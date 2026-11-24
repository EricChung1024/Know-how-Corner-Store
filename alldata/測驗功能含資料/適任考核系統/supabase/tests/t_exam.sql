begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@example.com');

-- 種子：階段 2＝3 題選擇＋1 題簡答；階段 5＝2 題選擇；階段 4＝1 題已審核＋1 題未審核；階段 9 無題
insert into questions (id, stage, qtype, stem, options, correct_index, explanation, error_type, option_errors, reviewed) values
  ('Q-2a', 2, 'mcq', '2a', '["o0","o1","o2"]', 0, '解 2a', '用了舊規則', '[null,"2022 手冊","2023 簡報"]', true),
  ('Q-2b', 2, 'mcq', '2b', '["o0","o1","o2"]', 1, '解 2b', '用了舊規則', null, true),
  ('Q-2c', 2, 'mcq', '2c', '["o0","o1","o2"]', 2, '解 2c', '違反紅線', null, true),
  ('Q-5a', 5, 'mcq', '5a', '["o0","o1"]', 0, '解 5a', '用了舊規則', null, true),
  ('Q-5b', 5, 'mcq', '5b', '["o0","o1"]', 1, '解 5b', '用了舊規則', null, true),
  ('M-R',  4, 'mcq', '4r', '["o0","o1"]', 0, '解 4r', '用了舊規則', null, true),
  ('M-U',  4, 'mcq', '4u', '["o0","o1"]', 0, '解 4u', '情境判斷失誤', null, false);
insert into questions (id, stage, qtype, stem, correct_index, explanation, error_type, error_detail, reference_answer, rubric, key_error, source, reviewed)
values ('S-2', 2, 'short', '簡答題幹', null, '解 S2', '情境判斷失誤', '漏掉核身', 'REF-ANSWER', '["點一","點二"]', '漏掉核身', 'legacy', false);

