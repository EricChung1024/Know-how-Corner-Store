import { getMe } from './api.js';

export const homeOf = (role) => (role === 'supervisor' ? 'supervisor.html' : 'home.html');

/** 受保護頁面第一行呼叫：未登入回登入頁、角色不符導向自己的首頁。回傳 {id, name, role}。
 *  注意：這只是便利；真正的權限由資料庫 RLS 與 RPC 強制。 */
export async function requireRole(role) {
  const me = await getMe();
  if (!me) {
    location.replace('index.html');
    return new Promise(() => {}); // 導頁後不再往下執行
  }
  if (me.role !== role) {
    location.replace(homeOf(me.role));
    return new Promise(() => {});
  }
  return me;
}
