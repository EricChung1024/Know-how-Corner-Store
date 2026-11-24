/* =========================================================
   經驗柑仔店｜後端呼叫
   callFn(name, payload) 呼叫 Supabase Edge Function，一律回傳 { data, error }，不會丟出錯誤。
   USE_MOCK 為 true 時改由 mock.js 的假函式回應。

   會用到的 Edge Function（名稱固定，Eric 實作）：
   - ask-xiaoju      問小橘（Gemini 金鑰只在這裡）
   - organize-sop    SOP 統整第 2 步：AI 清洗、拆規則
   - generate-paper  AI 從「已審」題目隨機出考卷
   - grade-exam      批改考卷（正確答案只在後端）
   - check-practice  錯題重練判斷對錯
   - notify-reply    資深回覆後寄信通知新人
   - create-user     新增員工帳號（需要 service_role，只能在後端）
   ========================================================= */
import { USE_MOCK, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let client = null;

/**
 * 取得 Supabase client（之後由 Eric 接上）。
 * 建議：import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
 * @returns {Promise<object>} Supabase client
 */
export async function getSupabase() {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('尚未設定 SUPABASE_URL 和 SUPABASE_ANON_KEY（js/config.js）');
  // TODO(Eric)：解開下面兩行
  // const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  // client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  throw new Error('尚未接上 Supabase（js/api.js getSupabase）');
}

/**
 * 呼叫後端函式。
 * @param {string} name  Edge Function 名稱，例如 'ask-xiaoju'
 * @param {object} payload 傳給函式的資料
 * @returns {Promise<{data: any, error: {message: string} | null}>}
 */
export async function callFn(name, payload = {}) {
  try {
    if (USE_MOCK) {
      const { mockFn } = await import('./mock.js');
      return { data: await mockFn(name, payload), error: null };
    }
    const sb = await getSupabase();
    const { data, error } = await sb.functions.invoke(name, { body: payload });
    return { data, error: error ? { message: error.message } : null };
  } catch (e) {
    return { data: null, error: { message: e.message || String(e) } };
  }
}
