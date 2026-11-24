// 複製這個檔案成 config.js，填入 Supabase 專案的值
// （Supabase 後台 → Project Settings → API）。
//
// 這兩個值本來就設計成可以放在前端：
//   - SUPABASE_URL：專案網址
//   - SUPABASE_ANON_KEY：公開金鑰（anon / publishable key），只能做 RLS 允許的事
// 絕對不能放進來的：service_role key、GEMINI_API_KEY（它們只放在 Supabase secrets）。
window.XK_CONFIG = {
  SUPABASE_URL: "https://你的專案代碼.supabase.co",
  SUPABASE_ANON_KEY: "貼上 anon / publishable key",
  FUNCTION_NAME: "xiaoju-answer",
};
