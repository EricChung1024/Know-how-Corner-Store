-- 經驗柑仔店｜補上題庫「對應 SOP」（sop、sop_rules）
-- 背景：題庫有 265 題「對應 SOP：未標示」：36 個通用案件（每案 7 題，共 252 題）＋13 題規則題。
-- 對照依據：57 條現行 SOP 規則＋題幹與選項；完整理由與信心見 docs/exam-sop-mapping.csv。
-- 只補 sop 還是空的題目（where ... and sop is null），已標示的不會被改；可重複執行。
-- 為什麼要在 SQL Editor 執行：題庫內容受 question_bank_guard 保護，登入的資深帳號改不了 sop／sop_rules（只能改審核狀態），
--   只有後台 SQL（postgres 角色）或匯入工具能改。
-- 信心分級：H 高、M 中＝區塊 A（建議執行）；L 低＝區塊 B（預設註解掉，確認後再開）；N 無對應＝不動（SOP 本身沒寫，建議補規則）。
-- 執行完用最下面的查詢確認；改錯了可以把 sop 設回 null、sop_rules 設回 '{}'（不影響其他欄位）。

begin;

-- ===== 區塊 A：信心高／中（建議執行）=====
update question_bank set sop = '8-4', sop_rules = array['8-4', '2-2', '8-10']::text[] where source = 'legacy' and case_id = 'C029' and sop is null;   -- 追蹤頁看到他人個資：涉及法規爭議，升級二線
update question_bank set sop = '3-3', sop_rules = array['3-3', '3-2']::text[] where source = 'legacy' and case_id = 'C039' and sop is null;   -- 缺貨：缺貨通知規則
update question_bank set sop = '3-3', sop_rules = array['3-3', '3-1']::text[] where source = 'legacy' and case_id = 'C040' and sop is null;   -- 缺貨改寄升級款：缺貨規則；補差額 SOP 沒寫
update question_bank set sop = '4-3', sop_rules = array['4-3', '4-2']::text[] where source = 'legacy' and case_id = 'C048' and sop is null;   -- 下單後才打折補價差：活動限制要主動說明
update question_bank set sop = '7-8', sop_rules = array['7-8', '7-9', '7-5', '8-4']::text[] where source = 'legacy' and case_id = 'C055' and sop is null;   -- 退回商品與申請不符：驗收未完成不先退款
update question_bank set sop = '3-1', sop_rules = array['3-1', '3-2']::text[] where source = 'legacy' and case_id = 'C059' and sop is null;   -- 停產顏色：商品資訊只依商品頁
update question_bank set sop = '7-7', sop_rules = array['7-7', '7-9', '7-10']::text[] where source = 'legacy' and case_id = 'C064' and sop is null;   -- 退貨連運費全退：退貨運費規則
update question_bank set sop = '7-9', sop_rules = array['7-9', '7-10']::text[] where source = 'legacy' and case_id = 'C065' and sop is null;   -- 退款成功簡訊但沒入帳：退款時程與銀行入帳
update question_bank set sop = '5-6', sop_rules = array['5-6', '5-7']::text[] where source = 'legacy' and case_id = 'C075' and sop is null;   -- 發票中獎資料有誤：發票改開
update question_bank set sop = '8-1', sop_rules = array['8-1', '2-2']::text[] where source = 'legacy' and case_id = 'C080' and sop is null;   -- 公開留言要主管回電：客戶要求找主管
update question_bank set sop = '7-7', sop_rules = array['7-7']::text[] where source = 'legacy' and case_id = 'C097' and sop is null;   -- 口頭宣布退貨運費吸收：以現行 7-7 與正式公告為準
update question_bank set sop = '7-9', sop_rules = array['7-9']::text[] where id = 'RU-R01' and sop is null;   -- 傳言：退款時程以 SOP 7-9 為準
update question_bank set sop = '8-3', sop_rules = array['8-3']::text[] where id = 'RU-R02' and sop is null;   -- 傳言：補償上限以 SOP 8-3 為準
update question_bank set sop = '8-3', sop_rules = array['8-3']::text[] where id = 'TIP-X03' and sop is null;   -- 凹補償：不當場答應，送補償申請
update question_bank set sop = '8-6', sop_rules = array['8-6']::text[] where id = 'TIP-X06' and sop is null;   -- 上網發文找媒體：照 8-6 升級
update question_bank set sop = '8-9', sop_rules = array['8-9']::text[] where id = 'TIP-X07' and sop is null;   -- 疑似詐騙：不會要求操作 ATM，撥 165
update question_bank set sop = '6-3', sop_rules = array['6-3']::text[] where id = 'TIP-X08' and sop is null;   -- 大促後物流延遲：派查與回覆
update question_bank set sop = '6-4', sop_rules = array['6-4']::text[] where id = 'TIP-X09' and sop is null;   -- 系統顯示已簽收：先查簽收照片與簽收人

