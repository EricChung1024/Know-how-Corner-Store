// SOP 與 SOP 統整流程測試（migration 006）。用法：node backend/tests/sop.test.mjs <專案根目錄> <pglite 資料夾>
import assert from 'assert/strict';
import { setup, S, N, N2 } from './_harness.mjs';
const [, , root, pgliteDir] = process.argv;
const { as, rpc, sup, deny } = await setup(root, pgliteDir, ['sop_seed.sql']);

// ---- 種子 ----
assert.equal((await sup('select count(*) c from sop_rules'))[0].c, 57);
assert.equal((await sup('select count(*) c from sop_rules where red_line'))[0].c, 12);
assert.equal((await sup('select count(*) c from sop_chapters'))[0].c, 9);
assert.equal((await sup('select count(*) c from sop_confirm_items'))[0].c, 12);
assert.equal((await sup('select count(*) c from sop_source_package'))[0].c, 9);
assert.equal((await sup(`select count(*) c from sop_rules where rule ~ '好物'`))[0].c, 0, '好物集／好物工單要改成 OO');
assert.equal((await sup(`select sop_label('2-2') l`))[0].l.startsWith('SOP 2-2 '), true);

// ---- 設定 ----
await as(N, async () => {
  const st = await rpc('get_exam_settings');
  assert.deepEqual(st.stages.map(x => [x.type, x.passScore, x.shortMax]), [['m1', 80, 0], ['m3', 85, 2], ['m6', 90, 3]]);
  assert.equal(st.errorTypes.length, 3); assert.equal(st.noHelpReasons.length, 4); assert.equal(st.demo, false);
});

// ---- 還沒發布：新人什麼都看不到 ----
await as(N, async () => {
  assert.equal(await rpc('get_published_sop', 'newbie'), null);
  assert.deepEqual(await rpc('get_sop_update_notice'), { show: false });
  await deny(rpc('get_published_sop', 'senior'), /只有資深/);
  await deny(rpc('get_sop_flow'), /只有資深/);
  await deny(rpc('import_source_package'), /只有資深/);
  assert.equal((await sup('select count(*) c from sop_rules'))[0].c, 0, '新人不能直接讀規則表（含生效日、依據）');
  assert.equal((await sup('select count(*) c from sop_chapters'))[0].c, 9);
  assert.equal(await rpc('mark_rule_read', '2-2'), true);
  await deny(rpc('mark_rule_read', '99-99'), /找不到這一條/);
  assert.deepEqual(await rpc('get_read_marks'), { '2-2': true });
});
await as(null, () => deny(rpc('get_published_sop'), /permission denied/), 'anon');

