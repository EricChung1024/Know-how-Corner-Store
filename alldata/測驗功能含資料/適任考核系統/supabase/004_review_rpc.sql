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
