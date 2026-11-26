-- 經驗柑仔店｜013 記錄每則回答是誰答的：'sql'（資料庫比對）或 'gemini'（AI），讓網站能標示「Gemini AI 回答」
-- 舊的提問紀錄一律當 'sql'。record_ask 多一個選填參數 p_engine（預設 'gemini'），Edge Function 不改也能用。

alter table qa_logs add column engine text not null default 'sql' check (engine in ('sql', 'gemini'));

-- 顯示用 JSON 多一個 engine（list_my_asks、get_ask 都走這支）
create or replace function _ask_json(a qa_logs, emp_code text) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', a.id, 'userId', emp_code, 'caseId', a.case_id, 'question', a.question, 'outcome', a.outcome, 'reply', a.reply,
    'sourceChip', a.source_chip, 'ruleNo', a.rule_no, 'writesPending', a.writes_pending, 'createdAt', _fmt_ts(a.created_at),
    'feedback', a.feedback, 'reason', a.reason, 'engine', a.engine)
$$;

-- record_ask 改簽名（多 p_engine），先刪舊的，避免同名兩個函式
drop function record_ask(uuid, text, text, text, text, text, text, boolean);
create function record_ask(p_employee uuid, p_question text, p_outcome text, p_reply text, p_chip text, p_rule_no text, p_case_id text, p_pending boolean, p_engine text default 'gemini')
returns jsonb language plpgsql security definer set search_path = public as $$
declare e employees; v_rule text; v_case text; v_pending boolean := coalesce(p_pending, false); aid uuid; pid uuid; q text := btrim(coalesce(p_question, ''));
begin
  select * into e from employees where id = p_employee;
  if not found then raise exception '找不到這位員工'; end if;
  if q = '' then raise exception '請輸入問題'; end if;
  if p_outcome not in ('直接回答', '已確認的變更', '舊規已失效', '暫時規則已過期', '新舊版都不符 → 請問資深', '不在 SOP 範圍') then raise exception '不認得的判斷結果：%', p_outcome; end if;
  if btrim(coalesce(p_reply, '')) = '' then raise exception '回答是空的'; end if;
  if p_engine not in ('sql', 'gemini') then raise exception '不認得的回答來源：%', p_engine; end if;
  v_rule := case when p_rule_no is not null and sop_known(p_rule_no) then p_rule_no end;
  select id into v_case from qa_cases where id = p_case_id;
  if p_outcome = '新舊版都不符 → 請問資深' then v_pending := true; end if;

  insert into qa_logs (employee_id, case_id, question, outcome, reply, source_chip, rule_no, writes_pending, engine)
  values (e.id, v_case, q, p_outcome, btrim(p_reply), coalesce(p_chip, ''), v_rule, v_pending, p_engine) returning id into aid;
  if v_pending then
    select id into pid from pending_questions where employee_id = e.id and status = '待處理' and question = q limit 1;
    if pid is null then
      insert into pending_questions (ask_id, case_id, employee_id, question, outcome, source_chip, ai_reply)
      values (aid, v_case, e.id, q, p_outcome, coalesce(p_chip, ''), btrim(p_reply)) returning id into pid;
    end if;
  end if;
  return jsonb_build_object('askId', aid, 'outcome', p_outcome, 'reply', btrim(p_reply), 'sourceChip', coalesce(p_chip, ''), 'ruleNo', v_rule,
    'writesPending', v_pending, 'pendingId', pid, 'engine', p_engine);
end $$;

revoke execute on function record_ask(uuid, text, text, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function record_ask(uuid, text, text, text, text, text, text, boolean, text) to service_role;
