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
// ---- 刪除員工（migration 013）----
// 先以管理者身分替吳佳蓉留下一些資料（前端角色本來就不能直接寫這些表），確認刪除時會一起清掉
await sup(`insert into qa_logs (employee_id, question, outcome, reply) values ('${wuId}', '測試提問', '不在 SOP 範圍', '測試回答')`);
await sup(`insert into pending_questions (employee_id, question, outcome) values ('${wuId}', '測試待確認', '不在 SOP 範圍')`);
const cnt = async (t, col = 'employee_id') => Number((await sup(`select count(*) c from ${t} where ${col} = '${wuId}'`))[0].c);
assert.equal(await cnt('qa_logs'), 1); assert.equal(await cnt('pending_questions'), 1);

await as(S, async () => {
  // 擋下的情況
  await deny(rpc('delete_employee', 'HW000000'), /找不到這位員工/);
  await deny(rpc('delete_employee', ''), /找不到這位員工/);
  await deny(rpc('delete_employee', 'HW210501'), /不能刪除自己/);   // 資深自己（林佩珊）
  // 刪新人（工號大小寫、前後空白都可以）
  assert.deepEqual(await rpc('delete_employee', ' hw260504 '), { id: 'HW260504', name: '吳佳蓉' });
});
assert.equal((await sup(`select count(*) c from employees where id = '${S}'`))[0].c, 1, '自己的帳號沒被刪');
assert.equal(await cnt('employees', 'id'), 0);
assert.equal(await cnt('auth.users', 'id'), 0);
assert.equal(await cnt('auth.identities', 'user_id'), 0);
assert.equal(await cnt('qa_logs'), 0); assert.equal(await cnt('pending_questions'), 0);
await as(S, async () => {
  assert.ok(!(await rpc('list_employees')).some(x => x.employeeId === 'HW260504'), '員工總覽不再有這個人');
  await deny(rpc('delete_employee', 'HW260504'), /找不到這位員工/);   // 已經刪掉，再刪一次
  // 另一位資深也可以刪；刪掉後工號與 email 可以重新使用
  assert.deepEqual(await rpc('delete_employee', 'HW210601'), { id: 'HW210601', name: '張家豪' });
  await rpc('create_employee', '吳佳蓉', 'wu.jiarong@haowu.example', 'HW260504', 'newbie', null);
});
// 新人與匿名刪不掉（用別人的工號試）
await as(N, () => deny(rpc('delete_employee', 'HW260504'), /只有資深/));
await as(null, () => deny(rpc('delete_employee', 'HW260504'), /permission denied/), 'anon');
assert.equal((await sup(`select count(*) c from employees where employee_id = 'HW260504'`))[0].c, 1, '新人與匿名刪不掉');
// 原本就有的新人（陳宥廷）沒被誤刪
assert.equal((await sup(`select count(*) c from employees where employee_id = 'HW261102'`))[0].c, 1);
console.log('新增員工測試全部通過：建新人／資深、輸入檢查、工號與 email 不能重複、只有資深能建、匿名不能呼叫');
console.log('刪除員工測試全部通過：連帶清掉提問與待確認資料、不能刪自己、找不到工號會擋、新人與匿名不能刪、刪除後工號可重新使用');
