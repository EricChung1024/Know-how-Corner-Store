# 經驗柑仔店 Know-how Corner Store｜網站程式

給客服新人用的 AI 教育系統。示範資料以虛構公司「OO電商公司」客服部為例。
純 HTML＋CSS＋原生 JavaScript（ES modules），沒有框架、沒有建置工具；部署在 GitHub Pages，資料庫預計用 Supabase。

- 定案 Mockup：「經驗柑仔店 Mockup」（claude.ai artifact，`QkK9Fr3J5VDuaD7xYr6rYz`）
- 22 頁截圖與白板：「經驗柑仔店 Mockup 白板」（`4AimQ8YFF4fmrRdqDvj3Ef`）

## 先跑起來

這個網站用 `fetch` 讀 `data/*.json`，也用 ES modules，**不能直接雙擊 HTML 開**，要用本機伺服器：

```bash
cd knowhow-corner-store
python3 -m http.server 8000
# 打開 http://localhost:8000/
```

| 示範帳號 | email／帳號 | 工號／密碼 |
| --- | --- | --- |
| 新人 陳宥廷 | chen.yuting@haowu.example | HW261102 |
| 資深 林佩珊 | lin.peishan@haowu.example | HW210501 |

- 假資料模式（`js/config.js` 的 `USE_MOCK = true`）的寫入存在瀏覽器 localStorage，同一個瀏覽器裡新人和資深的流程能串起來。
- 登入資訊存在 sessionStorage：關掉分頁就要重新登入；要切換身分請先登出。
- 登入頁頁尾的「重設示範」會清掉示範紀錄，回到第一次使用（資深還沒發布 SOP）。
- 任何頁面網址加上 `?mockFail=1`，可以看到「讀取失敗」的畫面。

### 四條流程怎麼點

1. **登入分流**：用上面兩個帳號登入，分別進新人首頁、資深首頁。
2. **SOP 發布**：資深 › SOP 統整 › 載入示範資料 › 下一步 › 確認 12 項 › 產生資深版 SOP → 新人登入後，新人版 SOP 出現「資深剛發布」提示和「最近更新」標籤。
3. **問小橘**：新人 › 問答亭 › 點右側 Q01–Q06，再輸入一個和 SOP 無關的問題 → 六種判斷標籤都會出現；Q02、Q05 會寫入待確認清單 → 資深 › 問答管理 › 回覆 → 顯示「已寄信通知」→ 新人首頁出現回覆提醒。
4. **考核**：資深 › 考核管理 › 員工總覽 › 陳宥廷 › 儲存到職日 › AI 產生試用期考卷 › 題庫審核（S2 通過）› 考卷審核補題 › 鎖定 → 新人作答、交卷（待資深覆核）→ 資深在員工詳情覆核簡答 → 新人看成績與錯誤類型 › 錯題區重練兩次 → 已掌握。

## 檔案結構

```
├─ index.html、n-*.html（11）、s-*.html（10）   一頁一個 HTML，內容由各自的 js/pages/*.js 產生
├─ css/
│  ├─ tokens.css、components.css、brand.css      brand-kit-ver-official 原檔，沒有修改
│  └─ app.css                                     頁面版面，只用 tokens.css 的變數
├─ js/
│  ├─ config.js     USE_MOCK、DEMO_TODAY、SUPABASE_URL／ANON_KEY（留空）、公司名稱
│  ├─ api.js        callFn(name, payload) → { data, error }；Supabase client
│  ├─ data.js       所有讀寫都只走這裡（54 個函式）
│  ├─ mock.js       假資料模式的實作與假 Edge Function；頁面不會直接 import
│  ├─ guard.js      requireRole()、sessionStorage 登入資訊
│  ├─ layout.js     共用頁首、導覽列、分頁、頁尾
│  ├─ ui.js         共用元件：狀態標籤、小橘、載入中／沒有資料／讀取失敗／送出成功、對話框、表單檢查
│  ├─ sop-view.js   新人版與資深版 SOP 共用的章節目錄、搜尋、條目
│  └─ pages/        每頁一支
├─ assets/          logo、icons（17）、mascot（12）、patterns（3），皆為 brand kit 原檔
└─ data/            04_示範資料的 4 個 JSON＋mock_extra.json（Mockup 補的示範值）
```

---

## 1. 頁面清單與對應的 Mockup 畫面

Mockup 截圖檔名（「經驗柑仔店_Mockup截圖.zip」）與白板上的編號相同。

