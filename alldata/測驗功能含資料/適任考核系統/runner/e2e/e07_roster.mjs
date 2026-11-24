import assert from 'node:assert/strict';
import { login } from './_helpers.mjs';

async function tryLogin(page, base, email, pw) {
  await page.goto(base + '/index.html');
  await page.fill('#email', email);
  await page.fill('#password', pw);
  await page.click('#go');
}

export default async function ({ page, base, sql, shot }) {
  page.on('dialog', (d) => d.accept());
  await login(page, base, 'boss@example.com');
  await page.click('#tab-add');
  await page.fill('#roster', '姓名,信箱\n陳宥廷,chen@example.com\n林小美 mei@example.com\n壞資料,not-email\n員工甲,emp1@example.com');
  await page.click('#create');
  await page.waitForSelector('table.created tbody tr');

  // 壞格式在前端就被指出（第 4 行），好的照常送出
  assert.match(await page.textContent('.roster-errors'), /第 4 行/);
  assert.equal(await page.locator('table.created tbody tr').count(), 3);
  const chenRow = page.locator('table.created tr:has-text("chen@example.com")');
  const chenPw = (await chenRow.locator('td.pw').textContent()).trim();
  assert.match(chenPw, /^[A-Za-z2-9]{12}$/);
  assert.match(await page.locator('table.created tr:has-text("emp1@example.com")').textContent(), /已有帳號/);
  assert.match(await page.textContent('main'), /只會顯示這一次/);
  await shot('roster-created');

  const [p] = await sql(`select name, role from profiles where name = '陳宥廷'`);
  assert.deepEqual(p, { name: '陳宥廷', role: 'employee' });
  assert.equal((await sql(`select count(*)::int c from profiles where name = '林小美'`))[0].c, 1);

  // 新員工用發的密碼登入，是「員工」身分
  await page.evaluate(() => localStorage.clear());
  await tryLogin(page, base, 'chen@example.com', chenPw);
  await page.waitForURL('**/home.html');
  assert.match(await page.textContent('.nav .who'), /陳宥廷（員工）/);

  // 員工不能呼叫建立帳號的功能
  const code = await page.evaluate(async () => {
    const { callFn } = await import('./js/api.js');
    try { await callFn('create-employees', { action: 'create', users: [{ name: 'x', email: 'x@example.com' }] }); return 'NO_ERROR'; } catch (e) { return e.code; }
  });
  assert.equal(code, 'FORBIDDEN');
  assert.equal((await sql(`select count(*)::int c from profiles where name = 'x'`))[0].c, 0);

  // 主管重設密碼：舊密碼失效、新密碼可登入
  const [{ id }] = await sql(`select id from profiles where name = '陳宥廷'`);
  await page.evaluate(() => localStorage.clear());
  await login(page, base, 'boss@example.com');
  await page.goto(base + '/employee.html?id=' + id);
  await page.click('#reset-pw');
  await page.waitForSelector('.new-password');
  const newPw = (await page.locator('.new-password').textContent()).trim();
  assert.match(newPw, /^[A-Za-z2-9]{12}$/);
  assert.notEqual(newPw, chenPw);
  await page.evaluate(() => localStorage.clear());
  await tryLogin(page, base, 'chen@example.com', chenPw);
  await page.waitForSelector('#msg .notice.error');
  assert.equal(await page.textContent('#msg .notice.error'), '帳號或密碼錯誤');
  await tryLogin(page, base, 'chen@example.com', newPw);
  await page.waitForURL('**/home.html');
}
