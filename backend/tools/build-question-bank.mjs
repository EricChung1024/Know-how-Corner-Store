// =========================================================
// 經驗柑仔店｜題庫匯入工具（785 題）
//
// 第 1 步：跑原本的題庫產生器 alldata/測驗功能含資料/適任考核系統/tools/build_questions.py
//          （讀 統整結果_標準答案總表.xlsx ＋ 三份題庫 CSV ＋ case_map），產生 785 題：
//            85 題  依 SOP 規則總表出題（R 規則、RL 紅線、QA 新舊衝突、RU 傳言辨識、TIP 客人應對）
//            448 題 有對應好物集 SOP 的 64 個案件：保留情境，答案改用總表規則寫成（總表延伸）
//            252 題 其他 36 個案件：維持原本的通用內容
// 第 2 步：加上難度（backend/data/difficulty.json，785 題逐題判斷）、主題、能力面向，拆成兩份輸出：
//   1. backend/supabase/seed/question_bank.sql  後端種子資料（含標準答案，不進網站、不進 git）
//   2. site/data/question_bank.json             假資料後端用（只有公開欄位）
//
// 用法（在專案根目錄）：node backend/tools/build-question-bank.mjs     （需要 Python 3，只用標準函式庫）
// 可以重複執行：SQL 用 upsert，重新匯入只更新題目內容，不會把資深的審核結果洗掉。
// =========================================================
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAM = path.join(ROOT, 'alldata/測驗功能含資料');
const GENERATOR = path.join(EXAM, '適任考核系統/tools/build_questions.py');
const CSV_DIR = path.join(EXAM, 'AI專屬客服測驗');
const OUT_SQL = path.join(ROOT, 'backend/supabase/seed/question_bank.sql');
const OUT_JSON = path.join(ROOT, 'site-legacy/data/question_bank.json');
const EXPECTED = 785;

/* ---------- 第 1 步：跑原本的產生器 ---------- */
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qbank-')), 'questions.json');
let ran = null;
for (const py of ['python', 'python3', 'py']) {
  const r = spawnSync(py, ['-I', GENERATOR, tmp], {encoding: 'utf8', cwd: os.tmpdir()});
  if (r.status === 0) { ran = r; break; }
  if (r.error && r.error.code === 'ENOENT') continue;
  console.error(`題庫產生器失敗（${py}）：\n${r.stderr || r.stdout}`); process.exit(1);
}
if (!ran) { console.error('找不到 Python 3。請先安裝 Python（只需要標準函式庫）。'); process.exit(1); }
/** 專案約定的文字改名：好物集→OO電商公司、好物工單→OO工單、好物雲端→OO雲端（和 build-sop-seed.mjs 一樣）。 */
const R = v => (typeof v === 'string' ? v.replace(/好物工單/g, 'OO工單').replace(/好物雲端/g, 'OO雲端').replace(/好物集/g, 'OO電商公司') : Array.isArray(v) ? v.map(R) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, R(x)])) : v);
const generated = R(JSON.parse(fs.readFileSync(tmp, 'utf8')));
fs.rmSync(path.dirname(tmp), {recursive: true, force: true});

/* ---------- CSV（補主題、案件、能力面向） ---------- */
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
const csvRow = {};
for (const name of ['電商客服_生活化情境500題_含得分點.csv', '電商客服_最佳回覆選擇題100.csv', '電商客服_多輪追問題100.csv'])
  for (const r of parseCsv(fs.readFileSync(path.join(CSV_DIR, name), 'utf8'))) csvRow[r['題號']] = R(r);

const difficulty = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/data/difficulty.json'), 'utf8')).levels;
const CHAPTER = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/sop_samples.json'), 'utf8')).chapters.map(c => [+c.no, c.name]));

/** 題目種類（給資深看，不洩答案） */
function kindOf(id, qtype) {
  if (id.startsWith('RL-')) return '紅線題';
  if (id.startsWith('R-')) return qtype === 'tf' ? '規則是非' : '規則選擇';
  if (id.startsWith('QA-')) return '新舊衝突';
  if (id.startsWith('RU-')) return '傳言辨識';
  if (id.startsWith('TIP-')) return '客人應對';
  if (id.startsWith('L-L')) return '情境簡答';
  if (id.startsWith('L-M')) return '最佳回覆';
  if (id.startsWith('L-D')) return '多輪追問';
  return '其他';
}
/** 對應的 SOP 條目 */
function rulesOf(q) {
  const ref = q.source_ref || '';
  if (q.source === 'rules_ext') return ref.split(':')[1].split('+');
  if (/^RL?-/.test(q.id)) return [ref];
  const m = ref.match(/SOP (\d+-\d+)/);
  return m ? [m[1]] : [];
}

