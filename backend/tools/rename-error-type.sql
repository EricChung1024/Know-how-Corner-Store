-- 經驗柑仔店｜把題庫錯誤類型「用了舊規則」改成「沒選到現行規定」
-- 背景：「用了舊規則」是整題一個標籤（57 題：規則選擇 55＋規則是非 2），答錯時不管選了哪個錯誤選項都顯示同一句，
--       但很多錯誤選項其實不是舊規則（只是不完整、或單純說錯），標籤會誤導新人。
-- 影響：只改 question_answers.error_type 的文字；網站從資料庫讀，改完全站一起變，不用重新發布。可重複執行。
-- question_answers 刻意不開放給前端和資深帳號，所以要在 Supabase SQL Editor（後台）執行。
-- 要還原：把下面的兩個字串對調再執行一次。

update question_answers set error_type = '沒選到現行規定' where error_type = '用了舊規則';

-- ===== 確認：預期「沒選到現行規定」57 題、「用了舊規則」0 題 =====
select error_type, count(*) as 題數 from question_answers where error_type is not null group by error_type order by 題數 desc;

-- ===== 另外檢查：說明文字裡有沒有也寫到「舊規則」（有的話貼給我，一起改）=====
select count(*) as 說明含舊規則 from question_answers
where error_detail like '%舊規則%' or option_errors::text like '%舊規則%';
