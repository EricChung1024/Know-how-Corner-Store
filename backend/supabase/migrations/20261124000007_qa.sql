-- 經驗柑仔店｜007 問小橘：案例、提問紀錄、待確認清單
-- 回答方式（先不用 AI）：
--   1. 比對 qa_cases（新人常問的案例，答案是資深確認過的）：問句和案例幾乎相同、或包含案例問句的前 12 個字、或用字相似度夠高 → 用案例的標準答法
--   2. 比對 SOP 規則：問句裡有規則主題的名稱，或問句的用字大部分出現在某一條規則裡 → 直接引用那一條規則
--   3. 都沒有 → 「不在 SOP 範圍」
-- 接 Gemini（RAG）之後，這支函式的第 2、3 步換成 Edge Function ask-xiaoju，其餘（紀錄、待確認清單）不變。

create table qa_cases (
  id text primary key, newbie_asks text not null, check_latest text, check_history text, outcome text not null,
  ai_should_reply text not null, source_chip text, writes_pending boolean not null default false, rule_no text
);
create table qa_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  case_id text references qa_cases (id),
  question text not null, outcome text not null, reply text not null, source_chip text not null default '',
  rule_no text, writes_pending boolean not null default false,
  feedback text check (feedback in ('up', 'down')), reason text not null default '',
  created_at timestamptz not null default now()
);
create table pending_questions (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid references qa_logs (id) on delete cascade,
  case_id text, employee_id uuid not null references employees (id) on delete cascade,
  question text not null, outcome text not null, source_chip text, ai_reply text,
  status text not null default '待處理' check (status in ('待處理', '已回覆')),
  reply text not null default '', replied_by text not null default '', replied_at timestamptz,
  seen boolean not null default false, notified_at timestamptz, created_at timestamptz not null default now()
);
create index qa_logs_employee_idx on qa_logs (employee_id, created_at desc);
create index pending_status_idx on pending_questions (status, created_at desc);

alter table qa_cases enable row level security;
alter table qa_logs enable row level security;
alter table pending_questions enable row level security;
create policy qa_cases_senior on qa_cases for select to authenticated using (is_senior());   -- 新人只能透過函式拿到答案
create policy qa_logs_read on qa_logs for select to authenticated using (employee_id = auth.uid() or is_senior());
create policy pending_read on pending_questions for select to authenticated using (employee_id = auth.uid() or is_senior());
revoke insert, update, delete on qa_cases, qa_logs, pending_questions from anon, authenticated;
revoke all on qa_cases, qa_logs, pending_questions from anon;

-- ===== 文字比對小工具 =====
create function _norm(t text) returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(coalesce(t, ''), '[\s，。？！、：；:;,.?!「」『』（）()“”"''\-]', '', 'g'))
$$;
create function _bigrams(t text) returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct substr(t, i, 2)), '{}') from generate_series(1, greatest(length(t) - 1, 0)) i
$$;
-- 兩段文字的相似度（雙字詞的 Jaccard）
create function _sim(a text, b text) returns numeric language sql immutable set search_path = public as $$
  with x as (select _bigrams(a) ba, _bigrams(b) bb),
       i as (select cardinality(array(select unnest(ba) intersect select unnest(bb))) n, cardinality(ba) na, cardinality(bb) nb from x)
  select case when na + nb - n = 0 then 0 else n::numeric / (na + nb - n) end from i
$$;

-- ===== 顯示用的 JSON =====
create function _ask_json(a qa_logs, emp_code text) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', a.id, 'userId', emp_code, 'caseId', a.case_id, 'question', a.question, 'outcome', a.outcome, 'reply', a.reply,
    'sourceChip', a.source_chip, 'ruleNo', a.rule_no, 'writesPending', a.writes_pending, 'createdAt', _fmt_ts(a.created_at),
    'feedback', a.feedback, 'reason', a.reason)
$$;
create function _pending_json(p pending_questions, asker employees) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'askId', p.ask_id, 'caseId', p.case_id, 'userId', asker.employee_id, 'askerName', asker.name, 'askerEmail', asker.email,
    'question', p.question, 'outcome', p.outcome, 'sourceChip', p.source_chip, 'aiReply', p.ai_reply, 'date', _fmt_ts(p.created_at), 'status', p.status,
    'reply', p.reply, 'repliedBy', p.replied_by, 'repliedAt', _fmt_ts(p.replied_at), 'seen', p.seen, 'notifiedAt', _fmt_ts(p.notified_at),
    'isNew', p.status = '已回覆' and not p.seen)