| HTML | 頁面 | 對應 Mockup 畫面 | 說明 |
| --- | --- | --- | --- |
| index.html | 登入 | 00 登入 | email／帳號＋工號／密碼；卡片上方顯示 OO電商公司、客服部 |
| n-home.html | 新人首頁 | N01 新人首頁 | 下一步、到職進度路、SOP 閱讀進度、下一次考核、資深新回覆、問小橘入口 |
| n-sop.html | 新人版 SOP | N02 新人版 SOP | `?rule=7-9` 跳到條目、`?ch=7` 跳到章節 |
| n-ask.html | 問小橘 | N03 問小橘 | `?rule=7-9` 表示從 SOP 條目帶過來 |
| n-history.html | 我的提問紀錄 | N04 我的提問紀錄 | 「看對話」開單筆對話 |
| n-pending.html | 待確認清單（自己的） | N05 待確認清單 | 打開即標記已看過新回覆 |
| n-stats.html | 我的統計 | N06 我的統計 | |
| n-exam.html | 我的考核清單 | N07 我的考核清單 | |
| n-taking.html | 考試作答 | N08 考試作答 | 作答會即時暫存；交卷前有確認視窗 |
| n-result.html | 成績與錯誤類型 | N09 成績與錯誤類型 | `?attempt=` 指定哪一次，不給取最近一次 |
| n-records.html | 考核紀錄 | N10 考核紀錄 | |
| n-wrong.html | 錯題區・重練 | N11 錯題區・重練 | 連續答對 2 次就算掌握 |
| s-home.html | 資深首頁 | S01 資深首頁 | 待辦件數、考核期限快到的新人、SOP 最近發布日 |
| s-flow.html | SOP 統整 | S02 SOP 統整 | 一頁四步驟 |
| s-sop.html | 資深版 SOP | S03 資深版 SOP | 匯出 Word；`?ch=7` 跳到章節 |
| s-pending.html | 待確認清單：回覆 | S04 待確認清單：回覆 | 送出後顯示信件預覽「已寄信通知新人」 |
| s-stats.html | 問答統計 | S05 問答統計 | |
| s-employees.html | 員工總覽 | S06 員工總覽 | `?new=工號` 標示剛建立的帳號 |
| s-employee.html | 員工詳情 | S07 員工詳情 | `?id=` 帶入員工（假資料用工號） |
| s-paper.html | 考卷審核 | S08 考卷審核 | `?paper=` 指定考卷；有多份時上方可切換 |
| s-bank.html | 題庫審核 | S09 題庫審核 | |
| s-new-user.html | 新增員工 | S10 新增員工 | |

每頁都處理四種狀態：**載入中**（轉圈）、**沒有資料**（小橘說明＋下一步按鈕）、**讀取失敗**（錯誤訊息＋重新載入）、**送出成功**（畫面下方提示）。表單都有必填與格式檢查（email 格式、分數範圍、工號重複等）。

---

## 2. data.js 函式清單與預計對應的 Supabase

詳細參數與回傳欄位寫在 `js/data.js` 每個函式上方的註解。標「函式」的是 Edge Function，透過 `callFn` 呼叫；假資料模式下由 `mock.js` 回應。

