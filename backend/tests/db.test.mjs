// 用 PGlite 跑 backend 的 migration＋題庫種子，檢查題數、重複匯入、RLS、答案保護
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import assert from 'assert/strict';
const [, , root, pgliteDir] = process.argv;
const { PGlite } = await import(pathToFileURL(path.join(pgliteDir, 'dist/index.js')).href);
const db = new PGlite();
// Supabase 的 auth 替身
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`);
const mig = path.join(root, 'backend/supabase/migrations');
for (const f of fs.readdirSync(mig).sort()) await db.exec(fs.readFileSync(path.join(mig, f), 'utf8'));
await db.exec(`grant usage on schema public to authenticated; grant select, update on all tables in schema public to authenticated;
  revoke all on question_answers from authenticated;`);  // Supabase 預設會 grant，這裡模擬後再 revoke
const seed = fs.readFileSync(path.join(root, 'backend/supabase/seed/question_bank.sql'), 'utf8');
await db.exec(seed);
const one = async (q, p) => (await db.query(q, p)).rows[0];

let st = await one('select * from v_question_bank_stats');
assert.deepEqual([+st.total, +st.mcq, +st.tf, +st.short, +st.approved, +st.pending], [785, 169, 16, 600, 85, 700]);
assert.equal(+(await one('select count(*) c from question_answers')).c, 785);
assert.equal(+(await one('select count(*) c from question_bank where level in (1,2,3)')).c, 785);
assert.equal(+(await one('select count(*) c from question_bank where red_line')).c > 0, true);
assert.equal((await one(`select exam_due_date('2026-01-31', 1) d`)).d.toISOString().slice(0, 10), '2026-03-02');
assert.equal((await one(`select exam_due_date('2026-11-02', 6) d`)).d.toISOString().slice(0, 10), '2027-05-03');

// 帳號
const S = '00000000-0000-0000-0000-000000000001', N = '00000000-0000-0000-0000-000000000002';
await db.exec(`insert into auth.users values ('${S}'), ('${N}');
  insert into employees values ('${S}', '林佩珊', 'lin.peishan@haowu.example', 'HW210501', 'senior', null),
                               ('${N}', '陳宥廷', 'chen.yuting@haowu.example', 'HW261102', 'newbie', '2026-11-02');`);
const as = async (uid, fn) => { await db.exec(`set role authenticated; set request.jwt.uid = '${uid}';`); try { return await fn(); } finally { await db.exec('reset role; reset request.jwt.uid;'); } };

// 資深：看得到題庫、可以審核；改題目內容會被擋
await as(S, async () => {
  assert.equal(+(await one('select count(*) c from question_bank')).c, 785);
  await db.exec(`update question_bank set status = '已審' where level = 1 and qtype = 'mcq' and status = '待審'`);
  await assert.rejects(db.exec(`update question_bank set stem = 'x' where id = 'L-M001'`), /ONLY_STATUS/);
  await assert.rejects(db.query('select * from question_answers limit 1'), /permission denied/);
});
const r = await one(`select status, reviewed_by from question_bank where id = (select id from question_bank where level = 1 and qtype = 'mcq' and reviewed_by is not null limit 1)`);
assert.equal(r.status, '已審'); assert.equal(r.reviewed_by, S);

// 新人：題庫、答案都讀不到
await as(N, async () => {
  assert.equal(+(await one('select count(*) c from question_bank')).c, 0);
  await assert.rejects(db.query('select * from question_answers limit 1'), /permission denied/);
  assert.equal(+(await one('select count(*) c from exam_stages')).c, 3);
});

// 重新匯入：內容更新、審核狀態保留
await db.exec(seed);
st = await one('select * from v_question_bank_stats');
assert.ok(+st.approved > 85);
console.log('資料庫測試全部通過：785 題（選擇 169、是非 16、簡答 600）、每題 Lv.1–3、答案 785 筆、重複匯入保留審核、RLS（資深可審、新人讀不到、答案都讀不到）、只能改狀態、考核日');
