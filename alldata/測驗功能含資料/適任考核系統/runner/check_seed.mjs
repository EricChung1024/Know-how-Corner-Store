// 把 supabase/seed.sql 載入本機 Postgres，檢查限制與各階段題數。
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const sup = path.join(here, '..', 'supabase');
const db = new PGlite();
try {
  await db.exec(readFileSync(path.join(here, 'stub.sql'), 'utf8'));
  for (const f of readdirSync(sup).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()) await db.exec(readFileSync(path.join(sup, f), 'utf8'));
  await db.exec(readFileSync(path.join(sup, 'seed.sql'), 'utf8'));
  const r = await db.query(`select stage, count(*) filter (where qtype<>'short')::int choice, count(*) filter (where qtype='short')::int short, count(*) filter (where reviewed)::int reviewed from questions group by 1 order by 1`);
  console.table(r.rows);
  console.log('total', (await db.query('select count(*)::int c from questions')).rows[0].c);
} catch (e) { console.log('SEED FAIL -', String(e.message).split('\n')[0].slice(0, 300)); process.exit(1); }
