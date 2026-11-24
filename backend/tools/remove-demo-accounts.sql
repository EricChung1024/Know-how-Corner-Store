-- 公開前：刪除兩個示範帳號（資深 林佩珊／新人 陳宥廷）與他們的所有資料。
-- 在 Supabase SQL Editor 貼上執行。執行前請先用 create-first-senior.sql 建好「真正的」資深帳號，否則會沒有人能登入。
-- 同時請把 site/src/lib/config.ts 的 SHOW_DEMO_ACCOUNTS 改成 false。

do $$
declare ids uuid[];
begin
  select array_agg(id) into ids from auth.users
   where email in ('lin.peishan@haowu.example', 'chen.yuting@haowu.example');
  if ids is null then raise notice '找不到示範帳號（可能已刪除）'; return; end if;
  -- employees 與其下的考卷、作答、問答等資料會跟著 cascade 刪除；若有 FK 擋住，錯誤訊息會指出是哪張表
  delete from public.employees where id = any(ids);
  delete from auth.identities where user_id = any(ids);
  delete from auth.users where id = any(ids);
  raise notice '已刪除 % 個示範帳號', array_length(ids, 1);
end $$;

select email from auth.users order by created_at;  -- 確認剩下的帳號
