import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url'; import assert from 'assert/strict';
const site = process.argv[2];
const mem = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem(); globalThis.location = {search: ''};
globalThis.fetch = async u => ({ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(site, u), 'utf8'))});
const m = await import(pathToFileURL(path.join(site, 'js/mock.js')).href);
const {setSession} = await import(pathToFileURL(path.join(site, 'js/guard.js')).href);
setSession(await m.login('lin.peishan@haowu.example', 'HW210501'));
await m.setBankStatusBulk({status: '待審'}, '已審');
for (const [t, shortMax, lv] of [['m1', 0, 1], ['m3', 2, 2], ['m6', 3, 3]]) {
  const p = await m.mockFn('generate-paper', {employeeId: 'HW261102', type: t});
  const paper = await m.getPaper(p.id), sh = paper.questions.filter(q => q.qtype === 'short').length;
  const byLv = {}; for (const q of paper.questions) byLv[q.level ?? '?'] = (byLv[q.level ?? '?'] || 0) + 1;
  console.log(t, '題數', paper.questions.length, '簡答', sh, 'shortage', p.shortage);
  assert.equal(paper.questions.length, 20); assert.ok(sh <= shortMax);
}
console.log('三階段都抽得滿 20 題');