$$;

-- ===== 新人：提問 =====
create function ask_xiaoju(p_question text) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e employees; q text := btrim(coalesce(p_question, '')); nq text; c qa_cases; best_c qa_cases; best numeric := 0; sc numeric;
  r sop_rules; best_r sop_rules; rscore numeric := 0; bq text[]; inter int;
  v_outcome text; v_reply text; v_chip text := ''; v_rule text; v_pending boolean := false; aid uuid; pid uuid;
begin
  e := require_login();
  if q = '' then raise exception '請輸入問題'; end if;
  nq := _norm(q); bq := _bigrams(nq);
  -- 1. 案例
  for c in select * from qa_cases loop
    sc := case when nq = _norm(c.newbie_asks) or nq like '%' || left(_norm(c.newbie_asks), 12) || '%' then 1 else _sim(nq, _norm(c.newbie_asks)) end;
    if sc > best then best := sc; best_c := c; end if;
  end loop;
  if best >= 0.5 then
    v_outcome := best_c.outcome; v_reply := best_c.ai_should_reply; v_chip := coalesce(best_c.source_chip, ''); v_rule := best_c.rule_no; v_pending := best_c.writes_pending;
  else
    best_c := null;
    -- 2. SOP 規則
    for r in select * from sop_rules where status = '現行' loop
      if length(_norm(r.topic)) >= 3 and nq like '%' || _norm(r.topic) || '%' then sc := 1;
      else
        inter := cardinality(array(select unnest(bq) intersect select unnest(_bigrams(_norm(r.topic || r.rule)))));
        sc := case when inter >= 4 and cardinality(bq) > 0 then inter::numeric / cardinality(bq) else 0 end;
        if sc < 0.55 then sc := 0; end if;
      end if;
      if sc > rscore then rscore := sc; best_r := r; end if;
    end loop;
    if rscore > 0 then
      v_outcome := '直接回答'; v_reply := 'SOP ' || best_r.no || ' ' || best_r.topic || '：' || best_r.rule;
      v_chip := '出處：SOP ' || best_r.no || ' ' || best_r.topic; v_rule := best_r.no;
    else
      -- 3. 不在範圍
      v_outcome := '不在 SOP 範圍'; v_reply := '這題不在OO電商公司 SOP 範圍內。';
    end if;
  end if;
  insert into qa_logs (employee_id, case_id, question, outcome, reply, source_chip, rule_no, writes_pending)
  values (e.id, best_c.id, q, v_outcome, v_reply, v_chip, v_rule, v_pending) returning id into aid;
  if v_pending then
    select id into pid from pending_questions where employee_id = e.id and case_id = best_c.id and status = '待處理' limit 1;
    if pid is null then
      insert into pending_questions (ask_id, case_id, employee_id, question, outcome, source_chip, ai_reply) values (aid, best_c.id, e.id, q, v_outcome, v_chip, v_reply) returning id into pid;
    end if;
  end if;
  return jsonb_build_object('askId', aid, 'outcome', v_outcome, 'reply', v_reply, 'sourceChip', v_chip, 'ruleNo', v_rule, 'writesPending', v_pending, 'pendingId', pid);
end $$;

create function list_suggested_questions() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_login();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'question', newbie_asks, 'ruleNo', rule_no, 'ruleName', sop_label(rule_no)) order by id) from qa_cases), '[]'::jsonb);
end $$;

create function list_my_asks() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  return coalesce((select jsonb_agg(_ask_json(a, e.employee_id) order by a.created_at desc, a.id) from qa_logs a where a.employee_id = e.id), '[]'::jsonb);
end $$;

