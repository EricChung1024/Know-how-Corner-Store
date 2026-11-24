import assert from 'node:assert/strict';

async function login(page, base, email, pw = 'pass1234') {
  await page.goto(base + '/index.html');
  await page.fill('#email', email);
  await page.fill('#password', pw);
  await page.click('#go');
}

export default async function ({ page, base }) {
  // 錯誤密碼：顯示通用訊息，不洩漏是哪個錯
  await login(page, base, 'emp1@example.com', 'wrong');
  await page.waitForSelector('#msg .notice.error');
  assert.equal(await page.textContent('#msg .notice.error'), '帳號或密碼錯誤');

  // 員工登入 → home.html，導覽顯示姓名與角色
  await login(page, base, 'emp1@example.com');
  await page.waitForURL('**/home.html');
  await page.waitForSelector('.nav .who');
  assert.match(await page.textContent('.nav .who'), /員工甲（員工）/);

  // 員工直接進主管頁 → 被導回 home.html
  await page.goto(base + '/supervisor.html');
  await page.waitForURL('**/home.html');

  // 登出 → 回登入頁；登出後再進受保護頁 → 回登入頁
  await page.click('text=登出');
  await page.waitForURL('**/index.html');
  await page.goto(base + '/home.html');
  await page.waitForURL('**/index.html');

  // 主管登入 → supervisor.html；進員工頁 → 被導回
  await login(page, base, 'boss@example.com');
  await page.waitForURL('**/supervisor.html');
  assert.match(await page.textContent('.nav .who'), /主管（主管）/);
  await page.goto(base + '/home.html');
  await page.waitForURL('**/supervisor.html');
}
