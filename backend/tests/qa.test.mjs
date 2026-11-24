// 問小橘測試（migration 007）。用法：node backend/tests/qa.test.mjs <專案根目錄> <pglite 資料夾>
import assert from 'assert/strict';
import { setup, S, N, N2 } from './_harness.mjs';
const [, , root, pgliteDir] = process.argv;
const { as, rpc, sup, deny } = await setup(root, pgliteDir, ['sop_seed.sql', 'qa_seed.sql']);

assert.equal((await sup('select count(*) c from qa_cases'))[0].c, 6);
const cases = Object.fromEntries((await sup('select id, newbie_asks, outcome, rule_no, writes_pending from qa_cases')).map(c => [c.id, c]));
const asks = {};

await as(N, async () => {
  const sug = await rpc('list_suggested_questions');
  assert.equal(sug.length, 6); assert.ok(sug.every(x => x.question && !('reply' in x)));
  assert.ok(sug.find(x => x.id === 'Q01').ruleName.startsWith('SOP 7-9 '));
  await deny(rpc('ask_xiaoju', '   '), /請輸入問題/);

  // 完全一樣的問句 → 案例標準答法
  const a1 = await rpc('ask_xiaoju', cases.Q01.newbie_asks);
  assert.deepEqual([a1.outcome, a1.ruleNo, a1.writesPending, a1.pendingId], ['已確認的變更', '7-9', false, null]);
  assert.ok(a1.reply.includes('以最新版為準') && a1.sourceChip.startsWith('出處：SOP 7-9'));
  // 少一點字、多一點標點也認得
  const a1b = await rpc('ask_xiaoju', cases.Q01.newbie_asks.replace('，可是', ' 可是 ') + '？？');
  assert.equal(a1b.outcome, '已確認的變更');
  // 要請問資深的案例 → 寫進待確認清單；同一題再問不重複開
  const a2 = await rpc('ask_xiaoju', cases.Q02.newbie_asks);
  assert.equal(a2.writesPending, true); assert.ok(a2.pendingId);
  const a2b = await rpc('ask_xiaoju', cases.Q02.newbie_asks);
  assert.equal(a2b.pendingId, a2.pendingId);
  // 沒有案例、但問到 SOP 規則 → 直接引用
  const a3 = await rpc('ask_xiaoju', '身分驗證要核對哪些資料？');
  assert.deepEqual([a3.outcome, a3.ruleNo], ['直接回答', '2-2']);
  assert.ok(a3.reply.startsWith('SOP 2-2 身分驗證：') && a3.sourceChip === '出處：SOP 2-2 身分驗證');
  // 不相關 → 不在範圍
  const a4 = await rpc('ask_xiaoju', '今天中午想吃什麼便當');
  assert.deepEqual([a4.outcome, a4.ruleNo, a4.writesPending], ['不在 SOP 範圍', null, false]);
  assert.equal(a4.reply, '這題不在OO電商公司 SOP 範圍內。');
  Object.assign(asks, { a1, a2, a3, a4 });

  const mine = await rpc('list_my_asks');
  assert.equal(mine.length, 6); assert.equal(mine[0].question, '今天中午想吃什麼便當'); assert.equal(mine[0].userId, 'HW261102');
  assert.equal((await rpc('get_ask', a3.askId)).outcome, '直接回答');

  // 回饋
  assert.equal(await rpc('send_feedback', a3.askId, true), true);
  await deny(rpc('send_feedback', a1.askId, false, ''), /請選一個原因/);
  await deny(rpc('send_feedback', a1.askId, false, '亂寫的原因'), /請選一個原因/);
  await rpc('send_feedback', a1.askId, false, '答案太長、看不完');
  const g = await rpc('get_ask', a1.askId);
  assert.deepEqual([g.feedback, g.reason], ['down', '答案太長、看不完']);
  await rpc('send_feedback', a1.askId, true); // 改成有幫助：原因清掉
  assert.deepEqual([(await rpc('get_ask', a1.askId)).feedback, (await rpc('get_ask', a1.askId)).reason], ['up', '']);
  await rpc('send_feedback', a1.askId, false, '其他');

  const st = await rpc('get_my_qa_stats');
  assert.equal(st.total, 6); assert.equal(st.sentToSenior, 2);
  assert.equal(st.helpful, 1); assert.equal(st.notHelpful, 1); assert.equal(st.noFeedback, 1); // 可回饋的只有 a1、a1b、a3；a2、a4 是請問資深／不在範圍，不計
  const q2ch = cases.Q02.rule_no.split('-')[0];
  assert.deepEqual(st.chapters.map(x => [x.no, x.count]).sort(), [['2', 1], ['7', 2], [q2ch, 2]].sort()); // Q01 問兩次、Q02 問兩次、身分驗證一次
});

