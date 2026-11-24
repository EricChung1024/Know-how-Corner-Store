begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@example.com', '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'boss@example.com', '{}');
update profiles set role = 'supervisor' where id = 'aaaaaaaa-0000-0000-0000-000000000003';

insert into questions (id, stage, qtype, stem, options, correct_index, explanation, error_type, reviewed) values
  ('Q-a', 2, 'mcq', 'qa', '["o0","o1"]', 0, '解 a', '用了舊規則', true),
  ('Q-b', 2, 'mcq', 'qb', '["o0","o1"]', 1, '解 b', '違反紅線', true),
  ('Q-c', 5, 'mcq', 'qc', '["o0","o1"]', 0, '解 c', '用了舊規則', true),
  ('L-1', 3, 'mcq', 'l1', '["o0","o1"]', 0, '解 l1', '情境判斷失誤', false);
insert into questions (id, stage, qtype, stem, correct_index, explanation, error_type, reference_answer, rubric, source, reviewed)
values ('S-x', 2, 'short', 'sx', null, '解 sx', '情境判斷失誤', 'REF', '["點一"]', 'legacy', false);

create function t_as(uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function t_admin() returns void language plpgsql as $$ begin reset role; end $$;
-- 依 practice_runs 的 perm 算出「畫面位置」：mode right＝正確選項，wrong＝另一個
create function t_practice_answers(run uuid, mode jsonb) returns jsonb language plpgsql as $$
declare out jsonb := '[]'; qq jsonb; q questions; orig int; pos int;
begin
  for qq in select e from jsonb_array_elements((select question_ids from practice_runs where id = run)) e loop
    select * into q from questions where id = qq ->> 'id';
    orig := case when mode ->> q.id = 'right' then q.correct_index else (q.correct_index + 1) % 2 end;
    select i - 1 into pos from jsonb_array_elements(qq -> 'perm') with ordinality t(v, i) where v::int = orig;
    out := out || jsonb_build_object('question_id', q.id, 'choice', pos);
  end loop;
  return out;
end $$;
grant execute on function t_as(uuid), t_admin(), t_practice_answers(uuid, jsonb) to public;

-- 種子：A 的錯題（Q-a、Q-b、S-x）；B 的錯題（Q-c）；A 一份已完成的考卷
insert into wrong_book (user_id, question_id, wrong_count, note) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Q-a', 1, '我的筆記'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Q-b', 2, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'S-x', 1, null),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Q-c', 1, 'B 的筆記');
insert into attempts (id, user_id, stage, question_ids, status, score, passed, submitted_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 2,
   '[{"id":"Q-a","perm":[0,1]},{"id":"S-x","perm":null}]', 'done', 80, true, now());
insert into attempt_answers (attempt_id, question_id, choice, is_correct) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Q-a', 0, true);
insert into attempt_answers (attempt_id, question_id, text_answer, checked, points, is_correct, error_type)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'S-x', '我的作答', '[]', 0, false, '情境判斷失誤');

-- R1：list_wrong 只回自己的、可篩選、含答案與我的作答
do $$ declare r jsonb;
begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  r := list_wrong();
  assert jsonb_array_length(r) = 3, 'A 有 3 筆錯題';
  assert r::text not like '%Q-c%', '不得含 B 的錯題';
  assert (select e ->> 'explanation' from jsonb_array_elements(r) e where e ->> 'question_id' = 'Q-a') = '解 a', '答錯過的題可看解析';
  assert (select e ->> 'note' from jsonb_array_elements(r) e where e ->> 'question_id' = 'Q-a') = '我的筆記', '筆記';
  assert (select e -> 'my_answer' ->> 'text_answer' from jsonb_array_elements(r) e where e ->> 'question_id' = 'S-x') = '我的作答', '簡答的我的作答';
  assert jsonb_array_length(list_wrong(5)) = 0, '階段篩選（A 在階段 5 沒錯題）';
  assert jsonb_array_length(list_wrong(2)) = 3, '階段 2 有 3 筆';
  assert jsonb_array_length(list_wrong(null, '違反紅線')) = 1, '錯誤類型篩選';
  assert jsonb_array_length(list_wrong(null, null, 'mastered')) = 0, '狀態篩選';
  perform t_as('aaaaaaaa-0000-0000-0000-000000000002');
  assert jsonb_array_length(list_wrong()) = 1 and list_wrong()::text like '%Q-c%', 'B 只看到自己的';
