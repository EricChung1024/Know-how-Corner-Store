-- 在 Supabase SQL Editor 或本機 runner 執行；全程在交易內，結束 rollback。
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '{"name":"員工甲"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@example.com', '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'boss@example.com', '{"name":"主管"}');
update profiles set role = 'supervisor' where id = 'aaaaaaaa-0000-0000-0000-000000000003';

insert into questions (id, stage, qtype, stem, options, correct_index, explanation, error_type)
values ('T-1', 1, 'mcq', '題幹', '["x","y"]', 0, '解析', '用了舊規則');
insert into attempts (id, user_id, stage, question_ids, status, score, passed) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, '[]', 'done', 90, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 1, '[]', 'done', 50, false);
insert into attempt_answers (attempt_id, question_id, choice, is_correct, error_type)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'T-1', 1, false, '用了舊規則');
insert into wrong_book (user_id, question_id, wrong_count)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'T-1', 1);

-- 1. 觸發器：新 auth 使用者自動有 employee profile，姓名取 metadata 或信箱前段
do $$ begin
  assert (select role from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'employee', 'A 預設應為 employee';
  assert (select name from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = '員工甲', 'A 姓名取 metadata';
  assert (select name from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002') = 'b', 'B 姓名取信箱前段';
end $$;

-- 2. 員工甲
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    assert (select count(*) from questions) = 0, '員工不得讀 questions';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from attempts) = 1, '員工只看得到自己的 attempts';
  assert (select count(*) from attempt_answers) = 0, '員工看不到別人的作答';
  assert (select count(*) from wrong_book) = 0, '員工看不到別人的錯題';
  assert (select count(*) from profiles) = 1, '員工只看得到自己的 profile';
  assert (select count(*) from v_stage_summary) = 1, 'view 對員工只回自己';
  assert (select count(*) from v_error_counts) = 0, 'view 錯誤類型不含別人的';
end $$;
do $$ begin
  begin
    insert into attempts (user_id, stage, question_ids, status) values (auth.uid(), 1, '[]', 'in_progress');
    raise exception 'INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    update profiles set role = 'supervisor' where id = auth.uid();
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select role from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'employee', '員工不能自己升成主管';
end $$;

-- 3. 主管
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from attempts) = 2, '主管看得到全部 attempts';
  assert (select count(*) from attempt_answers) = 1, '主管看得到全部作答';
  assert (select count(*) from wrong_book) = 1, '主管看得到全部錯題';
  assert (select count(*) from profiles) = 3, '主管看得到全部 profile';
  begin
    assert (select count(*) from questions) = 0, '主管也不能直接 select questions';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from v_stage_summary) = 2, 'view 對主管回全員';
  assert (select cnt from v_error_counts where user_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 1, '錯誤類型計數';
end $$;
reset role;

-- 4. 匿名
set local role anon;
do $$ begin
  begin perform count(*) from profiles; raise exception 'ANON_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
