# 經驗柑仔店｜後端（Supabase）

網站的所有資料都放在後端；`site/` 只負責畫面。這個資料夾**不會**發布到 GitHub Pages。

## 資料夾

| 路徑 | 內容 |
| --- | --- |
| `supabase/migrations/` | 資料表、RLS、函式，依檔名順序執行 |
| `supabase/seed/question_bank.sql` | 題庫種子資料（**含標準答案**，由工具產生，不進 git） |
| `tools/build-question-bank.mjs` | 題庫匯入工具 |
| `data/difficulty.json` | 785 題的難度（Lv.1–3），沿用參考專案逐題判斷的結果 |

## 題庫匯入（785 題）

```bash
node backend/tools/build-question-bank.mjs      # 需要 Python 3（只用標準函式庫）
```

工具先跑原本的題庫產生器 `alldata/測驗功能含資料/適任考核系統/tools/build_questions.py`（讀 `統整結果_標準答案總表.xlsx`、三份題庫 CSV、`case_map`），再加上難度，輸出兩個檔：

1. `backend/supabase/seed/question_bank.sql`：寫進 `question_bank`（題目）和 `question_answers`（答案）。含答案，已加進 `.gitignore`。
2. `site/data/question_bank.json`：假資料模式用，**只有公開欄位**（沒有正確答案、解析、參考答案、得分點、選項錯誤說明）。

| 來源 | 題數 | 內容 |
| --- | --- | --- |
| rules 總表規則 | 85 | 依 SOP 規則總表出題：規則選擇／是非 R（69＋16 是非含紅線）、紅線 RL、新舊衝突 QA、傳言辨識 RU、客人應對 TIP |
| rules_ext 總表延伸 | 448 | 64 個有對應好物集 SOP 的案件：保留情境，答案改用總表規則 |
| legacy 通用題 | 252 | 其他 36 個案件：維持原本的通用電商題 |

題型：選擇 169、是非 16、簡答 600。

**難度（每題都有）**：`data/difficulty.json`，沿用參考專案 785 題逐題判斷的結果。

| 難度 | 選擇 | 是非 | 簡答 | 合計 |
| --- | --- | --- | --- | --- |
| Lv.1 基礎 | 89 | 16 | 219 | 324 |
| Lv.2 情境應用 | 50 | 0 | 300 | 350 |
| Lv.3 綜合 | 30 | 0 | 81 | 111 |

- 這份產生器的 785 題與參考專案 `題庫_785題_含答案.sql` 逐題比對過：題號、題型、題幹、正確答案位置完全相同。
- 審核狀態：總表規則 85 題來自已確認的總表，匯入就是「已審」；其餘 700 題標「待審」，資深通過才會被抽進考卷。
- 紅線題（`red_line`）：答錯就不通過的規則還沒做，目前只有標記。
- 通用選擇題的解析會引用 A／B／C，所以 `shuffle = false`（不能打亂選項）。
- 可以重複執行：題目內容會更新，**審核狀態保留**。
- 工具會先檢查（題號不重複、剛好 785 題、每題有 Lv.1–3、選擇題的正確答案在選項裡、簡答有參考答案），有問題就不產生檔案。

## 目前的 Supabase 專案

`know-how-corner-store`（ref `qpgtpeombexzixitxcol`，東京，免費方案）。migration 已套用；題庫匯入見下。

## 匯入題庫（最後一步）

`node backend/tools/build-question-bank.mjs` 會在 `backend/supabase/seed/parts/` 產生 8 份小檔。到 Supabase 後台 › SQL Editor，**依序**貼上 `question_bank_1of8.sql` … `8of8.sql` 各執行一次（每份約 65–97 KB）。可以重複執行。執行完用下面這句確認：

```sql
select * from v_question_bank_stats;   -- total 785、mcq 169、tf 16、short 600、approved 85、pending 700
```

## 套用到 Supabase（重新建專案時）