create function get_ask(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees; a qa_logs;
begin
  e := require_login();
  select * into a from qa_logs where id = p_id and employee_id = e.id;
  if not found then return null; end if;
  return _ask_json(a, e.employee_id);
end $$;

create function send_feedback(p_ask uuid, p_helpful boolean, p_reason text default '') returns boolean language plpgsql security definer set search_path = public as $$
declare e employees; n int;
begin
  e := require_login();
  if not p_helpful and not ((select value from app_settings where key = 'no_help_reasons') @> to_jsonb(coalesce(p_reason, ''))) then raise exception '請選一個原因'; end if;
  update qa_logs set feedback = case when p_helpful then 'up' else 'down' end, reason = case when p_helpful then '' else p_reason end where id = p_ask and employee_id = e.id;
  get diagnostics n = row_count;
  if n = 0 then raise exception '找不到這筆提問'; end if;
  return true;
end $$;

create function list_my_pending() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  return coalesce((select jsonb_agg(_pending_json(p, e) order by p.created_at desc) from pending_questions p where p.employee_id = e.id), '[]'::jsonb);
end $$;

create function mark_replies_seen() returns boolean language plpgsql security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  update pending_questions set seen = true where employee_id = e.id and status = '已回覆';
  return true;
end $$;

-- 提問分析：依 SOP 章節統計（新人看自己的、資深看全部）
create function _qa_chapters(p_emp uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('no', t.ch, 'name', c.name, 'count', t.n) order by t.n desc, t.ch::int), '[]'::jsonb)
  from (select split_part(rule_no, '-', 1) ch, count(*) n from qa_logs where rule_no is not null and (p_emp is null or employee_id = p_emp) group by 1) t
  join sop_chapters c on c.no = t.ch::int
$$;

create function get_my_qa_stats() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees; fb_out text[] := array['新舊版都不符 → 請問資深', '不在 SOP 範圍'];
begin
  e := require_login();
  return jsonb_build_object('total', (select count(*) from qa_logs where employee_id = e.id),
    'sentToSenior', (select count(*) from qa_logs where employee_id = e.id and writes_pending), 'chapters', _qa_chapters(e.id),
    'helpful', (select count(*) from qa_logs where employee_id = e.id and outcome <> all (fb_out) and feedback = 'up'),
    'notHelpful', (select count(*) from qa_logs where employee_id = e.id and outcome <> all (fb_out) and feedback = 'down'),
    'noFeedback', (select count(*) from qa_logs where employee_id = e.id and outcome <> all (fb_out) and feedback is null));
end $$;

-- ===== 資深：待確認清單、統計 =====
create function list_pending(p_status text default '待處理') returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_senior();
  return coalesce((select jsonb_agg(_pending_json(p, a) order by p.created_at desc) from pending_questions p join employees a on a.id = p.employee_id
    where p_status = '全部' or p.status = p_status), '[]'::jsonb);
end $$;

create function reply_pending(p_id uuid, p_reply text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s employees; p pending_questions; a employees;
begin
  s := require_senior();
  select * into p from pending_questions where id = p_id;
  if not found then raise exception '找不到這個問題'; end if;
  if btrim(coalesce(p_reply, '')) = '' then raise exception '請輸入回覆內容'; end if;
  update pending_questions set status = '已回覆', reply = btrim(p_reply), replied_by = s.name, replied_at = now(), seen = false, notified_at = now()
  where id = p_id returning * into p;
  select * into a from employees where id = p.employee_id;
  return _pending_json(p, a);
end $$;

create function get_qa_stats() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare fb_out text[] := array['新舊版都不符 → 請問資深', '不在 SOP 範圍'];
begin
  perform require_senior();
  return jsonb_build_object('total', (select count(*) from qa_logs), 'askSenior', (select count(*) from qa_logs where outcome = '新舊版都不符 → 請問資深'),
    'waiting', (select count(*) from pending_questions where status = '待處理'),
    'helpful', (select count(*) from qa_logs where feedback = 'up'), 'notHelpful', (select count(*) from qa_logs where feedback = 'down'),
    'chapters', _qa_chapters(null),
    'outcomes', coalesce((select jsonb_agg(jsonb_build_object('outcome', outcome, 'count', n) order by n desc, outcome) from (select outcome, count(*) n from qa_logs group by 1) t), '[]'::jsonb),
    'noHelpReasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', r, 'count', (select count(*) from qa_logs where feedback = 'down' and reason = r))), '[]'::jsonb)
      from jsonb_array_elements_text((select value from app_settings where key = 'no_help_reasons')) r),
    'demo', false);
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
