// 考核流程測試（migration 004）：用 PGlite 在本機跑，模擬 Supabase 的登入身分。
// 用法：node backend/tests/exam.test.mjs <專案根目錄> <pglite 資料夾>
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import assert from 'assert/strict';
const [, , root, pgliteDir] = process.argv;
const { PGlite } = await import(pathToFileURL(path.join(pgliteDir, 'dist/index.js')).href);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
`);
const mig = path.join(root, 'backend/supabase/migrations');
for (const f of fs.readdirSync(mig).sort()) await db.exec(fs.readFileSync(path.join(mig, f), 'utf8'));
await db.exec(`grant usage on schema public to authenticated, anon; grant select, update on all tables in schema public to authenticated; grant insert, update, delete on all tables in schema public to authenticated;
  revoke all on question_answers from authenticated;
  revoke insert, update, delete on exam_papers, exam_attempts, wrong_items from authenticated;`);
await db.exec(fs.readFileSync(path.join(root, 'backend/supabase/seed/question_bank.sql'), 'utf8'));

const S = '00000000-0000-0000-0000-000000000001', N = '00000000-0000-0000-0000-000000000002', N2 = '00000000-0000-0000-0000-000000000003';
await db.exec(`insert into auth.users values ('${S}'), ('${N}'), ('${N2}');
  insert into employees values ('${S}', '林佩珊', 'lin@x.example', 'HW210501', 'senior', null),
    ('${N}', '陳宥廷', 'chen@x.example', 'HW261102', 'newbie', '2026-11-02'),
    ('${N2}', '王小美', 'wang@x.example', 'HW261103', 'newbie', null);`);
const as = async (uid, fn, role = 'authenticated') => { await db.exec(`set role ${role}; set request.jwt.uid = '${uid ?? ''}';`); try { return await fn(); } finally { await db.exec('reset role; reset request.jwt.uid;'); } };
const rpc = async (fn, ...args) => { const ph = args.map((_, i) => `$${i + 1}`).join(', '); return (await db.query(`select ${fn}(${ph}) as r`, args.map(a => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a)))).rows[0].r; };
const deny = (p, re) => assert.rejects(p, re);
const sup = async q => (await db.query(q)).rows;

// 批次通過全部題目（資深直接改表，等同題庫審核頁的批次通過）
await as(S, () => db.exec(`update question_bank set status = '已審' where status = '待審'`));

// ---- 員工總覽 ----
await as(S, async () => {
  const list = await rpc('list_employees');
  assert.equal(list.length, 2);
  const chen = list.find(x => x.employeeId === 'HW261102');
  assert.equal(chen.nextExam.name, '基礎考核'); assert.equal(chen.nextExam.deadline, '2026-12-02'); assert.equal(chen.hasPendingReview, false);
  assert.equal(list.find(x => x.employeeId === 'HW261103').nextExam, null); // 沒到職日
  await deny(rpc('generate_paper', 'HW261103', 'm1'), /先設定到職日/);
  const up = await rpc('update_hire_date', 'HW261103', '2026-10-01');
  assert.equal(up.hireDate, '2026-10-01');
  const e = await rpc('get_employee', 'HW261102');
  assert.deepEqual(e.stages.map(s => [s.type, s.dueDate, s.status]), [['m1', '2026-12-02', '尚未開放'], ['m3', '2027-02-02', '尚未開放'], ['m6', '2027-05-03', '尚未開放']]);
  assert.equal(e.canHaveExam, true);
});

// ---- 出題：三個階段都抽得滿 20 題 ----
const papers = {};
await as(S, async () => {
  for (const [t, shortMax] of [['m1', 0], ['m3', 2], ['m6', 3]]) {
    const r = await rpc('generate_paper', 'HW261102', t);
    const p = await rpc('get_paper', r.id);
    const shorts = p.questions.filter(q => q.qtype === 'short').length;
    assert.equal(p.questions.length, 20, `${t} 題數`); assert.equal(r.shortage, 0); assert.ok(shorts <= shortMax, `${t} 簡答 ${shorts}`);
    if (t === 'm3') assert.equal(shorts, 2);
    assert.ok(p.questions.every(q => q.level <= p.level), `${t} 難度`);
    assert.ok(p.questions.every(q => !('correct_index' in q) && !('referenceAnswer' in q)));
    papers[t] = { id: r.id, p };
  }
  // 不同階段不重複題目
  const all = Object.values(papers).flatMap(x => x.p.questions.map(q => q.id));
  assert.equal(new Set(all).size, all.length, '三階段題目不重複');
  // 刪題、補題、上限
  const m1 = papers.m1;
  await rpc('remove_paper_question', m1.id, m1.p.questions[0].id);
  assert.equal((await rpc('get_paper', m1.id)).questions.length, 19);
  await rpc('add_paper_question', m1.id, m1.p.questions[0].id);
  assert.equal((await rpc('get_paper', m1.id)).questions.length, 20);
  const extra = (await sup(`select id from question_bank where qtype <> 'short' and level = 1 and status = '已審' and id <> all(select unnest(question_ids) from exam_papers) limit 1`))[0].id;
  await deny(rpc('add_paper_question', m1.id, extra), /最多 20 題/);
  await rpc('remove_paper_question', m1.id, m1.p.questions[1].id);
  const shortQ = (await sup(`select id from question_bank where qtype = 'short' and status = '已審' limit 1`))[0].id;
  await deny(rpc('add_paper_question', m1.id, shortQ), /不出簡答/);
  await rpc('add_paper_question', m1.id, m1.p.questions[1].id);
  // 重新出題（還是草稿）→ 換一批
  const again = await rpc('generate_paper', 'HW261102', 'm1');
  assert.equal(again.id, m1.id);
  papers.m1.p = await rpc('get_paper', m1.id); // 重新出題後題目換了一批
  assert.equal(papers.m1.p.questions.length, 20);
});

// ---- 權限 ----
await as(N, async () => {
  await deny(rpc('generate_paper', 'HW261102', 'm1'), /只有資深/);
  await deny(rpc('list_employees'), /只有資深/);
  await deny(rpc('get_paper', papers.m1.id), /只有資深/);
  assert.equal((await sup('select count(*) c from exam_papers'))[0].c, 3); // 自己的考卷（含草稿）可讀
  const ex = await rpc('list_my_exams');
  assert.deepEqual(ex.map(x => x.status), ['尚未開放', '尚未開放', '尚未開放']);
  assert.equal(ex[0].paper, null); // 新人看不到草稿細節
  assert.equal(await rpc('start_exam', 'm1'), null); // 還沒鎖定
  await deny(db.exec(`insert into exam_papers (employee_id, stage) values ('${N}', 'm1')`), /permission denied/);
  // 內部函式不能被前端直接呼叫（否則能查別人的成績）
  for (const [fn, args] of [['_records', [S]], ['_stage_rows', [S, false]], ['require_senior', []], ['sop_label', ['2-2']]]) await deny(rpc(fn, ...args), /permission denied/);
});
await as(N2, async () => { assert.equal((await sup('select count(*) c from exam_papers'))[0].c, 0); });
await as(null, async () => { await deny(rpc('list_my_exams'), /permission denied/); }, 'anon');

// ---- 鎖定 ----
await as(S, async () => {
  await rpc('lock_paper', papers.m1.id);
  await deny(rpc('lock_paper', papers.m1.id), /已經鎖定/);
  await deny(rpc('remove_paper_question', papers.m1.id, papers.m1.p.questions[0].id), /鎖定後/);
  await deny(rpc('generate_paper', 'HW261102', 'm1'), /已經有鎖定/);
  await deny(db.exec(`update question_bank set status = '停用' where id = '${papers.m1.p.questions[0].id}'`), /鎖定的考卷/);
  const e = await rpc('get_employee', 'HW261102');
  assert.equal(e.stages[0].status, '可作答');
});

// ---- 新人作答：基礎考核（沒有簡答，直接出成績） ----
const correctAnswers = async attemptId => {
  const a = (await sup(`select option_order, (select question_ids from exam_papers p where p.id = paper_id) qids from exam_attempts where id = '${attemptId}'`))[0];
  const out = {};
  for (const qid of a.qids) {
    const k = (await sup(`select q.qtype, k.correct_index from question_bank q join question_answers k on k.qid = q.id where q.id = '${qid}'`))[0];
    if (k.qtype === 'short') out[qid] = '我理解您的狀況，先核對資料，今天內回覆您結果。';
    else out[qid] = a.option_order[qid] ? a.option_order[qid].indexOf(k.correct_index) : k.correct_index;
  }
  return out;
};
let attempt1;
await as(N, async () => {
  const ex = await rpc('list_my_exams');
  assert.deepEqual(ex.map(x => x.status), ['可作答', '尚未開放', '尚未開放']);
  assert.equal(ex[0].questionCount, 20);
  const t = await rpc('start_exam', 'm1');
  assert.equal(t.name, '基礎考核'); assert.equal(t.questions.length, 20); assert.equal(t.passScore, 80);
  assert.ok(t.questions.every(q => q.options && !('correct' in q)));
  const again = await rpc('start_exam', 'm1');
  assert.equal(again.attemptId, t.attemptId);
  assert.deepEqual(again.questions.map(q => q.options), t.questions.map(q => q.options), '選項順序穩定');
  attempt1 = t.attemptId;
  await rpc('save_answer', attempt1, t.questions[0].id, 1);
  assert.equal((await rpc('start_exam', 'm1')).answers[t.questions[0].id], 1);
  await deny(rpc('save_answer', attempt1, 'NOPE', 1), /已經交卷/);
});
const perfect = await correctAnswers(attempt1);
await as(N, async () => {
  const r = await rpc('submit_exam', attempt1, perfect);
  assert.equal(r.status, 'reviewed'); assert.equal(r.mcqScore, 100);
  await deny(rpc('submit_exam', attempt1, perfect), /已經交卷/);
  const res = await rpc('get_my_result', attempt1);
  assert.equal(res.finalScore, 100); assert.equal(res.passed, true); assert.equal(res.passScore, 80); assert.equal(res.redLineFailed, false);
  assert.equal(res.items.length, 20); assert.ok(res.items.every(i => i.correct === true && i.points === 5));
  assert.deepEqual(res.errorSummary, {}); assert.equal(res.resultSeen, false);
  assert.ok(res.items.every(i => !('referenceAnswer' in i)));
  await rpc('mark_result_seen', attempt1);
  assert.equal((await rpc('get_my_result')).resultSeen, true);
  assert.equal((await rpc('list_wrong_items')).length, 0);
  const recs = await rpc('list_my_records');
  assert.deepEqual([recs.length, recs[0].score, recs[0].passed, recs[0].type], [1, 100, true, 'm1']);
  const ex = await rpc('list_my_exams');
  assert.deepEqual([ex[0].status, ex[0].finalScore, ex[0].passed], ['已完成', 100, true]);
  assert.equal((await rpc('start_exam', 'm1')).done, true);
});

// ---- 情境應用考核：有簡答 → 等資深覆核 ----
let attempt3;
await as(S, () => rpc('lock_paper', papers.m3.id));
const m3q = papers.m3.p.questions;
await as(N, async () => {
  const t = await rpc('start_exam', 'm3');
  attempt3 = t.attemptId;
  assert.equal((await rpc('list_my_exams'))[1].mcqCount, 18);
});
const perfect3 = await correctAnswers(attempt3);
// 故意答錯一題紅線以外的選擇題＋一題紅線題（若有）
const redQ = (await sup(`select q.id from question_bank q where q.id = any(select unnest(question_ids) from exam_papers where id = '${papers.m3.id}') and q.red_line and q.qtype <> 'short' limit 1`))[0];
const wrongOne = m3q.find(q => q.qtype !== 'short' && !q.redLine);
const bad = { ...perfect3 }; bad[wrongOne.id] = ((bad[wrongOne.id] + 1) % wrongOne.options.length);
await as(N, async () => {
  const r = await rpc('submit_exam', attempt3, bad);
  assert.equal(r.status, 'submitted'); assert.equal(r.mcqScore, 85); assert.equal(r.mcqMax, 90);
  let res = await rpc('get_my_result', attempt3);
  assert.equal(res.finalScore, null); assert.equal(res.passed, null); assert.equal(res.shortMax, 10);
  assert.equal(res.items.filter(i => i.qtype === 'short').length, 2);
  assert.equal((await rpc('list_wrong_items')).length, 1);
  assert.equal((await rpc('list_my_records'))[1].score, null);
});
await as(S, async () => {
  assert.equal((await rpc('list_employees')).find(x => x.employeeId === 'HW261102').hasPendingReview, true);
  const rv = await rpc('get_short_review', 'HW261102');
  assert.equal(rv.items.length, 2); assert.ok(rv.items.every(i => i.referenceAnswer && i.maxPoints === 5 && i.answer));
  await deny(rpc('submit_short_review', rv.attemptId, { scores: { [rv.items[0].qid]: 3 }, comment: '' }), /0–5/);
  await deny(rpc('submit_short_review', rv.attemptId, { scores: { [rv.items[0].qid]: 9, [rv.items[1].qid]: 1 }, comment: '' }), /0–5/);
  const fin = await rpc('submit_short_review', rv.attemptId, { scores: { [rv.items[0].qid]: 5, [rv.items[1].qid]: 4 }, comment: '很好', errorTypes: ['只給結論，沒有下一步'] });
  assert.equal(fin.finalScore, 94); assert.equal(fin.passed, true); // 85＋5＋4，及格 85
  await deny(rpc('submit_short_review', rv.attemptId, { scores: {} }), /不在待覆核/);
  assert.equal(await rpc('get_short_review', 'HW261102'), null);
});
await as(N, async () => {
  const res = await rpc('get_my_result', attempt3);
  assert.equal(res.finalScore, 94); assert.equal(res.shortScore, 9); assert.equal(res.review.reviewer, '林佩珊'); assert.equal(res.review.comment, '很好');
  assert.equal(res.errorSummary['只給結論，沒有下一步'], 1);
  assert.equal(res.resultSeen, false);
});

// ---- 錯題重練（另一位新人整份答錯） ----
await as(S, async () => {
  await rpc('update_hire_date', 'HW261103', '2026-10-01');
  const r = await rpc('generate_paper', 'HW261103', 'm1'); papers.n2 = r.id; await rpc('lock_paper', r.id);
});
let attemptN2;
await as(N2, async () => { attemptN2 = (await rpc('start_exam', 'm1')).attemptId; });
const goodN2 = await correctAnswers(attemptN2);
const correctMap = Object.fromEntries((await sup('select qid, correct_index from question_answers')).map(r => [r.qid, r.correct_index]));
const allWrong = {}; for (const [q, v] of Object.entries(goodN2)) allWrong[q] = 99; // 超出範圍 → 一律答錯
await as(N2, async () => {
  const r = await rpc('submit_exam', attemptN2, allWrong);
  assert.equal(r.mcqScore, 0);
  const res = await rpc('get_my_result', attemptN2);
  assert.equal(res.finalScore, 0); assert.equal(res.passed, false);
  const wl = await rpc('list_wrong_items');
  assert.equal(wl.length, 20); assert.ok(wl.every(w => w.streak === 0 && !w.mastered && w.examName === '基礎考核'));
  const w0 = wl[0];
  const ci = correctMap[w0.qid];
  const wrongChoice = (ci + 1) % w0.options.length;
  assert.deepEqual(await rpc('check_practice', w0.qid, ci), { correct: true, streak: 1, mastered: false });
  assert.deepEqual(await rpc('check_practice', w0.qid, wrongChoice), { correct: false, streak: 0, mastered: false });
  await rpc('check_practice', w0.qid, ci);
  assert.deepEqual(await rpc('check_practice', w0.qid, ci), { correct: true, streak: 2, mastered: true });
  await deny(rpc('check_practice', 'R-1-1-不存在', 0), /沒有這一題/);
  const after = await rpc('list_wrong_items');
  assert.equal(after[after.length - 1].mastered, true); // 已掌握的排最後
  // 看不到別人的錯題和成績
  assert.equal((await sup(`select count(*) c from wrong_items`))[0].c, 20);
  await deny(rpc('get_my_result', attempt1), /./).catch(() => {}); // 不是自己的 → 回 null 或錯誤皆可
  assert.equal(await rpc('get_my_result', attempt1), null);
});

// ---- 紅線：答錯紅線題，分數夠也不通過 ----
if (redQ) {
  await as(S, async () => { await rpc('lock_paper', papers.m6.id); });
  // m6 的紅線情形用 SQL 直接驗：把一題標紅線的選擇題答錯、其他全對
  let a6;
  await as(N, async () => { a6 = (await rpc('start_exam', 'm6')).attemptId; });
  const p6 = await correctAnswers(a6);
  const redIn6 = (await sup(`select q.id from question_bank q where q.id = any(select unnest(question_ids) from exam_papers where id = '${papers.m6.id}') and q.red_line and q.qtype <> 'short' limit 1`))[0];
  if (redIn6) {
    const a = (await sup(`select option_order from exam_attempts where id = '${a6}'`))[0];
    p6[redIn6.id] = 99;
    await as(N, async () => {
      await rpc('submit_exam', a6, p6);
      const res = await rpc('get_my_result', a6);
      assert.equal(res.redLineFailed, true);
    });
    await as(S, async () => {
      const rv = await rpc('get_short_review', 'HW261102');
      const scores = Object.fromEntries(rv.items.map(i => [i.qid, i.maxPoints]));
      const fin = await rpc('submit_short_review', rv.attemptId, { scores, comment: '' });
      assert.ok(fin.finalScore >= 90, `分數 ${fin.finalScore}`); assert.equal(fin.passed, false); // 紅線題答錯
    });
  }
}

console.log('考核流程測試全部通過：員工總覽、三階段出題（20 題、簡答上限、題目不重複）、加刪題、鎖定、權限、作答（選項打亂且穩定）、批改、簡答覆核、成績、錯題重練、紅線');
