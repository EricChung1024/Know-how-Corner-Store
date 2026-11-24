-- 經驗柑仔店｜一次套用 006（SOP）、007（問小橘）、008（首頁）三個 migration，再匯入 SOP 與問答案例的種子資料。
-- 在 Supabase 後台 › SQL Editor 貼上整份、按 Run 一次即可。只能執行一次（資料表已存在會報錯）；種子資料可重複執行。
-- 由 backend/tools/bundle-pending.mjs 產生，不要手改；含 SOP 內容（沒有題庫答案）。


-- ================= migrations/20261124000006_sop.sql =================
-- 經驗柑仔店｜006 SOP、SOP 統整流程、設定
-- SOP 內容（章節與 57 條規則）由 backend/tools/build-sop-seed.mjs 產生的 seed/sop_seed.sql 匯入。
-- 新人看到的版本不含「生效日、依據、確認人」（只有資深版有）；所有資料只透過下面的函式讀寫。

-- ===== 設定 =====
create table app_settings (key text primary key, value jsonb not null);
alter table app_settings enable row level security;
create policy app_settings_read on app_settings for select to authenticated using (true);
insert into app_settings (key, value) values
  ('exam_error_types', '["只給結論，沒有下一步", "還沒查證就下結論", "把口頭說法當正式規定"]'),
  ('no_help_reasons', '["答案太長、看不完", "跟現場遇到的不一樣", "沒有回答到我的問題", "其他"]'),
  ('sop_package_title', '"統整模擬資料包 v3"');

create function get_exam_settings() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_login();
  return jsonb_build_object(
    'stages', (select jsonb_agg(jsonb_build_object('type', type, 'name', name, 'months', months, 'questionCount', question_count, 'shortMax', short_max,
        'passScore', pass_score, 'level', level, 'levelName', level_name, 'focus', focus) order by sort) from exam_stages),
    'errorTypes', (select value from app_settings where key = 'exam_error_types'),
    'noHelpReasons', (select value from app_settings where key = 'no_help_reasons'),
    'demo', false);
end $$;

-- ===== SOP =====
create table sop_chapters (no int primary key, name text not null, descr text not null);
create table sop_rules (
  no text primary key,                       -- 章-條，例如 7-9
  sys_id text,                               -- 系統內部代碼（永遠不變，用來追蹤版本；新人版不顯示）
  chapter int not null references sop_chapters (no),
  topic text not null,
  rule text not null,
  red_line boolean not null default false,
  status text not null default '現行' check (status in ('現行', '已失效')),
  effective date,
  basis text, law text, confirm_type text
);
create table sop_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  published_at date not null default current_date,
  confirmed_by text not null,
  seq int not null unique
);
create table sop_reads (
  employee_id uuid not null references employees (id) on delete cascade,
  rule_no text not null references sop_rules (no) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (employee_id, rule_no)
);
create table sop_update_seen (employee_id uuid primary key references employees (id) on delete cascade, seen_key text not null);

alter table sop_chapters enable row level security;
alter table sop_rules enable row level security;
alter table sop_versions enable row level security;
alter table sop_reads enable row level security;
alter table sop_update_seen enable row level security;
create policy sop_chapters_read on sop_chapters for select to authenticated using (true);
create policy sop_rules_senior_read on sop_rules for select to authenticated using (is_senior());
create policy sop_versions_senior_read on sop_versions for select to authenticated using (is_senior());
create policy sop_reads_own on sop_reads for select to authenticated using (employee_id = auth.uid() or is_senior());
create policy sop_update_seen_own on sop_update_seen for select to authenticated using (employee_id = auth.uid());
revoke insert, update, delete on sop_chapters, sop_rules, sop_versions, sop_reads, sop_update_seen, app_settings from anon, authenticated;
revoke all on sop_chapters, sop_rules, sop_versions, sop_reads, sop_update_seen, app_settings from anon;

-- 取代 004 的佔位：SOP 條目的顯示名稱（SOP 2-2 身分驗證）
create or replace function sop_label(p_no text) returns text language sql stable security definer set search_path = public as $$
  select case when p_no is null then null else 'SOP ' || p_no || coalesce(' ' || (select topic from sop_rules where no = p_no), '') end
$$;
create or replace function sop_known(p_no text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sop_rules where no = p_no)
$$;

create function get_published_sop(p_mode text default 'newbie') returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v sop_versions; senior boolean := p_mode = 'senior';
begin
  perform require_login();
  if senior then perform require_senior(); end if;
  select * into v from sop_versions order by seq desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('version', v.version, 'publishedAt', _fmt_date(v.published_at), 'confirmedBy', case when senior then v.confirmed_by end,
    'ruleCount', (select count(*) from sop_rules where status = '現行'), 'redLineCount', (select count(*) from sop_rules where status = '現行' and red_line),
    'title', (select value ->> 'title' from app_settings where key = 'sop_meta'),
    'chapters', (select jsonb_agg(jsonb_build_object('no', no::text, 'name', name, 'desc', descr) order by no) from sop_chapters),
    'rules', (select jsonb_agg(jsonb_build_object('no', r.no, 'chapter', r.chapter::text, 'topic', r.topic, 'name', sop_label(r.no), 'rule', r.rule,
        'redLine', r.red_line, 'effective', case when senior then _fmt_date(r.effective) end,
        'recent', r.effective is not null and v.published_at - r.effective <= 30) order by r.chapter, split_part(r.no, '-', 2)::int)
      from sop_rules r where r.status = '現行'));
end $$;

create function get_read_marks() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  return coalesce((select jsonb_object_agg(rule_no, true) from sop_reads where employee_id = e.id), '{}'::jsonb);
end $$;

create function mark_rule_read(p_rule_no text) returns boolean language plpgsql security definer set search_path = public as $$
declare e employees;
begin
  e := require_login();
  if not exists (select 1 from sop_rules where no = p_rule_no) then raise exception '找不到這一條 SOP'; end if;
  insert into sop_reads (employee_id, rule_no) values (e.id, p_rule_no) on conflict do nothing;
  return true;
end $$;

create function get_sop_update_notice() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e employees; v sop_versions; seen text;
begin
  e := require_login();
  select * into v from sop_versions order by seq desc limit 1;
  if not found then return jsonb_build_object('show', false); end if;
  select seen_key into seen from sop_update_seen where employee_id = e.id;
  return jsonb_build_object('show', seen is distinct from v.version || '#' || v.seq, 'version', v.version, 'publishedAt', _fmt_date(v.published_at),
    'recentCount', (select count(*) from sop_rules r where r.status = '現行' and r.effective is not null and v.published_at - r.effective <= 30));
end $$;

create function mark_sop_update_seen() returns boolean language plpgsql security definer set search_path = public as $$
declare e employees; v sop_versions;
begin
  e := require_login();
  select * into v from sop_versions order by seq desc limit 1;
  if found then
    insert into sop_update_seen (employee_id, seen_key) values (e.id, v.version || '#' || v.seq)
    on conflict (employee_id) do update set seen_key = excluded.seen_key;
  end if;
  return true;
end $$;

