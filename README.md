# 經驗柑仔店 Know-how Corner Store

給電商客服新人用的培訓網站：**SOP 統整**、**問小橘**（問答）、**考核**（到職滿 1／3／6 個月各一次）三個功能，一個網站、兩種身分（新人／資深）。

線上版：https://ericchung1024.github.io/Know-how-Corner-Store/

| 層 | 技術 |
| --- | --- |
| 網站前端 | Vite＋React 18＋TypeScript（strict）、react-router（HashRouter）、GitHub Pages |
| 後端／資料庫 | Supabase：PostgreSQL、Auth、RLS；所有操作都是 `security definer` 的資料庫函式（RPC） |
| 題庫答案 | 只存在後端 `question_answers` 表，前端與一般登入者讀不到 |
| 問小橘 | 目前是 SQL 比對案例與 SOP 規則；接 Gemini 見 `todo.md` |

## 資料夾

| 路徑 | 內容 |
| --- | --- |
| `site/` | 網站本體（React＋TS）。`src/lib/api.ts` 全部資料呼叫、`src/pages/` 各頁、`public/design-system/` 系統規範設計稿 |
| `site-legacy/` | 舊版純 HTML 網站，只供對照，確認不需要後可刪 |
| `backend/` | Supabase migration（001–010）、測試、題庫與 SOP 匯入工具、清理與帳號 SQL（見 `backend/README.md`） |
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

推到 `master` 後，`.github/workflows/pages.yml` 會執行 `npm ci && npm run build`，並把 `site/dist` 發布到 GitHub Pages（Pages 來源為「GitHub Actions」，已啟用）。

## 進度

- [x] 22 頁前端（登入、帳號、新人 11 頁、資深 10 頁），React＋TypeScript，全部讀真實資料庫
- [x] 後端：題庫 785 題（Lv.1–3，答案只在後端）、三階段考核（出題、鎖定、作答、批改、簡答覆核、錯題）、SOP 統整流程、問小橘、首頁、新增員工
- [x] 後端測試（PGlite）全部通過；考核、SOP、問答、首頁另用真實 Supabase 連線驗證
- [ ] SOP「AI 統整」真的讀檔（需 Gemini 金鑰與 Edge Function，目前為固定結果）
- [ ] 問小橘接 Gemini（RAG）、寄信、首次登入強制改密碼
- [ ] 公開前收尾：刪示範帳號與按鈕、決定 git 歷史（舊 commit 仍含 `alldata/`）
