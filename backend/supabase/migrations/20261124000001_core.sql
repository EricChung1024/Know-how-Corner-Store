-- 經驗柑仔店｜001 核心：員工與身分
-- employees.id 對應 Supabase Auth 的使用者；role 只能是 newbie（新人）或 senior（資深）。

create table employees (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  employee_id text not null unique,            -- 工號，例如 HW261102
  role text not null check (role in ('newbie', 'senior')),
  hire_date date,                              -- 到職日；沒填就沒有考核日期
  created_at timestamptz not null default now()
);

alter table employees enable row level security;

-- 目前登入的人是不是資深（security definer：policy 裡查 employees 不會被 RLS 擋住而無限遞迴）
create function is_senior() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees where id = auth.uid() and role = 'senior');
$$;

create policy employees_self_read on employees for select to authenticated using (id = auth.uid() or is_senior());
create policy employees_senior_update on employees for update to authenticated using (is_senior()) with check (is_senior());
-- 新增員工要建 Auth 帳號，只能由 Edge Function create-user 用 service_role 做，所以沒有 insert policy。
