import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** 登入失敗一律丟 INVALID_LOGIN，不洩漏是帳號還是密碼錯。 */
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    const e = new Error('帳號或密碼錯誤');
    e.code = 'INVALID_LOGIN';
    throw e;
  }
}

export async function signOut() {
  await sb.auth.signOut();
}

/** 回傳 {id, name, role}；未登入回 null。 */
export async function getMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const rows = await select('profiles', { columns: 'id, name, role', eq: { id: session.user.id } });
  if (!rows.length) throw new Error('讀取使用者資料失敗');
  return rows[0];
}

/** 呼叫 Postgres 函式；raise exception 的訊息會成為 error.code（例 NO_QUESTIONS）。 */
export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    const e = new Error(error.message);
    e.code = error.message;
    throw e;
  }
  return data;
}

/** 讀取表或 view。opts：{columns='*', eq:{欄:值}, order:[欄, 'asc'|'desc']}；失敗時丟錯。 */
export async function select(table, opts = {}) {
  const { columns = '*', eq = {}, order } = opts;
  let b = sb.from(table).select(columns);
  for (const [k, v] of Object.entries(eq)) b = b.eq(k, v);
  if (order) b = b.order(order[0], { ascending: order[1] !== 'desc' });
  const { data, error } = await b;
  if (error) throw new Error(error.message);
  return data;
}

/** 呼叫 Supabase Edge Function；失敗時丟帶 .code 的 Error（函式回 {error: 代碼}）。 */
export async function callFn(name, body = {}) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let code = 'FUNCTION_FAILED';
    try { const j = await error.context.json(); if (j?.error) code = j.error; } catch { /* 沒有回應內容 */ }
    const e = new Error(code);
    e.code = code;
    throw e;
  }
  return data;
}
