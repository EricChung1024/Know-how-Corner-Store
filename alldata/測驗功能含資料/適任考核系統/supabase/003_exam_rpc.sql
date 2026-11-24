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
