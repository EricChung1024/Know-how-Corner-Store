-- 經驗柑仔店｜005 收緊內部函式
-- 問題：004 的收尾把所有 public 函式都開給 authenticated，內部小工具（例如 _records(員工 uuid)）也能被登入的人
--       直接呼叫，等於能查別人的成績。內部函式只該被別的函式（以擁有者身分執行）呼叫，不開給前端。
-- 規則（之後每個 migration 結尾都用這段）：名稱以底線開頭、或在清單裡的函式不開給 authenticated；
--   其餘（給前端呼叫的 RPC）只開給 authenticated，匿名一律不行。is_senior() 要保留（RLS policy 以呼叫者身分執行它）。

alter function _opts_display(jsonb, jsonb) set search_path = public;
alter function _q_public(question_bank, jsonb) set search_path = public;
alter function _w(exam_papers) set search_path = public;
alter function _fmt_date(date) set search_path = public;
alter function _fmt_ts(timestamptz) set search_path = public;
alter function sop_label(text) set search_path = public;
alter function sop_known(text) set search_path = public;

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