-- ===== SOP 統整流程（資深，一頁四步驟） =====
create table sop_flow (
  id int primary key default 1 check (id = 1),    -- 只有目前這一輪
  step int not null default 1 check (step between 1 and 4),
  imported boolean not null default false,
  organized boolean not null default false,
  generated boolean not null default false,
  reset_note text not null default ''
);
insert into sop_flow (id) values (1);
create table sop_source_package (name text primary key, kind text not null, format text not null, date text not null, sort int not null);
create table sop_flow_sources (
  name text primary key, kind text not null, format text not null, date text not null, own boolean not null default false,
  seq bigint generated always as identity
);
create table sop_confirm_items (
  id text primary key, sort int not null, kind text not null check (kind in ('batch', 'question')),
  no text, topic text, title text, ask text, options jsonb not null, ai_pick text, payload jsonb, result_rule text
);
create table sop_flow_decisions (
  item_id text primary key references sop_confirm_items (id) on delete cascade,
  decision text not null, decided_by uuid references employees (id) on delete set null, decided_at timestamptz not null default now()
);
alter table sop_flow enable row level security;
alter table sop_source_package enable row level security;
alter table sop_flow_sources enable row level security;
alter table sop_confirm_items enable row level security;
alter table sop_flow_decisions enable row level security;
create policy sop_flow_senior on sop_flow for select to authenticated using (is_senior());
create policy sop_source_package_senior on sop_source_package for select to authenticated using (is_senior());
create policy sop_flow_sources_senior on sop_flow_sources for select to authenticated using (is_senior());
create policy sop_confirm_items_senior on sop_confirm_items for select to authenticated using (is_senior());
create policy sop_flow_decisions_senior on sop_flow_decisions for select to authenticated using (is_senior());
revoke insert, update, delete on sop_flow, sop_source_package, sop_flow_sources, sop_confirm_items, sop_flow_decisions from anon, authenticated;
revoke all on sop_flow, sop_source_package, sop_flow_sources, sop_confirm_items, sop_flow_decisions from anon;

-- 換過檔案後：已做的 AI 統整和資深確認要重做（已發布的版本不受影響）
create function _sources_changed(p_before text[]) returns void language plpgsql security definer set search_path = public as $$
declare f sop_flow; after text[];
begin
  select * into f from sop_flow where id = 1;
  select coalesce(array_agg(name order by name), '{}') into after from sop_flow_sources;
  if f.imported and p_before is distinct from after and (f.organized or exists (select 1 from sop_flow_decisions)) then
    delete from sop_flow_decisions where true;
    update sop_flow set organized = false, step = 1, reset_note = '檔案換過了：AI 統整和資深確認要重做。' where id = 1;
  else
    update sop_flow set reset_note = '' where id = 1;
  end if;
  update sop_flow set imported = exists (select 1 from sop_flow_sources) where id = 1;
end $$;

create function _flow_sources() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'kind', kind, 'format', format, 'date', date, 'own', own) order by seq), '[]'::jsonb) from sop_flow_sources
$$;

create function get_sop_flow() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f sop_flow; v sop_versions; total int; done int; m jsonb;
begin
  perform require_senior();
  select * into f from sop_flow where id = 1;
  select * into v from sop_versions order by seq desc limit 1;
  select count(*) into total from sop_confirm_items;
  select count(*) into done from sop_flow_decisions;
  select value into m from app_settings where key = 'sop_meta';
  return jsonb_build_object('step', f.step, 'imported', f.imported, 'sources', _flow_sources(), 'organized', f.organized, 'generated', f.generated, 'resetNote', f.reset_note,
    'sourcePackage', jsonb_build_object('title', (select value #>> '{}' from app_settings where key = 'sop_package_title'), 'count', (select count(*) from sop_source_package),
      'oldDocs', (select count(*) from sop_source_package where kind = '舊檔'), 'transcripts', (select count(*) from sop_source_package where kind = '教學逐字稿')),
    'organizeResult', case when f.organized then jsonb_build_object('chapters', (select count(*) from sop_chapters), 'rules', (select count(*) from sop_rules where status = '現行'),
      'redLines', (select count(*) from sop_rules where status = '現行' and red_line), 'confirmCount', total) end,
    'confirmItems', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'no', i.no,
        'name', case when i.kind = 'question' then 'SOP ' || i.no || ' ' || i.topic else i.title end, 'title', i.title, 'ask', i.ask, 'options', i.options, 'aiPick', i.ai_pick,
        'context', case when i.kind = 'question' then i.payload end, 'batchItems', case when i.kind = 'batch' then i.payload end, 'resultRule', i.result_rule,
        'tbd', false, 'decision', d.decision) order by i.sort), '[]'::jsonb) from sop_confirm_items i left join sop_flow_decisions d on d.item_id = i.id),
    'confirmedCount', done, 'confirmTotal', total, 'version', m ->> 'version',
    'published', case when v.id is null then null else jsonb_build_object('version', v.version, 'publishedAt', _fmt_date(v.published_at), 'confirmedBy', v.confirmed_by) end);
end $$;

create function import_source_package() returns jsonb language plpgsql security definer set search_path = public as $$
declare before text[]; n int;
begin
  perform require_senior();
  select coalesce(array_agg(name order by name), '{}') into before from sop_flow_sources;
  delete from sop_flow_sources where not own;
  insert into sop_flow_sources (name, kind, format, date, own)
    select name, kind, format, date, false from sop_source_package order by sort
    on conflict (name) do update set kind = excluded.kind, format = excluded.format, date = excluded.date, own = false;
  perform _sources_changed(before);
  select count(*) into n from sop_source_package;
  return jsonb_build_object('count', n, 'sources', _flow_sources());
end $$;