1. 建立 Supabase 專案。
2. 依序執行 `supabase/migrations/` 的 SQL（Supabase CLI：`supabase db push`；或貼到 SQL Editor）。
3. 執行 `node backend/tools/build-question-bank.mjs`，再把 `supabase/seed/question_bank.sql` 貼到 SQL Editor 執行。

## 安全

- `question_answers` 開了 RLS 但沒有任何 policy，並 revoke 了 anon／authenticated 的權限，只有 Edge Function（service_role）讀得到。
- `question_bank` 只有資深讀得到；資深只能改審核狀態，改題目內容會被 trigger 擋下（`ONLY_STATUS`）。
- 注意：`alldata/` 已經在 git 裡，裡面的題庫 CSV 本身就含答案。repo 如果要公開（免費版 GitHub Pages 需要公開 repo），要先把 `alldata/` 移出 repo 或改成私人 repo。

## 寄信通知（問答亭：新人的問題 → 資深收到信）

函式：`supabase/functions/notify-pending/`（用 Resend 寄信）。金鑰只放 Supabase 的 Secrets，不進 repo。

1. Secrets（Edge Functions › Secrets）：`RESEND_API_KEY`、`MAIL_FROM`（沒網域用 `經驗柑仔店 <onboarding@resend.dev>`）、`WEBHOOK_SECRET`（自訂一串亂數）、`NOTIFY_TO`（沒網域時填註冊 Resend 的信箱；有網域後刪掉，就會改寄給所有資深員工）。
2. 部署：`supabase functions deploy notify-pending --no-verify-jwt`（或在後台 Edge Functions › Deploy a new function 貼上 `index.ts`，並關閉 Verify JWT）。
3. 觸發：後台 Database › Webhooks › Create：Table `pending_questions`、Event `Insert`、Type `Supabase Edge Functions`（選 notify-pending）、HTTP Headers 加 `x-webhook-secret` ＝ 上面設的 `WEBHOOK_SECRET`。
4. 測試：在網站用新人帳號問一個小橘查不到的問題，信箱會收到信；Edge Functions › notify-pending › Logs 可看結果。

## 問小橘接 Gemini（RAG）

原本的 （資料庫 SQL 比對）保留當備援；新的流程是：問題 → Gemini 轉向量 →  找最像的 SOP 規則／案例 → Gemini 只根據這些資料回答。

| 問題類型 | 小橘的回答 |
| --- | --- |
| SOP 有寫 | 照 SOP 與資深確認過的案例回答，附出處與條號 |
| 跟客服有關、但 SOP 完全沒有 | 先說「SOP 裡沒有寫這題」，再用一般客服常識延伸回答；標示「非 SOP 內容，僅供參考」，不寫待確認清單 |
| 跟客服無關 | 直接說「不在 SOP 範圍內」，不回答內容 |
| 資料有相關但不足以確定 | 「新舊版都不符 → 請問資深」，寫進待確認清單 |

Gemini 沒設金鑰、額度用完、還沒算向量時， 會自動改用 ；網站前端在函式還沒部署時也會直接改用 ，所以沒部署前網站照常能用。

設定步驟（我這邊不能部署，需要你操作）：

1. 在 SQL Editor 貼上並執行 （開 pgvector、建 ，並從現行 SOP 規則與問答案例產生知識片段）。
2. Edge Functions › Secrets 確認有 （名稱要一樣；也接受 ）。選填：（預設 ）、（預設 ）。
3. 部署兩個函式，**Verify JWT 保持開啟**：、（或在後台貼上各自的 ）。
4. 用**資深帳號**登入網站後，在瀏覽器主控台執行一次  來算向量（回傳  應等於片段數）。SOP 或案例改過後再執行一次，只會重算有變動的片段。
5. 用新人帳號在「問小橘」測：問 SOP 有的題目、問「客人一直罵很難聽怎麼安撫」（延伸回答）、問「今天天氣如何」（不在範圍）。看 Edge Functions › ask-xiaoju › Logs，出現「Gemini 版失敗，改用 SQL 版」代表走了備援，原因會寫在同一行。

測試：（資料庫端，需要附 pgvector 的 PGlite 0.3.x）、（Edge Function 流程，用假回應）。

