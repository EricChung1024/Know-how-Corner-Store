import assert from 'node:assert/strict';
import { login, latestAttempt, EMP1 } from './_helpers.mjs';

export default async function ({ page, base, sql, shot }) {
  const leaked = [];
  page.on('response', async (r) => {
    if (r.url().endsWith('/__rpc') && r.request().postData()?.includes('"start_exam"')) {
      const t = await r.text();
      for (const w of ['correct_index', 'explanation', 'reference_answer', 'rubric']) if (t.includes(w)) leaked.push(w);
    }
  });
  page.on('dialog', (d) => d.accept());

  await login(page, base, 'emp1@example.com');
  await page.waitForSelector('.stage-card');
  assert.equal(await page.locator('.stage-card').count(), 12, '首頁應有 12 張卡（2 張正式考核＋10 張章節）');
  assert.equal(await page.locator('.stage-card .badge.none').count(), 12, '一開始全部未考');
  await shot('home-empty');

  // ── 全對：階段 7 ──
  await page.click('.stage-card[data-stage="7"] a.btn');
  await page.waitForSelector('.qnav');
  const att = await latestAttempt(sql, EMP1);
  const n = att.questions.length;
  assert.equal(n, 10, '階段 7 應抽 10 題（8 選擇＋2 簡答）');
  for (let i = 0; i < n; i++) {
    await page.click(`.qnav[data-i="${i}"]`);
    const q = att.questions[i];
    if (q.qtype === 'short') await page.fill(`textarea[data-qid="${q.id}"]`, '我的回覆內容');
    else await page.check(`input[data-qid="${q.id}"][value="${q.shownRight}"]`);
  }
  if (!process.env.NO_SHOT) await shot('exam');
  await page.click('#submit');
  await page.waitForSelector('.selfcheck');
  for (const cb of await page.locator('.selfcheck input[type=checkbox]').all()) await cb.check();
  await shot('selfcheck');
  await page.click('#submit-selfcheck');
  await page.waitForURL('**/result.html**');
  await page.waitForSelector('.score');
  assert.match(await page.textContent('.score'), /100/);
  assert.ok(await page.locator('.badge.ok').count() >= 1, '應顯示已通過');
  await shot('result-pass');

  // 交卷後清掉暫存再重新整理 → 友善訊息，不重複交卷
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.waitForSelector('.notice');
  assert.match(await page.textContent('.notice'), /已交出/);

  // ── 首頁反映成績 ──
  await page.goto(base + '/home.html');
  await page.waitForSelector('.stage-card');
  const card7 = page.locator('.stage-card[data-stage="7"]');
  assert.match(await card7.textContent(), /已通過/);
  assert.match(await card7.textContent(), /100/);

  // ── 有錯、有未答：再考一次階段 7 ──
  await page.click('.stage-card[data-stage="7"] a.btn');
  await page.waitForSelector('.qnav');
  const att2 = await latestAttempt(sql, EMP1);
  let wrong = 0;
  for (let i = 0; i < att2.questions.length; i++) {
    const q = att2.questions[i];
    if (q.qtype === 'short') continue;
    await page.click(`.qnav[data-i="${i}"]`);
    if (i % 3 === 2) continue; // 刻意不答
    await page.check(`input[data-qid="${q.id}"][value="${q.shownWrong}"]`);
    wrong++;
  }
  assert.ok(wrong >= 4);
  await page.click('#submit'); // confirm 對話框會被自動接受
  await page.waitForSelector('.selfcheck');
  await page.click('#submit-selfcheck'); // 簡答沒作答也沒勾
  await page.waitForURL('**/result.html**');
  await page.waitForSelector('.score');
  const score = Number((await page.textContent('.score')).match(/[\d.]+/)[0]);
  assert.ok(score < 80, '全錯應不及格，實得 ' + score);
  assert.ok(await page.locator('.badge.bad').count() >= 1, '應顯示未通過');
  assert.ok(await page.locator('.error-summary li').count() >= 1, '應有錯誤類型彙總');
  assert.ok(await page.locator('.item.wrong .explanation').count() >= 1, '錯題顯示解析');
  await shot('result-fail');
  const rows = await sql(`select count(*)::int c from wrong_book where user_id = '${EMP1}'`);
  assert.ok(rows[0].c >= 4, '錯題區應收進錯題');

  // 沒有題目的階段（刪光階段 9 的題目）→ 友善訊息
  await sql('delete from wrong_book where question_id in (select id from questions where stage = 9)');
  await sql('delete from attempt_answers where question_id in (select id from questions where stage = 9)');
  await sql('delete from questions where stage = 9');
  await page.goto(base + '/exam.html?stage=9');
  await page.waitForSelector('.notice');
  assert.match(await page.textContent('.notice'), /尚無題目/);

  assert.deepEqual(leaked, [], 'start_exam 回應不得含答案相關欄位');
}
