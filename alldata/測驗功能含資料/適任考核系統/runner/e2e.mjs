// 端對端：本機模擬後端＋真實 Chrome。用法：node e2e.mjs [情境檔名片段]
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { startServer } from './dev_server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(path.join(here, 'shots'), { recursive: true });
const srv = await startServer();
const base = 'http://localhost:' + srv.port;
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failed = 0;
const files = readdirSync(path.join(here, 'e2e')).filter((f) => /^e\d+_.*\.mjs$/.test(f) && f.includes(filter)).sort();
if (!files.length) { console.log('沒有符合的情境：' + filter); process.exit(1); }
for (const f of files) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  const sql = async (s) => { const j = await (await fetch(base + '/__sql', { method: 'POST', body: JSON.stringify({ sql: s }) })).json(); if (j.error) throw new Error('SQL 失敗：' + j.error + ' ← ' + s.slice(0, 80)); return j.data; };
  try {
    const mod = await import(pathToFileURL(path.join(here, 'e2e', f)).href);
    await mod.default({ page, base, sql, ctx, browser, shot: (n) => page.screenshot({ path: path.join(here, 'shots', n + '.png'), fullPage: true }) });
    if (errors.length) throw new Error('頁面錯誤：' + errors.join(' | '));
    console.log('PASS', f);
  } catch (e) { failed++; console.log('FAIL', f, '-', String(e.message).split('\n').join(' ').slice(0, 500)); }
  await ctx.close();
}
await browser.close();
await srv.close();
console.log(failed ? failed + ' e2e failed' : 'E2E ALL PASSED');
process.exit(failed ? 1 : 0);
