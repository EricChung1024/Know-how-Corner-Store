begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@example.com', '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'boss@example.com', '{}');
update profiles set role = 'supervisor' where id = 'aaaaaaaa-0000-0000-0000-000000000003';

-- 50 題已審核選擇題（散在 9 章），前 12 題是紅線題；另有 5 題未審核
insert into questions (id, stage, qtype, stem, options, correct_index, explanation, error_type, red_line, reviewed)
select 'LV-' || n, 1 + n % 9, 'mcq', 'q' || n, '["a","b"]', 0, 'e', '用了舊規則', n <= 12, true from generate_series(1, 50) n;
insert into questions (id, stage, qtype, stem, options, correct_index, explanation, error_type, red_line, reviewed)
select 'UN-' || n, 1 + n % 9, 'mcq', 'u' || n, '["a","b"]', 0, 'e', '用了舊規則', true, false from generate_series(1, 5) n;

create function t_as(uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function t_admin() returns void language plpgsql as $$ begin reset role; end $$;
-- 前 k 題答對、其餘答錯
create function t_answers_k(att uuid, k int) returns jsonb language plpgsql as $$
declare out jsonb := '[]'; qq jsonb; q questions; pos int; orig int; n int := 0;
begin
  for qq in select e from jsonb_array_elements((select question_ids from attempts where id = att)) e loop
    n := n + 1;
    select * into q from questions where id = qq ->> 'id';
    orig := case when n <= k then q.correct_index else (q.correct_index + 1) % 2 end;
    select i - 1 into pos from jsonb_array_elements(qq -> 'perm') with ordinality t(v, i) where v::int = orig;
    out := out || jsonb_build_object('question_id', q.id, 'choice', pos);
  end loop;
  return out;
end $$;
grant execute on function t_as(uuid), t_admin(), t_answers_k(uuid, int) to public;

-- L1：設定表與階段範圍
do $$ begin
  assert (select count(*) from assessments) = 12, '階段 0–11 共 12 筆設定';
  assert (select pass_score from assessments where stage = 11) = 85, '半年考核 85 分及格';
  assert (select pass_score from assessments where stage = 10) = 80, '試用期考核 80 分及格';
  assert (select interval_months from assessments where stage = 11) = 6, '半年一次';
  begin
    insert into attempts (user_id, stage, question_ids) values ('aaaaaaaa-0000-0000-0000-000000000001', 12, '[]');
    raise exception 'NO_RAISE';
  exception when check_violation then null; end;
end $$;

-- L1b：登入者可唯讀分級設定（view 與設定表皆可讀，內容非機密），但不能改；匿名什麼都看不到
do $$ begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  assert (select pass_score from v_assessments where stage = 11) = 85, 'view 可讀及格分';
  assert (select name from v_assessments where stage = 10) = '試用期考核', 'view 可讀名稱';
  assert (select count(*) from assessments) = 12, '登入者可唯讀設定表';
  begin update assessments set pass_score = 0; raise exception 'NO_RAISE';
  exception when insufficient_privilege then null; end;
  perform t_admin();
  set local role anon;
  begin perform count(*) from v_assessments; raise exception 'NO_RAISE';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- L2：試用期 30 題、半年 40 題；只抽已審核；紅線題保底
do $$ declare r jsonb; ids text[];
begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  r := start_exam(10);
  assert jsonb_array_length(r -> 'questions') = 30, '試用期考核 30 題';
  ids := array(select e ->> 'id' from jsonb_array_elements(r -> 'questions') e);
  perform t_admin();
  assert (select count(*) from questions where id = any (ids) and red_line) >= 5, '試用期至少 5 題紅線題';
  assert (select count(*) from questions where id = any (ids) and not reviewed) = 0, '不得含未審核題';
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  r := start_exam(11);
  assert jsonb_array_length(r -> 'questions') = 40, '半年考核 40 題';
  ids := array(select e ->> 'id' from jsonb_array_elements(r -> 'questions') e);
  perform t_admin();
  assert (select count(*) from questions where id = any (ids) and red_line) >= 10, '半年至少 10 題紅線題';
  assert (select count(*) from questions where id = any (ids) and not reviewed) = 0, '不得含未審核題';
end $$;

-- L3：各級及格分不同（同樣 80 分：試用期及格、半年不及格）
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; att uuid; ans jsonb; r jsonb;
begin
  perform t_as(a); att := (start_exam(11) ->> 'attempt_id')::uuid;
  perform t_admin(); ans := t_answers_k(att, 32); perform t_as(a);
  r := submit_exam(att, ans);
  assert (r ->> 'score')::numeric = 80 and not (r ->> 'passed')::bool, '半年考核 80 分不及格（85 分及格）';
  assert (r ->> 'pass_score')::numeric = 85, '結果要帶該級別的及格分';
  att := (start_exam(10) ->> 'attempt_id')::uuid;
  perform t_admin(); ans := t_answers_k(att, 24); perform t_as(a);
  r := submit_exam(att, ans);
  assert (r ->> 'score')::numeric = 80 and (r ->> 'passed')::bool, '試用期考核 80 分及格';
end $$;

-- L4：到職日（僅主管可設）與期限 view
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000002');
  begin perform set_hire_date(a, date '2026-01-01'); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
  perform t_as('aaaaaaaa-0000-0000-0000-000000000003');
  perform set_hire_date(a, date '2026-01-01');
  assert (select probation_due from v_assessment_status where user_id = a) = date '2026-04-01', '試用期期限＝到職日＋3 個月';
  assert (select probation_passed_at from v_assessment_status where user_id = a) is not null, '已通過試用期考核';
  assert (select semiannual_last_passed_at from v_assessment_status where user_id = a) is null, '半年考核還沒通過';
  assert (select semiannual_due from v_assessment_status where user_id = a) = (current_date + interval '6 months')::date,
         '通過試用期後，半年考核期限＝通過日＋6 個月';
  assert (select count(*) from v_assessment_status) = 2, '主管看得到全部員工（2 位）';
  perform t_as('aaaaaaaa-0000-0000-0000-000000000002');
  assert (select count(*) from v_assessment_status) = 1, '員工只看得到自己';
  assert (select semiannual_due from v_assessment_status) is null, '沒有到職日、沒通過任何考核 → 無期限';
  begin perform set_hire_date('aaaaaaaa-0000-0000-0000-000000000002', null); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
end $$;

rollback;
