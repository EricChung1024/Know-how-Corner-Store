# 巷口服務所・考核系統

好物集客服的「適任評估考核」網站（資料全為虛構）。員工考試、看成績與錯誤類型、用錯題區檢討；主管看全員成績、錯誤類型、考核期限。

- 前端：純靜態 HTML／JS（`site/`），放 GitHub Pages。外觀依「巷口服務所」設計系統（奶茶底＋陶土紅＋鵝黃、粉圓體＋思源黑體、貼紙感粗框），字型由 Google Fonts 載入。
- 後端：Supabase（登入、資料庫、權限規則、評分函式、Edge Function）。標準答案只在資料庫，員工交卷後才拿得到。

## 功能

| 角色 | 功能 |
|---|---|
| 員工 | 考核大廳（試用期／半年考核＋第 1–9 章＋綜合）、逐題作答（選擇、是非、簡答自評）、成績與錯誤類型、錯題區（篩選、筆記、重練）、考試紀錄 |
| 主管 | 全員成績矩陣（含試用期／半年期限與逾期）、員工詳情與簡答調分、設定到職日、題庫審核、批次新增員工與重設密碼 |

評分：選擇／是非自動判分；簡答依得分點自評（空白為 0，主管可調整）。總分＝100×(0.8×選擇題答對率＋0.2×簡答得分率)，及格線見「三、考核分級與調整」。

錯誤類型：用了舊規則、違反紅線、被舊資訊誤導、把傳言當規定、應對方式不當、情境判斷失誤。

## 專案結構

```
適任考核系統/
├─ site/        要部署的網站（HTML、css/app.css、js/）
├─ supabase/    資料庫：001–004 SQL、setup.sql（合併版）、tests/、functions/create-employees/
├─ tools/       題庫產生、匯入、匯出、交接包、安全檢查（Python）與 tests/
├─ runner/      本機測試工具：pglite 資料庫測試、模擬後端、Chrome 端對端（不部署）
└─ docs/        設計與實作計畫
```

題庫目前共 785 題：總表規則題 85（已審核）、`rules_ext` 448（依總表改寫，未審核）、`legacy` 252（通用內容，未審核）。綜合／試用期／半年考核只抽已審核題；章節考核連未審核題也會抽。

## 常見問題

- **不關閉自行註冊會怎樣？** 陌生人可自己建員工帳號進來考試、污染成績名單；看不到他人資料與答案，但請務必關閉（見「二、帳號」）。
- **審核後才會「進題庫」嗎？** 不是，題目都已在資料庫；審核只決定是否進入正式考核（見「四、題庫審核」）。

## 一、第一次設定 Supabase（只做一次）

1. **建立資料表與函式**：Supabase 後台 → SQL Editor → 貼上 `supabase/setup.sql` → Run。
2. **匯入題庫**（含標準答案，只在你的電腦上產生，不要放上網站）：
   ```
   python -X utf8 -I 適任考核系統/tools/build_questions.py 適任考核系統/tools/out/questions.json
   python -X utf8 -I 適任考核系統/tools/gen_seed_sql.py 適任考核系統/tools/out/questions.json 適任考核系統/supabase/seed.sql
   ```
   把 `supabase/seed.sql` 的內容貼進 SQL Editor 執行（檔案較大，貼不下可分段，每段以 `insert into questions` 開頭、`;` 結尾）。
   完成後執行 `select stage, count(*) from questions group by 1 order by 1;`，確認 1–9 章都有題。
3. **登入設定**：Authentication → Providers → Email，建議關閉「Confirm email」（帳號都由主管建立）。
4. **網址設定**：Authentication → URL Configuration → Site URL 填 GitHub Pages 網址。
5. **網站連線設定**：`site/js/config.js` 已填入專案網址與 publishable key（這把 key 設計上就是公開的）。

## 二、帳號

**第一位主管**要在後台建立（之後的員工都由主管在網站上新增）：
- Authentication → Users → **Add user**：填信箱與密碼，勾「Auto Confirm User」，User Metadata 填 `{"name": "王小明"}`（顯示姓名）。
- 新帳號預設是**員工**。設為**主管**（在 SQL Editor 執行）：
  ```sql
  update profiles set role = 'supervisor'
   where id = (select id from auth.users where email = 'boss@example.com');
  ```
- **新增員工**：主管登入 →「主管後台 → 新增員工」，貼上名單（每行 `姓名,信箱`，也可直接從 Excel 貼兩欄），系統建立帳號並產生 12 碼初始密碼。密碼**只顯示一次**，請立刻複製或下載 CSV 交給員工。
- **重設密碼**：「員工詳情」頁 → 重設密碼（只能重設員工，不能重設主管）。
- **到職日**：主管登入後，在「員工詳情」頁設定（用來算試用期與半年考核期限）。
- **務必關閉自行註冊**：Authentication → Sign In / Providers → 關閉「Allow new users to sign up」。網站沒有註冊頁，但 Supabase 的註冊介面預設是公開的，不關閉的話陌生人可以自己建帳號進來抽題。

### 新增員工的後端函式

