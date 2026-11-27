// =========================================================
// 經驗柑仔店｜SOP、統整流程、問答案例 種子資料產生工具
// 讀 alldata/經驗柑仔店_SOP統整中心_交接包/…/05_網頁用資料（JSON），產生：
//   backend/supabase/seed/sop_seed.sql   SOP 章節與 57 條規則、統整流程的資料包與 12 個確認項目、設定
//   backend/supabase/seed/qa_seed.sql    問小橘的案例
// 用法（專案根目錄）：node backend/tools/build-sop-seed.mjs
// 可以重複執行（upsert）。專案約定：文字裡的「好物集」改成「OO電商公司」、「好物工單」改成「OO工單」、「好物雲端」改成「OO雲端」。
// =========================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'alldata/經驗柑仔店_SOP統整中心_交接包/03_統整模擬資料包_v3/05_網頁用資料（JSON）');
const OUT = path.join(ROOT, 'backend/supabase/seed');
const load = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const R = v => (typeof v === 'string' ? v.replace(/好物工單/g, 'OO工單').replace(/好物雲端/g, 'OO雲端').replace(/好物集/g, 'OO電商公司') : Array.isArray(v) ? v.map(R) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, R(x)])) : v);

const sop = R(load('sop_latest.json')), review = R(load('review.json')), qa = R(load('qa_cases.json'));
const pkg = R(JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/mock_extra.json'), 'utf8')).sop_flow.source_package);

const s = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const j = v => (v === null || v === undefined ? 'null' : `${s(JSON.stringify(v))}::jsonb`);
const b = v => (v ? 'true' : 'false');
const ta = a => `array[${(a || []).map(s).join(', ')}]::text[]`;
const problems = [];

/* ---- SOP ---- */
if (sop.rules.length !== 57) problems.push(`規則應該 57 條，實際 ${sop.rules.length}`);
if (sop.rules.filter(r => r.red_line).length !== 12) problems.push('紅線應該 12 條');
if (new Set(sop.rules.map(r => r.no)).size !== sop.rules.length) problems.push('規則編號重複');
const chapterRows = sop.chapters.map(c => `(${[+c.no, s(c.name), s(c.desc)].join(', ')})`);
const ruleRows = sop.rules.map(r => `(${[s(r.no), s(r.id), +r.chapter, s(r.topic), s(r.rule), b(r.red_line), s('現行'), s(r.detail.effective), s(r.detail.basis), s(r.detail.law || null), s(r.detail.confirm_type || null)].join(', ')})`);
const meta = { company: sop.meta.company, title: sop.meta.title, version: sop.meta.version, runDate: sop.meta.run_date, ruleCount: sop.meta.rule_count, redLineCount: sop.meta.red_line_count };

/* ---- 資深確認 12 項：4 張批次卡＋8 個問題 ---- */
const BATCH_BUTTON = { NEWER: '全部確認', ADD: '全部確認', KEEP: '全部沿用', EXPIRED: '確認失效' };
const confirmRows = [];
review.batches.forEach((bt, i) => {
  confirmRows.push([`batch-${bt.bucket}`, i + 1, 'batch', null, null, bt.title, null, [BATCH_BUTTON[bt.bucket] || '全部確認'], null,
    bt.items.map(it => ({ no: it.no, topic: it.topic, proposed: it.proposed || it.rule || '', older: it.older || [] })), null]);
});
// 原始資料沒填「小橘建議」的題目，用這裡補（與 migration 012 相同；重跑種子不會把建議洗成空的）
const AI_PICK_FALLBACK = {
  A03: '列為「建議（非強制）」',
  D07: '一線不扣款，拍照轉二線；是否收整新費、收多少由二線決定',
  F07: '不做例行回訪；主管指定的個案才在 24 小時內回訪（教學說法）',
  G13: '改為：請客戶到會員中心 > 隱私權設定申請，無法操作就開單轉法務（舊檔只寫「轉主管處理」、教學沒提到，請資深確認）',
  G08: '改用OO工單內建「外撥範本」，舊檔停用（舊檔已遺失、教學沒提到，請資深確認）',
};
review.questions.forEach((q, i) => {
  confirmRows.push([q.id, review.batches.length + i + 1, 'question', q.no, q.topic, q.ask, q.ask,
    q.options.filter(o => !/^其他/.test(o)), q.ai_pick || AI_PICK_FALLBACK[q.id] || null, (q.context || []).map(c => ({ label: c.label, text: c.text, status: c.status })), q.result_rule || null]);
});
if (confirmRows.length !== 12) problems.push(`確認項目應該 12 項，實際 ${confirmRows.length}`);
const confirmSql = confirmRows.map(r => `(${[s(r[0]), r[1], s(r[2]), s(r[3]), s(r[4]), s(r[5]), s(r[6]), j(r[7]), s(r[8]), j(r[9]), s(r[10])].join(', ')})`);

/* ---- 一鍵匯入的資料包 ---- */
if (pkg.files.length !== 9) problems.push('資料包應該 9 份');
const pkgRows = pkg.files.map((f, i) => `(${[s(f.name), s(f.kind), s(f.format), s(f.date), i + 1].join(', ')})`);

/* ---- 問答案例 ---- */
const qaRows = qa.map(c => {
  const m = (c.check_latest.match(/SOP (\d+-\d+)/) || [])[1] || null;
  if (m && !sop.rules.some(r => r.no === m)) problems.push(`${c.id} 對應的 SOP ${m} 不存在`);
  return `(${[s(c.id), s(c.newbie_asks), s(c.check_latest), s(c.check_history), s(c.outcome), s(c.ai_should_reply), s(c.source_chip), b(c.writes_pending), s(m)].join(', ')})`;
});

if (problems.length) { console.error('資料有問題，沒有產生檔案：\n' + problems.join('\n')); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'sop_seed.sql'), `-- 經驗柑仔店｜SOP 種子資料（由 backend/tools/build-sop-seed.mjs 產生，不要手改）。可重複執行。
begin;

insert into sop_chapters (no, name, descr) values
${chapterRows.join(',\n')}
on conflict (no) do update set name = excluded.name, descr = excluded.descr;

insert into sop_rules (no, sys_id, chapter, topic, rule, red_line, status, effective, basis, law, confirm_type) values
${ruleRows.join(',\n')}
on conflict (no) do update set sys_id = excluded.sys_id, chapter = excluded.chapter, topic = excluded.topic, rule = excluded.rule,
  red_line = excluded.red_line, status = excluded.status, effective = excluded.effective, basis = excluded.basis, law = excluded.law, confirm_type = excluded.confirm_type;

insert into app_settings (key, value) values ('sop_meta', ${j(meta)})
on conflict (key) do update set value = excluded.value;

insert into sop_source_package (name, kind, format, date, sort) values
${pkgRows.join(',\n')}
on conflict (name) do update set kind = excluded.kind, format = excluded.format, date = excluded.date, sort = excluded.sort;

insert into sop_confirm_items (id, sort, kind, no, topic, title, ask, options, ai_pick, payload, result_rule) values
${confirmSql.join(',\n')}
on conflict (id) do update set sort = excluded.sort, kind = excluded.kind, no = excluded.no, topic = excluded.topic, title = excluded.title,
  ask = excluded.ask, options = excluded.options, ai_pick = excluded.ai_pick, payload = excluded.payload, result_rule = excluded.result_rule;

commit;
`);
fs.writeFileSync(path.join(OUT, 'qa_seed.sql'), `-- 經驗柑仔店｜問小橘案例種子資料（由 backend/tools/build-sop-seed.mjs 產生，不要手改）。可重複執行。
begin;
insert into qa_cases (id, newbie_asks, check_latest, check_history, outcome, ai_should_reply, source_chip, writes_pending, rule_no) values
${qaRows.join(',\n')}
on conflict (id) do update set newbie_asks = excluded.newbie_asks, check_latest = excluded.check_latest, check_history = excluded.check_history,
  outcome = excluded.outcome, ai_should_reply = excluded.ai_should_reply, source_chip = excluded.source_chip, writes_pending = excluded.writes_pending, rule_no = excluded.rule_no;
commit;
`);
console.log(`SOP：${sop.chapters.length} 章、${sop.rules.length} 條規則（紅線 ${sop.rules.filter(r => r.red_line).length}）；確認項目 ${confirmRows.length} 項（批次 4、問題 8）；資料包 ${pkg.files.length} 份；問答案例 ${qa.length} 個`);
for (const f of ['sop_seed.sql', 'qa_seed.sql']) console.log(`  ${f}：${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
