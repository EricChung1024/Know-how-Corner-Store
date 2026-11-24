/* =========================================================
   經驗柑仔店｜登入守門
   登入資訊存在 sessionStorage（關掉分頁就登出）。
   每頁開頭呼叫 requireRole('newbie' | 'senior')。
   ========================================================= */

const KEY = 'knowhow-user';

/** 身分對應的首頁。 */
export const homeOf = role => (role === 'senior' ? 's-home.html' : 'n-home.html');

/**
 * 讀目前登入的使用者。
 * @returns {{id: string, name: string, email: string, employeeId: string, role: 'newbie'|'senior'} | null}
 */
export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch (e) { return null; }
}

/** 登入成功後寫入使用者。 */
export function setSession(user) {
  try { sessionStorage.setItem(KEY, JSON.stringify(user)); } catch (e) { /* 無痕模式可能不能寫 */ }
}

/** 登出時清掉使用者。 */
export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

/**
 * 每頁開頭呼叫：沒登入就回 index.html；身分不符就導回自己的首頁。
 * @param {'newbie'|'senior'} role 這一頁允許的身分
 * @returns {object|null} 使用者；回傳 null 時頁面已在導向，請直接結束
 */
export function requireRole(role) {
  const user = getSession();
  if (!user) { location.replace('index.html'); return null; }
  if (user.role !== role) { location.replace(homeOf(user.role)); return null; }
  return user;
}
