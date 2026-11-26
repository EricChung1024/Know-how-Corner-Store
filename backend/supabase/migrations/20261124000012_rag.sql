-- 經驗柑仔店｜012 問小橘接 Gemini（RAG）：向量資料表、知識片段、搜尋函式、紀錄函式
--
-- 做法：
--   1. knowledge_chunks 存「知識片段」：每一條現行 SOP 規則、每一個問答案例各一筆。文字由 sync_knowledge() 從 sop_rules、qa_cases 自動產生，
--      所以 SOP 或案例改了，只要再執行一次 sync_knowledge()，有變動的片段會清掉舊向量、等著重新產生。
--   2. 向量（768 維）由 Edge Function embed-knowledge 呼叫 Gemini 算出來，再用 store_embeddings() 寫回。
--   3. 新人提問時，Edge Function ask-xiaoju 把問題轉成向量，用 match_knowledge() 找最像的片段，交給 Gemini 組出回答，
--      最後用 record_ask() 寫進提問紀錄與待確認清單（和原本的 ask_xiaoju 寫的東西一樣）。
--   4. 原本的 ask_xiaoju（SQL 比對版）完全不動，當作備援：Gemini 或函式出問題時前端會自動改用它。
-- 以上新函式只有 service_role（Edge Function）能呼叫；新人、資深、匿名都不能直接碰向量資料表。

create extension if not exists vector with schema extensions;

create table knowledge_chunks (
  id text primary key,                                   -- 'rule:7-9' 或 'case:Q01'
  kind text not null check (kind in ('rule', 'case')),
  rule_no text,                                          -- 對應的 SOP 條號（規則片段一定有；案例片段可能有）
  case_id text,                                          -- 案例片段才有
  title text not null,
  content text not null,                                 -- 交給 Gemini 看的文字
  source_chip text not null default '',                  -- 回答下方顯示的出處
  writes_pending boolean not null default false,         -- 案例：這類問題要不要寫進待確認清單
  content_hash text not null,                            -- content 的 md5，用來判斷是不是改過
  embedding extensions.vector(768),                      -- null = 還沒算（或內容改了要重算）
  embedded_at timestamptz,
  updated_at timestamptz not null default now()
);
create index knowledge_chunks_embedding_idx on knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index knowledge_chunks_kind_idx on knowledge_chunks (kind);

alter table knowledge_chunks enable row level security;   -- 不開任何 policy，也不給權限：只有 service_role 讀得到
revoke all on knowledge_chunks from anon, authenticated;

-- ===== 從 SOP 規則與問答案例產生知識片段 =====
-- 內容有變才會清掉舊向量；已經不存在的片段會刪掉。回傳目前還需要算向量的片段數。
create function sync_knowledge() returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  insert into knowledge_chunks (id, kind, rule_no, case_id, title, content, source_chip, writes_pending, content_hash)
  select 'rule:' || r.no, 'rule', r.no, null, 'SOP ' || r.no || ' ' || r.topic, t.content, '出處：SOP ' || r.no || ' ' || r.topic, false, md5(t.content)
  from sop_rules r
  cross join lateral (select 'SOP ' || r.no || ' ' || r.topic || E'\n規則：' || r.rule
    || case when r.red_line then E'\n（這是紅線規則，不能違反）' else '' end
    || coalesce(E'\n依據：' || nullif(r.basis, ''), '') || coalesce(E'\n法規：' || nullif(r.law, ''), '') as content) t
  where r.status = '現行'
  on conflict (id) do update set rule_no = excluded.rule_no, title = excluded.title, content = excluded.content, source_chip = excluded.source_chip,
    content_hash = excluded.content_hash, updated_at = now(),
    embedding = case when knowledge_chunks.content_hash = excluded.content_hash then knowledge_chunks.embedding else null end,
    embedded_at = case when knowledge_chunks.content_hash = excluded.content_hash then knowledge_chunks.embedded_at else null end;

  insert into knowledge_chunks (id, kind, rule_no, case_id, title, content, source_chip, writes_pending, content_hash)
  select 'case:' || c.id, 'case', c.rule_no, c.id, '案例 ' || c.id, t.content, coalesce(c.source_chip, ''), c.writes_pending, md5(t.content)
  from qa_cases c
  cross join lateral (select '新人常問：' || c.newbie_asks
    || coalesce(E'\n對照最新版 SOP：' || nullif(c.check_latest, ''), '') || coalesce(E'\n對照舊版 SOP：' || nullif(c.check_history, ''), '')
    || E'\n判斷結果：' || c.outcome || E'\n標準回答：' || c.ai_should_reply as content) t
  on conflict (id) do update set rule_no = excluded.rule_no, title = excluded.title, content = excluded.content, source_chip = excluded.source_chip,
    writes_pending = excluded.writes_pending, content_hash = excluded.content_hash, updated_at = now(),
    embedding = case when knowledge_chunks.content_hash = excluded.content_hash then knowledge_chunks.embedding else null end,
    embedded_at = case when knowledge_chunks.content_hash = excluded.content_hash then knowledge_chunks.embedded_at else null end;

  delete from knowledge_chunks where kind = 'rule' and rule_no not in (select no from sop_rules where status = '現行');
  delete from knowledge_chunks where kind = 'case' and case_id not in (select id from qa_cases);

  select count(*) into n from knowledge_chunks where embedding is null;
  return n;
