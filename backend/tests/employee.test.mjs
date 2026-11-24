// 新增員工測試（migration 010）。用法：node backend/tests/employee.test.mjs <專案根目錄> <pglite 資料夾>
import assert from 'assert/strict';
import { setup, S, N } from './_harness.mjs';
const [, , root, pgliteDir] = process.argv;
const { as, rpc, sup, deny } = await setup(root, pgliteDir, []);

let wuId;
await as(S, async () => {
  const r = await rpc('create_employee', '  吳佳蓉 ', ' Wu.Jiarong@Haowu.Example ', ' hw260504 ', 'newbie', '2026-05-04');
  assert.deepEqual(r, { id: 'HW260504' });
  const e = (await sup(`select * from employees where employee_id = 'HW260504'`))[0];
  assert.deepEqual([e.name, e.email, e.role, e.hire_date.toISOString().slice(0, 10)], ['吳佳蓉', 'wu.jiarong@haowu.example', 'newbie', '2026-05-04']);
  wuId = e.id;
  // 沒填到職日也可以；也可以建資深
  await rpc('create_employee', '張家豪', 'zhang@haowu.example', 'HW210601', 'senior', null);
  assert.equal((await sup(`select role, hire_date from employees where employee_id = 'HW210601'`))[0].role, 'senior');
  // 出現在員工總覽（只列新人）
  assert.ok((await rpc('list_employees')).some(x => x.employeeId === 'HW260504'));
  // 擋下不合法的輸入
  await deny(rpc('create_employee', '', 'a@b.co', 'HW999999', 'newbie', null), /請輸入姓名/);
  await deny(rpc('create_employee', 'x', 'not-an-email', 'HW999999', 'newbie', null), /email 格式/);
  await deny(rpc('create_employee', 'x', 'a@b.co', 'HW1', 'newbie', null), /工號只能是/);
  await deny(rpc('create_employee', 'x', 'a@b.co', 'HW 999 999', 'newbie', null), /工號只能是/);
  await deny(rpc('create_employee', 'x', 'a@b.co', 'HW999999', 'admin', null), /身分不正確/);
  await deny(rpc('create_employee', 'x', 'a@b.co', 'hw260504', 'newbie', null), /工號已經有帳號/);
  await deny(rpc('create_employee', 'x', 'WU.JIARONG@haowu.example', 'HW999999', 'newbie', null), /email 已經有帳號/);
});
// auth 資料表（前端角色讀不到）用管理者身分檢查
const u = (await sup(`select * from auth.users where id = '${wuId}'`))[0];
assert.deepEqual([u.email, u.aud, u.role, !!u.encrypted_password, !!u.email_confirmed_at], ['wu.jiarong@haowu.example', 'authenticated', 'authenticated', true, true]);
assert.equal((await sup(`select count(*) c from auth.identities where user_id = '${wuId}' and provider = 'email'`))[0].c, 1);
await as(N, () => deny(rpc('create_employee', 'x', 'a@b.co', 'HW999999', 'newbie', null), /只有資深/));
await as(null, () => deny(rpc('create_employee', 'x', 'a@b.co', 'HW999999', 'newbie', null), /permission denied/), 'anon');
console.log('新增員工測試全部通過：建新人／資深、輸入檢查、工號與 email 不能重複、只有資深能建、匿名不能呼叫');
