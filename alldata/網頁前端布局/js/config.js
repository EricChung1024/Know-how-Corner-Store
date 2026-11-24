/* =========================================================
   經驗柑仔店｜設定
   這裡不放任何管理者金鑰。service_role、Gemini 金鑰只放在
   Supabase Edge Function 的環境變數。
   ========================================================= */

/** true：讀 data/ 的示範 JSON，寫入存在瀏覽器 localStorage。false：走 Supabase。 */
export const USE_MOCK = true;

/** 假資料模式的「今天」。讓到職天數、期限和 Mockup 截圖一致；接上 Supabase 後改用真正的日期。 */
export const DEMO_TODAY = '2026-11-23';

/** Supabase 專案網址與 anon（publishable）key。部署時由專案負責人填入；anon key 靠 RLS 保護，可以放前端。 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

/** 登入頁與頁尾顯示的公司資訊。 */
export const COMPANY = { name: 'OO電商公司', dept: '客服部' };

/** 今天的日期（YYYY-MM-DD）。 */
export function today() {
  if (USE_MOCK) return DEMO_TODAY;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