end $$;

-- R2：練習只含選擇題、不含答案；沒有未掌握錯題 → NO_WRONG
do $$ declare r jsonb;
begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  r := start_practice();
  assert jsonb_array_length(r -> 'questions') = 2, '簡答不進重練，只有 Q-a、Q-b';
  assert r::text not like '%correct_index%' and r::text not like '%解 a%' and r::text not like '%S-x%', '練習題不含答案';
  perform t_as('aaaaaaaa-0000-0000-0000-000000000003');
  begin perform start_practice(); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'NO_WRONG' then raise; end if; end;
end $$;

-- R3：連續答對 2 次才掌握；中間答錯歸零；練習不新增 attempts
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; run uuid; r jsonb; ans jsonb; n0 int;
begin
  perform t_admin(); n0 := (select count(*) from attempts);
  -- 第 1 輪：Q-a 對、Q-b 錯
  perform t_as(a); run := (start_practice() ->> 'practice_id')::uuid;
  perform t_admin(); ans := t_practice_answers(run, '{"Q-a":"right","Q-b":"wrong"}'); perform t_as(a);
  r := submit_practice(run, ans);
  assert (r ->> 'correct')::int = 1 and (r ->> 'total')::int = 2, '第 1 輪 1/2';
  perform t_admin();
  assert (select streak from wrong_book where user_id = a and question_id = 'Q-a') = 1, 'Q-a streak 1';
  assert (select streak from wrong_book where user_id = a and question_id = 'Q-b') = 0
     and (select wrong_count from wrong_book where user_id = a and question_id = 'Q-b') = 3, 'Q-b 歸零且 wrong_count+1';
  -- 第 2 輪：Q-a 錯（歸零）、Q-b 對
  perform t_as(a); run := (start_practice() ->> 'practice_id')::uuid;
  perform t_admin(); ans := t_practice_answers(run, '{"Q-a":"wrong","Q-b":"right"}'); perform t_as(a);
  perform submit_practice(run, ans);
  perform t_admin();
  assert (select streak from wrong_book where user_id = a and question_id = 'Q-a') = 0, '中間答錯歸零';
  -- 第 3、4 輪：都答對 → 第 4 輪後皆 mastered
  for i in 3..4 loop
    perform t_as(a); run := (start_practice() ->> 'practice_id')::uuid;
    perform t_admin(); ans := t_practice_answers(run, '{"Q-a":"right","Q-b":"right"}'); perform t_as(a);
    perform submit_practice(run, ans);
    perform t_admin();
    if i = 3 then assert (select status from wrong_book where user_id = a and question_id = 'Q-a') = 'open', '只對 1 次仍未掌握'; end if;
  end loop;
  assert (select status from wrong_book where user_id = a and question_id = 'Q-a') = 'mastered', '連續答對 2 次 → mastered';
  assert (select count(*) from attempts) = n0, '重練不新增 attempts';
  begin perform t_as(a); perform submit_practice(run, ans); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'ATTEMPT_CLOSED' then raise; end if; end;
  begin perform start_practice(); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'NO_WRONG' then raise; end if; end;
end $$;

