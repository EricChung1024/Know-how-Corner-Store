-- 建立第一位「真正的」資深帳號（之後新員工都由資深在網站「新增員工」建立）。
-- 把下面三個值改成真實的，再貼到 Supabase SQL Editor 執行。登入：帳號＝email、密碼＝工號。

do $$
declare
  v_name  text := '請改成姓名';
  v_email text := 'you@example.com';
  v_eid   text := 'HW000001';          -- 工號，英數字 6–20 個字，也是初始密碼
  v_id    uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = v_email) then raise exception '此 email 已存在'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          extensions.crypt(v_eid, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), now(), now(), now());
  insert into public.employees (id, name, email, employee_id, role)
  values (v_id, v_name, v_email, v_eid, 'senior');
end $$;
