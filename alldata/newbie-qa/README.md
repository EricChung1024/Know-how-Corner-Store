# 新人問答亭（經驗柑仔店 Know-how Corner Store）｜Supabase 版

負責人：Iris（劉俞瑄）｜交給：Eric 整併進 `Know-how-Corner-Store`
這個資料夾只包含「新人問答亭」：問小橘、我的紀錄、待確認清單、統計。

## 架構

```
瀏覽器（web/，靜態網頁，可放 GitHub Pages）
  ├─ 登入：Supabase Auth（Email＋密碼）
  ├─ 讀寫紀錄：Supabase 資料表（RLS 控權限）
  └─ 問問題 → Edge Function「xiaoju-answer」
                 ├─ 讀 kb.json（SOP 知識庫）組提示詞
                 ├─ 呼叫 Gemini（金鑰只在 Supabase secrets）
                 └─ 寫入 qa_records／pending_items
```

| 資料夾 | 內容 |
|---|---|
| `web/` | `index.html`（巷口服務所 Design System v2 樣式）、`app.js`、`config.example.js`、`kb.json`（產生的） |
| `supabase/migrations/` | 資料表、權限（RLS）、觸發器 |
| `supabase/functions/xiaoju-answer/` | 小橘回答的 Edge Function（Deno）＋ `kb.json`（產生的） |
| `supabase/functions/xiaoju-notify/` | 寄信通知的 Edge Function（由排程呼叫） |
| `supabase/setup/notify_schedule.sql` | 建立寄信排程（部署後手動執行一次） |
| `scripts/build-kb.mjs` | 把 SOP 檔轉成 `kb.json`，同時輸出到前端與 Edge Function |
| `data/` | 放 SOP 原始檔（見下方第 1 步）；`examples.json` 是 6 題標準答法範例 |

## 角色與權限

| | 新人（newbie） | 資深（senior） |
|---|---|---|
| 問小橘 | ✓ | ✗（Edge Function 會擋） |
| 我的紀錄、改自己的回饋 | ✓ 只看自己 | ✗ |
| 待確認清單 | 只看自己提出的 | 看全部，可回覆、標記已處理 |
| 統計 | 我的統計（近 7／30 天／全部） | 後台統計（今年 Q1–Q4／全部），可依新人篩選 |

- 使用者不能自己新增或刪除紀錄；紀錄只由 Edge Function 用 service role 寫入。
- 新人只能改自己題目的回饋欄位；資深只能改待確認題目的回覆欄位。
- 角色只能由管理者在 Supabase 改；新註冊的帳號一律是新人。
- 以上都已在本機 PostgreSQL 模擬 Supabase 的角色測過（新人、資深、未登入各一組）。

## 部署步驟

### 1. 產生知識庫 kb.json
把專案裡婉萱維護的 `sop_latest.json`、`sop_history.json` 複製到 `data/`，然後執行：

```bash
node scripts/build-kb.mjs
```

會輸出 `web/kb.json` 和 `supabase/functions/xiaoju-answer/kb.json`。
**SOP 有更新時**：婉萱更新原檔 → 重新複製到 `data/` → 重跑這一步 → 重新部署前端與 Edge Function。
不要直接改 `kb.json` 或 SOP JSON；要改規則內容，先在 Discord 告知婉萱。

### 2. 建立資料表
在 Supabase 後台 SQL Editor 貼上 `supabase/migrations/20261121000000_newbie_qa.sql` 執行，
或用 CLI：`supabase db push`。

> 如果整個系統已經有 `profiles` 表或「新帳號自動建 profile」的觸發器，請先比對欄位再合併，避免重複。這支 migration 需要 `profiles` 有 `id`、`display_name`、`employee_no`、`role` 四個欄位。

### 3. 建立帳號
Supabase 後台 → Authentication → Users → Add user（Email＋密碼，勾 Auto Confirm）。
建立時可在 User Metadata 填 `{"display_name":"陳宥廷","employee_no":"HW261102"}`，會自動帶進 profiles。
資深帳號建好後，在 SQL Editor 執行（換成實際 email）：

```sql
update public.profiles set role = 'senior', display_name = '林佩珊', employee_no = 'HW210501'
where id = (select id from auth.users where email = '資深的 email');
```

建議關閉公開註冊：Authentication → Sign In / Providers → 關掉「Allow new users to sign up」。

### 4. 部署 Edge Function

```bash
supabase secrets set GEMINI_API_KEY=你的金鑰
supabase secrets set ALLOWED_ORIGIN=https://<GitHub Pages 網址的網域>
# 選填：supabase secrets set GEMINI_MODEL=gemini-2.5-flash
# 選填：supabase secrets set SENIOR_CONTACT="林佩珊（或張家豪）"
supabase functions deploy xiaoju-answer
```

Gemini 沒設定或呼叫失敗時，小橘會改用關鍵字比對（畫面標示「關鍵字備援」），不會自己編答案。
每位新人每分鐘最多問 6 題，避免誤按耗費 API 額度。

### 5. 寄信通知（Gmail）

| 誰收到 | 什麼時候 | 內容 |
|---|---|---|
| 資深 | 每天 09:00（台灣時間），還有沒回覆的新人題目才寄 | 待回覆題數、昨天新增幾題、「前往待確認清單」連結 |
| 新人 | 資深回覆後，約 1 小時內（每小時第 5 分檢查一次） | 提醒登入查看回覆的連結 |

