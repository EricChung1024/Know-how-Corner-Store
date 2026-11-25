# 經驗柑仔店 Know-how Corner Store

給電商客服新人用的培訓網站：**SOP 統整**、**問小橘**（問答）、**考核**（到職滿 1／3／6 個月各一次）三個功能，一個網站、兩種身分（新人／資深）。

線上版：https://ericchung1024.github.io/Know-how-Corner-Store/

## 系統架構

```
 +----------------------------+          +-------------------------------------------+
 |  Browser (Newbie / Senior) |          |  GitHub                                   |
 |                            |  loads   |  +-------------+      +-----------------+ |
 |  React 18 + TypeScript SPA | <------- |  | Repo master | ---> | GitHub Actions  | |
 |  HashRouter, Vite build    |  static  |  +-------------+ push | npm ci + build  | |
 +-------------+--------------+  files   |                       +--------+--------+ |
               |                         |                                v          |
               |                         |                       +-----------------+ |
               |                         |                       |  GitHub Pages   | |
               |                         |                       |  (site/dist)    | |
               |                         |                       +-----------------+ |
               |                         +-------------------------------------------+
               |
               | supabase-js  (HTTPS)
               |   - Auth: email + employee ID
               |   - rpc(): every read / write is a database function
               v
 +-----------------------------------------------------------------------------------+
 |  Supabase project                                                                 |
 |                                                                                   |
 |  +-----------+    JWT     +--------------------------------------------------+    |
 |  |   Auth    | ---------> |  PostgreSQL                                      |    |
 |  | (GoTrue)  |            |                                                  |    |
 |  +-----------+            |  RPC functions (security definer)                |    |
 |                           |    require_login() / require_senior() gate each  |    |
 |                           |         |                                        |    |
 |                           |         v                                        |    |
 |                           |  Tables + RLS                                    |    |
 |                           |    employees        question_bank (785)          |    |
 |                           |    exam_papers      exam_attempts   wrong_items  |    |
 |                           |    sop_*            qa_cases  qa_logs            |    |
 |                           |    pending_questions                             |    |
 |                           |    question_answers  <-- no policy, revoked,     |    |
 |                           |                          read only inside RPC    |    |
 |                           +------------------------+-------------------------+    |
 |                                                    | INSERT on                    |
 |                                                    | pending_questions            |
 |                                                    v                              |
 |                           +--------------------------------------------------+    |
 |                           |  Database Webhook  -->  Edge Function            |    |
 |                           |                         notify-pending (Deno)    |    |
 |                           +------------------------+-------------------------+    |
 +----------------------------------------------------|------------------------------+
                                                      | HTTPS + RESEND_API_KEY
                                                      v   (stored as Edge Function secret)
                                           +----------------------+
                                           |  Resend (email API)  | ---> Senior inbox
                                           +----------------------+
```

**怎麼讀這張圖**
- **前端**：純靜態網站，放在 GitHub Pages，沒有自己的伺服器。瀏覽器直接用 `supabase-js` 連 Supabase。
- **所有資料都在後端**：前端不存題庫、分數、設定。每個動作都是呼叫一個資料庫函式（RPC），函式裡自己檢查身分（新人／資深），匿名完全不能呼叫。
- **題庫答案**：只存在 `question_answers` 表，沒有任何讀取政策，連登入的人都讀不到；只有批改函式在後端內部讀。
- **寄信**：新人的問題小橘答不出來時，會寫進待確認清單，資料庫 Webhook 觸發 Edge Function，用 Resend 寄信給資深。API key 只放在 Supabase 的 Secrets，不在前端、不在 repo。

## 技術一覽

| 層 | 技術 | 用途 |
| --- | --- | --- |
| 前端 | React 18、TypeScript（strict）、Vite、react-router（HashRouter） | 22 頁 SPA；HashRouter 因為 GitHub Pages 不支援伺服器端路由 |
| 前端 | supabase-js | 登入與 RPC 呼叫（`site/src/lib/api.ts`） |
| 後端 | Supabase PostgreSQL、Row Level Security | 資料與權限；`security definer` 函式當 API |
| 後端 | Supabase Auth | email＋工號（密碼）登入 |
| 後端 | Supabase Edge Functions（Deno） | `notify-pending`：寄信通知 |
| 寄信 | Resend | 問答亭通知信（沒有網域時只能寄到註冊 Resend 的信箱） |
| 部署 | GitHub Actions、GitHub Pages | push 到 `master` 自動建置並發布 `site/dist` |
| 測試 | Node `assert`＋PGlite（本機 Postgres） | 資料庫函式與權限測試，不用連線 |

