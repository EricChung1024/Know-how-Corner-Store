-- 經驗柑仔店｜002 考核：三階段設定、題庫、標準答案
-- 原則：正確答案、解析、參考答案、得分點只放在 question_answers，任何前端角色都讀不到；
--       出題、批改由 Edge Function（service_role）處理。

-- ===== 三階段考核設定（前端從這裡讀，不寫死） =====
create table exam_stages (
  type text primary key check (type in ('m1', 'm3', 'm6')),
  name text not null,
  months int not null check (months > 0),          -- 到職滿幾個月考
  question_count int not null check (question_count > 0),
  short_max int not null check (short_max >= 0),   -- 簡答題最多幾題
  pass_score int not null check (pass_score between 0 and 100),
  level int not null check (level in (1, 2, 3)),   -- 抽題難度
  level_name text not null,
  focus text not null,
  sort int not null
);
insert into exam_stages values
  ('m1', '基礎考核',     1, 20, 0, 80, 1, 'Lv.1 基礎',     '規則、流程、來源辨識',             1),
  ('m3', '情境應用考核', 3, 20, 2, 85, 2, 'Lv.2 情境應用', '資料不足、條件改變、追問、情緒',   2),
  ('m6', '綜合考核',     6, 20, 3, 90, 3, 'Lv.3 綜合',     '跨主題、客訴、補償、交接',         3);

alter table exam_stages enable row level security;
create policy exam_stages_read on exam_stages for select to authenticated using (true);
create policy exam_stages_senior_update on exam_stages for update to authenticated using (is_senior()) with check (is_senior());

-- 考核日：到職日＋N 個曆月；當月沒有同日用月底（Postgres 的 interval 本來就這樣算）；遇週六日順延到週一。國定假日未納入。
create function exam_due_date(p_hire date, p_months int) returns date
language plpgsql immutable set search_path = public as $$
declare d date := (p_hire + make_interval(months => p_months))::date;
begin
  while extract(isodow from d) in (6, 7) loop d := d + 1; end loop;
  return d;
end $$;

-- ===== 題庫（公開欄位） =====
create table question_bank (
  id text primary key,                              -- R-1-1、RL-2-2、QA-Q01、RU-R01、TIP-T01、L-L001、L-M001、L-D001…
  source text not null check (source in ('rules', 'rules_ext', 'legacy', 'ai')),
                                                    -- rules 依 SOP 規則總表出題；rules_ext 案件題、答案改用總表規則；legacy 通用電商題；ai 之後 AI 出的題
  kind text not null,                               -- 規則選擇、規則是非、紅線題、新舊衝突、傳言辨識、客人應對、情境簡答、最佳回覆、多輪追問
  case_id text,                                     -- 案件 C001…（總表規則題沒有）
  topic text,                                       -- 身分核對、退款…；總表規則題用章名
  chapter int check (chapter between 1 and 9),      -- 對應好物集 SOP 的章
  ability text,                                     -- 查核、判斷、回覆、處理、升級、多輪追問
  qtype text not null check (qtype in ('mcq', 'tf', 'short')),   -- 選擇、是非、簡答
  level int not null check (level in (1, 2, 3)),
  stem text not null,
  options jsonb,                                    -- 選擇／是非的選項
  sop text,                                         -- 主要對應的 SOP 條目，例如 2-2
  sop_rules text[] not null default '{}',
  red_line boolean not null default false,          -- 紅線題：答錯就不通過
  shuffle boolean not null default true,            -- 出題時要不要打亂選項（通用選擇題的解析引用 A／B／C，不能打亂）
  status text not null default '待審' check (status in ('待審', '已審', '停用')),
  reviewed_by uuid references employees (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((qtype <> 'short') = (options is not null))
);
create index question_bank_pool_idx on question_bank (level, qtype) where status = '已審';

alter table question_bank enable row level security;
-- 只有資深看得到整個題庫（新人考試時由 Edge Function 只回傳考卷上的題目）
create policy question_bank_senior_read on question_bank for select to authenticated using (is_senior());
create policy question_bank_senior_review on question_bank for update to authenticated using (is_senior()) with check (is_senior());

-- 資深只能改審核狀態，不能改題目內容（內容由匯入工具維護）
create function question_bank_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (new.id, new.source, new.kind, new.case_id, new.topic, new.chapter, new.ability, new.qtype, new.level, new.stem, new.options, new.sop, new.sop_rules, new.red_line, new.shuffle)
       is distinct from
       (old.id, old.source, old.kind, old.case_id, old.topic, old.chapter, old.ability, old.qtype, old.level, old.stem, old.options, old.sop, old.sop_rules, old.red_line, old.shuffle) then
      raise exception 'ONLY_STATUS';
    end if;
    if new.status is distinct from old.status then new.reviewed_by := auth.uid(); new.reviewed_at := now(); end if;
  end if;
  return new;
end $$;
create trigger question_bank_guard before update on question_bank for each row execute function question_bank_guard();

-- ===== 標準答案（任何前端角色都讀不到） =====
create table question_answers (
  qid text primary key references question_bank (id) on delete cascade,
  correct_index int,          -- 選擇／是非：正確選項（0 起算，對應 question_bank.options 的原始順序）
  explanation text,           -- 解析
  reference_answer text,      -- 簡答參考答案
  rubric jsonb,               -- 簡答得分點（字串陣列）
  key_error text,             -- 關鍵失誤
  error_type text,            -- 答錯時的錯誤類型（用了舊規則、違反紅線、被舊資訊誤導…）
  error_detail text,
  option_errors jsonb,        -- 每個選項選錯時的錯誤說明（會透露哪個是對的，所以放這裡）
  check (correct_index is not null or reference_answer is not null)
);
alter table question_answers enable row level security;
-- 刻意不建任何 policy：只有 service_role（Edge Function）讀得到。
revoke all on question_answers from anon, authenticated;

-- 題庫數字（題庫審核頁上方）
create view v_question_bank_stats with (security_invoker = true) as
select count(*) as total,
       count(*) filter (where qtype = 'mcq') as mcq,
       count(*) filter (where qtype = 'tf') as tf,
       count(*) filter (where qtype = 'short') as short,
       count(*) filter (where status = '已審') as approved,
       count(*) filter (where status = '待審') as pending,
       count(*) filter (where status = '停用') as disabled
from question_bank;