create function t_as(uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function t_admin() returns void language plpgsql as $$ begin reset role; end $$;
create function t_answers(att uuid, mode text) returns jsonb language plpgsql as $$
declare out jsonb := '[]'; qq jsonb; q questions; pos int; orig int;
begin
  for qq in select * from jsonb_array_elements((select question_ids from attempts where id = att)) loop
    select * into q from questions where id = qq ->> 'id';
    if q.qtype = 'short' then
      out := out || jsonb_build_object('question_id', q.id, 'text', case when mode in ('blank', 'wrongblank') then '' else 'abc' end);
    else
      orig := case mode when 'right' then q.correct_index when 'wrong' then (q.correct_index + 1) % jsonb_array_length(q.options) when 'wrongblank' then (q.correct_index + 1) % jsonb_array_length(q.options) else null end;
      continue when orig is null;
      select i - 1 into pos from jsonb_array_elements(qq -> 'perm') with ordinality as t(v, i) where v::int = orig;
      out := out || jsonb_build_object('question_id', q.id, 'choice', pos);
    end if;
  end loop;
  return out;
end $$;
grant execute on function t_as(uuid), t_admin(), t_answers(uuid, text) to public;

-- S1：答對＋簡答全勾 → 100 分；重複交卷被拒；start_exam 不含答案
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r jsonb; att uuid; ans jsonb;
begin
  perform t_as(a);
  r := start_exam(2); att := (r ->> 'attempt_id')::uuid;
  assert jsonb_array_length(r -> 'questions') = 4, '階段 2 應抽 4 題';
  assert r::text not like '%correct_index%' and r::text not like '%explanation%' and r::text not like '%REF-ANSWER%'
     and r::text not like '%點一%' and r::text not like '%解 2a%', 'start_exam 不得含答案／解析／得分點';
  perform t_admin(); ans := t_answers(att, 'right'); perform t_as(a);
  r := submit_exam(att, ans);
  assert r ->> 'status' = 'pending_selfcheck', '有簡答題要先自評';
  assert jsonb_array_length(r -> 'short_items') = 1 and r::text like '%REF-ANSWER%', '交卷後才給參考答案';
  assert (select count(*) from jsonb_array_elements(r -> 'mcq_items') e where (e ->> 'is_correct')::bool) = 3, '3 題選擇全對';
  begin perform submit_exam(att, ans); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'ATTEMPT_CLOSED' then raise; end if; end;
  r := submit_selfcheck(att, '[{"question_id":"S-2","checked":[0,1]}]');
  assert (r ->> 'score')::numeric = 100 and (r ->> 'passed')::bool and r ->> 'status' = 'done', '應 100 分及格';
  begin perform submit_selfcheck(att, '[]'); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'ATTEMPT_CLOSED' then raise; end if; end;
  assert (select score from attempts where id = att) = 100, '分數不因重複呼叫改變';
end $$;

-- S2：全錯＋空白簡答（即使勾選也 0 分）→ 0 分；錯題區 4 筆；再錯一次 wrong_count＝2；error_detail 取自選項
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r jsonb; att uuid; ans jsonb;
begin
  reset role; delete from wrong_book;
  for i in 1..2 loop
    perform t_as(a); att := (start_exam(2) ->> 'attempt_id')::uuid;
    perform t_admin(); ans := t_answers(att, 'wrongblank'); perform t_as(a);
    r := submit_exam(att, ans);
    r := submit_selfcheck(att, '[{"question_id":"S-2","checked":[0,1]}]');
    assert (r ->> 'score')::numeric = 0 and not (r ->> 'passed')::bool, '全錯應 0 分';
  end loop;
  perform t_admin();
  assert (select count(*) from wrong_book where user_id = a and status = 'open') = 4, '錯題區應有 4 題';
  assert (select min(wrong_count) from wrong_book where user_id = a) = 2, '再錯一次 wrong_count 應為 2';
  assert (select error_detail from attempt_answers where attempt_id = att and question_id = 'Q-2a') = '2022 手冊', 'error_detail 取自選項';
  assert (select error_type from attempt_answers where attempt_id = att and question_id = 'S-2') = '情境判斷失誤', '簡答錯誤類型';
end $$;

-- S3：選擇全對、簡答勾 1/2 → 100×(0.8×1＋0.2×0.5)＝90
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r jsonb; att uuid; ans jsonb;
begin
  perform t_as(a); att := (start_exam(2) ->> 'attempt_id')::uuid;
  perform t_admin(); ans := t_answers(att, 'right'); perform t_as(a);
  perform submit_exam(att, ans);
  r := submit_selfcheck(att, '[{"question_id":"S-2","checked":[0]}]');
  assert (r ->> 'score')::numeric = 90 and (r ->> 'passed')::bool, '應 90 分';
end $$;

-- S4：無簡答的階段，一次交卷即結算；答對 1 題、1 題未答 → 50；全未答 → 0 不報錯
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r jsonb; att uuid; ans jsonb;
begin
  perform t_as(a); att := (start_exam(5) ->> 'attempt_id')::uuid;
  perform t_admin(); ans := t_answers(att, 'right'); perform t_as(a);
  r := submit_exam(att, jsonb_build_array(ans -> 0));
  assert r ->> 'status' = 'done' and (r ->> 'score')::numeric = 50, '無簡答 1/2 應 50 分';
  att := (start_exam(5) ->> 'attempt_id')::uuid;
  r := submit_exam(att, '[]');
  assert (r ->> 'score')::numeric = 0 and r ->> 'status' = 'done', '全未答 0 分';
end $$;

-- S5：沒有題目的階段
do $$ begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
  begin perform start_exam(9); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'NO_QUESTIONS' then raise; end if; end;
end $$;

-- S6：綜合考核不抽未審核題；選項打亂 20 次後答對仍判對
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r jsonb; att uuid; ans jsonb;
begin
  perform t_as(a); r := start_exam(0);
  assert (select count(*) from jsonb_array_elements(r -> 'questions') e where e ->> 'id' in ('M-U', 'S-2')) = 0, '綜合不得含未審核題';
  assert jsonb_array_length(r -> 'questions') = 6, '已審核選擇題共 6 題全抽';
  for i in 1..20 loop
    att := (start_exam(5) ->> 'attempt_id')::uuid;
    perform t_admin(); ans := t_answers(att, 'right'); perform t_as(a);
    assert (submit_exam(att, ans) ->> 'score')::numeric = 100, '打亂後答對應判對';
  end loop;
end $$;

-- S7：別人的考卷不能交
do $$ declare att uuid;
begin
  perform t_as('aaaaaaaa-0000-0000-0000-000000000001'); att := (start_exam(5) ->> 'attempt_id')::uuid;
  perform t_as('aaaaaaaa-0000-0000-0000-000000000002');
  begin perform submit_exam(att, '[]'); raise exception 'NO_RAISE';
  exception when others then if sqlerrm <> 'ATTEMPT_CLOSED' then raise; end if; end;
end $$;

-- S8：匿名不能呼叫
do $$ begin
  reset role; set local role anon;
  begin perform start_exam(2); raise exception 'NO_RAISE';
  exception when insufficient_privilege then null; end;
end $$;

-- S9：shuffle=false 的題目（舊題的解析引用 A/B/C）選項順序永遠不變，其他題目才打亂
do $$ declare att uuid; perm jsonb;
begin
  reset role;
  insert into questions (id, stage, qtype, stem, options, correct_index, explanation, error_type, shuffle, reviewed)
  values ('Q-ns', 6, 'mcq', 'ns', '["A 選項","B 選項","C 選項"]', 2, 'A 錯誤。B 錯誤。C 正確。', '情境判斷失誤', false, false);
  for i in 1..20 loop
    perform t_as('aaaaaaaa-0000-0000-0000-000000000001');
    att := (start_exam(6) ->> 'attempt_id')::uuid;
    perform t_admin();
    perm := (select e -> 'perm' from attempts a, jsonb_array_elements(a.question_ids) e where a.id = att and e ->> 'id' = 'Q-ns');
    assert perm = '[0,1,2]'::jsonb, 'shuffle=false 不得打亂，實得 ' || perm::text;
  end loop;
end $$;

-- S10：簡答作答過長（貼入超大文字）只保留前 5000 字
do $$ declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; att uuid;
begin
  perform t_as(a); att := (start_exam(2) ->> 'attempt_id')::uuid;
  perform submit_exam(att, jsonb_build_array(jsonb_build_object('question_id', 'S-2', 'text', repeat('字', 6000))));
  perform t_admin();
  assert (select length(text_answer) from attempt_answers where attempt_id = att and question_id = 'S-2') = 5000, '簡答作答上限 5000 字';
end $$;

rollback;