-- R4：筆記與狀態只能改自己的；改回 open 會把 streak 歸零
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  perform t_as(a);
  perform set_wrong_status('Q-a', 'open');
  perform set_wrong_note('Q-a', '新筆記');
  perform t_admin();
  assert (select status from wrong_book where user_id = a and question_id = 'Q-a') = 'open'
     and (select streak from wrong_book where user_id = a and question_id = 'Q-a') = 0, '改回 open 且 streak 歸零';
  perform t_as('aaaaaaaa-0000-0000-0000-000000000002');
  perform set_wrong_note('Q-a', 'B 亂改');
  perform t_admin();
  assert (select note from wrong_book where user_id = a and question_id = 'Q-a') = '新筆記', 'B 不能改 A 的筆記';
  perform t_as(a);
  begin perform set_wrong_status('Q-a', 'bogus'); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'BAD_STATUS' then raise; end if; end;
end $$;

-- R5：主管專用函式；員工一律 FORBIDDEN
do $$ begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  begin perform adjust_short_score('bbbbbbbb-0000-0000-0000-000000000001', 'S-x', 1); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
  begin perform set_reviewed(array['L-1'], true); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
  begin perform list_questions_for_review(); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
end $$;

do $$ declare r jsonb;
begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000003');
  begin perform adjust_short_score('bbbbbbbb-0000-0000-0000-000000000001', 'S-x', 1.5); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'BAD_POINTS' then raise; end if; end;
  r := adjust_short_score('bbbbbbbb-0000-0000-0000-000000000001', 'S-x', 1);
  assert (r ->> 'score')::numeric = 100 and (r ->> 'passed')::bool, '1 選擇全對＋簡答滿分 → 100';
  r := adjust_short_score('bbbbbbbb-0000-0000-0000-000000000001', 'S-x', 0.5);
  assert (r ->> 'score')::numeric = 90, '簡答 0.5 → 90';
  assert jsonb_array_length(list_questions_for_review(null, false)) = 2, '未審核題 2 題（L-1、S-x）';
  assert list_questions_for_review(null, false)::text like '%correct_index%', '主管可看答案';
  assert set_reviewed(array['L-1', 'S-x'], true) = 2, 'set_reviewed 回傳筆數';
  assert jsonb_array_length(list_questions_for_review(null, false)) = 0, '審核後無未審核題';
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  assert (select score from attempts where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 90, '員工看到同步後的分數';
end $$;

-- R6：主管看單一員工詳情（常錯題、掌握數、簡答原文）；員工 FORBIDDEN
do $$ declare r jsonb;
begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000002');
  begin perform get_employee_detail('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
  perform t_as('aaaaaaaa-0000-0000-0000-000000000003');
  r := get_employee_detail('aaaaaaaa-0000-0000-0000-000000000001');
  assert r -> 'wrong' -> 0 ->> 'question_id' = 'Q-b', '常錯題依 wrong_count 由大到小，Q-b 最多';
  assert (r -> 'wrong' -> 0 ->> 'wrong_count')::int = 3, 'Q-b 答錯 3 次';
  assert r -> 'wrong' -> 0 ->> 'stem' = 'qb', '含題幹';
  assert (r ->> 'open_count')::int = 2 and (r ->> 'mastered_count')::int = 1, '未掌握 2、已掌握 1';
  assert jsonb_array_length(r -> 'short_answers') = 1, '1 筆簡答作答';
  assert r -> 'short_answers' -> 0 ->> 'text_answer' = '我的作答', '簡答原文';
  assert (r -> 'short_answers' -> 0 ->> 'points')::numeric = 0.5, '目前得分';
  assert (get_employee_detail('aaaaaaaa-0000-0000-0000-000000000002') -> 'wrong')::text like '%Q-c%'
     and (get_employee_detail('aaaaaaaa-0000-0000-0000-000000000002') -> 'wrong')::text not like '%Q-b%', '乙只有自己的錯題 Q-c';
end $$;

-- R7：筆記過長只保留前 2000 字
do $$ begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  perform set_wrong_note('Q-b', repeat('字', 3000));
  perform t_admin();
  assert (select length(note) from wrong_book where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and question_id = 'Q-b') = 2000, '筆記上限 2000 字';
end $$;

rollback;