## 資料流程：一次考核

```
  Senior                          Database                            Newbie
    |                                |                                   |
    | set hire date                  |                                   |
    |------------------------------->| exam date = hire + 1/3/6 months   |
    | generate_paper(stage)          |                                   |
    |------------------------------->| draw 20 Qs from "approved" bank   |
    | review / add / remove, lock    |                                   |
    |------------------------------->| paper locked                      |
    |                                |                                   |
    |                                |<----------------------- start_exam|
    |                                |  options shuffled per attempt     |
    |                                |<---------------------- submit_exam|
    |                                |  auto-grade choice questions      |
    |                                |  (answers read inside DB only)    |
    |                                |                                   |
    |  [paper has short answers?]    |                                   |
    |       yes: status = pending    |   newbie sees NO score yet        |
    | submit_short_review(scores)    |                                   |
    |------------------------------->| final score, pass / fail          |
    |                                |---------------------> score shown |
    |       no : graded immediately  |---------------------> score shown |
```

- 一份考卷 100 分，每題平分；答錯任何紅線題就不通過。
- 有簡答題時，資深給完分之前，新人看不到分數、對錯、錯題（見 migration 011）。

## 資料夾

| 路徑 | 內容 |
| --- | --- |
| `site/` | 網站本體（React＋TS）。`src/lib/api.ts` 全部資料呼叫、`src/pages/` 各頁、`public/design-system/` 系統規範設計稿 |
| `site-legacy/` | 舊版純 HTML 網站，只供對照，確認不需要後可刪 |
| `backend/supabase/migrations/` | 資料庫 migration（001–011） |
| `backend/supabase/functions/` | Edge Function（`notify-pending`） |
| `backend/tests/` | 資料庫測試 |
| `backend/tools/` | 題庫／SOP 匯入工具、清理與帳號 SQL（見 `backend/README.md`） |
| `todo.md` | 每次更新的紀錄與**待做清單**（交接用，先讀這個） |
| `alldata/` | 原始資料（含題庫標準答案），只留本機，不進 git |

## 本機執行

```bash
cd site
npm install
npm run dev        # http://localhost:8000/
npm run typecheck  # 型別檢查
npm run build      # 輸出 site/dist
```

資料庫測試（本機 PGlite，不連線）：`node backend/tests/<檔名>.test.mjs <專案根目錄> <pglite 資料夾>`，細節見 `todo.md`。

## 登入

帳號是 email，密碼是工號。登入頁目前有「自動填入：資深／新人」兩個示範按鈕（`site/src/lib/config.ts` 的 `SHOW_DEMO_ACCOUNTS`），方便 DEMO。

> ⚠️ 示範按鈕開著時，任何人都能用資深身分登入並改資料。正式使用前：把 `SHOW_DEMO_ACCOUNTS` 改 `false`，用 `backend/tools/create-first-senior.sql` 建真的資深帳號，再用 `backend/tools/remove-demo-accounts.sql` 刪掉示範帳號。之後新員工由資深在網站「新增員工」建立。

## 部署

推到 `master` 後，`.github/workflows/pages.yml` 會執行 `npm ci && npm run build`，並把 `site/dist` 發布到 GitHub Pages（Pages 來源為「GitHub Actions」）。

寄信通知（Resend＋Edge Function＋Database Webhook）的設定步驟見 `backend/README.md`「寄信通知」。

## 進度

- [x] 22 頁前端（登入、帳號、新人 11 頁、資深 10 頁），React＋TypeScript，全部讀真實資料庫
- [x] 後端：題庫 785 題（Lv.1–3，答案只在後端）、三階段考核、SOP 統整流程、問小橘、首頁、新增員工
- [x] 資深版 SOP 匯出 Word、匯出 PDF（瀏覽器列印轉 PDF，文字可搜尋）
- [x] 問答亭寄信通知（新人問題 → 資深收信；目前只寄到註冊 Resend 的信箱）
- [x] 後端測試（PGlite）全部通過；考核、SOP、問答、首頁另用真實 Supabase 連線驗證
- [ ] SOP「AI 統整」真的讀檔（需 Gemini 金鑰與 Edge Function，目前為固定結果）
- [ ] 問小橘接 Gemini（RAG）、回覆後寄信給新人
- [ ] 公開前收尾：刪示範帳號與按鈕、決定 git 歷史（舊 commit 仍含 `alldata/`）、有網域後把寄信改成寄給所有資深