| 分類 | 函式 | 預計對應 |
| --- | --- | --- |
| 登入 | `login(identifier, secret)` | **待決定（空殼）**：Edge Function 或 `auth.signInWithPassword` ＋ `employees` |
| | `logout()`、`currentUser()` | `auth.signOut`、`auth.getSession` |
| 員工 | `listEmployees()` | 檢視表 `v_employee_overview` |
| | `getEmployee(id)` | `employees`、`exam_papers`、`exam_attempts` |
| | `updateHireDate(id, date)` | `employees.hire_date` |
| | `createEmployee(input)` | 函式 `create-user`（需要 service_role）＋ `employees` |
| SOP | `getPublishedSop(mode)` | `sop_versions`、`sop_chapters`、`sop_rules`；新人用 `v_sop_newbie`（不含生效日、確認人） |
| | `getReadMarks()`、`markRuleRead(no)` | `sop_reads` |
| | `getSopUpdateNotice()`、`markSopUpdateSeen()` | `sop_versions`、`sop_update_seen` |
| SOP 統整 | `getSopFlow()` | `sop_flows`、`sop_sources`、`sop_confirm_items` |
| | `importSources(files)` | Storage 空間 `sop-sources` ＋ `sop_sources` |
| | `runOrganize()` | 函式 `organize-sop` |
| | `setFlowStep(step)`、`saveConfirmDecision(id, decision)`、`startNewRound()` | `sop_flows`、`sop_confirm_items` |
| | `generateSeniorSop()` | RPC `publish_sop`（產生即發布） |
| 問答 | `askXiaoju(question)` | 函式 `ask-xiaoju`（Gemini 金鑰只在這裡；寫 `qa_logs`、`pending_questions`） |
| | `listSuggestedQuestions()` | `qa_suggestions` |
| | `listMyAsks()`、`getAsk(id)`、`sendFeedback(id, helpful, reason)` | `qa_logs` |
| | `listMyPending()`、`markRepliesSeen()` | `pending_questions` |
| | `getMyQaStats()` | 檢視表 `v_my_qa_stats` |
| | `listPending(status)` | `pending_questions` ＋ `qa_logs` ＋ `employees` |
| | `replyPending(id, reply)` | `pending_questions` → 函式 `notify-reply`（寄信） |
| | `getQaStats()` | 檢視表 `v_qa_stats` |
| 考核（新人） | `listMyExams()` | `employees`、`exam_papers`、`exam_attempts` |
| | `getExamForTaking()`、`saveAnswerDraft(...)` | `exam_papers`、`question_bank`（公開欄位）、`exam_attempts` |
| | `submitExam(attemptId, answers)` | 函式 `grade-exam`（正確答案只在後端） |
| | `getMyResult(attemptId)`、`markResultSeen(id)`、`listMyRecords()` | `exam_attempts`、`short_reviews` |
| | `listWrongItems()` | `wrong_items` ＋ `question_bank` |
| | `submitPractice(qid, choice)` | 函式 `check-practice` |
| 考核（資深） | `listPapers()`、`getPaper(id)` | `exam_papers` ＋ `question_bank` |
| | `generatePaper(employeeId, type)` | 函式 `generate-paper` |
| | `removePaperQuestion`、`addPaperQuestion`、`lockPaper` | `exam_papers` |
| | `listBank(status)`、`setBankStatus(qid, status)` | `question_bank` |
| | `getShortReview(employeeId)` | `exam_attempts`（參考答案不回前端） |
| | `submitShortReview(attemptId, review)` | RPC `finalize_review`（寫 `short_reviews`、更新 `exam_attempts`） |
| | `getExamSettings()` | `exam_settings` |
| 首頁 | `getSeniorTodos()`、`getNewbieHome()`、`getNavCounts()` | 檢視表 `v_senior_todos`、`v_newbie_home`、`v_nav_counts` |
| 示範 | `resetDemo()` | 只在假資料模式有作用 |

---

## 3. 換成 Supabase 時要改的地方

1. **`js/config.js`**：填 `SUPABASE_URL`、`SUPABASE_ANON_KEY`，把 `USE_MOCK` 改成 `false`。anon key 可以放前端（靠 RLS 保護）；**service_role、Gemini 金鑰只放 Edge Function 的環境變數**，不要進 repo。
2. **`js/api.js`**：解開 `getSupabase()` 裡兩行註解（從 jsDelivr 載入 supabase-js），`callFn` 就會改呼叫 `functions.invoke`。
3. **`js/data.js`**：每個函式的 `notReady(...)` 換成 Supabase 查詢，回傳欄位照函式上方註解。頁面不用改。
   - `login()` 目前是空殼，要決定用哪種方式驗證「email／帳號＋工號／密碼」，成功後回傳 `{id, name, email, employeeId, role}`；`role` 只能是 `'newbie'` 或 `'senior'`。
   - `logout()` 加上 `auth.signOut()`。
4. **Edge Functions**（名稱已固定）：`ask-xiaoju`、`organize-sop`、`generate-paper`、`grade-exam`、`check-practice`、`notify-reply`、`create-user`。輸入輸出照 `js/mock.js` 裡同名的假函式。
5. **資料表**（建議，欄位可再調）：
   - `employees`（id → auth.users、name、email、employee_id 唯一、role、hire_date）
   - `sop_versions`、`sop_chapters`、`sop_rules`、`sop_reads`、`sop_update_seen`
   - `sop_flows`、`sop_sources`、`sop_confirm_items`
   - `qa_logs`、`pending_questions`、`qa_suggestions`
   - `question_bank`（題目、選項、對應 SOP、狀態）
   - **`question_answers`**（正確答案、參考答案、錯誤類型對照）：RLS 不開放任何前端角色讀取，只有 Edge Function 用 service_role 讀
   - `exam_papers`、`exam_attempts`、`short_reviews`、`wrong_items`、`exam_settings`
   - RLS 原則：新人只能讀寫自己的資料；資深可以讀全部、回覆、審核、覆核。