-- ===== 區塊 B：信心低（先不要執行；SOP 沒有直接對應，只是最接近的規則。確認後把前面的 -- 拿掉）=====
-- update question_bank set sop = '5-1', sop_rules = array['5-1', '5-2']::text[] where source = 'legacy' and case_id = 'C019' and sop is null;   -- 取消後恢復訂單：5-1 只寫取消，沒寫恢復
-- update question_bank set sop = '5-1', sop_rules = array['5-1', '7-12']::text[] where source = 'legacy' and case_id = 'C021' and sop is null;   -- 訂單減量退差額：SOP 沒寫修改數量，借 5-1／7-12
-- update question_bank set sop = '5-1', sop_rules = array['5-1', '5-2', '7-6']::text[] where source = 'legacy' and case_id = 'C025' and sop is null;   -- 改尺寸：依訂單狀態（待出貨／揀貨中）處理
-- update question_bank set sop = '6-3', sop_rules = array['6-3']::text[] where source = 'legacy' and case_id = 'C026' and sop is null;   -- 出貨通知無追蹤碼：配送異常查詢
-- update question_bank set sop = '6-3', sop_rules = array['6-3', '6-1']::text[] where source = 'legacy' and case_id = 'C032' and sop is null;   -- 沒收到取貨簡訊：查物流到店狀態
-- update question_bank set sop = '3-2', sop_rules = array['3-2', '3-1']::text[] where source = 'legacy' and case_id = 'C042' and sop is null;   -- 預購扣款：只能借「預計」到貨日說法
-- update question_bank set sop = '7-7', sop_rules = array['7-7', '7-8', '7-6']::text[] where source = 'legacy' and case_id = 'C058' and sop is null;   -- 壞掉先寄新品：瑕疵運費；先換後收 SOP 沒寫
-- update question_bank set sop = '7-6', sop_rules = array['7-6', '7-8', '7-10']::text[] where source = 'legacy' and case_id = 'C060' and sop is null;   -- 換貴款補差價：換貨規則；補差價 SOP 沒寫
-- update question_bank set sop = '6-5', sop_rules = array['6-5', '7-7']::text[] where source = 'legacy' and case_id = 'C067' and sop is null;   -- 缺配件：借商品破損的取證與補寄
-- update question_bank set sop = '8-4', sop_rules = array['8-4', '6-5', '7-7']::text[] where source = 'legacy' and case_id = 'C068' and sop is null;   -- 變壓器冒煙（安全）：疑涉法規，升級
-- update question_bank set sop = '7-7', sop_rules = array['7-7', '6-6', '7-3']::text[] where source = 'legacy' and case_id = 'C069' and sop is null;   -- 效期過短：寄錯／瑕疵運費；效期規則 SOP 沒寫
-- update question_bank set sop = '8-6', sop_rules = array['8-6', '8-4', '8-7']::text[] where source = 'legacy' and case_id = 'C079' and sop is null;   -- 要求承認安全問題以投訴：不爭辯、記原話、升級
-- update question_bank set sop = '9-1', sop_rules = array['9-1', '9-4', '8-5']::text[] where source = 'legacy' and case_id = 'C094' and sop is null;   -- 兩人同時回覆：工單狀態管理
-- update question_bank set sop = '8-2', sop_rules = array['8-2']::text[] where id = 'TIP-X02' and sop is null;   -- 情緒激動罵人：辱罵與騷擾
-- update question_bank set sop = '7-9', sop_rules = array['7-9', '2-4']::text[] where id = 'TIP-X05' and sop is null;   -- 焦慮催進度：給下次回覆時間、退款發起當天通知
-- update question_bank set sop = '8-2', sop_rules = array['8-2']::text[] where id = 'TIP-X10' and sop is null;   -- 被罵到受不了：通知主管／換人

commit;

-- ===== 確認：還剩幾題未標示（區塊 A 執行後預期：265 − 84 = 181 題）=====
select count(*) filter (where sop is null) as 未標示, count(*) filter (where sop is not null) as 已標示, count(*) as 總數 from question_bank;
