-- 經驗柑仔店｜012 補上 SOP 統整第 3 步缺的「小橘建議」
-- 8 個要資深決定的問題裡，B03、B06、F03 有建議，A03、D07、G13、F07、G08 的建議是空的（原始資料沒填）。
-- 補法：每題的建議 = 「選了之後會變成的 SOP 規則（result_rule）」對得上的那個選項，文字與選項完全相同。
--   A03：result_rule 寫「建議（非強制）」             → 選項 1
--   D07：result_rule 寫「一線不可自行扣款…由二線決定」 → 選項 1
--   F07：result_rule 寫「不做例行回訪；主管指定才回訪」 → 選項 1（教學說法）
--   G13、G08：舊檔已失效或遺失、教學沒提到，建議依整理結果，但建議後面註明要資深確認。
-- 可以重複執行；只改 sop_confirm_items 的建議文字，不動資深已做的確認（存在 sop_flow_decisions）。

update sop_confirm_items set ai_pick = '列為「建議（非強制）」' where id = 'A03';
update sop_confirm_items set ai_pick = '一線不扣款，拍照轉二線；是否收整新費、收多少由二線決定' where id = 'D07';
update sop_confirm_items set ai_pick = '不做例行回訪；主管指定的個案才在 24 小時內回訪（教學說法）' where id = 'F07';
update sop_confirm_items set ai_pick = '改為：請客戶到會員中心 > 隱私權設定申請，無法操作就開單轉法務（舊檔只寫「轉主管處理」、教學沒提到，請資深確認）' where id = 'G13';
update sop_confirm_items set ai_pick = '改用OO工單內建「外撥範本」，舊檔停用（舊檔已遺失、教學沒提到，請資深確認）' where id = 'G08';
