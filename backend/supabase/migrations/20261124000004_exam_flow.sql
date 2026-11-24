-- 經驗柑仔店｜004 考核流程：考卷、作答、批改、覆核、錯題、員工總覽
-- 原則：所有寫入都走下面的函式（security definer），前端不能直接改表；
--       正確答案只在函式裡讀（question_answers），不會回傳給前端。
-- 函式回傳 jsonb，欄位名稱與 site/js/data.js 的註解一致。

-- ===== 資料表 =====
create table exam_papers (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  stage text not null references exam_stages (type),
  status text not null default 'draft' check (status in ('draft', 'locked')),
  question_ids text[] not null default '{}',     -- 考卷題目（依顯示順序）
  generated_at timestamptz not null default now(),
  locked_at timestamptz,
  unique (employee_id, stage)
);

create table exam_attempts (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null unique references exam_papers (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  answers jsonb not null default '{}',           -- {題號: 選項（顯示順序的索引）或簡答文字}
  option_order jsonb not null default '{}',      -- {題號: [原始索引…]}：顯示的第 k 個選項是原始第 order[k] 個
  status text not null default 'doing' check (status in ('doing', 'submitted', 'reviewed')),
  graded jsonb not null default '{}',            -- {題號: {correct, errorType, points}}（自動批改的題目）
  mcq_score numeric(6, 1),
  red_line_failed boolean not null default false,
  review jsonb,                                  -- {scores: {題號: 分數}, comment, errorTypes, reviewer, at}
  final_score numeric(6, 1),
  passed boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  result_seen boolean not null default false
);

create table wrong_items (
  employee_id uuid not null references employees (id) on delete cascade,
  qid text not null references question_bank (id) on delete cascade,
  stage text references exam_stages (type),
  chosen int,                                    -- 當時選的（原始選項索引），沒作答是 null
  error_type text,
  streak int not null default 0,
  mastered boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (employee_id, qid)
);

alter table exam_papers enable row level security;
alter table exam_attempts enable row level security;
alter table wrong_items enable row level security;
create policy exam_papers_read on exam_papers for select to authenticated using (employee_id = auth.uid() or is_senior());
create policy exam_attempts_read on exam_attempts for select to authenticated using (employee_id = auth.uid() or is_senior());
create policy wrong_items_read on wrong_items for select to authenticated using (employee_id = auth.uid() or is_senior());
-- 沒有 insert／update／delete policy：寫入只能透過下面的函式
revoke insert, update, delete on exam_papers, exam_attempts, wrong_items from anon, authenticated;
revoke all on exam_papers, exam_attempts, wrong_items from anon;

-- ===== 鎖定考卷裡的題目，不能改審核狀態 =====
create or replace function question_bank_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (new.id, new.source, new.kind, new.case_id, new.topic, new.chapter, new.ability, new.qtype, new.level, new.stem, new.options, new.sop, new.sop_rules, new.red_line, new.shuffle)
       is distinct from
       (old.id, old.source, old.kind, old.case_id, old.topic, old.chapter, old.ability, old.qtype, old.level, old.stem, old.options, old.sop, old.sop_rules, old.red_line, old.shuffle) then
      raise exception 'ONLY_STATUS';
    end if;
    if new.status is distinct from old.status then
      if exists (select 1 from exam_papers p where p.status = 'locked' and old.id = any (p.question_ids)) then
        raise exception '這題已用在鎖定的考卷，不能改狀態';
      end if;
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
  end if;
  return new;
end $$;

-- ===== 小工具 =====
create function require_login() returns employees language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  select * into e from employees where id = auth.uid();
  if not found then raise exception '請先登入'; end if;
  return e;
end $$;

create function require_senior() returns employees language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  if e.role <> 'senior' then raise exception '只有資深可以做這件事'; end if;
  return e;
end $$;

-- SOP 條目的顯示名稱。SOP 條文放進資料庫（005）後會被取代成「SOP 2-2 身分驗證」。
create function sop_label(p_no text) returns text language sql stable as $$ select case when p_no is null then null else 'SOP ' || p_no end $$;
create function sop_known(p_no text) returns boolean language sql stable as $$ select false $$;

create function _fmt_date(d date) returns text language sql immutable as $$ select to_char(d, 'YYYY-MM-DD') $$;
create function _fmt_ts(t timestamptz) returns text language sql stable as $$ select to_char(t at time zone 'Asia/Taipei', 'YYYY-MM-DD') $$;

-- 依顯示順序排選項
create function _opts_display(p_opts jsonb, p_perm jsonb) returns jsonb language sql immutable as $$
  select case when p_opts is null or p_perm is null then p_opts
    else (select jsonb_agg(p_opts -> (t.v)::int order by t.ord) from jsonb_array_elements_text(p_perm) with ordinality as t(v, ord)) end
$$;

-- 一題的公開欄位（不含答案）
create function _q_public(q question_bank, p_perm jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('id', q.id, 'qtype', q.qtype, 'stem', q.stem, 'options', _opts_display(q.options, p_perm),
    'sop', q.sop, 'sopName', sop_label(q.sop), 'sopKnown', sop_known(q.sop))
$$;

-- 簡答題的滿分：一份考卷 100 分，每題平分
create function _w(p_paper exam_papers) returns numeric language sql immutable as $$
  select 100.0 / greatest(cardinality(p_paper.question_ids), 1)
$$;

-- ===== 三次考核的狀態列（員工詳情、新人考核清單共用） =====
create function _stage_rows(p_emp uuid, p_public boolean) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e employees; st exam_stages; pp exam_papers; aa exam_attempts;
  r jsonb := '[]'::jsonb; due date; stt text; mcq int; paper jsonb; locked boolean;
begin
  select * into e from employees where id = p_emp;
  for st in select * from exam_stages order by sort loop
    select * into pp from exam_papers where employee_id = p_emp and stage = st.type;
    select * into aa from exam_attempts where paper_id = pp.id;
    due := case when e.hire_date is null then null else exam_due_date(e.hire_date, st.months) end;
    stt := case when aa.id is not null and aa.status in ('submitted', 'reviewed') then '已完成'
                when pp.status = 'locked' then '可作答' else '尚未開放' end;
    locked := pp.status = 'locked';
    select count(*) into mcq from question_bank q where q.id = any (pp.question_ids) and q.qtype <> 'short';
    paper := case when pp.id is null then null else jsonb_build_object('id', pp.id, 'status', pp.status, 'questionCount', cardinality(pp.question_ids),
      'mcqCount', mcq, 'generatedAt', _fmt_ts(pp.generated_at), 'lockedAt', _fmt_ts(pp.locked_at)) end;
    r := r || jsonb_build_object(
      'type', st.type, 'name', st.name, 'months', st.months, 'level', st.level, 'levelName', st.level_name, 'focus', st.focus,
      'questionTarget', st.question_count, 'shortMax', st.short_max, 'passScore', st.pass_score,
      'dueDate', _fmt_date(due), 'daysLeft', due - current_date, 'status', stt,
      'paper', case when p_public then null else paper end,
      'questionCount', case when p_public and locked then cardinality(pp.question_ids) else null end,
      'mcqCount', case when p_public and locked then mcq else null end,
      'attemptId', aa.id, 'attemptStatus', aa.status, 'resultSeen', coalesce(aa.result_seen, true),
      'finalScore', case when aa.status = 'reviewed' then aa.final_score end,
      'passed', case when aa.status = 'reviewed' then aa.passed end);
  end loop;
  return r;
end $$;

-- 成績紀錄（員工詳情、新人考核紀錄共用）
create function _records(p_emp uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('exam', st.name, 'type', st.type, 'date', _fmt_ts(a.submitted_at),
    'score', case when a.status = 'reviewed' then a.final_score end, 'passed', case when a.status = 'reviewed' then a.passed end,
    'passScore', st.pass_score, 'attemptId', a.id) order by a.submitted_at), '[]'::jsonb)
  from exam_attempts a join exam_papers p on p.id = a.paper_id join exam_stages st on st.type = p.stage
  where a.employee_id = p_emp and a.status in ('submitted', 'reviewed')
$$;

create function _overview(e employees) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rows jsonb; nx jsonb; rec jsonb; last_rec jsonb;
begin
  rows := _stage_rows(e.id, false);
  select x into nx from jsonb_array_elements(rows) x where x ->> 'status' <> '已完成' limit 1;
  rec := _records(e.id);
  last_rec := rec -> (jsonb_array_length(rec) - 1);
  return jsonb_build_object('id', e.employee_id, 'name', e.name, 'email', e.email, 'employeeId', e.employee_id, 'role', e.role,
    'roleLabel', case e.role when 'senior' then '資深' else '新人' end, 'hireDate', _fmt_date(e.hire_date),
    'dayNo', case when e.hire_date is null then null else current_date - e.hire_date + 1 end,
    'nextExam', case when e.role = 'newbie' and e.hire_date is not null and nx is not null
      then jsonb_build_object('type', nx ->> 'type', 'name', nx ->> 'name', 'deadline', nx ->> 'dueDate') end,
    'latestScore', last_rec -> 'score', 'latestPending', last_rec is not null and last_rec -> 'score' = 'null'::jsonb,
    'hasPendingReview', exists (select 1 from exam_attempts a where a.employee_id = e.id and a.status = 'submitted'),
    'demo', false, 'added', false);
end $$;

-- ===== 員工 =====
create function list_employees() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees; r jsonb := '[]'::jsonb;
begin
  perform require_senior();
  for e in select * from employees where role = 'newbie' order by hire_date nulls last, employee_id loop
    r := r || _overview(e);
  end loop;
  return r;
end $$;

create function get_employee(p_employee_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  perform require_senior();
  select * into e from employees where employee_id = p_employee_id;
  if not found then return null; end if;
  return _overview(e) || jsonb_build_object('stages', _stage_rows(e.id, false), 'records', _records(e.id), 'canHaveExam', e.role = 'newbie');
end $$;

create function update_hire_date(p_employee_id text, p_date date) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform require_senior();
  if p_date is null then raise exception '到職日格式不正確'; end if;
  update employees set hire_date = p_date where employee_id = p_employee_id;
  if not found then raise exception '找不到這位員工'; end if;
  return jsonb_build_object('id', p_employee_id, 'hireDate', _fmt_date(p_date));
end $$;

-- ===== 資深：考卷 =====
create function generate_paper(p_employee_id text, p_type text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  st exam_stages; e employees; old exam_papers; used text[]; shorts text[]; nonshort text[]; ids text[]; pid uuid;
begin
  perform require_senior();
  select * into st from exam_stages where type = p_type;
  if not found then raise exception '沒有這個考核階段'; end if;
  select * into e from employees where employee_id = p_employee_id and role = 'newbie';
  if not found then raise exception '找不到這位新人'; end if;
  if e.hire_date is null then raise exception '先設定到職日，才能出題'; end if;
  select * into old from exam_papers where employee_id = e.id and stage = p_type;
  if found and old.status = 'locked' then raise exception '已經有鎖定的考卷'; end if;
  -- 這位新人在其他階段考過的題目不再出
  select coalesce(array_agg(distinct x), '{}') into used from exam_papers p, unnest(p.question_ids) x where p.employee_id = e.id and p.stage <> p_type;
  select coalesce(array_agg(id), '{}') into shorts from (
    select id from question_bank where status = '已審' and qtype = 'short' and level <= st.level and id <> all (used)
    order by level desc, random() limit st.short_max) t;
  select coalesce(array_agg(id), '{}') into nonshort from (
    select id from question_bank where status = '已審' and qtype <> 'short' and level <= st.level and id <> all (used)
    order by level desc, random() limit st.question_count - cardinality(shorts)) t;
  ids := nonshort || shorts;
  if cardinality(ids) = 0 then raise exception '題庫沒有符合「%」的已審題目', st.level_name; end if;
  insert into exam_papers (employee_id, stage, question_ids) values (e.id, p_type, ids)
  on conflict (employee_id, stage) do update set question_ids = excluded.question_ids, generated_at = now()
  returning id into pid;
  return jsonb_build_object('id', pid, 'shortage', st.question_count - cardinality(ids));
end $$;

create function list_papers() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_senior();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'employeeId', e.employee_id, 'employeeName', e.name, 'type', p.stage,
      'examName', st.name, 'status', p.status, 'generatedAt', _fmt_ts(p.generated_at), 'lockedAt', _fmt_ts(p.locked_at)) order by p.generated_at)
    from exam_papers p join employees e on e.id = p.employee_id join exam_stages st on st.type = p.stage), '[]'::jsonb);
