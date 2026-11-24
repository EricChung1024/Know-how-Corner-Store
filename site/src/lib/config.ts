/* 設定。這裡不放任何管理者金鑰：service_role、Gemini 金鑰只放在 Supabase 後端。 */

/** Supabase 專案網址與 publishable key（know-how-corner-store，東京）。publishable key 本來就是公開的，靠資料表的 RLS 保護。 */
export const SUPABASE_URL = 'https://qpgtpeombexzixitxcol.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ytvGxGp2fHMT0tQB-qRbxg_IPveNTnK';

/** 登入頁與頁尾顯示的公司資訊。 */
export const COMPANY = { name: 'OO電商公司', dept: '客服部' };

/**
 * 登入頁的「自動填入示範帳號」按鈕（資深／新人各一個，方便 DEMO）。
 * ⚠️ 打開時，任何人都能填入帳號登入並改資料：正式使用前要關掉，並刪除這兩個示範帳號（backend/tools/remove-demo-accounts.sql）。
 */
export const SHOW_DEMO_ACCOUNTS = true;
export const DEMO_ACCOUNTS = [
  { role: 'senior' as const, label: '資深', name: '林佩珊', email: 'lin.peishan@haowu.example', secret: 'HW210501' },
  { role: 'newbie' as const, label: '新人', name: '陳宥廷', email: 'chen.yuting@haowu.example', secret: 'HW261102' },
];
