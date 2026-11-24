// 在 data.js 每個「live.js 的 MAP 裡有的」函式開頭加一行轉接。可重複執行。
import fs from 'fs';
const dataJs = process.argv[2], liveJs = process.argv[3];
const names = [...fs.readFileSync(liveJs, 'utf8').matchAll(/^  (\w+):\s+\['/gm)].map(m => m[1]);
let s = fs.readFileSync(dataJs, 'utf8');
if (!s.includes("from './live.js'")) s = s.replace("import { callFn, getSupabase } from './api.js';", "import { callFn, getSupabase } from './api.js';\nimport { isLive, callLive } from './live.js';");
let n = 0;
for (const name of names) {
  const re = new RegExp(`(export async function ${name}\\(([^)]*)\\) \\{\\n)(  if \\(isLive\\('${name}'\\)\\)[^\\n]*\\n)?`);
  const m = s.match(re);
  if (!m) { console.log('找不到函式', name); continue; }
  const args = m[2].split(',').map(x => x.trim().replace(/\s*=.*$/, '')).filter(Boolean);
  s = s.replace(re, `$1  if (isLive('${name}')) return callLive('${name}'${args.length ? ', ' + args.join(', ') : ''});\n`);
  n++;
}
fs.writeFileSync(dataJs, s);
console.log(`已加上轉接：${n} / ${names.length}`);