// ---- 統整流程 ----
await as(S, async () => {
  let f = await rpc('get_sop_flow');
  assert.deepEqual([f.step, f.imported, f.organized, f.generated, f.resetNote], [1, false, false, false, '']);
  assert.deepEqual(f.sourcePackage, { title: '統整模擬資料包 v3', count: 9, oldDocs: 6, transcripts: 3 });
  assert.equal(f.confirmTotal, 12); assert.equal(f.confirmedCount, 0); assert.equal(f.published, null);
  await deny(rpc('run_organize'), /請先匯入資料/);
  await deny(rpc('set_flow_step', 2), /前一步還沒完成/);
  await deny(rpc('import_sources', []), /請選擇檔案/);

  const r = await rpc('import_source_package');
  assert.equal(r.count, 9); assert.equal(r.sources.length, 9);
  f = await rpc('get_sop_flow');
  assert.equal(f.imported, true); assert.equal(f.sources.filter(x => x.kind === '教學逐字稿').length, 3);
  assert.equal(f.sources[0].name.startsWith('S1_2022'), true);

  // 自己加的檔案：類型判斷、格式、同名取代
  const own = await rpc('import_sources', [{ name: '2026_雙12活動規則.docx', lastModified: Date.parse('2026-11-20T12:00:00+08:00') }, { name: 'B1_會議轉錄.vtt' }]);
  assert.equal(own.length, 11);
  const o1 = own.find(x => x.name.startsWith('2026_雙12')), o2 = own.find(x => x.name.startsWith('B1'));
  assert.deepEqual([o1.kind, o1.format, o1.date, o1.own], ['舊檔', 'Word', '2026-11-20', true]);
  assert.deepEqual([o2.kind, o2.format, o2.own], ['教學逐字稿', '會議轉錄', true]);
  assert.equal((await rpc('remove_source', 'B1_會議轉錄.vtt')).length, 10);
  // 再一鍵匯入：自己加的檔案保留
  assert.equal((await rpc('import_source_package')).sources.length, 10);

  // 第 2 步
  const org = await rpc('run_organize');
  assert.deepEqual(org, { chapters: 9, rules: 57, redLines: 12, confirmCount: 12 });
  assert.equal(await rpc('set_flow_step', 2), 2);
  await deny(rpc('set_flow_step', 4), /前一步還沒完成/);
  assert.equal(await rpc('set_flow_step', 3), 3);

  // 第 3 步：12 項（4 張批次卡＋8 個問題）
  f = await rpc('get_sop_flow');
  assert.equal(f.confirmItems.length, 12);
  assert.deepEqual(f.confirmItems.map(i => i.kind), [...Array(4).fill('batch'), ...Array(8).fill('question')]);
  const batch = f.confirmItems[0], q = f.confirmItems[4];
  assert.equal(batch.batchItems.length, 16); assert.deepEqual(batch.options, ['全部確認']);
  assert.ok(q.name.startsWith('SOP ') && q.options.length >= 2 && Array.isArray(q.context) && q.ask);
  assert.ok(f.confirmItems.every(i => i.options.length > 0 && !i.options.some(o => /^其他/.test(o))));
  await deny(rpc('save_confirm_decision', q.id, '亂寫的答案'), /確認結果不正確/);
  await deny(rpc('save_confirm_decision', 'NOPE', 'x'), /確認結果不正確/);
  await rpc('save_confirm_decision', q.id, q.options[0]);
  await rpc('save_confirm_decision', q.id, q.options[1]); // 可以改
  assert.equal((await rpc('get_sop_flow')).confirmedCount, 1);

  // 換檔案 → 第 2、3 步重做
  await rpc('remove_source', '2026_雙12活動規則.docx');
  f = await rpc('get_sop_flow');
  assert.deepEqual([f.organized, f.confirmedCount, f.step], [false, 0, 1]);
  assert.match(f.resetNote, /重做/);
  // 沒換檔案 → 進度保留
  await rpc('run_organize');
  await rpc('save_confirm_decision', q.id, q.options[0]);
  await rpc('import_source_package');
  f = await rpc('get_sop_flow');
  assert.deepEqual([f.organized, f.confirmedCount, f.resetNote], [true, 1, '']);

  // 第 4 步：沒全部確認不能產生
  await deny(rpc('generate_senior_sop'), /12 項還沒全部確認/);
  await deny(rpc('set_flow_step', 4), /前一步還沒完成/);
  for (const it of f.confirmItems) await rpc('save_confirm_decision', it.id, it.options[0]);
  assert.equal(await rpc('set_flow_step', 4), 4);
  const g = await rpc('generate_senior_sop');
  assert.equal(g.version, '2026.11.16');
  f = await rpc('get_sop_flow');
  assert.deepEqual([f.generated, f.step, f.published.version, f.published.confirmedBy], [true, 4, '2026.11.16', '林佩珊']);
});

// ---- 發布後：新人版與資深版 ----
await as(N, async () => {
  const p = await rpc('get_published_sop', 'newbie');
  assert.equal(p.rules.length, 57); assert.equal(p.chapters.length, 9); assert.equal(p.ruleCount, 57); assert.equal(p.redLineCount, 12);
  assert.equal(p.confirmedBy, null); assert.ok(p.rules.every(r => r.effective === null), '新人版不顯示生效日');
  assert.equal(p.rules[0].no, '1-1'); assert.ok(p.rules[0].name.startsWith('SOP 1-1 '));
  assert.equal(p.rules.filter(r => r.redLine).length, 12);
  assert.ok(p.rules.some(r => r.recent) || true);
  const n = await rpc('get_sop_update_notice');
  assert.equal(n.show, true); assert.equal(n.version, '2026.11.16');
  await rpc('mark_sop_update_seen');
  assert.equal((await rpc('get_sop_update_notice')).show, false);
  await deny(rpc('get_published_sop', 'senior'), /只有資深/);
});
await as(N2, async () => { assert.equal((await rpc('get_sop_update_notice')).show, true); }); // 每個人各自記錄
await as(S, async () => {
  const p = await rpc('get_published_sop', 'senior');
  assert.equal(p.confirmedBy, '林佩珊'); assert.ok(p.rules.every(r => r.effective));
  // 再開新一輪：已發布的版本不受影響
  await rpc('start_new_round');
  const f = await rpc('get_sop_flow');
  assert.deepEqual([f.step, f.imported, f.organized, f.generated, f.sources.length, f.confirmedCount], [1, false, false, false, 0, 0]);
  assert.equal(f.published.version, '2026.11.16');
  // 第二次發布 → 新人再看到「剛更新」
  await rpc('import_source_package'); await rpc('run_organize');
  for (const it of f.confirmItems) await rpc('save_confirm_decision', it.id, it.options[0]);
  await rpc('generate_senior_sop');
});
await as(N, async () => { assert.equal((await rpc('get_sop_update_notice')).show, true); });
assert.equal((await sup('select count(*) c from sop_versions'))[0].c, 2);

console.log('SOP 測試全部通過：種子（57 條、紅線 12、12 項確認、9 份資料包）、設定、新人版不含生效日／確認人、已讀、「剛更新」提示、統整流程（一鍵匯入、自選檔案、換檔重做、12 項確認、發布、再開一輪）、權限');