信件不寫問題細節，格式照「使用與紀錄規則」文件的信件公版。寄信是一般程式，不用 AI，不耗 token。

1. 準備一個寄件用的 Gmail：開啟兩步驟驗證 → Google 帳戶「應用程式密碼」產生 16 碼密碼。免費 Gmail 每天最多寄給 500 位收件人，這個專案用不到上限。
2. 設定 secrets 並部署：

```bash
supabase secrets set GMAIL_USER=寄件的gmail地址 GMAIL_APP_PASSWORD=16碼應用程式密碼
supabase secrets set NOTIFY_SECRET=自訂一串亂碼
supabase secrets set APP_URL=https://問答亭的網址/
supabase functions deploy xiaoju-notify --no-verify-jwt
```

`--no-verify-jwt` 是因為呼叫它的是資料庫排程，不是登入的使用者；函式改用 `NOTIFY_SECRET` 擋掉外人。

3. 先試寄（不會真的寄出，只列出會寄給誰）：

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/xiaoju-notify \
  -H "Authorization: Bearer <NOTIFY_SECRET>" -H "Content-Type: application/json" \
  -d '{"job":"senior","dry_run":true}'
```

把 `dry_run` 拿掉就會真的寄一次。

4. 建立排程：打開 `supabase/setup/notify_schedule.sql`，把 `<PROJECT_REF>`、`<NOTIFY_SECRET>` 換成實際值，在 SQL Editor 執行。檔案最下面有查看、暫停、刪除排程的指令。

- 同一天的資深提醒只會寄一次（`notify_log` 表記錄）；新人通知寄成功才標記，失敗會在下一小時重試。
- 資深更新已處理題目的回覆時，新人會再收到一次通知。
- Supabase Edge Function 不能連 25、587 埠，所以程式用 Gmail 的 465 埠。

### 6. 前端
1. 把 `web/config.example.js` 複製成 `web/config.js`，填 `SUPABASE_URL` 和 anon（publishable）key。
2. 把 `web/` 放上 GitHub Pages（或整併到主網站的子路徑，例如 `/newbie-qa/`）。
3. 在 Supabase → Authentication → URL Configuration 把網站網址加進 Site URL／Redirect URLs。

## 金鑰放哪裡

| 金鑰 | 放哪裡 | 能不能進 GitHub／前端 |
|---|---|---|
| `GEMINI_API_KEY` | Supabase secrets | ✗ 不行 |
| `service_role` key | 只在 Edge Function 內由 Supabase 自動提供 | ✗ 不行 |
| `GMAIL_APP_PASSWORD`、`NOTIFY_SECRET` | Supabase secrets（排程用的那份存在 Vault） | ✗ 不行 |
| `anon`／publishable key | `web/config.js` | 可以放前端：它是 Supabase 設計給瀏覽器用的公開金鑰，能做的事被 RLS 限制住 |

`web/config.js` 已列在 `.gitignore`，如果團隊希望 anon key 也不進 repo，可改用 GitHub Actions 部署時產生。

## 和 claude.ai 版的差異

- 帳密：示範帳號（姓名＋工號）改成 Supabase Auth 真實登入。
- AI：Claude（artifact 內建）改成 Gemini（Edge Function）。
- 知識庫：改用 `sop_latest.json`＋`sop_history.json`（專案規定的唯一依據），不再用總表。
- 寄信通知：從 claude.ai 排程＋Gmail 連接器，改成 Supabase 排程（pg_cron）＋Gmail 寄信，規則不變，且不耗 AI token。
- 舊的 claude.ai 測試紀錄沒有搬過來。

## 本機測試

- 資料庫權限：本機 PostgreSQL＋Supabase 角色模擬，測新人／資深／未登入的讀寫範圍。
- Edge Function：`deno check` 型別檢查；模擬 Gemini 正常、答不出來、失敗、沒金鑰、資深誤用五種情況。
- 前端：模擬 Supabase，測登入、問答、回饋、待確認回覆、統計。
- 寄信：本機寄信伺服器收信，測資深提醒（題數、昨天新增、同日不重寄、沒題目不寄）、新人通知（寄完標記、不重寄、回覆更新後重新通知）、密碼錯誤擋下。
- 還沒在真的 Supabase 專案、Gemini、Gmail 上跑過；`notify_schedule.sql` 用到 Supabase 才有的 pg_cron、Vault，本機沒辦法測。部署後請用下面的測試題走一遍，並先用 dry_run 試寄。

## 上線後測試題

| 題目 | 預期判斷 |
|---|---|
| 客人說之前客服跟他說退款要 7 個工作天，可是 SOP 寫驗收後 3 個工作日，哪個對？ | 已確認的變更（SOP 7-9） |
| 客人說以前有客服給過他 200 元購物金，我可以給 200 嗎？ | 舊規已失效（SOP 8-3） |
| 今天 11/20，LINE 不是放寬到 3 分鐘嗎？ | 暫時規則已過期（SOP 2-1） |
| 聽說退款之後要改成隔天就退？ | 傳言不採用（SOP 7-9） |
| 客人收到的取貨通知簡訊寫「請於 10 天內取貨」，SOP 寫 7 天，哪個對？ | 新舊版都不符 → 請問資深（進待確認清單） |
| 客人說他只是選了紅色 L 號，商品頁寫客製化商品不退，可以拒絕嗎？ | 直接回答（SOP 7-4） |
| 公司尾牙在哪裡辦？ | 不在 SOP 範圍 |
