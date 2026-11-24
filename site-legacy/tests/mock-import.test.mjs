// 一鍵匯入：整包匯入、自己加檔、換檔後第 2、3 步重做
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import assert from 'assert/strict';
const site = process.argv[2];
const mem = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem(); globalThis.location = {search: ''};
globalThis.fetch = async u => ({ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(site, u), 'utf8'))});
const imp = f => import(pathToFileURL(path.join(site, 'js', f)).href);
const m = await imp('mock.js');
const {setSession} = await imp('guard.js');
setSession(await m.login('lin.peishan@haowu.example', 'HW210501'));

let f = await m.getSopFlow();
assert.equal(f.imported, false);
assert.deepEqual(f.sourcePackage, {title: '統整模擬資料包 v3', count: 9, oldDocs: 6, transcripts: 3});

// 一鍵匯入
const r = await m.importSourcePackage();
assert.equal(r.count, 9);
f = await m.getSopFlow();
assert.equal(f.imported, true); assert.equal(f.sources.length, 9);
assert.equal(f.sources.filter(s => s.kind === '教學逐字稿').length, 3);

// 再加一份自己的檔案 → 10 份；再按一鍵匯入，自己的檔案留著
await m.importSources([{name: '2026_雙12活動規則.docx', lastModified: Date.parse('2026-11-20')}]);
await m.importSourcePackage();
f = await m.getSopFlow();
assert.equal(f.sources.length, 10);
const mine = f.sources.find(s => s.own);
assert.deepEqual([mine.kind, mine.format, mine.date], ['舊檔', 'Word', '2026-11-20']);
await m.importSources(['B1_帶新人_會議轉錄.vtt']);
assert.equal((await m.getSopFlow()).sources.find(s => s.name.startsWith('B1')).kind, '教學逐字稿');
await m.removeSource('B1_帶新人_會議轉錄.vtt');

// 統整、確認一項後換檔 → 第 2、3 步清掉
await m.mockFn('organize-sop', {});
await m.setFlowStep(2);
await m.saveConfirmDecision('c1', '以最新版為準');
await m.removeSource('2026_雙12活動規則.docx');
f = await m.getSopFlow();
assert.equal(f.organized, false); assert.equal(f.confirmedCount, 0);
assert.match(f.resetNote, /重做/);
// 沒換檔就重新匯入 → 不清
await m.mockFn('organize-sop', {});
await m.importSourcePackage();
f = await m.getSopFlow();
assert.equal(f.organized, true); assert.equal(f.resetNote, '');
await assert.rejects(m.importSources([]), /請選擇檔案/);
console.log('一鍵匯入：全部通過');
