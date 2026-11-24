// 首頁與導覽彙總測試（migration 008），串起考核、SOP、問答。用法：node backend/tests/home.test.mjs <專案根目錄> <pglite 資料夾>
import assert from 'assert/strict';
import { setup, S, N, N2 } from './_harness.mjs';
const [, , root, pgliteDir] = process.argv;
const { db, as, rpc, sup, deny } = await setup(root, pgliteDir, ['question_bank.sql', 'sop_seed.sql', 'qa_seed.sql']);

// ---- 一開始什麼都還沒發生 ----
await as(N, async () => {
  const h = await rpc('get_newbie_home');
  assert.equal(h.hireDate, '2026-11-02'); assert.ok(h.dayNo > 0);
  assert.deepEqual(h.stages.map(s => [s.type, s.status, s.dueDate]), [['m1', '尚未開放', '2026-12-02'], ['m3', '尚未開放', '2027-02-02'], ['m6', '尚未開放', '2027-05-03']]);
  assert.deepEqual([h.exam.type, h.exam.status, h.exam.dueDate], ['m1', '尚未開放', '2026-12-02']);
  assert.deepEqual([h.sop.published, h.sop.shown, h.sop.read, h.sop.updated, h.sop.firstUnread.no], [false, 57, 0, false, '1-1']);
  assert.deepEqual(h.replies, { unseen: [], waiting: 0 }); assert.equal(h.wrongOpen, 0);
  assert.deepEqual(await rpc('get_nav_counts'), { sop: 0, qa: 0, exam: 0, wrong: 0 });
});
await as(N2, async () => { // 沒有到職日
  const h = await rpc('get_newbie_home');
  assert.deepEqual([h.hireDate, h.dayNo, h.exam.dueDate], [null, null, null]);
});
await as(S, async () => {
  const t = await rpc('get_senior_todos');
  assert.deepEqual([t.pendingQuestions, t.pendingReviews, t.pendingPapers, t.firstReviewEmployee, t.firstDraftPaper, t.sop], [0, 0, 0, null, null, null]);
  assert.deepEqual(t.deadlines.map(d => [d.id, d.exam, d.deadline]), [['HW261102', '基礎考核', '2026-12-02']]); // 沒到職日的不列
  assert.deepEqual(await rpc('get_nav_counts'), { qa: 0, exam: 0 });
});
await as(N, () => deny(rpc('get_senior_todos'), /只有資深/));
await as(null, () => deny(rpc('get_nav_counts'), /permission denied/), 'anon');

// ---- 考核：出題 → 鎖定 → 作答 ----
const papers = {};
await as(S, async () => {
  await db.exec(`update question_bank set status = '已審' where status = '待審'`); // 資深批次通過題庫
  for (const t of ['m1', 'm3']) papers[t] = (await rpc('generate_paper', 'HW261102', t)).id;
  const t = await rpc('get_senior_todos');
  assert.deepEqual([t.pendingPapers, t.firstDraftPaper], [2, papers.m1]);
  assert.deepEqual(await rpc('get_nav_counts'), { qa: 0, exam: 2 });
  for (const id of Object.values(papers)) await rpc('lock_paper', id);
  assert.equal((await rpc('get_senior_todos')).pendingPapers, 0);
});
await as(N, async () => {
  const h = await rpc('get_newbie_home');
  assert.deepEqual([h.exam.type, h.exam.status], ['m1', '可作答']);
  assert.equal((await rpc('get_nav_counts')).exam, 2);
});
let a1;
await as(N, async () => { a1 = (await rpc('start_exam', 'm1')).attemptId; });
await as(N, async () => {
  await rpc('submit_exam', a1, {}); // 全部沒作答 → 全錯
  const h = await rpc('get_newbie_home');
  assert.deepEqual([h.exam.type, h.exam.attemptStatus, h.exam.finalScore, h.exam.passed, h.exam.resultSeen], ['m1', 'reviewed', 0, false, false]); // 新成績還沒看
  assert.equal(h.wrongOpen, 20);
  assert.deepEqual(await rpc('get_nav_counts'), { sop: 0, qa: 0, exam: 1, wrong: 20 });
  await rpc('mark_result_seen', a1);
  const h2 = await rpc('get_newbie_home');
  assert.deepEqual([h2.exam.type, h2.exam.status], ['m3', '可作答']); // 焦點移到下一個
});
let a3;
await as(N, async () => { a3 = (await rpc('start_exam', 'm3')).attemptId; await rpc('submit_exam', a3, {}); }); // 有簡答 → 待覆核
await as(S, async () => {
  const t = await rpc('get_senior_todos');
  assert.deepEqual([t.pendingReviews, t.firstReviewEmployee], [1, 'HW261102']);
  assert.equal((await rpc('get_nav_counts')).exam, 1);
  assert.equal(t.deadlines[0].exam, '綜合考核'); // m1、m3 都交卷了，下一次是 m6
});
await as(N, async () => { const h = await rpc('get_newbie_home'); assert.deepEqual([h.exam.type, h.exam.status], ['m6', '尚未開放']); assert.deepEqual(h.stages.map(s => s.status), ['已完成', '已完成', '尚未開放']); }); // m1、m3 交卷後，焦點是下一次考核

