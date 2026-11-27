// 驗證 backend/tools/apply-exam-sop-mapping.sql：新增 9 條草稿 SOP 規則、補上題庫的對應 SOP（265 題）。
// 檢查：只補空的 sop、不動已標示的、新規則編號已存在就不覆蓋、可重複執行、題目全部有對應、登入角色仍不能改題庫 sop 或新增規則。
// 用法：node backend/tests/exam-sop-mapping.test.mjs <專案根目錄> <pglite 資料夾>
import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { setup, S } from './_harness.mjs';
const [, , root, pgliteDir] = process.argv;
const { db, as, sup, deny } = await setup(root, pgliteDir, []);

await db.exec(`insert into sop_chapters (no, name, descr) values ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `(${n}, '第${n}章', '')`).join(', ')};`);
// 現有規則：5-9 已被占用（內容不同），新規則不能覆蓋它
await db.exec(`insert into sop_rules (no, chapter, topic, rule, status) values ('5-9', 5, '既有規則', '既有內容不能被覆蓋', '現行'), ('6-3', 6, '配送延遲與派查', '派查規則', '現行');`);

const row = (id, caseId, source, qtype, kind, sop) =>
  `insert into question_bank (id, source, kind, case_id, chapter, qtype, level, stem, options, sop, sop_rules) values
   ('${id}', '${source}', '${kind}', ${caseId ? `'${caseId}'` : 'null'}, 7, '${qtype}', 1, '題幹', ${qtype === 'short' ? 'null' : `'["A","B"]'::jsonb`}, ${sop ? `'${sop}'` : 'null'}, ${sop ? `array['${sop}']` : `'{}'`});`;
await db.exec([
  row('L-1', 'C065', 'legacy', 'short', '情境簡答', null),   // 高 → 7-9
  row('L-2', 'C065', 'legacy', 'mcq', '最佳回覆', null),
  row('L-3', 'C065', 'legacy', 'short', '情境簡答', '2-2'),  // 已標示 → 不能被覆蓋
  row('L-4', 'C097', 'legacy', 'short', '情境簡答', null),   // 中 → 7-7
  row('L-5', 'C019', 'legacy', 'short', '情境簡答', null),   // 取消後恢復 → 新規則 5-10
  row('L-6', 'C012', 'legacy', 'short', '情境簡答', null),   // ATM 對帳 → 新規則 5-9（但 5-9 已被占用，規則內容不能被改）
  row('L-7', 'C026', 'legacy', 'short', '情境簡答', null),   // 低 → 既有規則 6-3
  row('RU-R01', null, 'rules', 'tf', '傳言辨識', null),      // 7-9
  row('TIP-X04', null, 'rules', 'mcq', '客人應對', null),    // 話術 → 新規則 2-5
].join('\n'));

const sqlFile = fs.readFileSync(path.join(root, 'backend/tools/apply-exam-sop-mapping.sql'), 'utf8');
await db.exec(sqlFile);
const get = async id => (await sup(`select sop, sop_rules from question_bank where id = '${id}'`))[0];

// 題目對應
assert.deepEqual(await get('L-1'), { sop: '7-9', sop_rules: ['7-9', '7-10'] });
assert.deepEqual(await get('L-2'), { sop: '7-9', sop_rules: ['7-9', '7-10'] });
assert.deepEqual(await get('L-3'), { sop: '2-2', sop_rules: ['2-2'] });          // 已標示的不動
assert.equal((await get('L-4')).sop, '7-7');
assert.equal((await get('L-5')).sop, '5-10');
assert.equal((await get('L-6')).sop, '5-9');
assert.equal((await get('L-7')).sop, '6-3');
assert.equal((await get('RU-R01')).sop, '7-9');
assert.equal((await get('TIP-X04')).sop, '2-5');
assert.equal((await sup(`select count(*) c from question_bank where sop is null`))[0].c, 0);   // 全部都有對應

// 新規則：9 條，其中編號已被占用的 5-9 不覆蓋，其餘 8 條新增
const drafts = await sup(`select no, topic, status, red_line, basis from sop_rules where basis like '草稿%' order by no`);
assert.deepEqual(drafts.map(r => r.no).sort(), ['1-4', '2-5', '3-7', '5-10', '6-8', '6-9', '7-13', '9-5'].sort());   // 5-9 沒被新增（已存在）
assert.ok(drafts.every(r => r.status === '現行' && r.red_line === false && r.basis.includes('待資深確認')));
assert.deepEqual((await sup(`select topic, rule from sop_rules where no = '5-9'`))[0], { topic: '既有規則', rule: '既有內容不能被覆蓋' });
assert.equal((await sup(`select sop_label('5-10') l, sop_known('5-10') k`))[0].l, 'SOP 5-10 訂單異動');
assert.equal((await sup(`select count(*) c from sop_rules`))[0].c, 2 + 8);

// 可重複執行，結果不變
await db.exec(sqlFile);
assert.equal((await sup(`select count(*) c from sop_rules`))[0].c, 2 + 8);
assert.equal((await get('L-1')).sop, '7-9');

// 登入的角色：不能改題庫 sop、不能新增 SOP 規則
await db.exec(`grant select, update on question_bank to authenticated; grant select, insert on sop_rules to authenticated;`);
await as(S, () => deny(db.query(`update question_bank set sop = '1-1' where id = 'L-6'`), /ONLY_STATUS/));
await db.exec(`revoke insert on sop_rules from authenticated;`);
await as(S, () => deny(db.query(`insert into sop_rules (no, chapter, topic, rule) values ('9-9', 9, 'x', 'x')`), /permission denied/));

// 規則內容：不能含「新增的數字承諾」——草稿只能沿用現行 SOP 已有的數字（3 次、3,000 元；其餘不得出現新的時限或金額）
const known = new Set(['3', '3,000']);
for (const r of await sup(`select no, rule from sop_rules where basis like '草稿%'`)) {
  for (const n of r.rule.replace(/\d+-\d+/g, '').match(/\d[\d,]*/g) || []) assert.ok(known.has(n), `草稿規則 ${r.no} 含有新的數字：${n}`);   // 先拿掉「7-10」這類規則編號
}

console.log('exam-sop-mapping.test.mjs 通過');