create function import_sources(p_files jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare before text[]; f jsonb; nm text; ext text; ms numeric;
begin
  perform require_senior();
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then raise exception '請選擇檔案'; end if;
  select coalesce(array_agg(name order by name), '{}') into before from sop_flow_sources;
  for f in select * from jsonb_array_elements(p_files) loop
    nm := f ->> 'name'; ext := lower(split_part(reverse(split_part(reverse(nm), '.', 1)), '.', 1));
    ms := (f ->> 'lastModified')::numeric;
    insert into sop_flow_sources (name, kind, format, date, own) values (nm,
      case when nm ~* '\.(srt|vtt)$|逐字稿|轉錄|字幕' then '教學逐字稿' else '舊檔' end,
      case ext when 'docx' then 'Word' when 'doc' then 'Word' when 'pdf' then 'PDF' when 'xlsx' then 'Excel' when 'csv' then 'CSV' when 'md' then 'Markdown'
        when 'txt' then '文字檔' when 'srt' then '字幕' when 'vtt' then '會議轉錄' when 'mp3' then '錄音' when 'm4a' then '錄音' when 'mp4' then '錄影' else upper(ext) end,
      to_char(case when ms is null then current_date else (to_timestamp(ms / 1000.0) at time zone 'Asia/Taipei')::date end, 'YYYY-MM-DD'), true)
    on conflict (name) do update set kind = excluded.kind, format = excluded.format, date = excluded.date, own = true;
  end loop;
  perform _sources_changed(before);
  return _flow_sources();
end $$;

create function remove_source(p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare before text[];
begin
  perform require_senior();
  select coalesce(array_agg(name order by name), '{}') into before from sop_flow_sources;
  delete from sop_flow_sources where name = p_name;
  perform _sources_changed(before);
  return _flow_sources();
end $$;

create function set_flow_step(p_step int) returns int language plpgsql security definer set search_path = public as $$
declare f sop_flow; done int; total int; ok boolean;
begin
  perform require_senior();
  select * into f from sop_flow where id = 1;
  select count(*) into done from sop_flow_decisions; select count(*) into total from sop_confirm_items;
  ok := p_step = 1 or (p_step = 2 and f.imported) or (p_step = 3 and f.organized) or (p_step = 4 and done >= total);
  if not ok then raise exception '前一步還沒完成'; end if;
  update sop_flow set step = p_step where id = 1;
  return p_step;
end $$;

create function run_organize() returns jsonb language plpgsql security definer set search_path = public as $$
declare f sop_flow;
begin
  perform require_senior();
  select * into f from sop_flow where id = 1;
  if not f.imported then raise exception '請先匯入資料'; end if;
  update sop_flow set organized = true where id = 1;
  return jsonb_build_object('chapters', (select count(*) from sop_chapters), 'rules', (select count(*) from sop_rules where status = '現行'),
    'redLines', (select count(*) from sop_rules where status = '現行' and red_line), 'confirmCount', (select count(*) from sop_confirm_items));
end $$;

create function save_confirm_decision(p_item text, p_decision text) returns boolean language plpgsql security definer set search_path = public as $$
declare s employees; i sop_confirm_items;
begin
  s := require_senior();
  select * into i from sop_confirm_items where id = p_item;
  if not found or not (i.options @> to_jsonb(p_decision)) then raise exception '確認結果不正確'; end if;
  insert into sop_flow_decisions (item_id, decision, decided_by) values (p_item, p_decision, s.id)
  on conflict (item_id) do update set decision = excluded.decision, decided_by = excluded.decided_by, decided_at = now();
  return true;
end $$;

create function generate_senior_sop() returns jsonb language plpgsql security definer set search_path = public as $$
declare s employees; done int; total int; ver text; seq int; pub date := current_date;
begin
  s := require_senior();
  select count(*) into done from sop_flow_decisions; select count(*) into total from sop_confirm_items;
  if done < total then raise exception '% 項還沒全部確認', total; end if;
  select value ->> 'version' into ver from app_settings where key = 'sop_meta';
  select coalesce(max(v.seq), 0) + 1 into seq from sop_versions v;
  insert into sop_versions (version, published_at, confirmed_by, seq) values (ver, pub, s.name, seq);
  update sop_flow set generated = true, step = 4 where id = 1;
  return jsonb_build_object('version', ver, 'publishedAt', _fmt_date(pub));
end $$;

create function start_new_round() returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform require_senior();
  delete from sop_flow_decisions where true; delete from sop_flow_sources where true;
  update sop_flow set step = 1, imported = false, organized = false, generated = false, reset_note = '' where id = 1;
  return true;
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


-- ================= migrations/20261124000007_qa.sql =================
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


-- ================= migrations/20261124000008_home.sql =================
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


-- ================= seed/sop_seed.sql =================
-- 經驗柑仔店｜SOP 種子資料（由 backend/tools/build-sop-seed.mjs 產生，不要手改）。可重複執行。
begin;

insert into sop_chapters (no, name, descr) values
(1, '上工前準備', '開始接客人之前要知道的系統、檔案與服務時間'),
(2, '接起對話', '客人一進來：多快回、怎麼驗證身分、哪些資料絕對不能問'),
(3, '回答商品問題', '客人還沒買：規格、補貨、缺貨、成分與採購'),
(4, '優惠與活動', '客人下單時：優惠券和活動限制'),
(5, '訂單、付款與發票', '客人下單後：取消、改地址、發票、扣款'),
(6, '配送與物流', '商品寄出後：超商取貨、延遲、沒收到、破損'),
(7, '退換貨與退款', '客人收到後想退：鑑賞期、能不能退、運費、退款'),
(8, '客訴、補償與特殊狀況', '客人不滿意或狀況特殊：找主管、補償、升級、詐騙、個資'),
(9, '結案與交接', '處理完：工單狀態、結案代碼、外撥、交接')
on conflict (no) do update set name = excluded.name, descr = excluded.descr;

insert into sop_rules (no, sys_id, chapter, topic, rule, red_line, status, effective, basis, law, confirm_type) values
('1-1', 'G06', 1, '工單系統', '一律在「OO工單」開單與記錄；2025 年 6 月以前的舊案件到「客服通」查詢，只能看不能改。', false, '現行', '2025-07-01', 'LINE 群組 2025/06/20 主管公告', null, '批次確認（教學與最新的舊檔一致）'),
('1-2', 'G07', 1, '檔案位置', '所有檔案在OO雲端「客服部」資料夾（https://drive.haowu.example/cs）；舊文件裡寫的 NAS 路徑（\\haowu-nas01）已經打不開，請查雲端「00_說明」裡的《檔案位置對照表》。', false, '現行', '2025-03-10', 'LINE 群組 2025/03/10＋檔案位置對照表', null, '批次確認（教學與最新的舊檔一致）'),
('1-3', 'G01', 1, '服務時間與渠道', '每日 09:00–21:00；渠道為 LINE 官方帳號、站內訊息、客服電話、Email。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('2-1', 'G04', 2, '首次回覆時限', 'LINE：60 秒內回覆第一句（可先用罐頭訊息）；站內訊息：30 分鐘；客服電話：響 3 聲內接聽；Email：營運時間內 4 小時。大促期間依當次主管公告。', false, '現行', '2025-10-08', '2024 檢核表＋2025 佩珊小抄，經林佩珊確認', null, '批次確認（教學與最新的舊檔一致）'),
('2-2', 'G02', 2, '身分驗證', '說明任何訂單細節前，須核對「訂單編號＋手機末 3 碼＋收件人姓氏」三項皆正確；任一不符就不能透露訂單內容。', true, '現行', '2025-08-12', 'LINE 群組 2025/08/12 主管公告', null, '批次確認（教學與最新的舊檔一致）'),
('2-3', 'G03', 2, '禁止索取的資料', '不可索取：完整卡號、卡片背面末 3 碼、密碼、簡訊驗證碼（OTP）、身分證字號；客戶主動貼出時，提醒「我們不會索取這些資料」，並在OO工單按「遮蔽」。', true, '現行', '2025-10-08', '2024 檢核表＋2025 佩珊小抄，遮蔽為教學新增', null, '批次確認（教學新增）'),
('2-4', 'G11', 2, '承諾一定附時間', '說「我幫您查」時一定要給明確回覆時間（例：今天 18:00 前回覆您）；不說「馬上」「一定」「絕對」。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('3-1', 'A01', 3, '商品資訊只依商品頁', '商品規格只依商品頁與後台規格表回答；規格表沒寫的不推測，向商品部確認並告知回覆時間。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('3-2', 'A02', 3, '補貨日期只說「預計」', '補貨日期只說「預計」，提醒可能調整，並建議客戶開啟商品頁「到貨通知」；不承諾確切日期。', false, '現行', '2025-10-08', '2025 佩珊小抄', null, '自動確認（教學與舊檔一致）'),
('3-3', 'A03', 3, '缺貨通知與高單價致電', '缺貨由系統自動發簡訊通知。建議（非強制）：單價 3,000 元以上的訂單，可再主動致電說明。', false, '現行', '2026-11-16', '2025 佩珊小抄＋林佩珊確認列為「建議」', null, '逐題確認'),
('3-4', 'A04', 3, '療效、醫療問題不回答', '不回答療效或醫療建議，回覆「無法提供醫療建議」，建議客戶諮詢醫師或專業人員。', true, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('3-5', 'A05', 3, '過敏原與成分', '食品過敏原、成分只回答包裝標示內容；標示沒寫的一律回覆「需確認」並升級品管。', true, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('3-6', 'A06', 3, '批量、企業採購', '批量或企業採購：收集數量、預算、期限後轉業務窗口報價，客服不自行報價。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('4-1', 'E01', 4, '優惠券無法使用', '先逐項查門檻、效期、品類限制、是否已使用、可否併用，再向客戶說明；不直接補發。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('4-2', 'E02', 4, '過期優惠券', '過期券不延期、不補發；因公司系統錯誤造成者，由二線評估。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('4-3', 'E04', 4, '活動限制要主動說明', '活動商品不接受取消、優惠券不可併用等限制，須在受理時主動說明。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('5-1', 'B01', 5, '取消訂單（待出貨）', '狀態「待出貨」可在OO工單直接取消，並寄送取消確認；退款時程照 7-9。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('5-2', 'B02', 5, '取消訂單（揀貨中）', '狀態「揀貨中」：在OO工單按「攔截申請」，倉庫 30 分鐘內回覆；確認攔截成功才可跟客戶說已取消。', false, '現行', '2026-11-04', '2024 檢核表＋教學補充（按鈕、30 分鐘）', null, '批次確認（教學新增）'),
('5-3', 'B03', 5, '已出貨：宅配攔截', '宅配已出貨但物流「尚未集貨」：可填「物流攔截申請」嘗試攔截，須告知客戶不保證成功；已集貨則請客戶拒收，或收到後申請退貨。', false, '現行', '2026-09-01', '林佩珊教學＋統整確認（物流商 2026/09 起取消「出貨 2 小時內」限制）', null, '逐題確認'),
('5-4', 'B04', 5, '已出貨：超商', '超商取貨已出貨無法攔截：請客戶不要取件，逾期自動退回倉庫後走退款。', false, '現行', '2025-10-08', '2025 佩珊小抄', null, '自動確認（教學與舊檔一致）'),
('5-5', 'B05', 5, '修改收件資料', '待出貨：在OO工單直接修改，並請客戶確認新資料；已出貨：聯繫物流商改址，須告知不保證成功。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次確認（教學與最新的舊檔一致）'),
('5-6', 'B06', 5, '發票統編補開、改開', '發票開立「當月月底前」可作廢重開；跨月須改開折讓單。統編、抬頭請客戶自己確認，客服不轉記。', false, '現行', '2026-03-01', 'LINE 群組 2026/02/24 財務公告', null, '逐題確認'),
('5-7', 'B08', 5, '電子發票沒收到', '請客戶確認信箱與垃圾郵件匣；後台確認已開立後，從OO工單重寄。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('5-8', 'B07', 5, '重複扣款', '先確認是「授權」還是「請款」：純授權會自動釋放，告知客戶即可；已請款升級二線與財務處理。不要先說「我們多扣了」。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('6-1', 'C04', 6, '超商取貨期限', '超商取貨期限 7 天；逾期退回倉庫不算退貨（不走第 7 章退貨流程）。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('6-2', 'C05', 6, '超商逾期退回後重寄運費', '逾期退回後重寄：同一訂單第 1 次免運費，第 2 次起運費 60 元由客戶負擔。', false, '現行', '2026-01-05', 'LINE 群組 2026/01/02 主管公告', null, '批次確認（教學與最新的舊檔一致）'),
('6-3', 'C01', 6, '配送延遲與派查', '超過預計到貨日 2 個工作日才向物流商派查；派查後 24 小時內回覆客戶，並告知派查單號與下次回覆時間。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次確認（教學與最新的舊檔一致）'),
('6-4', 'C02', 6, '顯示已送達但沒收到', '先請客戶確認家人、管理室、鄰居；同時查簽收照片與簽收人；當日向物流商派查。不要直接回「系統顯示已簽收」。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('6-5', 'C03', 6, '商品破損', '請客戶拍外箱、物流標籤與商品照片，包材先保留；金額 3,000 元以內一線可直接補寄或退款，超過升級二線。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次確認（教學與最新的舊檔一致）'),
('6-6', 'C06', 6, '生鮮、易腐商品物流異常', '生鮮、易腐商品物流異常須當日處理，並升級二線。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('6-7', 'C07', 6, '30 天內第 2 次物流異常', '同一客戶 30 天內第 2 次物流異常，升級二線。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('7-1', 'D01', 7, '7 天鑑賞期怎麼算', '7 天鑑賞期從「到貨（宅配簽收）或超商取件的隔天」起算 7 天，不是下單日。', true, '現行', '2025-10-08', '2025 佩珊小抄＋消保法第 19 條', '消保法第 19 條', '批次確認（教學與最新的舊檔一致）'),
('7-2', 'D02', 7, '拆封商品', '拆封仍須受理退貨，不可以「已拆封」直接拒絕；包裝不完整也要收，在OO工單註記狀況，由倉庫驗收評估。', true, '現行', '2025-10-08', '2025 佩珊小抄＋消保法', '消保法第 19 條', '批次確認（教學與最新的舊檔一致）'),
('7-3', 'D03', 7, '例外商品', '生鮮、客製化、拆封的貼身衣物或個人衛生用品、拆封的影音軟體：須商品頁「事先標示」不適用鑑賞期才能拒絕；未標示者升級二線，原則上受理。', true, '現行', '2025-10-08', '2025 佩珊小抄＋合理例外情事適用準則', '通訊交易解除權合理例外情事適用準則', '自動確認（教學與舊檔一致）'),
('7-4', 'D04', 7, '「客製化」不等於「選了規格」', '從現有顏色、尺寸選購不算客製化，不可以「客製化」為由拒退。', true, '現行', '2026-11-03', '林佩珊教學（舊版沒有）', null, '批次確認（教學新增）'),
('7-5', 'D07', 7, '明顯使用痕跡', '一線不可自行扣款或拒退：請客戶拍照，轉二線評估；是否酌收整新費、收多少，由二線決定。', false, '現行', '2026-11-16', '林佩珊於統整時確認', null, '逐題確認'),
('7-6', 'D06', 7, '簽收 8–14 天換貨', '簽收 8–14 天內、未拆封且包裝完整可換貨，運費由客戶負擔，不退現金。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('7-7', 'D05', 7, '退貨運費', '7 天內退貨，以及商品瑕疵、寄錯，退貨運費都由公司負擔。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次確認（教學與最新的舊檔一致）'),
('7-8', 'D11', 7, '退貨未入倉不先退款', '退貨尚未由物流取回或入倉驗收，不先退款；告知客戶預計入倉日。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('7-9', 'D08', 7, '退款時程', '倉庫驗收完成後 3 個工作日內發起退款；信用卡另需發卡銀行約 5–14 個工作日，不保證入帳日。發起當天主動通知客戶。', false, '現行', '2026-01-15', 'LINE 群組 2026/01/12 財務公告', '消保法第 19-2 條（15 天內退款為法定底線）', '批次確認（教學與最新的舊檔一致）'),
('7-10', 'D10', 7, '退款方式', '一律原付款方式退回；不可主動建議改成購物金，購物金只能是客戶自己選。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('7-11', 'D09', 7, 'ATM／貨到付款的退款帳戶', '請客戶到「會員中心 > 退款帳戶」自行填寫；不可在對話、電話中索取或記錄銀行帳號。', true, '現行', '2025-07-01', 'LINE 群組 2025/07/01 主管公告＋2025 佩珊小抄', null, '批次確認（教學與最新的舊檔一致）'),
('7-12', 'D12', 7, '部分退貨的優惠分攤', '部分退貨依商品金額比例分攤優惠，先把金額算給客戶看再說明；無法判斷轉二線。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次沿用（教學沒提、舊檔一致）'),
('8-1', 'F04', 8, '客戶要求找主管', '不可拒絕；先詢問是否能讓我先協助，客戶仍堅持就轉接並完整交接，客戶不需重述。', false, '現行', '2024-05-20', '2024 檢核表', null, '批次確認（教學與最新的舊檔一致）'),
('8-2', 'F05', 8, '辱罵與騷擾', '先警告一次：「為了讓我能協助您，請我們用理性的方式溝通。」持續則可結束通話或對話，並通知主管、附上紀錄。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('8-3', 'F01', 8, '補償權限', '一線可直接發放 100 元以內購物金（限物流延遲、缺貨）；101–500 元由組長核准；500 元以上由主管核准；一律在OO工單「補償申請」送出。', false, '現行', '2026-03-02', 'LINE 群組 2026/02/26 主管公告', null, '批次確認（教學與最新的舊檔一致）'),
('8-4', 'F02', 8, '一線升級二線的條件', '符合任一即升級二線：同一問題第 3 次聯繫；金額超過 3,000 元且需例外處理；疑似詐騙或盜用；涉及法規爭議；客戶兩次要求找主管。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('8-5', 'F09', 8, '升級時的交接寫法', '升級時在OO工單寫清楚：事件、時間線、已做事項、客戶要什麼；二線接手不讓客戶重述。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('8-6', 'F03', 8, '揚言消保官、1950、媒體、律師', '保持禮貌、不爭辯不勸阻、記錄原話；立即在OO工單按「升級」，並用 Teams 通知主管；主管 1 小時內聯絡客戶。', true, '現行', '2026-11-16', '林佩珊教學＋統整確認', null, '逐題確認'),
('8-7', 'F06', 8, '書面客訴', '消保官函、存證信函等書面客訴，轉法務處理。', false, '現行', '2025-10-08', '2025 佩珊小抄', null, '批次沿用（教學沒提、舊檔一致）'),
('8-8', 'F07', 8, '客訴結案後回訪', '不做例行回訪；主管指定的個案，於結案後 24 小時內回訪。', false, '現行', '2026-11-16', '林佩珊教學＋統整確認', null, '逐題確認'),
('8-9', 'G12', 8, '防詐騙', '客戶反映接到「解除分期／重複扣款／訂單設定錯誤」電話：明確告知我們不會要求操作 ATM、網銀或購買點數；請客戶掛斷並撥 165；OO工單加「疑似詐騙」標籤、結案代碼 R5，並通報資安窗口。', true, '現行', '2025-09-01', 'LINE 群組 2025/09/01＋2025 佩珊小抄', null, '自動確認（教學與舊檔一致）'),
('8-10', 'G13', 8, '個資請求（查閱、刪除、停止行銷）', '客戶要求查閱／刪除個資、刪除帳號或停止行銷：不在對話中處理，請客戶到「會員中心 > 隱私權設定」提出申請（系統自動轉法務）；客戶無法操作時開單轉法務（R3）。', true, '現行', '2026-11-16', '林佩珊於統整時確認（舊版只有 2022 版）', null, '逐題確認'),
('9-1', 'G09', 9, '工單狀態與「等待客戶」', '工單狀態：新建／處理中／等待客戶／等待物流商／已升級／已結案；「等待客戶」超過 3 天未回，結案前須發最後一次通知。', false, '現行', '2024-05-20', '2024 檢核表', null, '自動確認（教學與舊檔一致）'),
('9-2', 'G10', 9, '結案代碼', 'OO工單結案代碼：R1 已解決／R2 待追蹤／R3 轉單位／R4 顧客未回應／R5 疑似詐騙。', false, '現行', '2025-07-01', '2025 佩珊小抄＋OO工單畫面', null, '批次確認（教學與最新的舊檔一致）'),
('9-3', 'G08', 9, '外撥話術', '外撥（主動致電客戶）一律使用OO工單內建的「外撥範本」；舊的《外撥話術.docx》停用。', false, '現行', '2025-07-01', '林佩珊於統整時確認（舊檔遺失）', null, '逐題確認'),
('9-4', 'F08', 9, '未結案交接（動態交接卡）', '換班、休假或離職時，每件未結案案件都要填「動態交接卡」：下一步、期限、負責人、對客承諾、證據位置；不可只寫「持續追蹤」。', false, '現行', '2026-11-05', '林佩珊教學（舊版沒有）', null, '批次確認（教學新增）')
on conflict (no) do update set sys_id = excluded.sys_id, chapter = excluded.chapter, topic = excluded.topic, rule = excluded.rule,
  red_line = excluded.red_line, status = excluded.status, effective = excluded.effective, basis = excluded.basis, law = excluded.law, confirm_type = excluded.confirm_type;

insert into app_settings (key, value) values ('sop_meta', '{"company":"OO電商公司（虛構）","title":"OO電商公司客服 SOP 最新版","version":"2026.11.16","runDate":"2026-11-16","ruleCount":57,"redLineCount":12}'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into sop_source_package (name, kind, format, date, sort) values
('S1_2022_OO電商公司客服作業手冊_v1.0_周美玲.docx', '舊檔', 'Word', '2022-03-15', 1),
('S2_2023_新人教育訓練_退換貨與退款_v1.3.pdf', '舊檔', 'PDF 簡報', '2023-09-01', 2),
('S3_2024_客服作業檢核表_v2_final(家豪).xlsx', '舊檔', 'Excel', '2024-05-20', 3),
('S4_2025_佩珊的客服小抄_Notion匯出.md', '舊檔', 'Markdown', '2025-10-08', 4),
('S5_[LINE]OO電商公司客服組的聊天記錄.txt', '舊檔', 'LINE 文字匯出', '2025-03-10~2026-10-28', 5),
('S6_檔案位置對照表_NAS轉雲端.csv', '舊檔', 'CSV', '2025-03-10', 6),
('A1_20261103_帶新人_退貨退款物流_純錄音逐字稿.txt', '教學逐字稿', '純錄音→自動逐字稿', '2026-11-03', 7),
('A2_20261104_OO工單操作_螢幕錄影字幕.srt', '教學逐字稿', '錄音＋螢幕錄影→字幕（含畫面文字）', '2026-11-04', 8),
('A3_20261105_客訴與經驗談_Teams會議轉錄.vtt', '教學逐字稿', '線上會議錄影→轉錄', '2026-11-05', 9)
on conflict (name) do update set kind = excluded.kind, format = excluded.format, date = excluded.date, sort = excluded.sort;

insert into sop_confirm_items (id, sort, kind, no, topic, title, ask, options, ai_pick, payload, result_rule) values
('batch-NEWER', 1, 'batch', null, null, '你教的和最新的舊檔一樣，只是更舊的檔案寫法不同', null, '["全部確認"]'::jsonb, null, '[{"no":"2-2","topic":"身分驗證","proposed":"說明任何訂單細節前，須核對「訂單編號＋手機末 3 碼＋收件人姓氏」三項皆正確；任一不符就不能透露訂單內容。","older":["2022 手冊：核對訂單編號＋收件人姓名。","2024 檢核表：訂單編號＋收件人姓名或手機末 3 碼（擇一）。"]},{"no":"2-1","topic":"首次回覆時限","proposed":"LINE：60 秒內回覆第一句（可先用罐頭訊息）；站內訊息：30 分鐘；客服電話：響 3 聲內接聽；Email：營運時間內 4 小時。大促期間依當次主管公告。","older":["2022 手冊：Email 1 個工作日內回覆；電話響 3 聲內接聽。","2024 檢核表：LINE 5 分鐘；站內訊息 30 分鐘；電話 3 聲；Email 4 小時。"]},{"no":"1-1","topic":"工單系統","proposed":"一律在「OO工單」開單與記錄；2025 年 6 月以前的舊案件到「客服通」查詢，只能看不能改。","older":["2022 手冊：所有進線在「客服通 CS-Link」開案件。","2023 新人訓簡報：退貨單在客服通開立。"]},{"no":"1-2","topic":"檔案位置","proposed":"所有檔案在OO雲端「客服部」資料夾（https://drive.haowu.example/cs）；舊文件裡寫的 NAS 路徑（\\\\haowu-nas01）已經打不開，請查雲端「00_說明」裡的《檔案位置對照表》。","older":["2022 手冊：檔案放在 \\\\haowu-nas01\\客服部\\ 底下。"]},{"no":"9-2","topic":"結案代碼","proposed":"OO工單結案代碼：R1 已解決／R2 待追蹤／R3 轉單位／R4 顧客未回應／R5 疑似詐騙。","older":["2022 手冊：客服通結案代碼 01–09（01 已解決、02 退貨、03 換貨……）。"]},{"no":"5-5","topic":"修改收件資料","proposed":"待出貨：在OO工單直接修改，並請客戶確認新資料；已出貨：聯繫物流商改址，須告知不保證成功。","older":["2022 手冊：收件資料可直接修改。"]},{"no":"6-3","topic":"配送延遲與派查","proposed":"超過預計到貨日 2 個工作日才向物流商派查；派查後 24 小時內回覆客戶，並告知派查單號與下次回覆時間。","older":["2022 手冊：延遲 3 天以上才向物流查件。"]},{"no":"6-5","topic":"商品破損","proposed":"請客戶拍外箱、物流標籤與商品照片，包材先保留；金額 3,000 元以內一線可直接補寄或退款，超過升級二線。","older":["2022 手冊：破損一律轉倉儲判定。"]},{"no":"6-2","topic":"超商逾期退回後重寄運費","proposed":"逾期退回後重寄：同一訂單第 1 次免運費，第 2 次起運費 60 元由客戶負擔。","older":["2022 手冊：逾期退回可免費重寄。","2024 檢核表：逾期退回免費重寄。","2025 佩珊小抄：現在重寄運費 60 元客人付（以前免費）。"]},{"no":"7-1","topic":"7 天鑑賞期怎麼算","proposed":"7 天鑑賞期從「到貨（宅配簽收）或超商取件的隔天」起算 7 天，不是下單日。","older":["2022 手冊：自訂單成立日起 7 日內可申請退貨。","2023 新人訓簡報：自到貨日起 7 日內。","2024 檢核表：訂單成立日起 7 天。"]},{"no":"7-2","topic":"拆封商品","proposed":"拆封仍須受理退貨，不可以「已拆封」直接拒絕；包裝不完整也要收，在OO工單註記狀況，由倉庫驗收評估。","older":["2022 手冊：商品拆封恕不受理退貨。","2023 新人訓簡報：拆封可退，但商品與配件需完整。"]},{"no":"7-7","topic":"退貨運費","proposed":"7 天內退貨，以及商品瑕疵、寄錯，退貨運費都由公司負擔。","older":["2022 手冊：退貨運費由客戶自付。"]},{"no":"7-9","topic":"退款時程","proposed":"倉庫驗收完成後 3 個工作日內發起退款；信用卡另需發卡銀行約 5–14 個工作日，不保證入帳日。發起當天主動通知客戶。","older":["2022 手冊：收到退貨後 14 個工作天內退款。","2023 新人訓簡報：驗收後 10 個工作天內退款。","2025 佩珊小抄：倉庫驗收完 7 個工作天內（財務 9 月說的）。"]},{"no":"7-11","topic":"ATM／貨到付款的退款帳戶","proposed":"請客戶到「會員中心 > 退款帳戶」自行填寫；不可在對話、電話中索取或記錄銀行帳號。","older":["2022 手冊：請客戶於對話中提供匯款帳號，客服登錄後轉財務。","2024 檢核表：引導客戶填寫「退款帳戶表單」，不在對話框收帳號。"]},{"no":"8-3","topic":"補償權限","proposed":"一線可直接發放 100 元以內購物金（限物流延遲、缺貨）；101–500 元由組長核准；500 元以上由主管核准；一律在OO工單「補償申請」送出。","older":["2022 手冊：一線可直接給 200 元購物金。","2024 檢核表：一線可發 500 元內優惠券，超過轉二線。","2025 佩珊小抄：一線現在不能直接給！開補償申請單給組長。"]},{"no":"8-1","topic":"客戶要求找主管","proposed":"不可拒絕；先詢問是否能讓我先協助，客戶仍堅持就轉接並完整交接，客戶不需重述。","older":["2022 手冊：請客戶留電話，主管有空時回電。"]}]'::jsonb, null),
('batch-ADD', 2, 'batch', null, null, '你教的新細節（舊檔沒寫）', null, '["全部確認"]'::jsonb, null, '[{"no":"2-3","topic":"禁止索取的資料","proposed":"不可索取：完整卡號、卡片背面末 3 碼、密碼、簡訊驗證碼（OTP）、身分證字號；客戶主動貼出時，提醒「我們不會索取這些資料」，並在OO工單按「遮蔽」。","older":["2022 手冊：可請客戶提供信用卡末四碼核對付款；嚴禁索取密碼。"]},{"no":"5-2","topic":"取消訂單（揀貨中）","proposed":"狀態「揀貨中」：在OO工單按「攔截申請」，倉庫 30 分鐘內回覆；確認攔截成功才可跟客戶說已取消。","older":["2022 手冊：揀貨中訂單無法取消。"]},{"no":"7-4","topic":"「客製化」不等於「選了規格」","proposed":"從現有顏色、尺寸選購不算客製化，不可以「客製化」為由拒退。","older":[]},{"no":"9-4","topic":"未結案交接（動態交接卡）","proposed":"換班、休假或離職時，每件未結案案件都要填「動態交接卡」：下一步、期限、負責人、對客承諾、證據位置；不可只寫「持續追蹤」。","older":[]}]'::jsonb, null),
('batch-KEEP', 3, 'batch', null, null, '你沒教到、但舊檔寫法一致的規則', null, '["全部沿用"]'::jsonb, null, '[{"no":"1-3","topic":"服務時間與渠道","proposed":"每日 09:00–21:00；渠道為 LINE 官方帳號、站內訊息、客服電話、Email。","older":["2022 手冊：週一至週五 09:00–18:00；渠道為客服電話與 Email。"]},{"no":"3-4","topic":"療效、醫療問題不回答","proposed":"不回答療效或醫療建議，回覆「無法提供醫療建議」，建議客戶諮詢醫師或專業人員。","older":[]},{"no":"3-5","topic":"過敏原與成分","proposed":"食品過敏原、成分只回答包裝標示內容；標示沒寫的一律回覆「需確認」並升級品管。","older":[]},{"no":"3-6","topic":"批量、企業採購","proposed":"批量或企業採購：收集數量、預算、期限後轉業務窗口報價，客服不自行報價。","older":[]},{"no":"5-8","topic":"重複扣款","proposed":"先確認是「授權」還是「請款」：純授權會自動釋放，告知客戶即可；已請款升級二線與財務處理。不要先說「我們多扣了」。","older":[]},{"no":"5-7","topic":"電子發票沒收到","proposed":"請客戶確認信箱與垃圾郵件匣；後台確認已開立後，從OO工單重寄。","older":[]},{"no":"6-6","topic":"生鮮、易腐商品物流異常","proposed":"生鮮、易腐商品物流異常須當日處理，並升級二線。","older":[]},{"no":"6-7","topic":"30 天內第 2 次物流異常","proposed":"同一客戶 30 天內第 2 次物流異常，升級二線。","older":[]},{"no":"7-6","topic":"簽收 8–14 天換貨","proposed":"簽收 8–14 天內、未拆封且包裝完整可換貨，運費由客戶負擔，不退現金。","older":[]},{"no":"7-8","topic":"退貨未入倉不先退款","proposed":"退貨尚未由物流取回或入倉驗收，不先退款；告知客戶預計入倉日。","older":[]},{"no":"7-12","topic":"部分退貨的優惠分攤","proposed":"部分退貨依商品金額比例分攤優惠，先把金額算給客戶看再說明；無法判斷轉二線。","older":[]},{"no":"4-3","topic":"活動限制要主動說明","proposed":"活動商品不接受取消、優惠券不可併用等限制，須在受理時主動說明。","older":[]},{"no":"8-7","topic":"書面客訴","proposed":"消保官函、存證信函等書面客訴，轉法務處理。","older":[]}]'::jsonb, null),
('batch-EXPIRED', 4, 'batch', null, null, '已經過期的暫時規則', null, '["確認失效"]'::jsonb, null, '[{"no":"—","topic":"雙 11 大促 LINE 首回放寬（暫時規則）","proposed":"2026/11/01–11/15 大促期間 LINE 首次回覆放寬為 3 分鐘；11/16 起恢復 60 秒。","older":[]},{"no":"—","topic":"雙 11 延遲出貨 50 元購物金（2025 活動限定）","proposed":"2025 雙 11 延遲出貨補償 50 元購物金，僅限 2025 年活動；2026 雙 11 不統一發放，改依 8-3 補償權限處理。","older":[]}]'::jsonb, null),
('A03', 5, 'question', '3-3', '缺貨通知與高單價致電', '佩珊說「3,000 元以上缺貨我習慣打電話，這不是規定」。這一條要怎麼收進 SOP？', '佩珊說「3,000 元以上缺貨我習慣打電話，這不是規定」。這一條要怎麼收進 SOP？', '["列為「建議（非強制）」","列為規定（必做）","只放經驗談，不放 SOP"]'::jsonb, null, '[{"label":"2025 佩珊小抄","text":"簡訊系統會自動發；高單價（3,000 以上）我自己會再打電話。","status":"已被取代"}]'::jsonb, '缺貨由系統自動發簡訊通知。建議（非強制）：單價 3,000 元以上的訂單，可再主動致電說明。'),
('B03', 6, 'question', '5-3', '已出貨：宅配攔截', '已出貨宅配的攔截條件，三個版本都不一樣。現在是？', '已出貨宅配的攔截條件，三個版本都不一樣。現在是？', '["只要物流尚未集貨就可申請（教學說法）","出貨 2 小時內＋尚未集貨（2025 小抄）","已出貨不能攔截，請客戶拒收（2024 檢核表）"]'::jsonb, '只要物流尚未集貨就可申請（教學說法）', '[{"label":"2024 檢核表","text":"已出貨不可取消，請客戶拒收或收到後退貨。","status":"已被取代"},{"label":"2025 佩珊小抄","text":"宅配：出貨 2 小時內＋物流還沒集貨 → 可以填物流攔截申請試試看，不保證成功。","status":"已被取代"}]'::jsonb, '宅配已出貨但物流「尚未集貨」：可填「物流攔截申請」嘗試攔截，須告知客戶不保證成功；已集貨則請客戶拒收，或收到後申請退貨。'),
('B06', 7, 'question', '5-6', '發票統編補開、改開', '佩珊說統編規定「財務今年有改，月底還是雙月忘了」。現在是？', '佩珊說統編規定「財務今年有改，月底還是雙月忘了」。現在是？', '["開立當月月底前可作廢重開，跨月開折讓（2026/02 財務公告）","當期雙月內可作廢重開（2024 檢核表）"]'::jsonb, '開立當月月底前可作廢重開，跨月開折讓（2026/02 財務公告）', '[{"label":"2022 手冊","text":"統編補開可隨時請財務重開。","status":"已被取代"},{"label":"2024 檢核表","text":"當期（雙月）內可作廢重開。","status":"已被取代"},{"label":"2025 佩珊小抄","text":"統編補開要看開立日期，規定我不太確定，問家豪。","status":"說法不確定"},{"label":"LINE 主管公告（2026/02/24）","text":"財務：3/1 起發票開立當月月底前可作廢重開，跨月改開折讓單。","status":"與最新版一致"}]'::jsonb, '發票開立「當月月底前」可作廢重開；跨月須改開折讓單。統編、抬頭請客戶自己確認，客服不轉記。'),
('D07', 8, 'question', '7-5', '明顯使用痕跡', '2023 簡報寫「明顯使用可酌收 10% 整新費（需組長同意）」，教學說「一線不要自己扣錢，拍照轉二線」。現在是？', '2023 簡報寫「明顯使用可酌收 10% 整新費（需組長同意）」，教學說「一線不要自己扣錢，拍照轉二線」。現在是？', '["一線不扣款，拍照轉二線；是否收整新費、收多少由二線決定","一線轉二線，二線固定收 10%","完全不收整新費"]'::jsonb, null, '[{"label":"2023 新人訓簡報","text":"明顯使用者可酌收 10% 整新費（需組長同意）。","status":"已被取代"}]'::jsonb, '一線不可自行扣款或拒退：請客戶拍照，轉二線評估；是否酌收整新費、收多少，由二線決定。'),
('G13', 9, 'question', '8-10', '個資請求（查閱、刪除、停止行銷）', '個資請求只有 2022 手冊寫「轉主管處理」，之後的檔案都沒再提，教學也沒講。現在怎麼處理？', '個資請求只有 2022 手冊寫「轉主管處理」，之後的檔案都沒再提，教學也沒講。現在怎麼處理？', '["沿用：轉主管處理","改為：請客戶到會員中心 > 隱私權設定申請，無法操作就開單轉法務"]'::jsonb, null, '[{"label":"2022 手冊","text":"客戶要求刪除個人資料，轉主管處理。","status":"已被取代"}]'::jsonb, '客戶要求查閱／刪除個資、刪除帳號或停止行銷：不在對話中處理，請客戶到「會員中心 > 隱私權設定」提出申請（系統自動轉法務）；客戶無法操作時開單轉法務（R3）。'),
('F03', 10, 'question', '8-6', '揚言消保官、1950、媒體、律師', '揚言消保官／媒體時的通報方式：2025 小抄寫「LINE 私訊組長」，教學說「OO工單按升級＋Teams 通知主管」，沒有書面公告。現在是？', '揚言消保官／媒體時的通報方式：2025 小抄寫「LINE 私訊組長」，教學說「OO工單按升級＋Teams 通知主管」，沒有書面公告。現在是？', '["OO工單按升級＋Teams 通知主管（教學說法）","LINE 私訊組長（2025 小抄）"]'::jsonb, 'OO工單按升級＋Teams 通知主管（教學說法）', '[{"label":"2024 檢核表","text":"立即通知主管，1 小時內由主管聯絡。","status":"與最新版一致"},{"label":"2025 佩珊小抄","text":"揚言消保官／1950／媒體／律師 → 立刻通報組長（LINE 私訊家豪）。","status":"已被取代"}]'::jsonb, '保持禮貌、不爭辯不勸阻、記錄原話；立即在OO工單按「升級」，並用 Teams 通知主管；主管 1 小時內聯絡客戶。'),
('F07', 11, 'question', '8-8', '客訴結案後回訪', '2024 檢核表寫「客訴結案後 24 小時內回訪」，教學說「現在沒在做，除非主管指定」。現在是？', '2024 檢核表寫「客訴結案後 24 小時內回訪」，教學說「現在沒在做，除非主管指定」。現在是？', '["不做例行回訪；主管指定的個案才在 24 小時內回訪（教學說法）","維持每件客訴 24 小時內回訪（2024 檢核表）"]'::jsonb, null, '[{"label":"2024 檢核表","text":"客訴結案後 24 小時內回訪。","status":"已被取代"}]'::jsonb, '不做例行回訪；主管指定的個案，於結案後 24 小時內回訪。'),
('G08', 12, 'question', '9-3', '外撥話術', '2022 手冊寫外撥話術在 NAS，但搬到雲端時檔案遺失（對照表寫「待確認」），教學也沒提到。外撥現在要用什麼？', '2022 手冊寫外撥話術在 NAS，但搬到雲端時檔案遺失（對照表寫「待確認」），教學也沒提到。外撥現在要用什麼？', '["改用OO工單內建「外撥範本」，舊檔停用","舊檔還要用，我會補上傳到雲端","外撥已不做，刪除此條"]'::jsonb, null, '[{"label":"2022 手冊","text":"外撥話術請見 \\\\haowu-nas01\\客服部\\03_話術\\外撥話術.docx。","status":"已被取代"},{"label":"檔案位置對照表","text":"外撥話術.docx → （搬遷時未找到，待確認）","status":"已被取代"}]'::jsonb, '外撥（主動致電客戶）一律使用OO工單內建的「外撥範本」；舊的《外撥話術.docx》停用。')
on conflict (id) do update set sort = excluded.sort, kind = excluded.kind, no = excluded.no, topic = excluded.topic, title = excluded.title,
  ask = excluded.ask, options = excluded.options, ai_pick = excluded.ai_pick, payload = excluded.payload, result_rule = excluded.result_rule;

commit;


-- ================= seed/qa_seed.sql =================
-- 經驗柑仔店｜問小橘案例種子資料（由 backend/tools/build-sop-seed.mjs 產生，不要手改）。可重複執行。
begin;
insert into qa_cases (id, newbie_asks, check_latest, check_history, outcome, ai_should_reply, source_chip, writes_pending, rule_no) values
('Q01', '客人說之前客服跟他說退款要 7 個工作天，可是 SOP 寫驗收後 3 個工作日，哪個對？', 'SOP 7-9 退款時程', '2025 佩珊小抄（2025/10：7 個工作天）', '已確認的變更', '以最新版為準：2026/01/15 起驗收後 3 個工作日內發起。客人聽到的 7 天是 2025 年的舊規定，可以這樣跟客人說明：「我們的退款流程今年有加快…」。', '出處：SOP 7-9 退款時程｜舊版：2025 佩珊小抄', false, '7-9'),
('Q02', '客人收到的取貨通知簡訊寫「請於 10 天內取貨」，SOP 寫超商放 7 天，哪個對？', 'SOP 6-1 超商取貨期限', '無（2024 檢核表、2026 教學都寫 7 天）', '新舊版都不符 → 請問資深', '最新版和所有舊版都寫 7 天，沒有任何版本寫 10 天，我沒辦法判斷哪個是對的。請先跟客人說「我確認後 30 分鐘內回覆您」，然後直接問林佩珊；我已經幫你把這題記到『待確認清單』，佩珊回覆後會在下一次統整時更新 SOP。', '出處：SOP 6-1 超商取貨期限｜狀態：待資深確認', true, '6-1'),
('Q03', '客人說以前有客服給過他 200 元購物金，我可以給 200 嗎？', 'SOP 8-3 補償權限', '2022 手冊（一線可給 200）', '舊規已失效', '不行直接給。2022 年一線可以給 200，但 2026/03/02 起一線只能給 100 元以內，而且限物流延遲或缺貨；超過要在OO工單送「補償申請」給組長。', '出處：SOP 8-3 補償權限｜舊版：2022 手冊', false, '8-3'),
('Q04', '今天 11/20，LINE 不是放寬到 3 分鐘嗎？', 'SOP 2-1 首次回覆時限', '雙 11 暫時規則（2026/11/15 到期）', '暫時規則已過期', '3 分鐘是雙 11 大促期間（11/1–11/15）的暫時規則，已經到期了；現在恢復 60 秒內回第一句。', '出處：SOP 2-1 首次回覆時限｜已失效：雙 11 暫時規則', false, '2-1'),
('Q05', '我按了攔截申請，倉庫兩個小時都沒回，SOP 不是寫 30 分鐘嗎？', 'SOP 5-2 取消訂單（揀貨中）', '無（只有 2026 教學提到 30 分鐘）', '新舊版都不符 → 請問資深', 'SOP 寫倉庫 30 分鐘內回覆，舊版沒有寫時間，查不到倉庫沒回時該怎麼做。先不要跟客人說已取消；請直接問林佩珊或張家豪要不要打倉庫分機，這題我已經記到『待確認清單』。', '出處：SOP 5-2 取消訂單（揀貨中）｜狀態：待資深確認', true, '5-2'),
('Q06', '客人說他只是選了紅色 L 號，商品頁寫客製化商品不退，可以拒絕嗎？', 'SOP 7-4 「客製化」不等於「選了規格」', '—', '直接回答', '不可以拒絕。從現有顏色、尺寸選購不算客製化，要照一般 7 天鑑賞期受理。', '出處：SOP 7-4 「客製化」不等於「選了規格」', false, '7-4')
on conflict (id) do update set newbie_asks = excluded.newbie_asks, check_latest = excluded.check_latest, check_history = excluded.check_history,
  outcome = excluded.outcome, ai_should_reply = excluded.ai_should_reply, source_chip = excluded.source_chip, writes_pending = excluded.writes_pending, rule_no = excluded.rule_no;
commit;
