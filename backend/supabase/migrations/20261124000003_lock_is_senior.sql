-- 經驗柑仔店｜003 收緊 is_senior()：匿名使用者不能透過 /rest/v1/rpc/is_senior 呼叫。
-- authenticated 要保留 execute：RLS policy 用呼叫者的身分執行這個函式。
revoke execute on function public.is_senior() from public, anon;
grant execute on function public.is_senior() to authenticated;
