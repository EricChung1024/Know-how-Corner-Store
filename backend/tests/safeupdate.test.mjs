// Supabase 開了 pg_safeupdate：沒有 WHERE 的 DELETE／UPDATE 會報錯（"DELETE requires a WHERE clause"），本機的 PGlite 不會。
// 這個測試掃過所有 migration，找出沒有 WHERE 的 delete／update。用法：node backend/tests/safeupdate.test.mjs <專案根目錄>
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';
const root = process.argv[2];
const dir = path.join(root, 'backend/supabase/migrations');
const bad = [];
for (const f of fs.readdirSync(dir).sort()) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, '');
  // delete from X ... ;
  for (const m of sql.matchAll(/\bdelete\s+from\s+[\w.]+([^;]*);/gi)) if (!/\bwhere\b/i.test(m[1])) bad.push(`${f}: delete from${m[0].slice(11, 60)}`);
  // update X set ... ;（排除 on conflict do update set）
  for (const m of sql.matchAll(/(?<!do\s)\bupdate\s+([\w.]+)\s+(?:\w+\s+)?set\b([^;]*);/gi)) {
    if (/\bon\s+conflict\b/i.test(sql.slice(Math.max(0, m.index - 400), m.index)) && /\bdo\s*$/i.test(sql.slice(Math.max(0, m.index - 6), m.index))) continue;
    if (!/\bwhere\b/i.test(m[2])) bad.push(`${f}: update ${m[1]} set${m[2].slice(0, 50)}`);
  }
}
assert.deepEqual(bad, [], '這些 delete／update 沒有 WHERE，在 Supabase 上會報錯：\n' + bad.join('\n'));
console.log('safeupdate 檢查通過：所有 migration 的 delete／update 都有 WHERE');
