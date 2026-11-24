-- 經驗柑仔店｜009 修正：Supabase 規定 DELETE 一定要有 WHERE（pg_safeupdate），006 的兩個函式少了。
-- 影響：「換過檔案後重做」（_sources_changed）和「開始新一輪統整」（start_new_round）在 Supabase 上會報錯 "DELETE requires a WHERE clause"。
-- 這份只重新建立那兩個函式；006 的檔案也已同步修正（新建專案直接用 006 就沒問題）。

create or replace function _sources_changed(p_before text[]) returns void language plpgsql security definer set search_path = public as $$
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

create or replace function start_new_round() returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform require_senior();
  delete from sop_flow_decisions where true; delete from sop_flow_sources where true;
  update sop_flow set step = 1, imported = false, organized = false, generated = false, reset_note = '' where id = 1;
  return true;
end $$;

-- 權限（規則同 005）：create or replace 不會改變原本的權限，這段只是保險
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
