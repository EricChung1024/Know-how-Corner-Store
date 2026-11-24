import assert from 'node:assert/strict';
import { login, latestAttempt, EMP1 } from './_helpers.mjs';

export default async function ({ page, base, sql, shot }) {
  page.on('dialog', (d) => d.accept());
  await sql(`delete from attempt_answers; delete from attempts; delete from wrong_book;
             update profiles set hire_date = current_date - 200 where id = '${EMP1}'`);

  // ── 員工首頁：「正式考核」區塊與期限 ──
  await login(page, base, 'emp1@example.com');
  await page.waitForSelector('#formal .stage-card');
  assert.equal(await page.locator('#formal .stage-card').count(), 2, '正式考核：試用期＋半年');
  const probation = page.locator('#formal .stage-card[data-stage="10"]');
  const semi = page.locator('#formal .stage-card[data-stage="11"]');
  assert.match(await probation.textContent(), /試用期考核/);
  assert.match(await probation.locator('.due').textContent(), /已逾期/);
  assert.ok(await probation.locator('.due.overdue').count() === 1);
  assert.match(await semi.textContent(), /半年考核/);
  assert.match(await semi.textContent(), /85 分/, '半年考核及格分 85 要寫出來');
  await shot('home-formal');

  // ── 考試：試用期考核（30 題，全對） ──
  await probation.locator('a.btn').click();
  await page.waitForSelector('.qnav');
  const att = await latestAttempt(sql, EMP1);
  assert.equal(att.questions.length, 30, '試用期考核 30 題');
  for (let i = 0; i < att.questions.length; i++) {
    await page.click(`.qnav[data-i="${i}"]`);
    const q = att.questions[i];
    if (q.qtype === 'short') await page.fill(`textarea[data-qid="${q.id}"]`, '我的回覆');
    else await page.check(`input[data-qid="${q.id}"][value="${q.shownRight}"]`);
  }
  await page.click('#submit');
  await page.waitForSelector('.selfcheck, .score');
  if (await page.locator('.selfcheck').count()) {
    for (const cb of await page.locator('.selfcheck input[type=checkbox]').all()) await cb.check();
    await page.click('#submit-selfcheck');
    await page.waitForSelector('.score');
  }
  assert.match(await page.textContent('.score'), /100/);
  assert.match(await page.textContent('main'), /80 分及格/, '結果頁依該級別顯示及格分');

  // ── 回首頁：試用期已通過；半年期限＝通過日＋6 個月 ──
  await page.goto(base + '/home.html');
  await page.waitForSelector('#formal .stage-card');
  assert.match(await page.locator('#formal .stage-card[data-stage="10"] .due').textContent(), /已通過/);
  const semiDue = await page.locator('#formal .stage-card[data-stage="11"] .due').textContent();
  assert.match(semiDue, /期限 \d{4}-\d{2}-\d{2}/);
  const [{ d }] = await sql(`select (current_date + interval '6 months')::date::text as d`);
  assert.ok(semiDue.includes(d), `半年期限應為 ${d}，實為 ${semiDue}`);

  // ── 主管：矩陣有試用期／半年欄與期限欄；可設定到職日 ──
  await page.evaluate(() => localStorage.setItem('mock_user', 'b0000000-0000-0000-0000-000000000001'));
  await page.goto(base + '/supervisor.html');
  await page.waitForSelector('table.matrix tbody tr');
  const heads = await page.locator('table.matrix thead th').allTextContents();
  assert.ok(heads.includes('試用期') && heads.includes('半年') && heads.includes('考核期限'), '欄位：' + heads.join(','));
  assert.match(await page.locator('table.matrix tr:has-text("員工甲") td[data-stage="10"]').textContent(), /100/);
  assert.match(await page.locator('table.matrix tr:has-text("員工甲") td.due-col').textContent(), /半年/);
  await shot('supervisor-levels');

  await page.click('a.emp-link:has-text("員工甲")');
  await page.waitForSelector('#hire-date');
  await page.fill('#hire-date', '2026-01-01');
  await page.click('#save-hire');
  await page.waitForSelector('.notice.ok');
  assert.equal((await sql(`select hire_date::text as h from profiles where id = '${EMP1}'`))[0].h, '2026-01-01');
  assert.match(await page.textContent('.formal-status'), /2026-04-01/, '試用期期限＝到職日＋3 個月');
}
