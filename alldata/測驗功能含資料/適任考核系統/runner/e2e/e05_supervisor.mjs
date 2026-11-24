import assert from 'node:assert/strict';
import { login, EMP1, EMP2 } from './_helpers.mjs';

export default async function ({ page, base, sql, shot }) {
  // ── 準備資料（清掉前面情境留下的紀錄） ──
  await sql('delete from attempt_answers; delete from attempts; delete from wrong_book; update questions set reviewed = false where source = \'legacy\'');
  const mcq = await sql(`select id from questions where qtype = 'mcq' and source = 'rules' order by id limit 3`);
  const [shortQ] = await sql(`select id from questions where qtype = 'short' order by id limit 1`);
  const A1 = 'dddddddd-0000-0000-0000-000000000001', A2 = 'dddddddd-0000-0000-0000-000000000002', A3 = 'dddddddd-0000-0000-0000-000000000003';
  const att = (id, uid, stage, score, passed, qids) =>
    sql(`insert into attempts (id, user_id, stage, question_ids, status, score, passed, submitted_at)
         values ('${id}', '${uid}', ${stage}, '${JSON.stringify(qids.map((q) => ({ id: q, perm: q === shortQ.id ? null : [0, 1] })))}', 'done', ${score}, ${passed}, now())`);
  const ans = (a, q, ok, err) => sql(`insert into attempt_answers (attempt_id, question_id, is_correct, error_type) values ('${a}', '${q}', ${ok}, ${err ? `'${err}'` : 'null'})`);
  await att(A1, EMP1, 7, 90, true, [mcq[0].id]); await ans(A1, mcq[0].id, false, '用了舊規則');
  await att(A2, EMP2, 7, 50, false, [mcq[0].id, mcq[1].id]);
  await ans(A2, mcq[0].id, false, '用了舊規則'); await ans(A2, mcq[1].id, false, '違反紅線');
  await att(A3, EMP2, 2, 80, true, [mcq[2].id, shortQ.id]);
  await ans(A3, mcq[2].id, true, null);
  await sql(`insert into attempt_answers (attempt_id, question_id, text_answer, checked, points, is_correct, error_type)
             values ('${A3}', '${shortQ.id}', 'abc', '[]', 0, false, '情境判斷失誤')`);
  await sql(`select _record_wrong('${EMP2}', '${mcq[0].id}'), _record_wrong('${EMP2}', '${mcq[0].id}'), _record_wrong('${EMP2}', '${mcq[1].id}')`);

  // ── 員工總覽 ──
  await login(page, base, 'boss@example.com');
  await page.waitForSelector('table.matrix tbody tr');
  assert.equal(await page.locator('table.matrix tbody tr').count(), 2, '只列員工（不含主管）');
  const cell = (name, stage) => page.locator(`table.matrix tr:has-text("${name}") td[data-stage="${stage}"]`);
  assert.match(await cell('員工甲', 7).textContent(), /90.*✔|✔.*90/);
  assert.match(await cell('員工乙', 7).textContent(), /50.*✘|✘.*50/);
  assert.match(await cell('員工乙', 2).textContent(), /80/);
  assert.equal((await cell('員工乙', 3).textContent()).trim(), '—');
  const types = await page.locator('.err-row').allTextContents();
  assert.ok(types.some((t) => /用了舊規則：2/.test(t)), '全體錯誤類型：用了舊規則 2 題');
  assert.ok(types.some((t) => /違反紅線：1/.test(t)));
  await shot('supervisor-overview');

  // ── 員工詳情＋簡答調分 ──
  await page.click('a.emp-link:has-text("員工乙")');
  await page.waitForURL('**/employee.html?id=*');
  await page.waitForSelector('table.attempts tbody tr');
  assert.equal(await page.locator('table.attempts tbody tr').count(), 2);
  assert.match(await page.textContent('#open-count'), /未掌握 2 題/);
  assert.match(await page.locator('.wrong-row').first().textContent(), /2 次/, '常錯題依答錯次數排序');
  await page.waitForSelector('.short-answer');
  assert.match(await page.textContent('.short-answer'), /abc/);
  await page.fill('.short-answer input.adjust', '1');
  await page.click('.short-answer button.adjust-btn');
  await page.waitForFunction(() => /100/.test(document.querySelector('table.attempts')?.textContent ?? ''));
  assert.equal(Number((await sql(`select score from attempts where id = '${A3}'`))[0].score), 100);
  await page.fill('.short-answer input.adjust', '2');
  await page.click('.short-answer button.adjust-btn');
  await page.waitForSelector('.notice.error');
  assert.match(await page.textContent('.notice.error'), /0 到 1/);
  await shot('supervisor-employee');

  // ── 題庫審核 ──
  await page.goto(base + '/supervisor.html');
  await page.click('#tab-review');
  await page.waitForSelector('table.review tbody tr');
  await page.selectOption('#r-stage', '2');
  await page.waitForSelector('table.review[data-stage="2"] tbody tr');
  const picks = page.locator('table.review input.pick');
  await picks.nth(0).check();
  await picks.nth(1).check();
  await page.click('#mark-reviewed');
  await page.waitForSelector('.notice.ok');
  assert.equal((await sql(`select count(*)::int c from questions where source in ('legacy', 'rules_ext') and reviewed`))[0].c, 2);
  await page.locator('table.review tbody tr').first().locator('summary').click();
  await shot('supervisor-review');

  // ── 員工不能呼叫主管 RPC ──
  await page.evaluate(() => localStorage.setItem('mock_user', 'e0000000-0000-0000-0000-000000000001'));
  await page.goto(base + '/home.html');
  await page.waitForSelector('.stage-card');
  const code = await page.evaluate(async () => {
    const { rpc } = await import('./js/api.js');
    try { await rpc('set_reviewed', { p_ids: ['L-L001'], p_reviewed: true }); return 'NO_ERROR'; } catch (e) { return e.code; }
  });
  assert.equal(code, 'FORBIDDEN');
}
