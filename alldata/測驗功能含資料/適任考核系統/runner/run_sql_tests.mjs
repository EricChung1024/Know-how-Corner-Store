// 用法：node run_sql_tests.mjs [測試檔名片段]
// 先套用 stub.sql 與 ../supabase/NNN_*.sql，再逐一執行 ../supabase/tests/t_*.sql。
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sup = path.join(here, '..', 'supabase');
const filter = process.argv[2] || '';
const short = (e) => String(e.message || e).split('\n')[0].slice(0, 300);

const db = new PGlite();
try { await db.exec(readFileSync(path.join(here, 'stub.sql'), 'utf8')); } catch (e) { console.log('STUB FAIL -', short(e)); process.exit(1); }
for (const f of readdirSync(sup).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()) {
  try { await db.exec(readFileSync(path.join(sup, f), 'utf8')); console.log('APPLIED', f); }
  catch (e) { console.log('MIGRATION FAIL', f, '-', short(e)); process.exit(1); }
}
let failed = 0;
const tdir = path.join(sup, 'tests');
for (const f of readdirSync(tdir).filter((f) => /^t_.*\.sql$/.test(f) && f.includes(filter)).sort()) {
  try { await db.exec(readFileSync(path.join(tdir, f), 'utf8')); console.log('PASS', f); }
  catch (e) {
    failed++; console.log('FAIL', f, '-', short(e));
    try { await db.exec('rollback; reset role;'); } catch {}
  }
}
console.log(failed ? `${failed} test file(s) failed` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