end $$;

-- ===== 寫回向量：p_items = [{"id": "rule:7-9", "embedding": [0.01, ...768 個數字]}, ...] =====
create function store_embeddings(p_items jsonb) returns int language plpgsql security definer set search_path = public, extensions as $$
declare it jsonb; n int := 0; c int;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_array_length(it -> 'embedding') <> 768 then raise exception '向量要 768 維（%）', it ->> 'id'; end if;
    update knowledge_chunks set embedding = (it ->> 'embedding')::extensions.vector, embedded_at = now() where id = it ->> 'id';
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end $$;

-- ===== 找最像的片段（cosine 相似度，1 = 一模一樣） =====
create function match_knowledge(p_embedding text, p_count int default 6) returns table (
  id text, kind text, rule_no text, case_id text, title text, content text, source_chip text, writes_pending boolean, similarity float8
) language sql stable security definer set search_path = public, extensions as $$
  select k.id, k.kind, k.rule_no, k.case_id, k.title, k.content, k.source_chip, k.writes_pending,
         1 - (k.embedding <=> p_embedding::extensions.vector) as similarity
  from knowledge_chunks k
  where k.embedding is not null
  order by k.embedding <=> p_embedding::extensions.vector
  limit greatest(1, least(coalesce(p_count, 6), 20))
$$;

-- ===== 寫提問紀錄與待確認清單（和 ask_xiaoju 寫的東西一樣，只是回答來源換成 Gemini） =====
create function record_ask(p_employee uuid, p_question text, p_outcome text, p_reply text, p_chip text, p_rule_no text, p_case_id text, p_pending boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e employees; v_rule text; v_case text; v_pending boolean := coalesce(p_pending, false); aid uuid; pid uuid; q text := btrim(coalesce(p_question, ''));
begin
  select * into e from employees where id = p_employee;
  if not found then raise exception '找不到這位員工'; end if;
  if q = '' then raise exception '請輸入問題'; end if;
  if p_outcome not in ('直接回答', '已確認的變更', '舊規已失效', '暫時規則已過期', '新舊版都不符 → 請問資深', '不在 SOP 範圍') then raise exception '不認得的判斷結果：%', p_outcome; end if;
  if btrim(coalesce(p_reply, '')) = '' then raise exception '回答是空的'; end if;
  v_rule := case when p_rule_no is not null and sop_known(p_rule_no) then p_rule_no end;
  select id into v_case from qa_cases where id = p_case_id;
  if p_outcome = '新舊版都不符 → 請問資深' then v_pending := true; end if;

  insert into qa_logs (employee_id, case_id, question, outcome, reply, source_chip, rule_no, writes_pending)
  values (e.id, v_case, q, p_outcome, btrim(p_reply), coalesce(p_chip, ''), v_rule, v_pending) returning id into aid;
  if v_pending then
    select id into pid from pending_questions where employee_id = e.id and status = '待處理' and question = q limit 1;
    if pid is null then
      insert into pending_questions (ask_id, case_id, employee_id, question, outcome, source_chip, ai_reply)
      values (aid, v_case, e.id, q, p_outcome, coalesce(p_chip, ''), btrim(p_reply)) returning id into pid;
    end if;
  end if;
  return jsonb_build_object('askId', aid, 'outcome', p_outcome, 'reply', btrim(p_reply), 'sourceChip', coalesce(p_chip, ''), 'ruleNo', v_rule,
    'writesPending', v_pending, 'pendingId', pid);
end $$;

-- ===== 權限：這四個函式只有 service_role（Edge Function）能呼叫 =====
revoke execute on function sync_knowledge(), store_embeddings(jsonb), match_knowledge(text, int),
  record_ask(uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function sync_knowledge(), store_embeddings(jsonb), match_knowledge(text, int),
  record_ask(uuid, text, text, text, text, text, text, boolean) to service_role;

-- ===== 第一次產生知識片段（之後 SOP 或案例有改，Edge Function embed-knowledge 會自動再同步） =====
select sync_knowledge();
