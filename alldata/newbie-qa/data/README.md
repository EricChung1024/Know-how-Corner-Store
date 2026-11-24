# data/

請把專案裡婉萱維護的這兩個檔案放在這裡（檔名不要改）：

- `sop_latest.json`：最新版 SOP（小橘回答的唯一依據）
- `sop_history.json`：舊版說法、已失效的暫時規則、傳言

然後在上一層執行 `node scripts/build-kb.mjs`。

`examples.json` 是 6 題標準答法範例（來自標準答案總表 Q01–Q06），只用來教 AI 回答的格式與判斷方式。
