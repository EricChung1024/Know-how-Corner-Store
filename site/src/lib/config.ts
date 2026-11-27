/* 設定。這裡不放任何管理者金鑰：service_role、Gemini 金鑰只放在 Supabase 後端。 */

/** Supabase 專案網址與 publishable key（know-how-corner-store，東京）。publishable key 本來就是公開的，靠資料表的 RLS 保護。 */
export const SUPABASE_URL = 'https://qpgtpeombexzixitxcol.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ytvGxGp2fHMT0tQB-qRbxg_IPveNTnK';

/**
 * 員工詳情頁的「刪除這位員工」按鈕。
 * 需要 Supabase 已套用 backend/supabase/migrations/20261127000013_delete_employee.sql（2026-11-27 使用者已套用、已確認函式存在）；
 * 在還沒套用的資料庫上要先設成 false，否則按「確定刪除」會報錯（找不到函式）。
 */
export const SHOW_DELETE_EMPLOYEE = true;

/** 登入頁與頁尾顯示的公司資訊。 */
export const COMPANY = { name: 'OO電商公司', dept: '客服部' };

/**
 * 登入頁的「自動填入示範帳號」按鈕（資深／新人各一個，方便 DEMO）。
 * ⚠️ 打開時，任何人都能填入帳號登入並改資料：正式使用前要關掉，並刪除這兩個示範帳號（backend/tools/remove-demo-accounts.sql）。
 */
export const SHOW_DEMO_ACCOUNTS = true;
type Demo = { role: 'senior' | 'newbie'; label: string; name: string; email: string; secret: string };
/** 示範帳號依「使用者」分組：每位使用者一個資深帳號、一個新人帳號（密碼＝工號）。名單來自團隊試算表；帳號都已在 Supabase 建立。 */
export const DEMO_USERS: { owner: string; accounts: [Demo, Demo] }[] = [
  { owner: 'Iris', accounts: [
    { role: 'senior', label: '資深', name: '鄭文豪', email: 'zheng.wenhao@haowu.example', secret: 'HW200615' },
    { role: 'newbie', label: '新人', name: '周品妍', email: 'zhou.pinyan@haowu.example', secret: 'HW261103' } ] },
  { owner: 'Eric', accounts: [
    { role: 'senior', label: '資深', name: '謝靜怡', email: 'xie.jingyi@haowu.example', secret: 'HW210903' },
    { role: 'newbie', label: '新人', name: '楊冠宇', email: 'yang.guanyu@haowu.example', secret: 'HW261104' } ] },
  { owner: '婉萱', accounts: [
    { role: 'senior', label: '資深', name: '洪志偉', email: 'hong.zhiwei@haowu.example', secret: 'HW220118' },
    { role: 'newbie', label: '新人', name: '郭芷涵', email: 'guo.zhihan@haowu.example', secret: 'HW261110' } ] },
  { owner: 'Carolyn', accounts: [
    { role: 'senior', label: '資深', name: '賴怡君', email: 'lai.yijun@haowu.example', secret: 'HW220726' },
    { role: 'newbie', label: '新人', name: '曾俊傑', email: 'zeng.junjie@haowu.example', secret: 'HW261111' } ] },
  { owner: 'Mindy', accounts: [
    { role: 'senior', label: '資深', name: '蕭建宏', email: 'xiao.jianhong@haowu.example', secret: 'HW230410' },
    { role: 'newbie', label: '新人', name: '葉雨彤', email: 'ye.yutong@haowu.example', secret: 'HW261117' } ] },
];
export type DemoAccount = Demo;
