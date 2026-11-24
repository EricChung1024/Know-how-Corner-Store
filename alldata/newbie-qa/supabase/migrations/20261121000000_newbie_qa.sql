-- =====================================================================
-- 經驗柑仔店 Know-how Corner Store｜新人問答亭（負責：Iris 劉俞瑄）
-- Supabase 資料庫結構與權限（Row Level Security）
--
-- 角色：newbie（新人）、senior（資深）
--   新人：發問、看自己的紀錄與待確認題目、改自己的回饋
--   資深：看全部新人的紀錄與統計、回覆新人的待確認題目（不發問）
--
-- 寫入規則：
--   問答紀錄與待確認題目只由 Edge Function「xiaoju-answer」用 service role 寫入，
--   使用者不能自己新增或刪除紀錄；新人只能改自己題目的「回饋」欄位，
--   資深只能改待確認題目的「回覆」欄位。
--
-- 若整體系統已有 profiles 表，請 Eric 先比對欄位再合併（見 README）。
-- =====================================================================

-- ---------- 1. 使用者資料與角色 ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  employee_no  text,
  role         text not null default 'newbie' check (role in ('newbie', 'senior')),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is '使用者顯示名稱與角色；角色只能由管理者在 Supabase 後台修改';

-- 新帳號建立時自動建一筆 profile，角色一律先設為新人（避免自己註冊成資深）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, employee_no)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'employee_no'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 判斷目前登入者是不是資深（security definer：避免 RLS 互相遞迴）
create or replace function public.is_senior()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'senior'
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_senior" on public.profiles;
create policy "profiles_select_self_or_senior" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_senior());

-- 使用者只能改自己的顯示名稱；角色、工號只能由管理者改
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ---------- 2. 問答紀錄（每問一題一筆） ----------
create table if not exists public.qa_records (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  question         text not null check (char_length(question) between 1 and 500),
  answer           text not null,
  say_to_customer  text not null default '',
  judge            text not null check (judge in (
                     '直接回答', '已確認的變更', '舊規已失效', '暫時規則已過期',
                     '傳言不採用', '新舊版都不符 → 請問資深', '不在 SOP 範圍')),
  sop_nos          text[] not null default '{}',   -- 命中的規則編號（例 7-9）；已失效規則用代碼（例 G05）
  chapters         text[] not null default '{}',   -- 步驟編號（1–9）
  red_line         boolean not null default false, -- 命中任一 ★ 紅線規則
  source_chip      text not null default '',       -- 出處標籤，例：出處：SOP 7-9 退款時程｜舊版：2025 佩珊小抄
  older_source     text not null default '',
  tip_ids          text[] not null default '{}',   -- 經驗談代碼（例 X05）
  pending          boolean not null default false, -- 是否轉進待確認清單
  mode             text not null default 'ai' check (mode in ('ai', 'keyword')),
  model            text not null default '',
  latency_ms       integer,
  feedback_value   text check (feedback_value in ('up', 'down')),
  feedback_reasons text[] not null default '{}',
  feedback_note    text not null default '' check (char_length(feedback_note) <= 300),
  feedback_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists qa_records_user_created_idx on public.qa_records (user_id, created_at desc);
create index if not exists qa_records_created_idx on public.qa_records (created_at desc);

alter table public.qa_records enable row level security;

drop policy if exists "qa_select_own_or_senior" on public.qa_records;
create policy "qa_select_own_or_senior" on public.qa_records
  for select to authenticated
  using (user_id = auth.uid() or public.is_senior());

-- 只開放「回饋」欄位給本人更新；沒有 insert / delete policy＝使用者不能新增或刪除
revoke insert, update, delete on public.qa_records from authenticated, anon;
grant update (feedback_value, feedback_reasons, feedback_note) on public.qa_records to authenticated;

drop policy if exists "qa_update_own_feedback" on public.qa_records;
create policy "qa_update_own_feedback" on public.qa_records
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 回饋原因只能是固定選項
create or replace function public.check_feedback_reasons()
returns trigger
language plpgsql
as $$
begin
  if not (new.feedback_reasons <@ array['答案錯誤','看不懂','答非所問','查無資料','還是要問資深','其他']::text[]) then
    raise exception '回饋原因不在允許的選項內';
  end if;
  if new.feedback_value is distinct from old.feedback_value
     or new.feedback_reasons is distinct from old.feedback_reasons
     or new.feedback_note is distinct from old.feedback_note then
    new.feedback_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists qa_feedback_check on public.qa_records;
create trigger qa_feedback_check
  before update on public.qa_records
  for each row execute function public.check_feedback_reasons();


-- ---------- 3. 待確認清單（小橘答不出來的題目） ----------
create table if not exists public.pending_items (
  id          uuid primary key default gen_random_uuid(),
  qa_id       uuid not null unique references public.qa_records (id) on delete cascade,
  asker_id    uuid not null references public.profiles (id) on delete cascade,
  question    text not null,
  ai_answer   text not null default '',
  sop_nos     text[] not null default '{}',
  chapters    text[] not null default '{}',
  status      text not null default 'open' check (status in ('open', 'done')),
  reply       text not null default '' check (char_length(reply) <= 500),
  replied_by  uuid references public.profiles (id),
  replied_at  timestamptz,
  notified_at timestamptz,                       -- 已寄信通知新人的時間（排程寫入）
  created_at  timestamptz not null default now()
);

create index if not exists pending_status_idx on public.pending_items (status, created_at desc);

alter table public.pending_items enable row level security;

drop policy if exists "pending_select_own_or_senior" on public.pending_items;
create policy "pending_select_own_or_senior" on public.pending_items
  for select to authenticated
  using (asker_id = auth.uid() or public.is_senior());

-- 只有資深能回覆；只開放回覆相關欄位
revoke insert, update, delete on public.pending_items from authenticated, anon;
grant update (status, reply) on public.pending_items to authenticated;

drop policy if exists "pending_update_senior" on public.pending_items;
create policy "pending_update_senior" on public.pending_items
  for update to authenticated
  using (public.is_senior())
  with check (public.is_senior());

-- 回覆者與回覆時間由資料庫自動填，不讓前端偽造
create or replace function public.stamp_pending_reply()
returns trigger
language plpgsql
as $$
begin
  if new.reply is distinct from old.reply or new.status is distinct from old.status then
    if new.status = 'done' and char_length(trim(new.reply)) = 0 then
      raise exception '標記已處理前請先填寫回覆內容';
    end if;
    new.replied_by := auth.uid();
    new.replied_at := now();
    -- 回覆有變動就重新排入「通知新人」（每小時的排程會寄信）
    if new.status = 'done' then
      new.notified_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pending_reply_stamp on public.pending_items;
create trigger pending_reply_stamp
  before update on public.pending_items
  for each row execute function public.stamp_pending_reply();


-- ---------- 4. 寄信紀錄（避免同一天重複寄提醒） ----------
create table if not exists public.notify_log (
  job        text not null,          -- 'senior_daily'
  sent_on    date not null,          -- 台灣日期
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (job, sent_on)
);
alter table public.notify_log enable row level security;  -- 沒有 policy＝只有 service role 能讀寫
revoke all on public.notify_log from authenticated, anon;


-- ---------- 5. 設定資深帳號（在 SQL Editor 手動執行，請改成實際 email） ----------
-- update public.profiles set role = 'senior', display_name = '林佩珊', employee_no = 'HW210501'
--   where id = (select id from auth.users where email = 'senior@example.com');
