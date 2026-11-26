// Edge Function 流程測試：用假的 Gemini 與 Supabase 回應，驗證 ask-xiaoju、embed-knowledge 的判斷、備援與權限。
// 用法：node backend/tests/edge.test.mjs（Node 22.18 以上，直接讀 .ts；不需要網路與金鑰）
import assert from 'assert/strict';
import { pathToFileURL } from 'url';
const F = new URL('../supabase/functions/', import.meta.url).pathname;
let handler; const calls = [];
globalThis.Deno = { serve: h => { handler = h; }, env: { get: k => ({ SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', GEMINI_API_KEY: 'g' })[k] } };
let mode = {};
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const body = init.body ? JSON.parse(init.body) : null; calls.push({ url, body });
  const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-range': '0-0/4' } });
  if (url.includes('/auth/v1/user')) return mode.noUser ? ok({}, 401) : ok({ id: 'u1' });
  if (url.includes('/rest/v1/employees')) return ok(mode.notSenior ? [] : [{ id: 'u1' }]);
  if (url.includes(':embedContent')) return mode.geminiDown ? ok({ error: 'quota' }, 429) : ok({ embedding: { values: Array(768).fill(0.1) } });
  if (url.includes(':batchEmbedContents')) return ok({ embeddings: body.requests.map(() => ({ values: Array(768).fill(0.2) })) });
  if (url.includes('rpc/match_knowledge')) return ok(mode.sim === undefined ? [{ id: 'rule:7-9', kind: 'rule', rule_no: '7-9', case_id: null, title: 't', content: 'c', source_chip: '出處：SOP 7-9 退貨期限', writes_pending: false, similarity: 0.8 }] : [{ id: 'rule:7-9', kind: 'rule', rule_no: '7-9', case_id: null, title: 't', content: 'c', source_chip: 'x', writes_pending: false, similarity: mode.sim }]);
  if (url.includes(':generateContent')) return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(mode.gen || { outcome: '直接回答', reply: '7 天內可以退貨。', sourceIds: ['rule:7-9', 'rule:fake'] }) }] } }] });
  if (url.includes('rpc/record_ask')) return ok({ askId: 'a1', outcome: body.p_outcome, reply: body.p_reply, sourceChip: body.p_chip, ruleNo: body.p_rule_no, writesPending: body.p_pending, pendingId: null });
  if (url.includes('rpc/ask_xiaoju')) return ok({ askId: 'sql', outcome: '不在 SOP 範圍', reply: 'sql', sourceChip: '', ruleNo: null, writesPending: false, pendingId: null });
  if (url.includes('rpc/sync_knowledge')) return ok(4);
  if (url.includes('knowledge_chunks?embedding=is.null')) return ok(Array.from({ length: 120 }, (_, i) => ({ id: 'c' + i, content: 'x' })));
  if (url.includes('rpc/store_embeddings')) return ok(body.p_items.length);
  if (url.includes('knowledge_chunks?select=id')) return ok([]);
  throw new Error('unexpected ' + url);
};
const req = (b, auth = 'Bearer t') => new Request('http://x', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(b) });
const run = async (b, m = {}, auth) => { mode = m; calls.length = 0; const r = await handler(req(b, auth)); return [r.status, await r.json()]; };

await import(pathToFileURL(F + 'ask-xiaoju/index.ts').href);
let [s, j] = await run({ question: '退貨幾天？' });
assert.deepEqual([s, j.engine, j.outcome, j.ruleNo, j.sourceChip], [200, 'gemini', '直接回答', '7-9', '出處：SOP 7-9 退貨期限']);   // 亂編的 rule:fake 被忽略
assert.ok(calls.find(c => c.url.includes('generateContent')).body.contents[0].parts[0].text.includes('退貨幾天？'));
// 完全無關 → 不在 SOP 範圍（沒有出處、沒有延伸）
[s, j] = await run({ question: '今天天氣' }, { sim: 0.1, gen: { outcome: '不在 SOP 範圍', reply: '這題不在OO電商公司 SOP 範圍內。', sourceIds: [], extended: false } });
assert.deepEqual([j.engine, j.outcome, j.sourceChip, j.writesPending], ['gemini', '不在 SOP 範圍', '', false]);
assert.ok(calls.find(c => c.url.includes('generateContent')).body.contents[0].parts[0].text.includes('沒有找到相關'));   // 低相似度的片段不給模型
// 客服相關但 SOP 沒有 → 延伸回答，標示非 SOP 內容，不寫待確認、不帶條號
[s, j] = await run({ question: '客人一直罵很難聽怎麼安撫？' }, { sim: 0.1, gen: { outcome: '不在 SOP 範圍', reply: 'SOP 裡沒有寫這題。一般做法：先道歉…', sourceIds: ['rule:7-9'], extended: true } });
assert.deepEqual([j.outcome, j.sourceChip, j.ruleNo, j.writesPending], ['不在 SOP 範圍', '非 SOP 內容，僅供參考', null, false]);
// 沒引用任何片段卻宣稱「直接回答」→ 不採信
[s, j] = await run({ question: 'q' }, { gen: { outcome: '直接回答', reply: '亂答', sourceIds: [], extended: false } });
assert.deepEqual([j.outcome, j.reply], ['不在 SOP 範圍', '這題不在OO電商公司 SOP 範圍內。']);
[s, j] = await run({ question: 'q' }, { gen: { outcome: '新舊版都不符 → 請問資深', reply: '已記錄', sourceIds: [], extended: false } });
assert.equal(calls.find(c => c.url.includes('record_ask')).body.p_pending, true);
[s, j] = await run({ question: 'q' }, { gen: { outcome: '亂寫', reply: 'x', sourceIds: [] } });   // 模型亂回 → 備援
assert.equal(j.engine, 'sql');
[s, j] = await run({ question: 'q' }, { geminiDown: true }); assert.deepEqual([s, j.engine, j.reply], [200, 'sql', 'sql']);
assert.equal((await run({ question: '   ' }))[0], 400);
assert.equal((await run({ question: 'x'.repeat(501) }))[0], 400);
assert.equal((await run({ question: 'q' }, {}, null))[0], 401);
assert.equal((await run({ question: 'q' }, { noUser: true }))[0], 401);

await import(pathToFileURL(F + 'embed-knowledge/index.ts').href);
[s, j] = await run({}, { notSenior: true }); assert.equal(s, 403);
[s, j] = await run({}); assert.deepEqual([s, j.ok, j.embeddedNow], [200, true, 120]);
assert.equal(calls.filter(c => c.url.includes('batchEmbedContents')).length, 3);   // 120 筆分 3 批（50/50/20）
assert.equal(calls.filter(c => c.url.includes('batchEmbedContents'))[0].body.requests[0].outputDimensionality, 768);
console.log('edge functions mock 測試通過');
