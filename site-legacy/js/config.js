/* =========================================================
   經驗柑仔店｜設定
   這裡不放任何管理者金鑰。service_role、Gemini 金鑰只放在
   Supabase Edge Function 的環境變數。
   ========================================================= */

/** true：讀 data/ 的示範 JSON，寫入存在瀏覽器 localStorage。false：走 Supabase。 */
export const USE_MOCK = true;

/** 登入頁要不要顯示「示範帳號（點一下帶入）」。公開部署前要關掉（或刪掉示範帳號）。 */
export const SHOW_DEMO_ACCOUNTS = true;

/** 假資料模式的「今天」。讓到職天數、期限和 Mockup 截圖一致；接上 Supabase 後改用真正的日期。 */
export const DEMO_TODAY = '2026-11-23';

/** Supabase 專案網址與 publishable key（know-how-corner-store，東京）。publishable key 本來就是公開的，靠資料表的 RLS 保護；service_role 金鑰絕對不能放這裡。 */
export const SUPABASE_URL = 'https://qpgtpeombexzixitxcol.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ytvGxGp2fHMT0tQB-qRbxg_IPveNTnK';

/**
 * 哪些功能已經接上真的 Supabase（其餘仍是 USE_MOCK 的假資料）。逐項打開，接好一項換一項：
 *   auth：登入、登出（Supabase Auth，帳號存在 employees）
 *   bank：題庫審核（question_bank，785 題；答案在 question_answers，前端讀不到）
 *   exam：員工、出題、作答、成績、簡答覆核、錯題（migration 004）
 *   sop／qa／home：見下方各項說明
 * 全部打開後，USE_MOCK 與假資料（mock.js）就不再使用。
 */
export const LIVE = {
  auth: true, bank: true, exam: true,
  // 下面三個要先把 backend/supabase/apply-006-008.sql 套用到 Supabase（資料表與函式、種子資料）才能打開，否則頁面會讀不到資料
  sop: true,    // SOP、SOP 統整流程、考核設定（migration 006）
  qa: true,     // 問小橘、待確認清單（migration 007）
  home: true,   // 新人首頁、資深待辦、導覽數字（migration 008）
};

/** 登入頁與頁尾顯示的公司資訊。 */
export const COMPANY = { name: 'OO電商公司', dept: '客服部' };

/** 今天的日期（YYYY-MM-DD）。 */
export function today() {
  if (USE_MOCK) return DEMO_TODAY;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
