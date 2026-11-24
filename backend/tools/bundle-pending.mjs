// 把還沒套用到 Supabase 的 migration 和種子資料合成一個檔案 backend/supabase/apply-006-008.sql，方便貼進後台 SQL Editor。
// 用法：node backend/tools/bundle-pending.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../supabase');
const files = ['migrations/20261124000006_sop.sql', 'migrations/20261124000007_qa.sql', 'migrations/20261124000008_home.sql', 'seed/sop_seed.sql', 'seed/qa_seed.sql'];
const head = `-- 經驗柑仔店｜一次套用 006（SOP）、007（問小橘）、008（首頁）三個 migration，再匯入 SOP 與問答案例的種子資料。
-- 在 Supabase 後台 › SQL Editor 貼上整份、按 Run 一次即可。只能執行一次（資料表已存在會報錯）；種子資料可重複執行。
-- 由 backend/tools/bundle-pending.mjs 產生，不要手改；含 SOP 內容（沒有題庫答案）。
`;
fs.writeFileSync(path.join(root, 'apply-006-008.sql'), head + files.map(f => `\n\n-- ================= ${f} =================\n` + fs.readFileSync(path.join(root, f), 'utf8')).join(''));
console.log('已產生 backend/supabase/apply-006-008.sql');
