-- 經驗柑仔店｜010 新增員工：資深在網站上建立新人／資深帳號
-- 做法：security definer 函式直接寫 auth.users／auth.identities（和建示範帳號同一個方式），不需要 service_role 金鑰或 Edge Function。
-- 初始密碼＝工號（登入頁的設計）；員工登入後應到「帳號」頁改密碼。工號至少 6 個字（Supabase Auth 密碼最短 6 個字）。

create function create_employee(p_name text, p_email text, p_employee_id text, p_role text, p_hire_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := gen_random_uuid(); mail text := lower(btrim(coalesce(p_email, ''))); code text := upper(btrim(coalesce(p_employee_id, '')));
  nm text := btrim(coalesce(p_name, ''));
begin
  perform require_senior();
  if nm = '' then raise exception '請輸入姓名'; end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email 格式不正確'; end if;
  if code !~ '^[A-Z0-9]{6,20}$' then raise exception '工號只能是英文字母與數字，6–20 個字（例如 HW261102）'; end if;
  if p_role not in ('newbie', 'senior') then raise exception '身分不正確'; end if;
  if exists (select 1 from employees where employee_id = code) then raise exception '這個工號已經有帳號了'; end if;
  if exists (select 1 from employees where lower(email) = mail) or exists (select 1 from auth.users where lower(email) = mail) then
    raise exception '這個 email 已經有帳號了';
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
          extensions.crypt(code, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true), 'email', now(), now(), now());
  insert into employees (id, name, email, employee_id, role, hire_date) values (uid, nm, mail, code, p_role, p_hire_date);
  return jsonb_build_object('id', code);
end $$;

-- 權限（規則同 005）
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.proname not like '\_%' and f.proname not in ('require_login', 'require_senior', 'sop_label', 'sop_known', 'exam_due_date', 'question_bank_guard') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
