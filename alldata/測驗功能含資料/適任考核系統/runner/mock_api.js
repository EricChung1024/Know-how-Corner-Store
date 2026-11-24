// 本機測試用：取代 site/js/api.js，改打 dev_server 的 /__ 端點（後面是真的 Postgres 與真的 RLS／RPC）。
const user = () => localStorage.getItem('mock_user');
async function call(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user() || '' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error); e.code = j.error; throw e; }
  return j.data;
}
export const sb = null;
export async function signIn(email, password) {
  const r = await fetch('/__login', { method: 'POST', body: JSON.stringify({ email, password }) });
  const j = await r.json();
  if (!j.ok) { const e = new Error('帳號或密碼錯誤'); e.code = 'INVALID_LOGIN'; throw e; }
  localStorage.setItem('mock_user', j.id);
}
export async function signOut() { localStorage.removeItem('mock_user'); }
export async function getMe() {
  const id = user();
  if (!id) return null;
  const rows = await select('profiles', { columns: 'id, name, role', eq: { id } });
  if (!rows.length) throw new Error('讀取使用者資料失敗');
  return rows[0];
}
export const rpc = (name, args = {}) => call('/__rpc', { name, args });
export const select = (table, opts = {}) => call('/__select', { table, opts });
export const callFn = (name, body = {}) => call('/__fn/' + name, body);
