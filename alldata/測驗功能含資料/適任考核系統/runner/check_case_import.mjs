// 驗證：tools/out/case_import_*.sql（案例層級展開）產生的 700 題，與構建器的 seed.sql 逐列相同。
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, p), 'utf8');
const outDir = path.join(here, '..', 'tools', 'out');
const WHERE = "source in ('rules_ext', 'legacy')";

async function fresh(...sqls) {
  const db = new PGlite();
  await db.exec(read('stub.sql'));
  await db.exec(read('../supabase/setup.sql'));
  for (const s of sqls) await db.exec(s);
  return db;
}
const rows = async (db) => (await db.query(`select id, md5(t::text) h from questions t where ${WHERE} order by id`)).rows;

try {
  const a = await rows(await fresh(read('../supabase/seed.sql')));
  const files = readdirSync(outDir).filter((f) => /^case_import_\d+\.sql$/.test(f)).sort();
  const b = await rows(await fresh(...files.map((f) => readFileSync(path.join(outDir, f), 'utf8'))));
  const bm = new Map(b.map((r) => [r.id, r.h]));
  let bad = 0;
  for (const r of a) if (bm.get(r.id) !== r.h) { bad++; if (bad <= 5) console.log('DIFF', r.id); }
  console.log(`構建器 ${a.length} 列，案例展開 ${b.length} 列，不同 ${bad} 列`, bad === 0 && a.length === b.length ? '→ 一致' : '→ 不一致');
  process.exit(bad === 0 && a.length === b.length ? 0 : 1);
} catch (e) { console.log('FAIL -', String(e.message).split('\n')[0].slice(0, 300)); process.exit(1); }
