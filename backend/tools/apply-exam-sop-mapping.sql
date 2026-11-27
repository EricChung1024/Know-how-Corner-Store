-- 經驗柑仔店｜補上題庫「對應 SOP」＋草擬 9 條新的 SOP 規則（草稿）
-- 背景：題庫有 265 題「對應 SOP：未標示」：36 個通用案件（每案 7 題，共 252 題）＋13 題規則題。
-- 其中 SOP 本身沒寫的情境，草擬了 9 條新規則（1-4、2-5、3-7、5-9、5-10、6-8、6-9、7-13、9-5），
--   內容只整理題目情境與現行 SOP 已隱含的做法，沒有新增數字、時限、金額；「依據」欄註明「草稿，待資深確認」。
--   ⚠ 這些規則 status 是「現行」：會出現在新人／資深的 SOP 頁面，執行後在「問答統計」按「重新產生知識向量」小橘才會引用。請資深確認內容後再對外使用。
-- 信心：H 高、M 中＝SOP 有明確對應（區塊 A，84 題）；L 低＝最接近的既有規則；D＝對應新增的草稿規則（區塊 B，181 題）。
-- 完整理由見 docs/exam-sop-mapping.csv。只補 sop 還是空的題目、新規則編號已存在就略過；可重複執行。
-- 為什麼要在 SQL Editor 執行：題庫內容受 question_bank_guard 保護，登入的資深帳號改不了 sop／sop_rules，只有後台 SQL（postgres 角色）或匯入工具能改。
-- 要還原：delete from sop_rules where no in ('1-4','2-5','3-7','5-9','5-10','6-8','6-9','7-13','9-5') and basis like '草稿%';
--         update question_bank set sop = null, sop_rules = '{}' where sop in (這些編號) and source = 'legacy' ...（依需要）

begin;

