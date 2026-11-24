# 巷口服務所・考核系統（網站發佈）

客服新人「適任評估考核」的靜態網站，供 GitHub Pages 發佈（資料全為虛構）。

- 員工：考試、看成績與錯誤類型、錯題區檢討。
- 主管：看全員成績、考核期限、題庫審核、新增員工。
- 外觀：依「巷口服務所」設計系統。

## 內容

| 路徑 | 說明 |
|---|---|
| `index.html` | 登入頁 |
| `home.html`、`exam.html`、`result.html`、`wrong.html`、`records.html` | 員工頁面 |
| `supervisor.html`、`employee.html` | 主管頁面 |
| `css/`、`js/` | 樣式與前端程式 |

後端為 Supabase；題庫與標準答案只存在資料庫，不在這個 repo 內。

原始碼、資料庫、測試與完整說明在另一個 repo（AISOP）的 `適任考核系統/`。
