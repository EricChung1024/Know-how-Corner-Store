-- 清掉測試留下的資料，並把題庫審核狀態還原成「剛匯入」的樣子。
-- 在 Supabase 後台 › SQL Editor 貼上執行。可以重複執行。
-- 會刪除：所有考卷、作答與成績、錯題（目前都只是測試資料）。
-- 還原：總表規則的 85 題「已審」，其餘 700 題「待審」，並清掉審核人紀錄。
delete from wrong_items;
delete from exam_papers;   -- exam_attempts 會跟著刪除
update question_bank
   set status = case when source = 'rules' then '已審' else '待審' end,
       reviewed_by = null, reviewed_at = null, updated_at = now();

-- 確認：應該是 0、0、0、85、700
select (select count(*) from exam_papers) as papers, (select count(*) from exam_attempts) as attempts,
       (select count(*) from wrong_items) as wrong,
       (select count(*) from question_bank where status = '已審') as approved,
       (select count(*) from question_bank where status = '待審') as pending;

-- ===== 套用 006–008 並跑過 site/tests/live-sop-qa-home.html 之後，另外清掉這些測試資料 =====
-- （還沒套用 006–008 就不要執行這一段，資料表不存在會報錯）
delete from pending_questions;
delete from qa_logs;
delete from sop_reads;
delete from sop_update_seen;
delete from sop_versions;
delete from sop_flow_decisions;
delete from sop_flow_sources;
update sop_flow set step = 1, imported = false, organized = false, generated = false, reset_note = '' where id = 1;