// ---- SOP 發布 ----
await as(S, async () => {
  await rpc('import_source_package'); await rpc('run_organize');
  for (const it of (await rpc('get_sop_flow')).confirmItems) await rpc('save_confirm_decision', it.id, it.options[0]);
  await rpc('generate_senior_sop');
  assert.equal((await rpc('get_senior_todos')).sop.confirmedBy, '林佩珊');
});
await as(N, async () => {
  let h = await rpc('get_newbie_home');
  assert.deepEqual([h.sop.published, h.sop.updated, h.sop.read, h.sop.firstUnread.no], [true, true, 0, '1-1']);
  assert.equal((await rpc('get_nav_counts')).sop, 1);
  await rpc('mark_rule_read', '1-1'); await rpc('mark_rule_read', '1-2');
  h = await rpc('get_newbie_home');
  assert.deepEqual([h.sop.read, h.sop.firstUnread.no, h.sop.firstUnread.name.startsWith('SOP 1-3 ')], [2, '1-3', true]);
  await rpc('mark_sop_update_seen');
  assert.deepEqual([(await rpc('get_newbie_home')).sop.updated, (await rpc('get_nav_counts')).sop], [false, 0]);
});

// ---- 問答 ----
const q2 = (await sup(`select newbie_asks from qa_cases where id = 'Q02'`))[0].newbie_asks;
await as(N, async () => { await rpc('ask_xiaoju', q2); assert.equal((await rpc('get_newbie_home')).replies.waiting, 1); });
await as(S, async () => {
  assert.equal((await rpc('get_senior_todos')).pendingQuestions, 1);
  assert.deepEqual(await rpc('get_nav_counts'), { qa: 1, exam: 1 });
  const p = (await rpc('list_pending', '待處理'))[0];
  await rpc('reply_pending', p.id, '以最新版為準。');
});
await as(N, async () => {
  const h = await rpc('get_newbie_home');
  assert.deepEqual([h.replies.unseen.length, h.replies.unseen[0].repliedBy, h.replies.waiting], [1, '林佩珊', 0]);
  assert.equal((await rpc('get_nav_counts')).qa, 1);
  await rpc('mark_replies_seen');
  assert.deepEqual([(await rpc('get_newbie_home')).replies.unseen.length, (await rpc('get_nav_counts')).qa], [0, 0]);
});
await as(S, async () => { assert.deepEqual(await rpc('get_nav_counts'), { qa: 0, exam: 1 }); });

console.log('首頁與導覽測試全部通過：新人首頁（到職天數、三階段、焦點考核會隨成績移動、SOP 進度與「剛更新」、回覆提醒、錯題數）、資深待辦（考卷、覆核、問題、考核期限、SOP）、導覽數字、權限');
