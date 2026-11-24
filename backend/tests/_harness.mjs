// 資料庫測試共用工具：用 PGlite 在本機建一個假的 Supabase（auth、角色、RLS 身分切換），套用所有 migration 與指定的種子檔。
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import assert from 'assert/strict';

export const S = '00000000-0000-0000-0000-000000000001'; // 資深 林佩珊
export const N = '00000000-0000-0000-0000-000000000002'; // 新人 陳宥廷（到職 2026-11-02）
export const N2 = '00000000-0000-0000-0000-000000000003'; // 新人 王小美（沒填到職日）

export async function setup(root, pgliteDir, seeds = []) {
  const { PGlite } = await import(pathToFileURL(path.join(pgliteDir, 'dist/index.js')).href);
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text, email_change text,
      email_change_token_new text, recovery_token text);
    create table auth.identities (id uuid primary key, user_id uuid, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create function extensions.crypt(t text, salt text) returns text language sql as $$ select 'hash:' || md5(t || salt) $$;   -- 假的，只模擬簽名
    create function extensions.gen_salt(t text) returns text language sql as $$ select 'salt' $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
  `);
  const mig = path.join(root, 'backend/supabase/migrations');
  for (const f of fs.readdirSync(mig).sort()) await db.exec(fs.readFileSync(path.join(mig, f), 'utf8'));
  // Supabase 預設把 public 的表開給 anon／authenticated，這裡模擬；真正的限制靠各 migration 裡的 revoke 和 RLS
  await db.exec(`grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated;`);
  for (const f of ['exam_papers', 'exam_attempts', 'wrong_items', 'sop_chapters', 'sop_rules', 'sop_versions', 'sop_reads', 'sop_update_seen', 'app_settings',
    'sop_flow', 'sop_source_package', 'sop_flow_sources', 'sop_confirm_items', 'sop_flow_decisions', 'qa_cases', 'qa_logs', 'pending_questions']) {
    try { await db.exec(`revoke insert, update, delete on ${f} from authenticated; revoke all on ${f} from anon;`); } catch (e) { /* 還沒建的表略過 */ }
  }
  await db.exec(`revoke all on question_answers from authenticated;`);
  for (const s of seeds) await db.exec(fs.readFileSync(path.join(root, 'backend/supabase/seed', s), 'utf8'));
  await db.exec(`insert into auth.users values ('${S}'), ('${N}'), ('${N2}');
    insert into employees values ('${S}', '林佩珊', 'lin@x.example', 'HW210501', 'senior', null),
      ('${N}', '陳宥廷', 'chen@x.example', 'HW261102', 'newbie', '2026-11-02'),
      ('${N2}', '王小美', 'wang@x.example', 'HW261103', 'newbie', null);`);
  const as = async (uid, fn, role = 'authenticated') => { await db.exec(`set role ${role}; set request.jwt.uid = '${uid ?? ''}';`); try { return await fn(); } finally { await db.exec('reset role; reset request.jwt.uid;'); } };
  const rpc = async (fn, ...args) => { const ph = args.map((_, i) => `$${i + 1}`).join(', '); return (await db.query(`select ${fn}(${ph}) as r`, args.map(a => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a)))).rows[0].r; };
  const sup = async q => (await db.query(q)).rows;
  const deny = (p, re) => assert.rejects(p, re);
  return { db, as, rpc, sup, deny };
}
