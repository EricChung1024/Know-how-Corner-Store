import assert from 'node:assert/strict';
import { login, EMP1, EMP2 } from './_helpers.mjs';

export default async function ({ page, base, sql, shot }) {
  // 直接寫入歷次成績與錯誤類型（員工乙：兩次；員工甲的不能出現在乙的畫面）
  const [q] = await sql(`select id from questions where qtype = 'mcq' order by id limit 1`);
  const ins = async (uid, att, stage, score, passed, errType) => {
    await sql(`insert into attempts (id, user_id, stage, question_ids, status, score, passed, submitted_at)
               values ('${att}', '${uid}', ${stage}, '[]', 'done', ${score}, ${passed}, now())`);
    if (errType) await sql(`insert into attempt_answers (attempt_id, question_id, is_correct, error_type) values ('${att}', '${q.id}', false, '${errType}')`);
  };
  await ins(EMP2, 'cccccccc-0000-0000-0000-000000000001', 7, 60, false, '用了舊規則');
  await sql(`insert into attempts (id, user_id, stage, question_ids, status, score, passed, submitted_at)
             values ('cccccccc-0000-0000-0000-000000000002', '${EMP2}', 7, '[]', 'done', 90, true, now())`);
  await ins(EMP1, 'cccccccc-0000-0000-0000-000000000003', 2, 30, false, '違反紅線');

  await login(page, base, 'emp2@example.com');
  await page.goto(base + '/records.html');
  await page.waitForSelector('table.attempts tbody tr');
  assert.equal(await page.locator('table.attempts tbody tr').count(), 2, '只看到自己的 2 次成績');
  const text = await page.textContent('table.attempts');
  assert.match(text, /60/);
  assert.match(text, /90/);
  assert.match(text, /未通過/);
  assert.match(text, /已通過/);
  await page.waitForSelector('.err-row');
  assert.equal(await page.locator('.err-row').count(), 1, '累積錯誤類型只含自己的');
  assert.match(await page.textContent('.err-row'), /用了舊規則/);
  assert.doesNotMatch(await page.textContent('main'), /違反紅線/);
  await shot('records');
}
