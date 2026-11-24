-- 權限：全部資料表啟用 RLS，用戶端只能 select；寫入只經 security definer 的 RPC。
alter table profiles enable row level security;
alter table questions enable row level security;
alter table attempts enable row level security;
alter table attempt_answers enable row level security;
alter table wrong_book enable row level security;
alter table assessments enable row level security;   -- 設定表：登入者唯讀（內容非機密），不可寫

create function is_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'supervisor' from profiles where id = auth.uid()), false)
$$;

create policy profiles_select on profiles for select
  using (id = auth.uid() or is_supervisor());
create policy attempts_select on attempts for select
  using (user_id = auth.uid() or is_supervisor());
create policy attempt_answers_select on attempt_answers for select
  using (attempt_id in (select id from attempts));
create policy wrong_book_select on wrong_book for select
  using (user_id = auth.uid() or is_supervisor());
-- questions：刻意不建任何 policy，員工與主管都不能直接 select。

create view v_stage_summary with (security_invoker = true) as
select a.user_id, p.name, a.stage,
       max(a.score) as best_score,
       count(*)::int as attempts,
       coalesce(bool_or(a.passed), false) as passed
from attempts a join profiles p on p.id = a.user_id
where a.status = 'done'
group by a.user_id, p.name, a.stage;

create view v_error_counts with (security_invoker = true) as
select aa.error_type, a.user_id, count(*)::int as cnt
from attempt_answers aa join attempts a on a.id = aa.attempt_id
where aa.error_type is not null
group by aa.error_type, a.user_id;

-- 分級設定（名稱、題數、及格分、週期）：登入者唯讀。view 用呼叫者權限，所以靠下面這條政策放行。
create policy assessments_read on assessments for select to authenticated using (true);
create view v_assessments with (security_invoker = true) as
select stage, name, kind, total_questions, pass_score, interval_months from assessments;

-- 考核期限：試用期＝到職日＋3 個月；半年考核＝（上次通過半年考核／通過試用期／到職日）＋6 個月
create view v_assessment_status with (security_invoker = true) as
select p.id as user_id, p.name, p.hire_date,
       (p.hire_date + interval '3 months')::date as probation_due,
       pr.passed_at as probation_passed_at,
       sa.last_passed_at as semiannual_last_passed_at,
       (coalesce(sa.last_passed_at, pr.passed_at, p.hire_date::timestamptz) + interval '6 months')::date as semiannual_due
from profiles p
left join lateral (select min(a.submitted_at) as passed_at from attempts a
                    where a.user_id = p.id and a.stage = 10 and a.passed) pr on true
left join lateral (select max(a.submitted_at) as last_passed_at from attempts a
                    where a.user_id = p.id and a.stage = 11 and a.passed) sa on true
where p.role = 'employee';

-- 用戶端權限：預設全收回，只開放 select（匿名什麼都不給）。
revoke all on all tables in schema public from anon, authenticated;
grant select on profiles, attempts, attempt_answers, wrong_book, v_stage_summary, v_error_counts, v_assessment_status, v_assessments, assessments to authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke all on function is_supervisor() from public, anon;
grant execute on function is_supervisor() to authenticated;
