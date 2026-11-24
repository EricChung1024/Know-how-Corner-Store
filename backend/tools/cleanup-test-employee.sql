-- 刪除實測用的「測試新人」（TEST0001）與他的考卷、作答、錯題等資料。在 Supabase SQL Editor 執行。
do $$
declare uid uuid;
begin
  select id into uid from auth.users where email = 'test.newbie@haowu.example';
  if uid is null then raise notice '找不到測試帳號（可能已刪除）'; return; end if;
  delete from public.employees where id = uid;
  delete from auth.identities where user_id = uid;
  delete from auth.users where id = uid;
  raise notice '已刪除測試帳號';
end $$;

select email from auth.users order by created_at;  -- 應只剩兩個示範帳號
