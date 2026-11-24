// 驗證精簡匯入檔與標準 seed.sql 產生的資料列完全一致（僅規則題）。
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const sp = process.argv[2];
const load = async (extra) => {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('./stub.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8'));
  await db.exec(extra);
  return (await db.query("select md5(string_agg(t::text, '|' order by id)) h, count(*)::int n from questions t where source = 'rules'")).rows[0];
};
const std = await load(readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
const cmp = await load(readFileSync(sp + '/rules_seed.sql', 'utf8'));
console.log('標準', JSON.stringify(std), '精簡', JSON.stringify(cmp), std.h === cmp.h && std.n === cmp.n ? '一致' : '不一致');