-- ===== 步驟 0：新增 9 條草稿規則 =====
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('1-4', 1, '跨通路訂單', '訂單在哪個通路下單，就依該通路的規則與窗口處理（官網、市集平台、門市各有不同）。先核對購買通路與憑證，再向客戶說明可行方式，必要時協助交接給有權限的窗口，不直接承諾跨通路退款或改價。價格與活動以各通路當時的上架價與活動條件為準。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('2-5', 2, '溝通基本做法', '先講結論與時間點，再補說明；一次只講一個步驟、少用術語。文字來回超過 3 次還講不清楚，詢問客戶是否方便改打電話，外撥一律用外撥範本（見 9-3）。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('3-7', 3, '預購與現貨', '預購商品的扣款時點與到貨日，以預購頁說明與訂單設定為準，到貨日只說「預計」、不承諾確切日期（同 3-2）。同一張單含現貨與預購時，是否可拆單、運費怎麼算，先確認系統設定再回覆。預購名額與數量異動，須先確認剩餘名額，且不能影響原訂單。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('5-9', 5, '付款確認', '客戶說已付款、訂單卻仍顯示待付款，先在後台核對付款方式與入帳狀態，不憑截圖或末碼直接出貨，並告知確認時間與下次回覆時間。訂單付款方式與客戶認知不符時，先查訂單再說明，不先說「是我們搞錯」。重複扣款依 5-8。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('5-10', 5, '訂單異動', '加購、減量、改規格、取消後要恢復，依訂單狀態處理：待出貨可在OO工單處理；揀貨中須走「攔截申請」（見 5-2）；已出貨不異動，改走退換貨。取消後要恢復訂單，須確認庫存與價格是否仍相同，無法恢復時請客戶重新下單。異動產生的差額，依 7-10 退款方式處理。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('6-8', 6, '超商包裹資料不符', '客戶取貨時發現包裹上的姓名不是本人：請客戶先不要拆封、拍下包裹標籤，向超商與物流商查證；不要請客戶提供他人資料。疑似誤配或個資外洩，升級二線（見 8-4）。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('6-9', 6, '缺件、效期過短與安全疑慮', '缺配件、效期過短，依 6-5 處理（請客戶拍照取證、保留包材；3,000 元以內一線可補寄或退款，超過升級二線）。客戶反映商品過熱、冒煙等安全疑慮：請客戶立即停止使用，記錄時間與情況，並升級二線與品管，不在對話中判定原因。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('7-13', 7, '換貨：先換後收與補差價', '一般不先寄新品再收舊品，須待退換商品由物流取回或入倉驗收後再處理（同 7-8）；急需的商品瑕疵案件，是否例外由二線決定。換成較貴的商品，差額由客戶補足，確認客戶同意金額後才處理。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;
insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values ('9-5', 9, '政策公告、題庫與資料治理', '只有正式公告或 SOP 的文字才能當依據；口頭宣布或內部傳聞，未公告前先向政策負責人確認生效日與範圍，再回覆客戶。發現題庫或文件有已結束的活動、或混入他公司資料：立即停用該內容、通報管理者、協助隔離資料與查存取紀錄。', false, '現行', '草稿：依題庫案件與現行 SOP 整理，待資深確認') on conflict (no) do nothing;

-- ===== 區塊 A：SOP 有明確對應（信心高／中，84 題）=====
update question_bank set sop = '8-4', sop_rules = array['8-4', '2-2', '8-10']::text[] where source = 'legacy' and case_id = 'C029' and sop is null;   -- [M] 追蹤頁看到他人個資：涉及法規爭議，升級二線
update question_bank set sop = '3-3', sop_rules = array['3-3', '3-2']::text[] where source = 'legacy' and case_id = 'C039' and sop is null;   -- [M] 缺貨：缺貨通知規則
update question_bank set sop = '3-3', sop_rules = array['3-3', '3-1']::text[] where source = 'legacy' and case_id = 'C040' and sop is null;   -- [M] 缺貨改寄升級款：缺貨規則；補差額 SOP 沒寫
update question_bank set sop = '4-3', sop_rules = array['4-3', '4-2']::text[] where source = 'legacy' and case_id = 'C048' and sop is null;   -- [M] 下單後才打折補價差：活動限制要主動說明
update question_bank set sop = '7-8', sop_rules = array['7-8', '7-9', '7-5', '8-4']::text[] where source = 'legacy' and case_id = 'C055' and sop is null;   -- [M] 退回商品與申請不符：驗收未完成不先退款
update question_bank set sop = '3-1', sop_rules = array['3-1', '3-2']::text[] where source = 'legacy' and case_id = 'C059' and sop is null;   -- [M] 停產顏色：商品資訊只依商品頁
update question_bank set sop = '7-7', sop_rules = array['7-7', '7-9', '7-10']::text[] where source = 'legacy' and case_id = 'C064' and sop is null;   -- [M] 退貨連運費全退：退貨運費規則
update question_bank set sop = '7-9', sop_rules = array['7-9', '7-10']::text[] where source = 'legacy' and case_id = 'C065' and sop is null;   -- [H] 退款成功簡訊但沒入帳：退款時程與銀行入帳
update question_bank set sop = '5-6', sop_rules = array['5-6', '5-7']::text[] where source = 'legacy' and case_id = 'C075' and sop is null;   -- [M] 發票中獎資料有誤：發票改開
update question_bank set sop = '8-1', sop_rules = array['8-1', '2-2']::text[] where source = 'legacy' and case_id = 'C080' and sop is null;   -- [M] 公開留言要主管回電：客戶要求找主管
update question_bank set sop = '7-7', sop_rules = array['7-7']::text[] where source = 'legacy' and case_id = 'C097' and sop is null;   -- [M] 口頭宣布退貨運費吸收：以現行 7-7 與正式公告為準
update question_bank set sop = '7-9', sop_rules = array['7-9']::text[] where id = 'RU-R01' and sop is null;   -- [H] 傳言：退款時程以 SOP 7-9 為準
update question_bank set sop = '8-3', sop_rules = array['8-3']::text[] where id = 'RU-R02' and sop is null;   -- [H] 傳言：補償上限以 SOP 8-3 為準
update question_bank set sop = '8-3', sop_rules = array['8-3']::text[] where id = 'TIP-X03' and sop is null;   -- [M] 凹補償：不當場答應，送補償申請
update question_bank set sop = '8-6', sop_rules = array['8-6']::text[] where id = 'TIP-X06' and sop is null;   -- [H] 上網發文找媒體：照 8-6 升級
update question_bank set sop = '8-9', sop_rules = array['8-9']::text[] where id = 'TIP-X07' and sop is null;   -- [H] 疑似詐騙：不會要求操作 ATM，撥 165
update question_bank set sop = '6-3', sop_rules = array['6-3']::text[] where id = 'TIP-X08' and sop is null;   -- [M] 大促後物流延遲：派查與回覆
update question_bank set sop = '6-4', sop_rules = array['6-4']::text[] where id = 'TIP-X09' and sop is null;   -- [H] 系統顯示已簽收：先查簽收照片與簽收人

-- ===== 區塊 B：最接近的既有規則／新草稿規則（181 題）=====
update question_bank set sop = '5-9', sop_rules = array['5-9', '5-8', '2-4', '2-2']::text[] where source = 'legacy' and case_id = 'C012' and sop is null;   -- [D] 新增草稿規則 SOP 5-9 付款確認（原：ATM 轉帳對帳：SOP 沒寫付款確認，借 5-8（先確認授權／請款））
update question_bank set sop = '5-9', sop_rules = array['5-9', '5-8', '2-2', '7-11']::text[] where source = 'legacy' and case_id = 'C014' and sop is null;   -- [D] 新增草稿規則 SOP 5-9 付款確認（原：貨到付款顯示疑義：SOP 沒寫，借 5-8（付款狀態確認））
update question_bank set sop = '5-10', sop_rules = array['5-10', '5-1', '5-2']::text[] where source = 'legacy' and case_id = 'C019' and sop is null;   -- [D] 新增草稿規則 SOP 5-10 訂單異動（原：取消後恢復訂單：5-1 只寫取消，沒寫恢復）
update question_bank set sop = '5-10', sop_rules = array['5-10', '5-1', '7-12']::text[] where source = 'legacy' and case_id = 'C021' and sop is null;   -- [D] 新增草稿規則 SOP 5-10 訂單異動（原：訂單減量退差額：SOP 沒寫修改數量，借 5-1／7-12）
update question_bank set sop = '5-10', sop_rules = array['5-10', '5-5', '5-1']::text[] where source = 'legacy' and case_id = 'C022' and sop is null;   -- [D] 新增草稿規則 SOP 5-10 訂單異動（原：加購合併運費：SOP 沒寫，借 5-5（待出貨修改訂單））
update question_bank set sop = '5-10', sop_rules = array['5-10', '5-1', '5-2', '7-6']::text[] where source = 'legacy' and case_id = 'C025' and sop is null;   -- [D] 新增草稿規則 SOP 5-10 訂單異動（原：改尺寸：依訂單狀態（待出貨／揀貨中）處理）
update question_bank set sop = '6-3', sop_rules = array['6-3']::text[] where source = 'legacy' and case_id = 'C026' and sop is null;   -- [L] 出貨通知無追蹤碼：配送異常查詢
update question_bank set sop = '6-3', sop_rules = array['6-3', '6-1']::text[] where source = 'legacy' and case_id = 'C032' and sop is null;   -- [L] 沒收到取貨簡訊：查物流到店狀態
update question_bank set sop = '6-8', sop_rules = array['6-8', '6-1', '2-2', '8-4', '6-3']::text[] where source = 'legacy' and case_id = 'C035' and sop is null;   -- [D] 新增草稿規則 SOP 6-8 超商包裹資料不符（原：超商包裹姓名不符：SOP 沒寫，借 6-1（超商取貨））
update question_bank set sop = '3-7', sop_rules = array['3-7', '3-2', '3-1']::text[] where source = 'legacy' and case_id = 'C042' and sop is null;   -- [D] 新增草稿規則 SOP 3-7 預購與現貨（原：預購扣款：只能借「預計」到貨日說法）
update question_bank set sop = '3-7', sop_rules = array['3-7', '3-2']::text[] where source = 'legacy' and case_id = 'C043' and sop is null;   -- [D] 新增草稿規則 SOP 3-7 預購與現貨（原：現貨預購拆單：SOP 沒寫，借 3-2（預計日期））
update question_bank set sop = '3-7', sop_rules = array['3-7', '3-2', '5-1']::text[] where source = 'legacy' and case_id = 'C045' and sop is null;   -- [D] 新增草稿規則 SOP 3-7 預購與現貨（原：預購增量：SOP 沒寫，借 3-2）
update question_bank set sop = '7-13', sop_rules = array['7-13', '7-7', '7-8', '7-6']::text[] where source = 'legacy' and case_id = 'C058' and sop is null;   -- [D] 新增草稿規則 SOP 7-13 換貨：先換後收與補差價（原：壞掉先寄新品：瑕疵運費；先換後收 SOP 沒寫）
update question_bank set sop = '7-13', sop_rules = array['7-13', '7-6', '7-8', '7-10']::text[] where source = 'legacy' and case_id = 'C060' and sop is null;   -- [D] 新增草稿規則 SOP 7-13 換貨：先換後收與補差價（原：換貴款補差價：換貨規則；補差價 SOP 沒寫）
update question_bank set sop = '6-9', sop_rules = array['6-9', '6-5', '7-7']::text[] where source = 'legacy' and case_id = 'C067' and sop is null;   -- [D] 新增草稿規則 SOP 6-9 缺件、效期過短與安全疑慮（原：缺配件：借商品破損的取證與補寄）
update question_bank set sop = '6-9', sop_rules = array['6-9', '8-4', '6-5', '7-7']::text[] where source = 'legacy' and case_id = 'C068' and sop is null;   -- [D] 新增草稿規則 SOP 6-9 缺件、效期過短與安全疑慮（原：變壓器冒煙（安全）：疑涉法規，升級）
update question_bank set sop = '6-9', sop_rules = array['6-9', '7-7', '6-6', '7-3']::text[] where source = 'legacy' and case_id = 'C069' and sop is null;   -- [D] 新增草稿規則 SOP 6-9 缺件、效期過短與安全疑慮（原：效期過短：寄錯／瑕疵運費；效期規則 SOP 沒寫）
update question_bank set sop = '8-6', sop_rules = array['8-6', '8-4', '8-7']::text[] where source = 'legacy' and case_id = 'C079' and sop is null;   -- [L] 要求承認安全問題以投訴：不爭辯、記原話、升級
update question_bank set sop = '1-4', sop_rules = array['1-4', '1-3', '7-1']::text[] where source = 'legacy' and case_id = 'C086' and sop is null;   -- [D] 新增草稿規則 SOP 1-4 跨通路訂單（原：跨通路退款：SOP 沒寫，借 1-3（服務渠道））
update question_bank set sop = '1-4', sop_rules = array['1-4', '1-3', '7-1']::text[] where source = 'legacy' and case_id = 'C087' and sop is null;   -- [D] 新增草稿規則 SOP 1-4 跨通路訂單（原：門市購買網路退貨：SOP 沒寫，借 1-3／7-1）
update question_bank set sop = '1-4', sop_rules = array['1-4', '4-3', '4-1']::text[] where source = 'legacy' and case_id = 'C088' and sop is null;   -- [D] 新增草稿規則 SOP 1-4 跨通路訂單（原：平台與官網價差：SOP 沒寫，借 4-3（活動限制說明））
update question_bank set sop = '9-1', sop_rules = array['9-1', '9-4', '8-5']::text[] where source = 'legacy' and case_id = 'C094' and sop is null;   -- [L] 兩人同時回覆：工單狀態管理
update question_bank set sop = '9-5', sop_rules = array['9-5', '4-2']::text[] where source = 'legacy' and case_id = 'C098' and sop is null;   -- [D] 新增草稿規則 SOP 9-5 政策公告、題庫與資料治理（原：內部題庫含已結束活動：借 4-2（過期活動／優惠））
update question_bank set sop = '9-5', sop_rules = array['9-5', '8-4', '8-10', '2-3']::text[] where source = 'legacy' and case_id = 'C099' and sop is null;   -- [D] 新增草稿規則 SOP 9-5 政策公告、題庫與資料治理（原：內部資料外洩：借 8-4（涉及法規爭議，升級））
update question_bank set sop = '9-5', sop_rules = array['9-5', '7-3', '7-1']::text[] where source = 'legacy' and case_id = 'C100' and sop is null;   -- [D] 新增草稿規則 SOP 9-5 政策公告、題庫與資料治理（原：新政策適用範圍不明：借 7-3（須事先標示的例外商品），應問主管）
update question_bank set sop = '2-5', sop_rules = array['2-5', '2-4']::text[] where id = 'TIP-X01' and sop is null;   -- [D] 新增草稿規則 SOP 2-5 溝通基本做法（原：趕時間客人：借 2-4（先講結論與明確時間））
update question_bank set sop = '8-2', sop_rules = array['8-2']::text[] where id = 'TIP-X02' and sop is null;   -- [L] 情緒激動罵人：辱罵與騷擾
update question_bank set sop = '2-5', sop_rules = array['2-5', '9-3']::text[] where id = 'TIP-X04' and sop is null;   -- [D] 新增草稿規則 SOP 2-5 溝通基本做法（原：長輩客人：借 9-3（改打電話外撥））
update question_bank set sop = '7-9', sop_rules = array['7-9', '2-4']::text[] where id = 'TIP-X05' and sop is null;   -- [L] 焦慮催進度：給下次回覆時間、退款發起當天通知
update question_bank set sop = '8-2', sop_rules = array['8-2']::text[] where id = 'TIP-X10' and sop is null;   -- [L] 被罵到受不了：通知主管／換人
update question_bank set sop = '2-5', sop_rules = array['2-5', '9-3']::text[] where id = 'TIP-X11' and sop is null;   -- [D] 新增草稿規則 SOP 2-5 溝通基本做法（原：文字講不清：借 9-3（改打電話外撥））

commit;

-- ===== 確認：預期 未標示 0、已標示 785、總數 785；規則數 66 =====
select count(*) filter (where sop is null) as 未標示, count(*) filter (where sop is not null) as 已標示, count(*) as 總數 from question_bank;
select count(*) as 現行規則數 from sop_rules where status = '現行';