6. **初始資料**：`data/sop_samples.json`、`qa_cases.json`、`sample_questions.json`、`demo_accounts.json` 可以直接當種子資料匯入。`data/mock_extra.json` 是示範值，正式上線前換成定稿。
7. **示範功能**：`USE_MOCK = false` 時，登入頁的示範帳號與「重設示範」、「帶入示範回覆／評分／作答」按鈕、「示範模式」提示都會自動隱藏，不用手動刪。
8. **日期**：`config.js` 的 `today()` 在 `USE_MOCK = false` 時用真正的日期。
9. **GitHub Pages**：整個資料夾放 repo 根目錄即可（入口 `index.html`，路徑都是相對路徑）。

---

## 4. 與 Mockup 不一樣的地方和原因

| 項目 | Mockup | 這版程式 | 原因 |
| --- | --- | --- | --- |
| 頁面結構 | 單一 HTML，用網址 # 切換 | 22 個 HTML 檔，共用頁首由 layout.js 產生 | 技術規格要求一頁一檔 |
| 登入欄位 | email＋工號 | 「email／帳號」＋「工號／密碼」，卡片上方顯示「OO電商公司」「客服部」 | 11/23 定案調整 |
| 公司名稱 | 好物集、好物工單 | OO電商公司、OO工單（畫面文字與 data/ 的 JSON 一起改） | 11/23 定案調整 |
| 批改對錯 | 前端判斷 | 走 `grade-exam`、`check-practice`；假資料模式用固定示範結果（S1 算錯、S2 算對；重練一律算對），檔案裡不寫正確選項 | 正確答案不可以出現在前端或 JSON |
| 「不在 SOP 範圍」 | 用一題自編的示範提問 | 輸入任何比不到示範案例的問題，都回通用說明「這題不在OO電商公司 SOP 範圍內」 | 不自編示範提問 |
| 小橘 | xiaoju.js 產生，尾巴會甩 | 直接用 brand kit 的 SVG 圖檔，尾巴不會甩 | 規格要求圖示、Logo、小橘直接用 SVG 檔 |
| 匯出 Word | 只有說明視窗 | 真的下載 `資深版SOP.doc`（Word 可開的 HTML 格式），內容不寫日期 | 不加外部函式庫；要正式 .docx 需另外載入 docx 函式庫 |
| 示範工具 | 登入頁有「重設示範」和「快轉到四條流程都完成」 | 只保留「重設示範」，且只在假資料模式出現 | 快轉要繞過資料層直接改資料，不適合放進正式程式 |
| 寄信後的預覽 | 有「以新人身分開啟信中連結」 | 拿掉，只顯示信件預覽 | 登入資訊存在 sessionStorage，切換身分要重新登入 |
| 窄視窗 | 整頁等比縮小 | 網格改成單欄，不會出現左右捲動 | 只做桌機版，但版面不能破掉 |
| 新增的帳號 | 只出現在員工總覽 | 假資料模式下也能用 email＋工號登入（各頁顯示空狀態） | 讓「沒有資料」狀態可以實際看到 |
| 考卷審核 | 只有一份考卷 | 有多份時上方可切換；網址 `?paper=` | 員工詳情產生考卷後直接帶到該份 |

### 還沒定案、畫面標「待補」或「示範資料」的地方

- **待補**：SOP 1-1 的主題（S1、S3 對應）、S2 的對應條目、資深確認 12 項中資料包沒提到的 9 項、資深對 Q02／Q05 的回覆內容、簡答參考答案（只在後端）。
- **示範資料**（`data/mock_extra.json`）：其他 3 位新人、陳宥廷的到職日（依工號推為 2026-11-02）、及格 60 分、3 種錯誤類型、4 種「沒幫助」原因、問答統計的基準數字、匯入的 5 份來源名稱、題庫總數與狀態。
- **名稱統一**：「好物集」一律改成「OO電商公司」，SOP 條文、問答與考題裡的「好物工單」改成「OO工單」。示範 email 網域 `haowu.example` 是規格表指定的登入帳號，維持原樣。
