-- =====================================================================
-- 新人問答亭｜寄信排程（部署好 xiaoju-notify 之後，在 SQL Editor 手動執行一次）
--
-- 排程規則（沿用原本 claude.ai 版）：
--   每天 09:00（台灣時間）提醒資深：還有沒回覆的新人題目才寄
--   每小時第 5 分通知新人：資深回覆後，約 1 小時內寄出
-- pg_cron 用 UTC 時間：台灣 09:00 = UTC 01:00
--
-- 執行前請把下面兩個值換掉：
--   <PROJECT_REF>    Supabase 專案代碼（網址 https://<PROJECT_REF>.supabase.co 的那段）
--   <NOTIFY_SECRET>  跟 supabase secrets set NOTIFY_SECRET=... 設的同一串
-- 這兩個值存在 Supabase Vault（加密保存），不會寫進 GitHub。
-- 這個檔案本身請保留佔位字，不要把真的密碼存回 repo。
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/xiaoju-notify', 'xk_notify_url');
select vault.create_secret('<NOTIFY_SECRET>', 'xk_notify_secret');

-- 共用：呼叫寄信函式
create or replace function public.xk_call_notify(job text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'xk_notify_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'xk_notify_secret')),
    body    := jsonb_build_object('job', job),
    timeout_milliseconds := 30000
  );
$$;
revoke all on function public.xk_call_notify(text) from public, anon, authenticated;

select cron.schedule('xk-remind-senior-daily', '0 1 * * *', $$ select public.xk_call_notify('senior'); $$);
select cron.schedule('xk-notify-newbie-hourly', '5 * * * *', $$ select public.xk_call_notify('newbie'); $$);

-- 查看排程：      select jobname, schedule, active from cron.job;
-- 查看執行紀錄：  select * from cron.job_run_details order by start_time desc limit 20;
-- 暫停：          select cron.alter_job((select jobid from cron.job where jobname = 'xk-notify-newbie-hourly'), active := false);
-- 刪除：          select cron.unschedule('xk-notify-newbie-hourly');