建立帳號需要管理者金鑰，**不能放在網站裡**，所以放在 Supabase Edge Function `create-employees`（原始碼：`supabase/functions/create-employees/`）。流程：驗證呼叫者的登入權杖 → 確認是主管 → 才動用管理者金鑰（只存在函式環境變數）。更新函式：`supabase functions deploy create-employees`。純邏輯可用 `node --test "supabase/functions/create-employees/*.test.js"` 測試。

## 二之一、題庫來源與匯入

題庫共 785 題：總表規則題 85 題（已審核）＋舊題庫 700 題（未審核）。舊題庫 100 個案例中，**64 個對應得到總表規則**，答案與得分點依總表改寫（`tools/data/case_map_*.json`，來源 `rules_ext`，448 題）；其餘 36 個總表沒有規則，維持原通用內容（來源 `legacy`，252 題）。對照表見交接包的 `案例對照_題目到總表規則.csv`。

匯入 Supabase（資料量大，改用「案例層級」資料，由資料庫自己展開成 700 題）：
```
python -X utf8 -I 適任考核系統/tools/gen_case_import.py 適任考核系統/tools/out
node 適任考核系統/runner/check_case_import.mjs     # 本機驗證展開結果與構建器逐列一致
```
再依序執行 `tools/out/case_import_1.sql`～`_4.sql`（可重複執行，不會產生重複題目）。

## 二之二、交接包（給評分系統開發者）

```
python -X utf8 -I 適任考核系統/tools/export_handoff.py
```
產生 `適任考核系統/交接/評分系統資料包/` 與同名 `.zip`：全部題庫（含標準答案與得分點）、總表原始資料、題目→規則對照、資料庫快照、資料表結構，以及說明現行評分邏輯與缺口的 `00_請先讀我.md`。內容含標準答案，`交接/` 已加入 `.gitignore`，請勿提交或公開。

## 三、考核分級與調整

| 級別 | 階段 | 題數 | 及格 | 說明 |
|---|---|---|---|---|
| 章節考核 | 1–9 | 10 | 80 | 隨時練習／考核 |
| 綜合適任考核 | 0 | 30 | 80 | 全部已審核題 |
| 試用期考核 | 10 | 30 | 80 | 至少 5 題紅線題；期限＝到職日＋3 個月 |
| 半年考核 | 11 | 40 | 85 | 至少 10 題紅線題；每半年一次 |

要調整題數、及格分、紅線題保底：直接改設定表，不用改程式，例如
`update assessments set pass_score = 90 where stage = 11;`

## 四、題庫審核

舊題庫標示「示範題，待公司主管審核」，且是通用電商版本。主管在「主管後台 → 題庫審核」確認題目符合好物集 SOP 後，勾選並標為已審核。**未審核的題目不會進入綜合、試用期、半年考核**，只會出現在各章考核。

## 五、匯出全部題目

```
python -X utf8 -I 適任考核系統/tools/export_questions.py 適任考核系統/tools/out/questions.json 適任考核系統/題庫匯出/題庫總表.csv
```
用 Excel 開啟（UTF-8 含 BOM，中文不會亂碼）。內容含標準答案，**請勿放上公開網站或公開 repo**（`題庫匯出/` 已加入 .gitignore）。

## 六、部署

只把 `site/` 的內容放進網站 repo（不要放題庫、`seed.sql`、`tools/`）。部署前先檢查：
```
python -X utf8 -I 適任考核系統/tools/check_site_safe.py 適任考核系統/site
```
輸出 `OK` 才能發佈。檢查項目：沒有 secret／管理者金鑰、沒有非 anon 的 JWT、沒有題庫答案檔。

## 七、本機測試

| 指令 | 內容 |
|---|---|
| `python -X utf8 -I -m unittest discover -s 適任考核系統/tools/tests` | 題庫產生、匯出、安全檢查 |
| `node 適任考核系統/runner/run_sql_tests.mjs` | 資料庫權限與評分（本機 Postgres） |
| `node --test "適任考核系統/site/js/*.test.js"` | 前端純函式 |
| `node 適任考核系統/runner/e2e.mjs` | 真實 Chrome 端對端（含員工／主管流程） |

`runner/` 底下的 SQL 測試與端對端測試跑在**本機**的 Postgres（pglite）與模擬後端上，只是開發用的回歸測試工具，**不會部署**、也不影響網站使用的真實 Supabase。正式環境請依下列清單驗收。

## 八、正式環境驗收清單

1. 員工登入 → 首頁；手動輸入 `supervisor.html` → 被導回首頁。主管登入 → 員工總覽。
2. 員工考一次章節考核：交卷後才看到答案與解析；開發者工具 Network 看 `start_exam` 回應，確認**沒有** `correct_index`、`explanation`、`reference_answer`。
3. 故意答錯 → 錯題區出現該題；重練連續答對 2 次 → 已掌握。
4. 員工用開發者工具呼叫 `set_reviewed` → 回 `FORBIDDEN`；員工直接讀 `questions` 表 → 被拒絕。
5. 主管設到職日 → 員工首頁顯示試用期／半年期限。
6. 員工乙看不到員工甲的成績與錯題。
7. 主管「新增員工」貼 2 筆名單 → 顯示 2 組密碼；用其中一組登入，確認是員工身分；用員工身分呼叫該函式回 `FORBIDDEN`。
8. 主管在員工詳情「重設密碼」→ 舊密碼失效、新密碼可登入。
