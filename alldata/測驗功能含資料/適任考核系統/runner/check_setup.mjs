// 驗證 supabase/setup.sql 能在乾淨資料庫一次套用成功。
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
try {
  await db.exec(readFileSync(new URL('./stub.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8'));
  const r = await db.query("select count(*)::int as n from pg_proc where proname in ('start_exam','submit_exam','submit_selfcheck','list_wrong','set_hire_date')");
  console.log('setup.sql OK，RPC 數量', r.rows[0].n);
} catch (e) { console.log('SETUP FAIL -', String(e.message).split('\n')[0].slice(0, 300)); process.exit(1); }
