-- 適任考核系統：資料表與觸發器
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'employee' check (role in ('employee', 'supervisor')),
  hire_date date   -- 到職日，由主管設定；用來算試用期與半年考核期限
);

-- 考核分級設定：0 綜合練習、1–9 章節、10 試用期考核、11 半年考核。調整題數／及格分／期限改這裡。
create table assessments (
  stage int primary key check (stage between 0 and 11),
  name text not null,
  kind text not null check (kind in ('chapter', 'comprehensive', 'probation', 'semiannual')),
  total_questions int not null,
  short_max int not null,
  pass_score numeric not null,
  red_min int not null default 0,      -- 至少抽幾題紅線題（只用在綜合類）
  interval_months int                  -- 重複週期（月）；null＝不重複
);
insert into assessments (stage, name, kind, total_questions, short_max, pass_score, red_min, interval_months) values
  (0, '綜合適任考核', 'comprehensive', 30, 4, 80, 0, null),
  (1, '章節考核', 'chapter', 10, 2, 80, 0, null), (2, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (3, '章節考核', 'chapter', 10, 2, 80, 0, null), (4, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (5, '章節考核', 'chapter', 10, 2, 80, 0, null), (6, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (7, '章節考核', 'chapter', 10, 2, 80, 0, null), (8, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (9, '章節考核', 'chapter', 10, 2, 80, 0, null),
  (10, '試用期考核', 'probation', 30, 4, 80, 5, null),
  (11, '半年考核', 'semiannual', 40, 4, 85, 10, 6);

create table questions (
  id text primary key,
  stage int not null check (stage between 1 and 9),
  qtype text not null check (qtype in ('mcq', 'tf', 'short')),
  stem text not null,
  options jsonb,
  correct_index int,
  explanation text not null default '',
  error_type text,
  error_detail text,
  option_errors jsonb,
  reference_answer text,
  rubric jsonb,
  key_error text,
  source text not null default 'rules',
  source_ref text,
  reviewed boolean not null default false,
  red_line boolean not null default false,
  shuffle boolean not null default true   -- false：選項順序固定（舊題的解析引用 A/B/C）
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  stage int not null check (stage between 0 and 11),
  question_ids jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'pending_selfcheck', 'done')),
  score numeric,
  passed boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index attempts_user_idx on attempts (user_id);

create table attempt_answers (
  attempt_id uuid not null references attempts (id) on delete cascade,
  question_id text not null references questions (id),
  choice int,
  text_answer text,
  checked jsonb,
  points numeric,
  is_correct boolean,
  error_type text,
  error_detail text,
  primary key (attempt_id, question_id)
);

create table wrong_book (
  user_id uuid not null references profiles (id) on delete cascade,
  question_id text not null references questions (id),
  wrong_count int not null default 1,
  streak int not null default 0,
  status text not null default 'open' check (status in ('open', 'mastered')),
  note text,
  last_wrong_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- 新的 auth 使用者自動建立 employee profile
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, role)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
          'employee');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();