/* ---------- 第 2 步：轉換＋檢查 ---------- */
const problems = [];
const questions = [], answers = [];
for (const g of generated) {
  const raw = csvRow[g.id.replace(/^L-/, '')] || null;
  const level = difficulty[g.id];
  if (![1, 2, 3].includes(level)) problems.push(`${g.id} 沒有難度（Lv.1–3）`);
  if (g.qtype !== 'short' && !(Array.isArray(g.options) && g.options.length >= 2)) problems.push(`${g.id} 沒有選項`);
  if (g.qtype !== 'short' && !(g.correct_index >= 0 && g.correct_index < g.options.length)) problems.push(`${g.id} 正確答案不在選項裡`);
  if (g.qtype === 'short' && !g.reference_answer) problems.push(`${g.id} 簡答沒有參考答案`);
  if (!['mcq', 'tf', 'short'].includes(g.qtype)) problems.push(`${g.id} 題型「${g.qtype}」不認得`);
  const sopRules = rulesOf(g);
  questions.push({
    id: g.id, source: g.source, kind: kindOf(g.id, g.qtype), caseId: raw ? raw['案例編號'] : null,
    topic: raw ? raw['主題'] : CHAPTER[g.stage] || null, chapter: g.stage || null,
    ability: raw ? (raw['能力面向'] || (g.id.startsWith('L-D') ? '多輪追問' : null)) : null,
    qtype: g.qtype, level, stem: g.stem, options: g.qtype === 'short' ? null : g.options,
    sop: sopRules[0] || null, sopRules, redLine: !!g.red_line, shuffle: !!g.shuffle,
    status: g.reviewed ? '已審' : '待審',   // 總表規則題來自已確認的總表，原本就算已審；案件題要資深審
  });
  answers.push({
    qid: g.id, correctIndex: g.qtype === 'short' ? null : g.correct_index, explanation: g.explanation || null,
    referenceAnswer: g.reference_answer || null, rubric: g.rubric || null, keyError: g.key_error || null,
    errorType: g.error_type || null, errorDetail: g.error_detail || null, optionErrors: g.option_errors || null,
  });
}
const ids = new Set();
for (const q of questions) { if (ids.has(q.id)) problems.push(`題號重複 ${q.id}`); ids.add(q.id); }
if (questions.length !== EXPECTED) problems.push(`應該有 ${EXPECTED} 題，產生器給了 ${questions.length} 題`);
if (problems.length) { console.error('題庫有問題，沒有產生檔案：\n' + problems.join('\n')); process.exit(1); }

/* ---------- 輸出：公開 JSON（假資料後端） ---------- */
const count = pred => questions.filter(pred).length;
const stats = {
  total: questions.length,
  byType: {mcq: count(q => q.qtype === 'mcq'), tf: count(q => q.qtype === 'tf'), short: count(q => q.qtype === 'short')},
  byLevel: Object.fromEntries([1, 2, 3].map(l => [l, {mcq: count(q => q.level === l && q.qtype === 'mcq'), tf: count(q => q.level === l && q.qtype === 'tf'), short: count(q => q.level === l && q.qtype === 'short')}])),
  bySource: {rules: count(q => q.source === 'rules'), rules_ext: count(q => q.source === 'rules_ext'), legacy: count(q => q.source === 'legacy')},
  approved: count(q => q.status === '已審'),
};
fs.writeFileSync(OUT_JSON, JSON.stringify({
  _note: '由 backend/tools/build-question-bank.mjs 產生，不要手改。只有公開欄位：沒有正確答案、解析、參考答案、得分點、選項錯誤類型（那些只在後端 question_answers）。',
  sources: {
    rules: '依 SOP 規則總表出題（統整結果_標準答案總表.xlsx）',
    rules_ext: '有對應好物集 SOP 的案件：保留情境，答案改用總表規則（總表延伸）',
    legacy: '其他案件：原本的通用電商題（示範題，待公司主管審核）',
  },
  stats, questions,
}, null, 1) + '\n');

