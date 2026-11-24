// 只放 Supabase 的專案網址與公開的 publishable（anon）key。
// 絕對不要放任何 secret／管理者金鑰（部署前會用 tools/check_site_safe.py 檢查）。
export const SUPABASE_URL = 'https://pdfdyuahpshrrdwkvyyh.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Y-kb7sdRH_HwtH8URcoUqw_-eS-WaKY';

export const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');
