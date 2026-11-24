# 經驗柑仔店 Know-how Corner Store

給電商客服新人用的 AI 教育系統：**SOP 統整**、**問小橘**（AI 問答）、**考核**三個功能，一個網站、兩種身分（新人／資深）。

| 層 | 技術 |
| --- | --- |
| 網站前端 | 純 HTML＋CSS＋原生 JS（ES modules），GitHub Pages |
| 後端 | Supabase Edge Functions（免費版） |
| 資料庫 | PostgreSQL＋pgvector（向量搜尋） |
| AI | Gemini API（Embedding＋回答，金鑰只放 Edge Function） |

## 資料夾

| 路徑 | 內容 |
| --- | --- |
| `site/` | 網站本體（GitHub Pages 只發布這個資料夾） |
| `site/design-system/` | 系統規範設計稿（品牌套件），打開 `preview.html` 看所有元件 |
| `site/README-前端.md` | 頁面清單、`data.js` 函式對照、換成 Supabase 要改的地方 |
| `backend/` | 後端：Supabase migration、題庫匯入工具（見 `backend/README.md`） |
| `alldata/` | 原始資料與各組交來的原作（唯讀參考，不發布） |
| `todo.md` | 每次更新的紀錄與待辦 |

## 本機執行

網站用 `fetch` 和 ES modules，不能直接雙擊 HTML，要開本機伺服器：

```bash
cd site
python -m http.server 8000
```

- 網站：http://localhost:8000/
- 設計規範預覽：http://localhost:8000/design-system/preview.html

目前是假資料模式（`site/js/config.js` 的 `USE_MOCK = true`）。示範帳號：

| 身分 | 帳號（email） | 工號／密碼 |
| --- | --- | --- |
| 新人 陳宥廷 | chen.yuting@haowu.example | HW261102 |
| 資深 林佩珊 | lin.peishan@haowu.example | HW210501 |

## 部署

推到 `master` 後，`.github/workflows/pages.yml` 會把 `site/` 發布到 GitHub Pages
（repo 設定 › Pages › Source 選「GitHub Actions」）。

## 進度

- [x] 網頁端布局：22 頁（登入＋新人 11 頁＋資深 10 頁），假資料模式可走完四條流程
- [x] 系統規範設計稿：套件放在 `site/design-system/`，頁面樣式全部用 `tokens.css` 變數
- [x] 題庫：785 題（每題 Lv.1–3）匯入工具、資料表與 RLS（`backend/`），假資料模式已用整份題庫
- [ ] Supabase：建專案、套用 migration、`js/data.js` 換成真查詢
- [ ] Edge Functions：`ask-xiaoju`、`organize-sop`、`generate-paper`、`grade-exam`、`check-practice`、`notify-reply`、`create-user`
- [ ] 小橘 RAG：pgvector 知識片段＋Gemini