/* ---------- 輸出：後端種子 SQL ---------- */
const s = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const j = v => (v === null || v === undefined ? 'null' : `${s(JSON.stringify(v))}::jsonb`);
const arr = a => `array[${a.map(s).join(', ')}]::text[]`;
const n = v => (v === null || v === undefined ? 'null' : String(v));
const b = v => (v ? 'true' : 'false');
const qRows = questions.map(q => `(${[s(q.id), s(q.source), s(q.kind), s(q.caseId), s(q.topic), n(q.chapter), s(q.ability), s(q.qtype), n(q.level), s(q.stem), j(q.options), s(q.sop), arr(q.sopRules), b(q.redLine), b(q.shuffle), s(q.status)].join(', ')})`);
const aRows = answers.map(a => `(${[s(a.qid), n(a.correctIndex), s(a.explanation), s(a.referenceAnswer), j(a.rubric), s(a.keyError), s(a.errorType), s(a.errorDetail), j(a.optionErrors)].join(', ')})`);
fs.writeFileSync(OUT_SQL, `-- 經驗柑仔店｜題庫種子資料（由 backend/tools/build-question-bank.mjs 產生，不要手改）
-- 共 ${stats.total} 題：總表規則 ${stats.bySource.rules}、總表延伸 ${stats.bySource.rules_ext}、通用題 ${stats.bySource.legacy}
-- 含標準答案：只能用 service_role 或 SQL 編輯器執行，不要放進網站或公開的地方。
-- 可以重複執行：題目內容會更新，審核狀態（status）只在第一次新增時寫入。
begin;

insert into question_bank (id, source, kind, case_id, topic, chapter, ability, qtype, level, stem, options, sop, sop_rules, red_line, shuffle, status) values
${qRows.join(',\n')}
on conflict (id) do update set
  source = excluded.source, kind = excluded.kind, case_id = excluded.case_id, topic = excluded.topic, chapter = excluded.chapter,
  ability = excluded.ability, qtype = excluded.qtype, level = excluded.level, stem = excluded.stem, options = excluded.options,
  sop = excluded.sop, sop_rules = excluded.sop_rules, red_line = excluded.red_line, shuffle = excluded.shuffle, updated_at = now();

insert into question_answers (qid, correct_index, explanation, reference_answer, rubric, key_error, error_type, error_detail, option_errors) values
${aRows.join(',\n')}
on conflict (qid) do update set
  correct_index = excluded.correct_index, explanation = excluded.explanation, reference_answer = excluded.reference_answer,
  rubric = excluded.rubric, key_error = excluded.key_error, error_type = excluded.error_type,
  error_detail = excluded.error_detail, option_errors = excluded.option_errors;

commit;
`);

/* 另外切成小檔（每份 100 題，題目和它的答案放在同一份），方便貼進 Supabase 後台的 SQL 編輯器 */
const PART = 100, PARTS_DIR = path.join(path.dirname(OUT_SQL), 'parts');
fs.rmSync(PARTS_DIR, {recursive: true, force: true}); fs.mkdirSync(PARTS_DIR, {recursive: true});
const qHead = `insert into question_bank (id, source, kind, case_id, topic, chapter, ability, qtype, level, stem, options, sop, sop_rules, red_line, shuffle, status) values\n`;
const qTail = `\non conflict (id) do update set
  source = excluded.source, kind = excluded.kind, case_id = excluded.case_id, topic = excluded.topic, chapter = excluded.chapter,
  ability = excluded.ability, qtype = excluded.qtype, level = excluded.level, stem = excluded.stem, options = excluded.options,
  sop = excluded.sop, sop_rules = excluded.sop_rules, red_line = excluded.red_line, shuffle = excluded.shuffle, updated_at = now();\n\n`;
const aHead = `insert into question_answers (qid, correct_index, explanation, reference_answer, rubric, key_error, error_type, error_detail, option_errors) values\n`;
const aTail = `\non conflict (qid) do update set
  correct_index = excluded.correct_index, explanation = excluded.explanation, reference_answer = excluded.reference_answer,
  rubric = excluded.rubric, key_error = excluded.key_error, error_type = excluded.error_type,
  error_detail = excluded.error_detail, option_errors = excluded.option_errors;\n`;
const nParts = Math.ceil(questions.length / PART);
for (let p = 0; p < nParts; p++) {
  const a = p * PART, z = a + PART;
  fs.writeFileSync(path.join(PARTS_DIR, `question_bank_${p + 1}of${nParts}.sql`),
    `-- 題庫種子資料 第 ${p + 1} / ${nParts} 份（${a + 1}–${Math.min(z, questions.length)} 題）。含標準答案，不要公開。可重複執行。\nbegin;\n\n${qHead}${qRows.slice(a, z).join(',\n')}${qTail}${aHead}${aRows.slice(a, z).join(',\n')}${aTail}\ncommit;\n`);
}

const T = {mcq: '選擇', tf: '是非', short: '簡答'};
console.log(`題庫 ${stats.total} 題（選擇 ${stats.byType.mcq}、是非 ${stats.byType.tf}、簡答 ${stats.byType.short}），每題都有 Lv.1–3`);
for (const l of [1, 2, 3]) console.log(`  Lv.${l}：${Object.entries(stats.byLevel[l]).filter(([, v]) => v).map(([k, v]) => `${T[k]} ${v}`).join('、')}`);
console.log(`  來源：總表規則 ${stats.bySource.rules}、總表延伸 ${stats.bySource.rules_ext}、通用題 ${stats.bySource.legacy}；一開始就已審 ${stats.approved} 題`);
console.log(`輸出：${path.relative(ROOT, OUT_JSON)}、${path.relative(ROOT, OUT_SQL)}`);
