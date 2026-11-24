import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
await db.exec(readFileSync(new URL('./stub.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
const r = await db.query("select id, left(md5(t::text), 6) h, t::text txt from questions t where source = 'rules' order by id");
const remote = process.argv[2].split(' ').map((x) => x.split(':'));
const rm = new Map(remote.map(([i, h]) => [i, h]));
let bad = 0;
for (const row of r.rows) if (rm.get(row.id) !== row.h) { bad++; console.log('DIFF', row.id, 'local', row.h, 'remote', rm.get(row.id)); }
console.log('比對', r.rows.length, '列，不同', bad, '列；遠端列數', rm.size);
