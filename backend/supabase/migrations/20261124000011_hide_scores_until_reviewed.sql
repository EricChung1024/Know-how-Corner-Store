-- 經驗柑仔店｜011 簡答題資深改完前，新人看不到任何分數
-- 規則（使用者要求）：考卷有簡答題時，交卷後狀態是「待覆核」；資深給完分之前，新人看不到選擇題分數、各題對錯、紅線結果、錯誤類型，
-- 錯題區也先不出現這次答錯的題目。沒有簡答題的考卷（滿 1 個月）沒有人要改，仍然交卷就出分數。

create or replace function submit_exam(p_attempt uuid, p_answers jsonb default null) returns jsonb language plpgsql security definer set search_path = public as $$
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
  return jsonb_build_object('attemptId', p_attempt, 'status', stt, 'mcqScore', case when stt = 'reviewed' then pts end, 'mcqMax', round(mcq_max, 1));
end $$;

create or replace function get_my_result(p_attempt uuid default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
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
      it := it || case when reviewed then jsonb_build_object('correct', (gi ->> 'correct')::boolean, 'errorType', gi ->> 'errorType', 'points', (gi ->> 'points')::numeric)
        else jsonb_build_object('correct', null, 'errorType', null, 'points', null) end;
      t := case when reviewed then gi ->> 'errorType' end;
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
    'mcqScore', case when reviewed then aa.mcq_score end, 'mcqMax', round(mcq_max, 1), 'shortMax', round(sh_max, 1), 'shortScore', case when reviewed then sh_score end,
    'review', case when aa.review is null then null else jsonb_build_object('reviewer', aa.review ->> 'reviewer', 'comment', aa.review ->> 'comment',
      'errorTypes', aa.review -> 'errorTypes', 'at', aa.review ->> 'at') end,
    'finalScore', case when reviewed then aa.final_score end, 'passScore', st.pass_score, 'passed', case when reviewed then aa.passed end,
    'redLineFailed', case when reviewed then aa.red_line_failed end, 'items', items, 'errorSummary', err, 'resultSeen', aa.result_seen);
end $$;

create or replace function list_wrong_items() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  return coalesce((select jsonb_agg(jsonb_build_object('employeeId', e.employee_id, 'qid', w.qid, 'type', w.stage, 'examName', st.name,
      'chosen', w.chosen, 'errorType', w.error_type, 'streak', w.streak, 'mastered', w.mastered, 'stem', q.stem, 'options', q.options,
      'sop', q.sop, 'sopName', sop_label(q.sop), 'sopKnown', sop_known(q.sop)) order by w.mastered, w.updated_at desc)
    from wrong_items w join question_bank q on q.id = w.qid left join exam_stages st on st.type = w.stage where w.employee_id = e.id
      and not exists (select 1 from exam_attempts a join exam_papers p on p.id = a.paper_id
                      where a.employee_id = e.id and p.stage = w.stage and a.status = 'submitted')), '[]'::jsonb);
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
