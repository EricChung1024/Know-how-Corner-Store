import assert from 'node:assert/strict';
import { login, EMP2 } from './_helpers.mjs';

/** 依最新一次練習的 perm，算出每題「畫面位置」並作答。mode: 'right' | 'wrong' */
async function answerPractice(page, sql, mode) {
  const [run] = await sql(`select id, question_ids from practice_runs where user_id = '${EMP2}' order by created_at desc limit 1`);
  for (const { id, perm } of run.question_ids) {
    const [q] = await sql(`select correct_index from questions where id = '${id}'`);
    const orig = mode === 'right' ? q.correct_index : perm.find((o) => o !== q.correct_index);
    await page.check(`input[data-qid="${id}"][value="${perm.indexOf(orig)}"]`);
  }
  return run.question_ids.length;
}

export default async function ({ page, base, sql, shot }) {
  const picks = await sql(`select distinct on (stage) id, stage from questions where qtype = 'mcq' and stage in (2, 5, 7) order by stage, id`);
  assert.equal(picks.length, 3);
  const [{ id: shortId }] = await sql(`select id from questions where qtype = 'short' and stage = 6 order by id limit 1`);
  for (const p of picks) await sql(`select _record_wrong('${EMP2}', '${p.id}')`);
  await sql(`select _record_wrong('${EMP2}', '${shortId}')`);

  await login(page, base, 'emp2@example.com');
  await page.goto(base + '/wrong.html');
  await page.waitForSelector('.wrong-item');
  assert.equal(await page.locator('.wrong-item').count(), 4, '預設顯示 4 題未掌握');
  await shot('wrong-list');

  // 篩選
  await page.selectOption('#f-stage', '2');
  await page.waitForFunction(() => document.querySelectorAll('.wrong-item').length === 1);
  await page.selectOption('#f-stage', '');
  await page.waitForFunction(() => document.querySelectorAll('.wrong-item').length === 4);
  await page.selectOption('#f-status', 'mastered');
  await page.waitForSelector('text=沒有符合條件的錯題');
  await page.selectOption('#f-status', 'open');
  await page.waitForFunction(() => document.querySelectorAll('.wrong-item').length === 4);

  // 筆記：失焦自動儲存
  const first = page.locator('.wrong-item').first();
  const qid = await first.getAttribute('data-qid');
  await first.locator('textarea.note').fill('我常搞混');
  await first.locator('textarea.note').blur();
  await page.waitForSelector('.saved');
  assert.equal((await sql(`select note from wrong_book where user_id = '${EMP2}' and question_id = '${qid}'`))[0].note, '我常搞混');

  // 重練第 1 輪：只含選擇題（簡答不進重練）
  await page.click('#practice');
  await page.waitForSelector('.practice input[type=radio]');
  assert.equal(await answerPractice(page, sql, 'right'), 3);
  await page.click('#submit-practice');
  await page.waitForSelector('.practice-result');
  assert.match(await page.textContent('.practice-result'), /3 \/ 3/);
  assert.match(await page.textContent('.practice-result'), /連續答對 1\/2/);
  assert.equal((await sql(`select count(*)::int c from attempts where user_id = '${EMP2}'`))[0].c, 0, '重練不產生成績');

  // 第 2 輪全對 → 已掌握
  await page.click('#practice');
  await page.waitForSelector('.practice input[type=radio]');
  await answerPractice(page, sql, 'right');
  await page.click('#submit-practice');
  await page.waitForSelector('.practice-result');
  assert.match(await page.textContent('.practice-result'), /已掌握/);
  assert.equal((await sql(`select count(*)::int c from wrong_book where user_id = '${EMP2}' and status = 'mastered'`))[0].c, 3);

  // 已掌握清單：3 題；手動改回未掌握
  await page.selectOption('#f-status', 'mastered');
  await page.waitForFunction(() => document.querySelectorAll('.wrong-item').length === 3);
  await page.locator('.wrong-item').first().locator('button.reopen').click();
  await page.waitForFunction(() => document.querySelectorAll('.wrong-item').length === 2);
  const reopened = (await sql(`select streak, status from wrong_book where user_id = '${EMP2}' and status = 'open' and question_id <> '${shortId}'`));
  assert.deepEqual(reopened, [{ streak: 0, status: 'open' }]);

  // 只剩 1 題可練 → 練完 2 次後，沒有可練的 → 友善訊息
  for (let i = 0; i < 2; i++) {
    await page.click('#practice');
    await page.waitForSelector('.practice input[type=radio]');
    assert.equal(await answerPractice(page, sql, 'right'), 1);
    await page.click('#submit-practice');
    await page.waitForSelector('.practice-result');
  }
  await page.click('#practice');
  await page.waitForSelector('.notice');
  assert.match(await page.textContent('.notice'), /沒有可重練/);
  await shot('wrong-done');
}