end $$;

create function get_paper(p_paper uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p exam_papers; e employees; st exam_stages;
begin
  perform require_senior();
  select * into p from exam_papers where id = p_paper;
  if not found then return null; end if;
  select * into e from employees where id = p.employee_id;
  select * into st from exam_stages where type = p.stage;
  return jsonb_build_object('id', p.id, 'employeeId', e.employee_id, 'employeeName', e.name, 'type', st.type, 'examName', st.name,
    'level', st.level, 'levelName', st.level_name, 'focus', st.focus, 'questionTarget', st.question_count, 'shortMax', st.short_max,
    'passScore', st.pass_score, 'status', p.status, 'generatedAt', _fmt_ts(p.generated_at), 'lockedAt', _fmt_ts(p.locked_at),
    'deadline', _fmt_date(case when e.hire_date is null then null else exam_due_date(e.hire_date, st.months) end),
    'mcqCount', (select count(*) from question_bank q where q.id = any (p.question_ids) and q.qtype <> 'short'),
    'questions', coalesce((select jsonb_agg(_q_public(q, null) || jsonb_build_object('bankStatus', q.status, 'redLine', q.red_line, 'level', q.level) order by t.ord)
      from unnest(p.question_ids) with ordinality t(id, ord) join question_bank q on q.id = t.id), '[]'::jsonb));
end $$;

create function remove_paper_question(p_paper uuid, p_qid text) returns boolean language plpgsql security definer set search_path = public as $$
declare p exam_papers;
begin
  perform require_senior();
  select * into p from exam_papers where id = p_paper;
  if not found or p.status <> 'draft' then raise exception '鎖定後不能再刪題'; end if;
  update exam_papers set question_ids = array_remove(question_ids, p_qid) where id = p_paper;
  return true;
end $$;

create function add_paper_question(p_paper uuid, p_qid text) returns boolean language plpgsql security definer set search_path = public as $$
declare p exam_papers; st exam_stages; q question_bank; shorts int;
begin
  perform require_senior();
  select * into p from exam_papers where id = p_paper;
  if not found or p.status <> 'draft' then raise exception '鎖定後不能再補題'; end if;
  select * into st from exam_stages where type = p.stage;
  select * into q from question_bank where id = p_qid;
  if not found then raise exception '找不到這一題'; end if;
  if q.status <> '已審' then raise exception '只能補「已審」的題目'; end if;
  if p_qid = any (p.question_ids) then return true; end if;
  if cardinality(p.question_ids) >= st.question_count then raise exception '%最多 % 題', st.name, st.question_count; end if;
  select count(*) into shorts from question_bank where id = any (p.question_ids) and qtype = 'short';
  if q.qtype = 'short' and shorts >= st.short_max then
    raise exception '%', case when st.short_max = 0 then st.name || '不出簡答題' else st.name || '最多 ' || st.short_max || ' 題簡答' end;
  end if;
  update exam_papers set question_ids = (
    select array_agg(t.id order by (b.qtype = 'short'), t.ord)
    from unnest(p.question_ids || p_qid) with ordinality t(id, ord) join question_bank b on b.id = t.id)
  where id = p_paper;
  return true;
end $$;

create function lock_paper(p_paper uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare p exam_papers;
begin
  perform require_senior();
  select * into p from exam_papers where id = p_paper;
  if not found or p.status <> 'draft' then raise exception '這份考卷已經鎖定'; end if;
  if cardinality(p.question_ids) = 0 then raise exception '考卷沒有題目'; end if;
  update exam_papers set status = 'locked', locked_at = now() where id = p_paper;
  return jsonb_build_object('lockedAt', _fmt_ts(now()));
end $$;

-- ===== 新人：考核清單、作答 =====
create function list_my_exams() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  return _stage_rows(e.id, true);
end $$;

create function start_exam(p_type text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare e employees; pp exam_papers; aa exam_attempts; st exam_stages; ord jsonb := '{}'::jsonb; q question_bank; perm jsonb;
begin
  e := require_login();
  select p.* into pp from exam_papers p left join exam_attempts a on a.paper_id = p.id
  where p.employee_id = e.id and p.status = 'locked' and (p_type is null or p.stage = p_type)
  order by (a.id is not null and a.status <> 'doing'), (select s.sort from exam_stages s where s.type = p.stage) limit 1;
  if not found then return null; end if;
  select * into aa from exam_attempts where paper_id = pp.id;
  if found and aa.status <> 'doing' then return jsonb_build_object('done', true, 'attemptId', aa.id); end if;
  if not found then
    -- 選擇題的選項每個人打亂一次，順序記下來批改時用
    for q in select * from question_bank where id = any (pp.question_ids) loop
      if q.qtype = 'mcq' and q.shuffle then
        select jsonb_agg(i - 1 order by random()) into perm from generate_series(1, jsonb_array_length(q.options)) i;
        ord := ord || jsonb_build_object(q.id, perm);
      end if;
    end loop;
    insert into exam_attempts (paper_id, employee_id, option_order) values (pp.id, e.id, ord) returning * into aa;
  end if;
  select * into st from exam_stages where type = pp.stage;
  return jsonb_build_object('paperId', pp.id, 'attemptId', aa.id, 'type', st.type, 'name', st.name, 'passScore', st.pass_score,
    'deadline', _fmt_date(case when e.hire_date is null then null else exam_due_date(e.hire_date, st.months) end),
    'questions', (select jsonb_agg(_q_public(b, aa.option_order -> b.id) order by t.ord)
      from unnest(pp.question_ids) with ordinality t(id, ord) join question_bank b on b.id = t.id),
    'answers', aa.answers);
end $$;

create function save_answer(p_attempt uuid, p_qid text, p_answer jsonb) returns boolean language plpgsql security definer set search_path = public as $$
declare e employees; n int;
begin
  e := require_login();
  update exam_attempts a set answers = a.answers || jsonb_build_object(p_qid, p_answer)
  from exam_papers p where a.id = p_attempt and a.employee_id = e.id and a.status = 'doing' and p.id = a.paper_id and p_qid = any (p.question_ids);
  get diagnostics n = row_count;
  if n = 0 then raise exception '這份考卷已經交卷'; end if;
  return true;
end $$;

create function submit_exam(p_attempt uuid, p_answers jsonb default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e employees; aa exam_attempts; pp exam_papers; st exam_stages; ans jsonb; w numeric; g jsonb := '{}'::jsonb;
  q question_bank; k question_answers; d int; orig int; ok boolean; et text; pts numeric := 0; mcq_max numeric := 0; has_short boolean := false;
  red boolean := false; final numeric; stt text;
begin
  e := require_login();
  select * into aa from exam_attempts where id = p_attempt and employee_id = e.id;
  if not found or aa.status <> 'doing' then raise exception '這份考卷已經交卷'; end if;
  select * into pp from exam_papers where id = aa.paper_id;
  select * into st from exam_stages where type = pp.stage;
  ans := aa.answers || coalesce(p_answers, '{}'::jsonb);
  w := _w(pp);
  for q in select b.* from unnest(pp.question_ids) with ordinality t(id, ord) join question_bank b on b.id = t.id order by t.ord loop
    if q.qtype = 'short' then has_short := true; continue; end if;
    select * into k from question_answers where qid = q.id;
    mcq_max := mcq_max + w;
    d := case when jsonb_typeof(ans -> q.id) = 'number' then (ans ->> q.id)::int end;
    orig := case when d is null then null when aa.option_order ? q.id then (aa.option_order -> q.id ->> d)::int else d end;
    ok := orig is not null and orig = k.correct_index;
    et := case when ok then null when d is null then '未作答' else coalesce(k.error_type, '情境判斷失誤') end;
    g := g || jsonb_build_object(q.id, jsonb_build_object('correct', ok, 'errorType', et, 'points', case when ok then round(w, 1) else 0 end));
    if ok then pts := pts + w;
    else
      if q.red_line then red := true; end if;
      insert into wrong_items (employee_id, qid, stage, chosen, error_type) values (e.id, q.id, pp.stage, orig, et)
      on conflict (employee_id, qid) do update set stage = excluded.stage, chosen = excluded.chosen, error_type = excluded.error_type,
        streak = 0, mastered = false, updated_at = now();
    end if;
  end loop;
  pts := round(pts, 1);
  if has_short then stt := 'submitted'; final := null;
  else stt := 'reviewed'; final := pts; end if;
  update exam_attempts set answers = ans, graded = g, mcq_score = pts, red_line_failed = red, status = stt, submitted_at = now(),
    final_score = final, passed = case when final is null then null else final >= st.pass_score and not red end,
    reviewed_at = case when final is null then null else now() end, result_seen = false
  where id = p_attempt;
  return jsonb_build_object('attemptId', p_attempt, 'status', stt, 'mcqScore', pts, 'mcqMax', round(mcq_max, 1));
end $$;

create function get_my_result(p_attempt uuid default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees; aa exam_attempts; pp exam_papers; st exam_stages; w numeric; items jsonb; sh_max numeric := 0; sh_score numeric := 0; mcq_max numeric := 0;
  err jsonb := '{}'::jsonb; q question_bank; k question_answers; gi jsonb; it jsonb; sc numeric; reviewed boolean; t text;
begin
  e := require_login();
  if p_attempt is null then
    select * into aa from exam_attempts where employee_id = e.id and status <> 'doing' order by submitted_at desc limit 1;
  else
    select * into aa from exam_attempts where id = p_attempt and employee_id = e.id;
  end if;
  if not found or aa.status = 'doing' then return null; end if;
  select * into pp from exam_papers where id = aa.paper_id;
  select * into st from exam_stages where type = pp.stage;
  w := _w(pp); reviewed := aa.status = 'reviewed'; items := '[]'::jsonb;
  for q in select b.* from unnest(pp.question_ids) with ordinality t(id, ord) join question_bank b on b.id = t.id order by t.ord loop
    gi := aa.graded -> q.id;
    it := jsonb_build_object('qid', q.id, 'qtype', q.qtype, 'stem', q.stem, 'options', _opts_display(q.options, aa.option_order -> q.id),
      'answer', aa.answers -> q.id, 'sop', q.sop, 'sopName', sop_label(q.sop), 'sopKnown', sop_known(q.sop), 'maxPoints', round(w, 1));
    if q.qtype = 'short' then
      sh_max := sh_max + w;
      sc := (aa.review -> 'scores' ->> q.id)::numeric;
      if sc is not null then sh_score := sh_score + sc; end if;
      it := it || jsonb_build_object('correct', null, 'errorType', null, 'points', sc, 'reviewed', sc is not null);
    else
      mcq_max := mcq_max + w;
      it := it || jsonb_build_object('correct', (gi ->> 'correct')::boolean, 'errorType', gi ->> 'errorType', 'points', (gi ->> 'points')::numeric);
      t := gi ->> 'errorType';
      if t is not null then err := err || jsonb_build_object(t, coalesce((err ->> t)::int, 0) + 1); end if;
    end if;
    items := items || it;
  end loop;
  if reviewed and aa.review is not null then
    for t in select jsonb_array_elements_text(aa.review -> 'errorTypes') loop
      err := err || jsonb_build_object(t, coalesce((err ->> t)::int, 0) + 1);
    end loop;
  end if;
  return jsonb_build_object('attemptId', aa.id, 'type', st.type, 'examName', st.name, 'submittedAt', _fmt_ts(aa.submitted_at), 'status', aa.status,
    'mcqScore', aa.mcq_score, 'mcqMax', round(mcq_max, 1), 'shortMax', round(sh_max, 1), 'shortScore', case when reviewed then sh_score end,
    'review', case when aa.review is null then null else jsonb_build_object('reviewer', aa.review ->> 'reviewer', 'comment', aa.review ->> 'comment',
      'errorTypes', aa.review -> 'errorTypes', 'at', aa.review ->> 'at') end,
    'finalScore', case when reviewed then aa.final_score end, 'passScore', st.pass_score, 'passed', case when reviewed then aa.passed end,
    'redLineFailed', aa.red_line_failed, 'items', items, 'errorSummary', err, 'resultSeen', aa.result_seen);
end $$;

create function mark_result_seen(p_attempt uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  update exam_attempts set result_seen = true where id = p_attempt and employee_id = e.id;
  return true;
end $$;

create function list_my_records() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  return _records(e.id);
end $$;

-- ===== 資深：簡答覆核 =====
create function get_short_review(p_employee_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees; aa exam_attempts; pp exam_papers; st exam_stages; w numeric;
begin
  perform require_senior();
  select * into e from employees where employee_id = p_employee_id;
  if not found then return null; end if;
  select * into aa from exam_attempts where employee_id = e.id and status = 'submitted' order by submitted_at limit 1;
  if not found then return null; end if;
  select * into pp from exam_papers where id = aa.paper_id;
  select * into st from exam_stages where type = pp.stage;
  w := _w(pp);
  return jsonb_build_object('attemptId', aa.id, 'examName', st.name, 'mcqScore', aa.mcq_score,
    'items', (select jsonb_agg(jsonb_build_object('qid', q.id, 'stem', q.stem, 'answer', aa.answers ->> q.id, 'maxPoints', round(w, 1),
        'referenceAnswer', k.reference_answer, 'rubric', k.rubric, 'keyError', k.key_error) order by t.ord)
      from unnest(pp.question_ids) with ordinality t(id, ord) join question_bank q on q.id = t.id join question_answers k on k.qid = q.id
      where q.qtype = 'short'));
end $$;

create function submit_short_review(p_attempt uuid, p_review jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s employees; aa exam_attempts; pp exam_papers; st exam_stages; w numeric; q question_bank; sc numeric; total numeric := 0; final numeric;
begin
  s := require_senior();
  select * into aa from exam_attempts where id = p_attempt;
  if not found or aa.status <> 'submitted' then raise exception '這份考卷不在待覆核狀態'; end if;
  select * into pp from exam_papers where id = aa.paper_id;
  select * into st from exam_stages where type = pp.stage;
  w := _w(pp);
  for q in select * from question_bank where id = any (pp.question_ids) and qtype = 'short' loop
    sc := (p_review -> 'scores' ->> q.id)::numeric;
    if sc is null or sc < 0 or sc > round(w, 1) then raise exception '每題簡答的得分要在 0–% 之間', round(w, 1); end if;
    total := total + sc;
  end loop;
  final := round(aa.mcq_score + total, 1);
  update exam_attempts set status = 'reviewed', final_score = final, passed = final >= st.pass_score and not aa.red_line_failed,
    review = jsonb_build_object('scores', p_review -> 'scores', 'comment', coalesce(p_review ->> 'comment', ''),
      'errorTypes', coalesce(p_review -> 'errorTypes', '[]'::jsonb), 'reviewer', s.name, 'at', _fmt_ts(now())),
    reviewed_at = now(), result_seen = false
  where id = p_attempt;
  return jsonb_build_object('finalScore', final, 'passed', final >= st.pass_score and not aa.red_line_failed);
end $$;

-- ===== 錯題區 =====
create function list_wrong_items() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  return coalesce((select jsonb_agg(jsonb_build_object('employeeId', e.employee_id, 'qid', w.qid, 'type', w.stage, 'examName', st.name,
      'chosen', w.chosen, 'errorType', w.error_type, 'streak', w.streak, 'mastered', w.mastered, 'stem', q.stem, 'options', q.options,
      'sop', q.sop, 'sopName', sop_label(q.sop), 'sopKnown', sop_known(q.sop)) order by w.mastered, w.updated_at desc)
    from wrong_items w join question_bank q on q.id = w.qid left join exam_stages st on st.type = w.stage where w.employee_id = e.id), '[]'::jsonb);
end $$;

create function check_practice(p_qid text, p_choice int) returns jsonb language plpgsql security definer set search_path = public as $$
declare e employees; w wrong_items; k question_answers; ok boolean; s int;
begin
  e := require_login();
  select * into w from wrong_items where employee_id = e.id and qid = p_qid;
  if not found then raise exception '錯題區沒有這一題'; end if;
  select * into k from question_answers where qid = p_qid;
  ok := p_choice = k.correct_index;
  s := case when ok then least(2, w.streak + 1) else 0 end;
  update wrong_items set streak = s, mastered = s >= 2, updated_at = now() where employee_id = e.id and qid = p_qid;
  return jsonb_build_object('correct', ok, 'streak', s, 'mastered', s >= 2);
end $$;

-- ===== 權限：函式只有登入的人能呼叫（匿名不行） =====
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
