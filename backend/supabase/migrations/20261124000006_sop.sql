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
