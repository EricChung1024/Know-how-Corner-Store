-- 經驗柑仔店｜008 首頁與導覽的彙總：新人首頁、資深待辦、導覽列上的數字
-- 這些函式只彙整 004（考核）、006（SOP）、007（問答）已有的資料，不新增資料表。

create function get_newbie_home() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e employees; rows jsonb; x jsonb; focus jsonb; stages jsonb := '[]'::jsonb; v sop_versions; seen_k text;
  shown int; read_n int; first_unread text; unseen jsonb; waiting int;
begin
  e := require_login();
  rows := _stage_rows(e.id, true);
  -- 首頁焦點：有新成績沒看過的 → 可作答的 → 第一個還沒完成的 → 最後一個
  for x in select * from jsonb_array_elements(rows) loop
    stages := stages || jsonb_build_object('type', x ->> 'type', 'name', x ->> 'name', 'months', (x ->> 'months')::int, 'dueDate', x ->> 'dueDate',
      'daysLeft', x -> 'daysLeft', 'status', x ->> 'status', 'passed', x -> 'passed');
    if focus is null and x ->> 'attemptStatus' = 'reviewed' and not (x ->> 'resultSeen')::boolean then focus := x; end if;
  end loop;
  if focus is null then select y into focus from jsonb_array_elements(rows) y where y ->> 'status' = '可作答' limit 1; end if;
  if focus is null then select y into focus from jsonb_array_elements(rows) y where y ->> 'status' <> '已完成' limit 1; end if;
  if focus is null then focus := rows -> (jsonb_array_length(rows) - 1); end if;

  select * into v from sop_versions order by seq desc limit 1;
  select seen_key into seen_k from sop_update_seen where employee_id = e.id;
  select count(*) into shown from sop_rules where status = '現行';
  select count(*) into read_n from sop_reads r join sop_rules s on s.no = r.rule_no and s.status = '現行' where r.employee_id = e.id;
  select no into first_unread from sop_rules s where s.status = '現行' and not exists (select 1 from sop_reads r where r.employee_id = e.id and r.rule_no = s.no)
    order by s.chapter, split_part(s.no, '-', 2)::int limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'question', p.question, 'repliedBy', p.replied_by, 'repliedAt', _fmt_ts(p.replied_at)) order by p.replied_at desc), '[]'::jsonb)
    into unseen from pending_questions p where p.employee_id = e.id and p.status = '已回覆' and not p.seen;
  select count(*) into waiting from pending_questions where employee_id = e.id and status = '待處理';

  return jsonb_build_object('hireDate', _fmt_date(e.hire_date), 'dayNo', case when e.hire_date is null then null else current_date - e.hire_date + 1 end,
    'today', _fmt_date(current_date), 'stages', stages,
    'sop', jsonb_build_object('published', v.id is not null, 'read', read_n, 'shown', shown, 'ruleCount', shown,
      'updated', v.id is not null and seen_k is distinct from v.version || '#' || v.seq,
      'firstUnread', case when first_unread is null then null else jsonb_build_object('no', first_unread, 'name', sop_label(first_unread)) end),
    'exam', jsonb_build_object('type', focus ->> 'type', 'name', focus ->> 'name', 'months', (focus ->> 'months')::int, 'dueDate', focus ->> 'dueDate',
      'daysLeft', focus -> 'daysLeft', 'status', focus ->> 'status', 'attemptStatus', focus ->> 'attemptStatus', 'attemptId', focus ->> 'attemptId',
      'finalScore', focus -> 'finalScore', 'passed', focus -> 'passed', 'resultSeen', (focus ->> 'resultSeen')::boolean),
    'replies', jsonb_build_object('unseen', unseen, 'waiting', waiting),
    'wrongOpen', (select count(*) from wrong_items where employee_id = e.id and not mastered));
end $$;

create function get_senior_todos() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v sop_versions; dl jsonb;
begin
  perform require_senior();
  select * into v from sop_versions order by seq desc limit 1;
  -- 考核日最近的 4 位新人（每人看下一次還沒完成的考核）
  select coalesce(jsonb_agg(t.j order by t.due), '[]'::jsonb) into dl from (
    select (nx ->> 'dueDate') as due, jsonb_build_object('id', n.employee_id, 'name', n.name, 'demo', false, 'exam', nx ->> 'name',
      'deadline', nx ->> 'dueDate', 'daysLeft', nx -> 'daysLeft') as j
    from employees n cross join lateral (select y as nx from jsonb_array_elements(_stage_rows(n.id, false)) y where y ->> 'status' <> '已完成' limit 1) z
    where n.role = 'newbie' and n.hire_date is not null order by (nx ->> 'dueDate') limit 4) t;
  return jsonb_build_object(
    'pendingQuestions', (select count(*) from pending_questions where status = '待處理'),
    'pendingReviews', (select count(*) from exam_attempts where status = 'submitted'),
    'pendingPapers', (select count(*) from exam_papers where status = 'draft'),
    'firstReviewEmployee', (select e.employee_id from exam_attempts a join employees e on e.id = a.employee_id where a.status = 'submitted' order by a.submitted_at limit 1),
    'firstDraftPaper', (select id from exam_papers where status = 'draft' order by generated_at limit 1),
    'deadlines', dl,
    'sop', case when v.id is null then null else jsonb_build_object('version', v.version, 'publishedAt', _fmt_date(v.published_at), 'confirmedBy', v.confirmed_by) end);
end $$;

create function get_nav_counts() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees; v sop_versions; seen_k text;
begin
  e := require_login();
  if e.role = 'senior' then
    return jsonb_build_object('qa', (select count(*) from pending_questions where status = '待處理'),
      'exam', (select count(*) from exam_attempts where status = 'submitted') + (select count(*) from exam_papers where status = 'draft'));
  end if;
  select * into v from sop_versions order by seq desc limit 1;
  select seen_key into seen_k from sop_update_seen where employee_id = e.id;
  return jsonb_build_object(
    'sop', case when v.id is not null and seen_k is distinct from v.version || '#' || v.seq then 1 else 0 end,
    'qa', (select count(*) from pending_questions where employee_id = e.id and status = '已回覆' and not seen),
    'exam', (select count(*) from exam_papers p where p.employee_id = e.id and p.status = 'locked'
             and not exists (select 1 from exam_attempts a where a.paper_id = p.id and a.status in ('submitted', 'reviewed'))),
    'wrong', (select count(*) from wrong_items where employee_id = e.id and not mastered));
end $$;

-- ===== 權限（規則同 005） =====
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
