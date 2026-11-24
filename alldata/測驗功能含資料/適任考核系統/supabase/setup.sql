-- 適任考核系統：資料庫安裝腳本（自動合併 001～004，請勿手改；改 001～004 後執行 tools/build_setup_sql.py）

-- ===== 001_schema.sql =====
-- 適任考核系統：資料表與觸發器
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'employee' check (role in ('employee', 'supervisor')),
  hire_date date   -- 到職日，由主管設定；用來算試用期與半年考核期限
);

-- 考核分級設定：0 綜合練習、1–9 章節、10 試用期考核、11 半年考核。調整題數／及格分／期限改這裡。
create table assessments (
  stage int primary key check (stage between 0 and 11),
  name text not null,
  kind text not null check (kind in ('chapter', 'comprehensive', 'probation', 'semiannual')),
  total_questions int not null,
  short_max int not null,
  pass_score numeric not null,
  red_min int not null default 0,      -- 至少抽幾題紅線題（只用在綜合類）
  interval_months int                  -- 重複週期（月）；null＝不重複
);
insert into assessments (stage, name, kind, total_questions, short_max, pass_score, red_min, interval_months) values
  (0, '綜合適任考核', 'comprehensive', 30, 4, 80, 0, null),
  (1, '章節考核', 'chapter', 10, 2, 80, 0, null), (2, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (3, '章節考核', 'chapter', 10, 2, 80, 0, null), (4, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (5, '章節考核', 'chapter', 10, 2, 80, 0, null), (6, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (7, '章節考核', 'chapter', 10, 2, 80, 0, null), (8, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (9, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (10, '試用期考核', 'probation', 30, 4, 80, 5, null),
  (11, '半年考核', 'semiannual', 40, 4, 85, 10, 6);

create table questions (
  id text primary key,
  stage int not null check (stage between 1 and 9),
  qtype text not null check (qtype in ('mcq', 'tf', 'short')),
  stem text not null,
  options jsonb,
  correct_index int,
  explanation text not null default '',
  error_type text,
  error_detail text,
  option_errors jsonb,
  reference_answer text,
  rubric jsonb,
  key_error text,
  source text not null default 'rules',
  source_ref text,
  reviewed boolean not null default false,
  red_line boolean not null default false,
  shuffle boolean not null default true   -- false：選項順序固定（舊題的解析引用 A/B/C）
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  stage int not null check (stage between 0 and 11),
  question_ids jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'pending_selfcheck', 'done')),
  score numeric,
  passed boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index attempts_user_idx on attempts (user_id);

create table attempt_answers (
  attempt_id uuid not null references attempts (id) on delete cascade,
  question_id text not null references questions (id),
  choice int,
  text_answer text,
  checked jsonb,
  points numeric,
  is_correct boolean,
  error_type text,
  error_detail text,
  primary key (attempt_id, question_id)
);

create table wrong_book (
  user_id uuid not null references profiles (id) on delete cascade,
  question_id text not null references questions (id),
  wrong_count int not null default 1,
  streak int not null default 0,
  status text not null default 'open' check (status in ('open', 'mastered')),
  note text,
  last_wrong_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- 新的 auth 使用者自動建立 employee profile
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, role)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
          'employee');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ===== 002_rls.sql =====
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

-- ===== 003_exam_rpc.sql =====
-- 考試 RPC：抽題、交卷、自評。標準答案只在交卷後由這裡回傳。
-- 錯誤碼（raise exception 的訊息）：NOT_AUTHENTICATED、BAD_STAGE、NO_QUESTIONS、ATTEMPT_CLOSED

-- 內部：把答錯（或簡答未得滿分）的題目寫入錯題區
create function _record_wrong(p_user uuid, p_question text) returns void
language sql security definer set search_path = public as $$
  insert into wrong_book (user_id, question_id) values (p_user, p_question)
  on conflict (user_id, question_id) do update
    set wrong_count = wrong_book.wrong_count + 1, streak = 0, status = 'open', last_wrong_at = now();
$$;

-- 內部：依 attempt 的題目順序產生逐題報告（含正確答案與解析，只在交卷後使用）
create function _attempt_report(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  qq jsonb; q questions; aa attempt_answers; perm jsonb; out jsonb := '[]'::jsonb; item jsonb;
begin
  for qq in select e from jsonb_array_elements((select question_ids from attempts where id = p_attempt)) e loop
    select * into q from questions where id = qq ->> 'id';
    select * into aa from attempt_answers where attempt_id = p_attempt and question_id = q.id;
    perm := qq -> 'perm';
    if q.qtype = 'short' then
      item := jsonb_build_object(
        'question_id', q.id, 'qtype', 'short', 'stem', q.stem, 'text_answer', aa.text_answer,
        'reference_answer', q.reference_answer, 'rubric', q.rubric, 'checked', aa.checked,
        'points', aa.points, 'explanation', q.explanation, 'error_type', aa.error_type,
        'error_detail', aa.error_detail);
    else
      item := jsonb_build_object(
        'question_id', q.id, 'qtype', q.qtype, 'stem', q.stem,
        'options', (select jsonb_agg(q.options -> (v::int) order by i) from jsonb_array_elements(perm) with ordinality t(v, i)),
        'chosen', (select i - 1 from jsonb_array_elements(perm) with ordinality t(v, i) where v::int = aa.choice),
        'correct', (select i - 1 from jsonb_array_elements(perm) with ordinality t(v, i) where v::int = q.correct_index),
        'is_correct', coalesce(aa.is_correct, false), 'explanation', q.explanation,
        'error_type', aa.error_type, 'error_detail', aa.error_detail);
    end if;
    out := out || item;
  end loop;
  return out;
end $$;

-- 內部：結算分數。選擇 80%＋簡答 20%；只有一類題時該類 100%。
create function _finalize_attempt(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  mcq_total int; mcq_right int; short_total int; short_pts numeric; v_score numeric; v_passed boolean; v_pass numeric;
begin
  select count(*) filter (where q.qtype <> 'short'),
         count(*) filter (where q.qtype <> 'short' and aa.is_correct),
         count(*) filter (where q.qtype = 'short'),
         coalesce(sum(aa.points) filter (where q.qtype = 'short'), 0)
    into mcq_total, mcq_right, short_total, short_pts
  from attempt_answers aa join questions q on q.id = aa.question_id
  where aa.attempt_id = p_attempt;

  v_score := case
    when mcq_total > 0 and short_total > 0 then 100 * (0.8 * mcq_right / mcq_total + 0.2 * short_pts / short_total)
    when mcq_total > 0 then 100.0 * mcq_right / mcq_total
    when short_total > 0 then 100 * short_pts / short_total
    else 0 end;
  v_score := round(v_score, 1);
  select pass_score into v_pass from assessments where stage = (select stage from attempts where id = p_attempt);
  v_passed := v_score >= coalesce(v_pass, 80);
  update attempts set score = v_score, passed = v_passed, status = 'done', submitted_at = coalesce(submitted_at, now()) where id = p_attempt;
  return jsonb_build_object('status', 'done', 'attempt_id', p_attempt, 'score', v_score,
                            'passed', v_passed, 'pass_score', coalesce(v_pass, 80), 'items', _attempt_report(p_attempt));
end $$;

create function start_exam(p_stage int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); cfg assessments; v_short_n int; v_choice_n int; v_red_ids text[];
  v_ids text[]; q questions; perm int[]; v_qids jsonb := '[]'::jsonb; v_client jsonb := '[]'::jsonb; v_att uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into cfg from assessments where stage = p_stage;
  if not found then raise exception 'BAD_STAGE'; end if;
  -- 章節考核：該章全部題目（含未審核舊題）；綜合類（綜合／試用期／半年）：全部已審核題

  select least(cfg.short_max, count(*)) into v_short_n from questions
   where qtype = 'short' and (case when cfg.kind = 'chapter' then stage = p_stage else reviewed end);
  v_choice_n := cfg.total_questions - v_short_n;

  v_red_ids := case when cfg.red_min > 0
    then array(select id from questions where qtype <> 'short' and reviewed and red_line
                and (case when cfg.kind = 'chapter' then stage = p_stage else true end)
                order by random() limit least(cfg.red_min, v_choice_n))
    else '{}'::text[] end;

  v_ids := v_red_ids
        || array(select id from questions where qtype <> 'short' and not (id = any (v_red_ids))
                    and (case when cfg.kind = 'chapter' then stage = p_stage else reviewed end)
                  order by random() limit v_choice_n - coalesce(array_length(v_red_ids, 1), 0))
        || array(select id from questions where qtype = 'short'
                    and (case when cfg.kind = 'chapter' then stage = p_stage else reviewed end)
                  order by random() limit v_short_n);
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'NO_QUESTIONS'; end if;

  for q in select * from questions where id = any (v_ids) order by random() loop
    if q.qtype = 'mcq' and q.shuffle then
      perm := array(select g - 1 from generate_series(1, jsonb_array_length(q.options)) g order by random());
    elsif q.qtype in ('mcq', 'tf') then
      perm := array(select g - 1 from generate_series(1, jsonb_array_length(q.options)) g order by g);
    else
      perm := null;
    end if;
    v_qids := v_qids || jsonb_build_object('id', q.id, 'perm', to_jsonb(perm));
    v_client := v_client || jsonb_build_object(
      'id', q.id, 'qtype', q.qtype, 'stem', q.stem,
      'options', case when perm is null then null
                      else (select jsonb_agg(q.options -> p order by ord) from unnest(perm) with ordinality u(p, ord)) end);
  end loop;

  insert into attempts (user_id, stage, question_ids) values (v_uid, p_stage, v_qids) returning id into v_att;
  return jsonb_build_object('attempt_id', v_att, 'stage', p_stage, 'questions', v_client);
end $$;

create function submit_exam(p_attempt uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  att attempts; qq jsonb; q questions; a jsonb; v_shown int; v_orig int; v_ok boolean; v_has_short boolean := false;
  v_report jsonb;
begin
  select * into att from attempts where id = p_attempt and user_id = auth.uid() for update;
  if not found or att.status <> 'in_progress' then raise exception 'ATTEMPT_CLOSED'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then p_answers := '[]'::jsonb; end if;

  for qq in select e from jsonb_array_elements(att.question_ids) e loop
    select * into q from questions where id = qq ->> 'id';
    select e into a from jsonb_array_elements(p_answers) e where e ->> 'question_id' = q.id limit 1;
    if q.qtype = 'short' then
      v_has_short := true;
      insert into attempt_answers (attempt_id, question_id, text_answer)
      values (p_attempt, q.id, left(coalesce(a ->> 'text', ''), 5000));   -- 作答上限 5000 字
    else
      v_shown := case when a is not null and jsonb_typeof(a -> 'choice') = 'number' then (a ->> 'choice')::int end;
      v_orig := case when v_shown is not null and v_shown >= 0 and v_shown < jsonb_array_length(qq -> 'perm')
                     then (qq -> 'perm' ->> v_shown)::int end;
      v_ok := coalesce(v_orig = q.correct_index, false);
      insert into attempt_answers (attempt_id, question_id, choice, is_correct, error_type, error_detail)
      values (p_attempt, q.id, v_orig, v_ok,
              case when v_ok then null else q.error_type end,
              case when v_ok then null else coalesce(q.option_errors ->> v_orig, q.error_detail) end);
      if not v_ok then perform _record_wrong(att.user_id, q.id); end if;
    end if;
  end loop;

  if v_has_short then
    update attempts set status = 'pending_selfcheck' where id = p_attempt;
    v_report := _attempt_report(p_attempt);
    return jsonb_build_object(
      'status', 'pending_selfcheck', 'attempt_id', p_attempt,
      'mcq_items', (select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(v_report) e where e ->> 'qtype' <> 'short'),
      'short_items', (select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(v_report) e where e ->> 'qtype' = 'short'));
  end if;
  return _finalize_attempt(p_attempt);
end $$;

create function submit_selfcheck(p_attempt uuid, p_checks jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  att attempts; r record; c jsonb; v_n int; v_hit int; v_pts numeric;
begin
  select * into att from attempts where id = p_attempt and user_id = auth.uid() for update;
  if not found or att.status <> 'pending_selfcheck' then raise exception 'ATTEMPT_CLOSED'; end if;
  if p_checks is null or jsonb_typeof(p_checks) <> 'array' then p_checks := '[]'::jsonb; end if;

  for r in select aa.question_id, aa.text_answer, q.rubric, q.error_type, q.key_error, q.error_detail
             from attempt_answers aa join questions q on q.id = aa.question_id
            where aa.attempt_id = p_attempt and q.qtype = 'short' loop
    select e into c from jsonb_array_elements(p_checks) e where e ->> 'question_id' = r.question_id limit 1;
    v_n := greatest(jsonb_array_length(r.rubric), 1);
    select count(distinct v::int) into v_hit
      from jsonb_array_elements_text(coalesce(c -> 'checked', '[]'::jsonb)) v
     where v ~ '^[0-9]+$' and v::int < v_n;
    -- 空白作答不能靠自評拿分
    v_pts := case when btrim(coalesce(r.text_answer, '')) = '' then 0 else v_hit::numeric / v_n end;
    update attempt_answers
       set checked = coalesce(c -> 'checked', '[]'::jsonb), points = v_pts, is_correct = v_pts >= 1,
           error_type = case when v_pts >= 1 then null else r.error_type end,
           error_detail = case when v_pts >= 1 then null else coalesce(r.key_error, r.error_detail) end
     where attempt_id = p_attempt and question_id = r.question_id;
    if v_pts < 1 then perform _record_wrong(att.user_id, r.question_id); end if;
  end loop;
  return _finalize_attempt(p_attempt);
end $$;

-- 權限：內部函式不開放；RPC 只開給登入使用者
revoke all on function _record_wrong(uuid, text), _attempt_report(uuid), _finalize_attempt(uuid)
  from public, anon, authenticated;
revoke all on function start_exam(int), submit_exam(uuid, jsonb), submit_selfcheck(uuid, jsonb) from public, anon;
grant execute on function start_exam(int), submit_exam(uuid, jsonb), submit_selfcheck(uuid, jsonb) to authenticated;

-- ===== 004_review_rpc.sql =====
-- 錯題區與主管用 RPC。
-- 錯誤碼：NO_WRONG、ATTEMPT_CLOSED、BAD_STATUS、BAD_POINTS、FORBIDDEN、NOT_FOUND

create table practice_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  question_ids jsonb not null,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table practice_runs enable row level security;
revoke all on practice_runs from anon, authenticated;

create function _require_supervisor() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_supervisor() then raise exception 'FORBIDDEN'; end if;
end $$;

-- 本人的錯題（答錯過的題才會出現，所以解析與正確答案可以給）
create function list_wrong(p_stage int default null, p_error_type text default null, p_status text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.last_wrong_at desc), '[]'::jsonb)
  from (
    select w.question_id, q.stage, q.qtype, q.stem, q.options, q.correct_index, q.explanation,
           q.reference_answer, q.rubric,
           coalesce(la.error_type, q.error_type) as error_type, la.error_detail,
           w.wrong_count, w.streak, w.status, w.note, w.last_wrong_at,
           jsonb_build_object('choice', la.choice, 'text_answer', la.text_answer) as my_answer
    from wrong_book w
    join questions q on q.id = w.question_id
    left join lateral (
      select aa.choice, aa.text_answer, aa.error_type, aa.error_detail
      from attempt_answers aa join attempts a on a.id = aa.attempt_id
      where a.user_id = w.user_id and aa.question_id = w.question_id
      order by a.started_at desc limit 1
    ) la on true
    where w.user_id = auth.uid()
      and (p_stage is null or q.stage = p_stage)
      and (p_status is null or w.status = p_status)
      and (p_error_type is null or coalesce(la.error_type, q.error_type) = p_error_type)
  ) t
$$;

create function start_practice(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); q questions; perm int[]; v_qids jsonb := '[]'::jsonb; v_client jsonb := '[]'::jsonb; v_run uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  for q in select qs.* from questions qs join wrong_book w on w.question_id = qs.id
            where w.user_id = v_uid and w.status = 'open' and qs.qtype <> 'short'
            order by random() limit greatest(coalesce(p_limit, 10), 1) loop
    perm := case when q.qtype = 'mcq' and q.shuffle
                 then array(select g - 1 from generate_series(1, jsonb_array_length(q.options)) g order by random())
                 else array(select g - 1 from generate_series(1, jsonb_array_length(q.options)) g order by g) end;
    v_qids := v_qids || jsonb_build_object('id', q.id, 'perm', to_jsonb(perm));
    v_client := v_client || jsonb_build_object('id', q.id, 'qtype', q.qtype, 'stem', q.stem,
      'options', (select jsonb_agg(q.options -> p order by ord) from unnest(perm) with ordinality u(p, ord)));
  end loop;
  if jsonb_array_length(v_qids) = 0 then raise exception 'NO_WRONG'; end if;
  insert into practice_runs (user_id, question_ids) values (v_uid, v_qids) returning id into v_run;
  return jsonb_build_object('practice_id', v_run, 'questions', v_client);
end $$;

create function submit_practice(p_practice uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  run practice_runs; qq jsonb; q questions; a jsonb; v_shown int; v_orig int; v_ok boolean; w wrong_book;
  items jsonb := '[]'::jsonb; v_right int := 0; v_total int := 0;
begin
  select * into run from practice_runs where id = p_practice and user_id = auth.uid() for update;
  if not found or run.closed then raise exception 'ATTEMPT_CLOSED'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then p_answers := '[]'::jsonb; end if;

  for qq in select e from jsonb_array_elements(run.question_ids) e loop
    select * into q from questions where id = qq ->> 'id';
    select e into a from jsonb_array_elements(p_answers) e where e ->> 'question_id' = q.id limit 1;
    v_shown := case when a is not null and jsonb_typeof(a -> 'choice') = 'number' then (a ->> 'choice')::int end;
    v_orig := case when v_shown is not null and v_shown >= 0 and v_shown < jsonb_array_length(qq -> 'perm')
                   then (qq -> 'perm' ->> v_shown)::int end;
    v_ok := coalesce(v_orig = q.correct_index, false);
    v_total := v_total + 1;
    if v_ok then
      v_right := v_right + 1;
      update wrong_book set streak = streak + 1,
             status = case when streak + 1 >= 2 then 'mastered' else status end
       where user_id = run.user_id and question_id = q.id returning * into w;
    else
      update wrong_book set streak = 0, wrong_count = wrong_count + 1, status = 'open', last_wrong_at = now()
       where user_id = run.user_id and question_id = q.id returning * into w;
    end if;
    items := items || jsonb_build_object(
      'question_id', q.id, 'stem', q.stem,
      'options', (select jsonb_agg(q.options -> (v::int) order by i) from jsonb_array_elements(qq -> 'perm') with ordinality t(v, i)),
      'chosen', v_shown,
      'correct', (select i - 1 from jsonb_array_elements(qq -> 'perm') with ordinality t(v, i) where v::int = q.correct_index),
      'is_correct', v_ok, 'explanation', q.explanation, 'streak', w.streak, 'status', w.status);
  end loop;
  update practice_runs set closed = true where id = p_practice;
  return jsonb_build_object('practice_id', p_practice, 'correct', v_right, 'total', v_total, 'items', items);
end $$;

create function set_wrong_note(p_question text, p_note text) returns void
language sql security definer set search_path = public as $$
  update wrong_book set note = left(p_note, 2000) where user_id = auth.uid() and question_id = p_question  -- 筆記上限 2000 字
$$;

create function set_wrong_status(p_question text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open', 'mastered') then raise exception 'BAD_STATUS'; end if;
  update wrong_book set status = p_status, streak = case when p_status = 'open' then 0 else streak end
   where user_id = auth.uid() and question_id = p_question;
end $$;

-- 主管：調整簡答單題分數（0–1），重算整份考卷
create function adjust_short_score(p_attempt uuid, p_question text, p_points numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _require_supervisor();
  if p_points is null or p_points < 0 or p_points > 1 then raise exception 'BAD_POINTS'; end if;
  update attempt_answers aa set points = p_points, is_correct = p_points >= 1
   from attempts a, questions q
   where aa.attempt_id = p_attempt and aa.question_id = p_question and a.id = aa.attempt_id
     and a.status = 'done' and q.id = aa.question_id and q.qtype = 'short';
  if not found then raise exception 'NOT_FOUND'; end if;
  return _finalize_attempt(p_attempt);
end $$;

create function set_reviewed(p_ids text[], p_reviewed boolean) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _require_supervisor();
  update questions set reviewed = p_reviewed where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

create function list_questions_for_review(p_stage int default null, p_reviewed boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _require_supervisor();
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.stage, q.id), '[]'::jsonb)
            from questions q
           where (p_stage is null or q.stage = p_stage) and (p_reviewed is null or q.reviewed = p_reviewed));
end $$;

revoke all on function _require_supervisor() from public, anon, authenticated;
revoke all on function list_wrong(int, text, text), start_practice(int), submit_practice(uuid, jsonb),
  set_wrong_note(text, text), set_wrong_status(text, text), adjust_short_score(uuid, text, numeric),
  set_reviewed(text[], boolean), list_questions_for_review(int, boolean) from public, anon;
grant execute on function list_wrong(int, text, text), start_practice(int), submit_practice(uuid, jsonb),
  set_wrong_note(text, text), set_wrong_status(text, text), adjust_short_score(uuid, text, numeric),
  set_reviewed(text[], boolean), list_questions_for_review(int, boolean) to authenticated;

-- 主管：單一員工詳情（常錯題前 10、未掌握／已掌握數、最近 20 筆簡答作答原文）
create function get_employee_detail(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _require_supervisor();
  return jsonb_build_object(
    'wrong', (select coalesce(jsonb_agg(to_jsonb(x) order by x.wrong_count desc, x.question_id), '[]'::jsonb)
                from (select w.question_id, q.stage, q.qtype, q.stem, q.error_type, w.wrong_count, w.status
                        from wrong_book w join questions q on q.id = w.question_id
                       where w.user_id = p_user
                       order by w.wrong_count desc, w.question_id limit 10) x),
    'open_count', (select count(*) from wrong_book where user_id = p_user and status = 'open'),
    'mastered_count', (select count(*) from wrong_book where user_id = p_user and status = 'mastered'),
    'short_answers', (select coalesce(jsonb_agg(to_jsonb(y) order by y.submitted_at desc), '[]'::jsonb)
                        from (select aa.attempt_id, aa.question_id, q.stem, q.reference_answer, q.rubric,
                                     aa.text_answer, aa.checked, aa.points, a.submitted_at
                                from attempt_answers aa
                                join attempts a on a.id = aa.attempt_id
                                join questions q on q.id = aa.question_id
                               where a.user_id = p_user and a.status = 'done' and q.qtype = 'short'
                               order by a.submitted_at desc limit 20) y));
end $$;
revoke all on function get_employee_detail(uuid) from public, anon;
grant execute on function get_employee_detail(uuid) to authenticated;

-- 主管：設定員工到職日（用來算試用期與半年考核期限）
create function set_hire_date(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_supervisor();
  update profiles set hire_date = p_date where id = p_user and role = 'employee';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function set_hire_date(uuid, date) from public, anon;
grant execute on function set_hire_date(uuid, date) to authenticated;