// ---- 別人看不到 ----
await as(N2, async () => {
  assert.deepEqual(await rpc('list_my_asks'), []);
  assert.equal(await rpc('get_ask', asks.a3.askId), null);
  await deny(rpc('send_feedback', asks.a3.askId, true), /找不到這筆提問/);
  assert.equal((await sup('select count(*) c from qa_logs'))[0].c, 0);
  assert.equal((await sup('select count(*) c from qa_cases'))[0].c, 0, '新人不能直接讀案例（含標準答案）');
  assert.deepEqual(await rpc('list_my_pending'), []);
  await deny(rpc('list_pending'), /只有資深/);
});
await as(null, () => deny(rpc('ask_xiaoju', 'x'), /permission denied/), 'anon');

// ---- 資深：待確認清單 ----
await as(S, async () => {
  const pend = await rpc('list_pending', '待處理');
  assert.equal(pend.length, 1); assert.equal(pend[0].askerName, '陳宥廷'); assert.equal(pend[0].userId, 'HW261102'); assert.equal(pend[0].caseId, 'Q02');
  assert.equal((await rpc('list_pending', '已回覆')).length, 0); assert.equal((await rpc('list_pending', '全部')).length, 1);
  await deny(rpc('reply_pending', pend[0].id, '  '), /請輸入回覆內容/);
  await deny(rpc('reply_pending', '00000000-0000-0000-0000-0000000000ff', 'x'), /找不到這個問題/);
  const r = await rpc('reply_pending', pend[0].id, '  7-9 以最新版為準，驗收後 3 個工作日內。 ');
  assert.deepEqual([r.status, r.reply, r.repliedBy, r.askerEmail, r.isNew], ['已回覆', '7-9 以最新版為準，驗收後 3 個工作日內。', '林佩珊', 'chen@x.example', true]);
  const qs = await rpc('get_qa_stats');
  assert.deepEqual([qs.total, qs.askSenior, qs.waiting, qs.helpful, qs.notHelpful, qs.demo], [6, 2, 0, 1, 1, false]);
  assert.equal(qs.outcomes.reduce((a, o) => a + o.count, 0), 6);
  assert.deepEqual(qs.noHelpReasons.find(x => x.reason === '其他'), { reason: '其他', count: 1 });
  assert.equal(qs.noHelpReasons.length, 4);
});
await as(N, async () => {
  let p = await rpc('list_my_pending');
  assert.equal(p.length, 1); assert.deepEqual([p[0].status, p[0].isNew, p[0].repliedBy], ['已回覆', true, '林佩珊']);
  await rpc('mark_replies_seen');
  p = await rpc('list_my_pending'); assert.equal(p[0].isNew, false);
  // 回覆之後再問同一題 → 開新的一筆
  const again = await rpc('ask_xiaoju', cases.Q02.newbie_asks);
  assert.notEqual(again.pendingId, asks.a2.pendingId);
  assert.equal((await rpc('list_my_pending')).length, 2);
});
await as(N, () => deny(rpc('reply_pending', '00000000-0000-0000-0000-0000000000ff', 'x'), /只有資深/));

console.log('問小橘測試全部通過：案例比對（含標點差異）、SOP 規則比對、不在範圍、待確認清單（不重複開、回覆後再問開新的）、回饋與原因、統計、資深回覆、權限');
