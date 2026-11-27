-- 經驗柑仔店｜013 刪除員工：資深在網站上刪除一位員工（新人或資深）
-- 做法和 010 新增員工相同：security definer 函式，直接刪 auth 帳號，不需要 service_role 金鑰或 Edge Function。
-- 刪除是「整個人刪掉」：登入帳號、員工資料，以及這個人的考卷、作答、錯題、提問紀錄、待確認問題、SOP 閱讀紀錄
-- 都會一起刪除（資料表的 on delete cascade）；題庫審核人、SOP 統整確認人只是「誰做的」的紀錄，會留下並改成空值。
-- 刪除後無法復原。擋下的情況：只有資深能刪；不能刪自己；找不到工號。

create function delete_employee(p_employee_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me employees; t employees; code text := upper(btrim(coalesce(p_employee_id, '')));
begin
  me := require_senior();
  select * into t from employees where employee_id = code;
  if not found then raise exception '找不到這位員工'; end if;
  if t.id = me.id then raise exception '不能刪除自己的帳號'; end if;
  -- 先刪登入帳號的身分資料，再刪帳號；employees 與底下所有資料表會跟著刪（on delete cascade）
  delete from auth.identities where user_id = t.id;
  delete from auth.users where id = t.id;
  return jsonb_build_object('id', t.employee_id, 'name', t.name);
end $$;

-- 權限：只開給登入的人（函式裡再用 require_senior 檢查是資深），匿名一律不行。
-- 注意：這裡只設定這一支函式，不要重跑 005、010 那種「重設所有函式權限」的區塊——
-- 012、013（問小橘）刻意把 sync_knowledge、store_embeddings、match_knowledge、record_ask 限制成只有 service_role 能呼叫，重設會把它們開給登入者。
revoke execute on function delete_employee(text) from public, anon;
grant execute on function delete_employee(text) to authenticated;
