// Edge Function 流程測試：用假的 Gemini 與 Supabase 回應，驗證 ask-xiaoju、embed-knowledge 的判斷、備援與權限。
// 用法：node backend/tests/edge.test.mjs（Node 22.18 以上，直接讀 .ts；不需要網路與金鑰）
import assert from 'assert/strict';
import { pathToFileURL } from 'url';
const F = new URL('../supabase/functions/', import.meta.url).pathname;
let handler; const calls = [];
globalThis.Deno = { serve: h => { handler = h; }, env: { get: k => ({ ...(globalThis.__extraEnv || {}), SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', GEMINI_API_KEY: 'g', GEMINI_API_KEY_2: 'g2' })[k] } };
let mode = {}; const gen_calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('generativelanguage') && mode.deadKeys && mode.deadKeys.includes((init.headers || {})['x-goog-api-key'])) return new Response(JSON.stringify({ error: { code: mode.deadStatus || 429 } }), { status: mode.deadStatus || 429 });
  const body = init.body ? JSON.parse(init.body) : null; calls.push({ url, body, init });
  const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-range': '0-0/4' } });
  if (url.includes('/v1beta/models?')) { gen_calls.push('LIST'); return ok({ models: ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.8-flash-lite-preview', 'gemini-2.5-flash-lite', 'gemini-3.8-pro', 'gemini-3.8-flash-image'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })).concat([{ name: 'models/gemini-3.9-flash-lite', supportedGenerationMethods: ['embedContent'] }]) }); }
  if (url.includes('/auth/v1/user')) return mode.noUser ? ok({}, 401) : ok({ id: 'u1' });
  if (url.includes('/rest/v1/employees')) return ok(mode.notSenior ? [] : [{ id: 'u1' }]);
  if (url.includes(':embedContent')) return mode.geminiDown ? ok({ error: 'quota' }, 429) : ok({ embedding: { values: Array(768).fill(0.1) } });
  if (url.includes(':batchEmbedContents')) return ok({ embeddings: body.requests.map(() => ({ values: Array(768).fill(0.2) })) });
  if (url.includes('rpc/match_knowledge') && mode.twoChunks) return ok([{ id: 'rule:7-1', kind: 'rule', rule_no: '7-1', case_id: null, title: 't', content: 'SOP 7-1\n規則：七天\n（這是紅線規則，不能違反）', source_chip: '出處：SOP 7-1', writes_pending: false, similarity: 0.8 }, { id: 'rule:2-4', kind: 'rule', rule_no: '2-4', case_id: null, title: 't', content: 'SOP 2-4\n規則：一定附時間', source_chip: '出處：SOP 2-4', writes_pending: false, similarity: 0.7 }]);
  if (url.includes('rpc/match_knowledge')) return ok(mode.sim === undefined ? [{ id: 'rule:7-9', kind: 'rule', rule_no: '7-9', case_id: null, title: 't', content: 'c', source_chip: '出處：SOP 7-9 退貨期限', writes_pending: false, similarity: 0.8 }] : [{ id: 'rule:7-9', kind: 'rule', rule_no: '7-9', case_id: null, title: 't', content: mode.content || 'c', source_chip: 'x', writes_pending: false, similarity: mode.sim }]);
  if (url.includes(':generateContent') && mode.timeoutModels && mode.timeoutModels.some(m => url.includes('/' + m + ':'))) { gen_calls.push('TIMEOUT:' + url); throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }
  if (url.includes(':generateContent') && mode.overloadModels && mode.overloadModels.some(m => url.includes('/' + m + ':'))) { gen_calls.push('503:' + url); return ok({ error: { code: 503, status: 'UNAVAILABLE' } }, 503); }
  if (url.includes(':generateContent') && mode.flaky429 && (mode.flaky429.n = (mode.flaky429.n ?? 0) + 1) <= mode.flaky429.times) return ok({ error: { code: 429 } }, 429);
  if (url.includes(':generateContent') && mode.badJsonOnce && (mode.badJsonOnce.n = (mode.badJsonOnce.n ?? 0) + 1) === 1) return new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"outcome": "直接回' }] } }] }), { status: 200 });
  if (url.includes(':generateContent')) { if (mode.deadModels && mode.deadModels.some(m => url.includes('/' + m + ':'))) return ok({ error: { code: 404, message: 'no longer available' } }, 404); gen_calls.push(url); }
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
// 模型自動挑：最便宜的 flash-lite、最新版優先；排除 preview／image／不支援 generateContent 的；清單只查一次
assert.ok(gen_calls.filter(x => x === 'LIST').length <= 1);
gen_calls.length = 0;
[s, j] = await run({ question: '退貨幾天？' });
assert.ok(gen_calls.find(u => u !== 'LIST').includes('/gemini-3.8-flash-lite:generateContent'), gen_calls.join());
// 最便宜的那個 404 → 換下一個（flash-lite 舊版）→ 再 404 → 一般 flash
gen_calls.length = 0;
[s, j] = await run({ question: '退貨幾天？' }, { deadModels: ['gemini-3.8-flash-lite', 'gemini-2.5-flash-lite'] });
assert.deepEqual([j.engine, j.outcome], ['gemini', '直接回答']); assert.ok(gen_calls.at(-1).includes('/gemini-3.8-flash:generateContent'), gen_calls.join());
[s, j] = await run({ question: '退貨幾天？' }, { deadModels: ['gemini-3.8-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'] });   // 全部不可用 → 備援 SQL
assert.equal(j.engine, 'sql');
// 模型把編號連【】一起寫出來也要認得
[s, j] = await run({ question: '退貨幾天？' }, { gen: { outcome: '直接回答', reply: '7 天。', sourceIds: ['【rule:7-9】'], extended: false } });
assert.deepEqual([j.outcome, j.ruleNo], ['直接回答', '7-9']);
// debug：新人拿不到、資深拿得到
[s, j] = await run({ question: '退貨幾天？', debug: true }, { notSenior: true }); assert.equal(j.debug, undefined);
[s, j] = await run({ question: '退貨幾天？', debug: true }); assert.deepEqual([j.debug.retrieved[0].id, j.debug.modelOutcome], ['rule:7-9', '直接回答']);
// 暫時性錯誤（429）重試後成功，仍是 Gemini 版；一直 429 才退回備援
[s, j] = await run({ question: '退貨幾天？' }, { flaky429: { times: 2 } }); assert.deepEqual([j.engine, j.outcome], ['gemini', '直接回答']);
[s, j] = await run({ question: '退貨幾天？' }, { flaky429: { times: 99 } }); assert.equal(j.engine, 'sql');
// 模型回壞掉的 JSON → 重來一次
[s, j] = await run({ question: '退貨幾天？' }, { badJsonOnce: {} }); assert.deepEqual([j.engine, j.outcome], ['gemini', '直接回答']);
// 紅線標記：標題標「｜紅線規則」；引用非紅線規則時，含「紅線」的句子會被拿掉；引用紅線規則則保留
[s, j] = await run({ question: '保證明天到貨？' }, { twoChunks: true, gen: { outcome: '直接回答', reply: '這是紅線，不能做。依 SOP 2-4，要給明確回覆時間。', sourceIds: ['rule:2-4'], extended: false } });
assert.equal(j.reply, '依 SOP 2-4，要給明確回覆時間。');
const ctx = calls.find(c => c.url.includes('generateContent')).body.contents[0].parts[0].text;
assert.ok(ctx.includes('【rule:7-1｜紅線規則】') && ctx.includes('【rule:2-4】'));
[s, j] = await run({ question: '鑑賞期？' }, { twoChunks: true, gen: { outcome: '直接回答', reply: '這是紅線，不能違反。7 天內可退。', sourceIds: ['rule:7-1'], extended: false } });
assert.equal(j.reply, '這是紅線，不能違反。7 天內可退。');
// 說「有答案」卻沒給來源 → 重問一次；第二次補上來源就採用；仍沒有才改成不在範圍
let n = 0; const savedFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { if (String(url).includes(':generateContent') && !mode.deadModels) { n++; mode.gen = n === 1 ? { outcome: '直接回答', reply: '7 天。', sourceIds: [], extended: false } : { outcome: '直接回答', reply: '7 天。', sourceIds: ['rule:7-9'], extended: false }; } return savedFetch(url, init); };
[s, j] = await run({ question: '退貨幾天？' }); assert.deepEqual([j.outcome, j.ruleNo, n], ['直接回答', '7-9', 2]);
const genCalls = calls.filter(c => c.url.includes(':generateContent'));
assert.ok(!genCalls[0].body.contents[0].parts[0].text.includes('提醒') && genCalls[1].body.contents[0].parts[0].text.includes('sourceIds 一定要填入'));   // 第二次才加提醒
globalThis.fetch = savedFetch;
[s, j] = await run({ question: 'q', debug: true }); assert.ok(j.debug.build);
assert.equal(calls.find(c => c.url.includes('record_ask')).body.p_engine, 'gemini');
// 第二把金鑰備援：主金鑰額度用完（429）／被停用（403）→ 改用 GEMINI_API_KEY_2，仍是 Gemini 版；兩把都壞才退回 SQL
[s, j] = await run({ question: '退貨幾天？', debug: true }, { deadKeys: ['g'] });
assert.deepEqual([j.engine, j.outcome, j.debug.keyNo, j.debug.keyCount], ['gemini', '直接回答', 2, 2]);
const usedKeys = calls.filter(c => c.url.includes('generativelanguage')).map(c => c.init?.headers?.['x-goog-api-key']);
[s, j] = await run({ question: '退貨幾天？' }, { deadKeys: ['g'], deadStatus: 403 }); assert.equal(j.engine, 'gemini');
[s, j] = await run({ question: '退貨幾天？' }, { deadKeys: ['g', 'g2'] }); assert.equal(j.engine, 'sql');
[s, j] = await run({ question: '退貨幾天？' }, { deadKeys: [] });   // 恢復正常（沿用上次成功的那把）
assert.equal(j.engine, 'gemini');
// GEMINI_MODEL 填成顯示名稱（Gemini 3.8 Flash）也能用：轉成代碼；名稱完全錯誤（400/404）則換下一個模型
globalThis.__extraEnv = { GEMINI_MODEL: 'Gemini 3.8 Flash' };
gen_calls.length = 0; [s, j] = await run({ question: '退貨幾天？' }); assert.equal(j.engine, 'gemini');
assert.ok(gen_calls.find(u => u !== 'LIST').includes('/gemini-3.8-flash:generateContent'), gen_calls.join());
globalThis.__extraEnv = {};
// 逾時：指定的模型卡住 → 換下一個模型，仍是 Gemini 版；退回備援時資深看得到原因，新人看不到
globalThis.__extraEnv = { GEMINI_MODEL: 'gemini-3.8-flash' };
[s, j] = await run({ question: '退貨幾天？', debug: true }, { timeoutModels: ['gemini-3.8-flash'] });
assert.deepEqual([j.engine, j.outcome], ['gemini', '直接回答']); assert.ok(gen_calls.some(u => String(u).startsWith('TIMEOUT:')) && gen_calls.at(-1).includes('flash-lite'), gen_calls.join());
globalThis.__extraEnv = {};
[s, j] = await run({ question: '退貨幾天？', debug: true }, { geminiDown: true }); assert.ok(j.engine === 'sql' && /Gemini|429|quota/.test(j.debug.fallbackReason), JSON.stringify(j.debug));
[s, j] = await run({ question: '退貨幾天？', debug: true }, { geminiDown: true, notSenior: true }); assert.equal(j.debug, undefined);
// 503「需求很高」：有兩把金鑰也要重試一次，之後換下一個模型（較快的 flash-lite），仍是 Gemini 版
globalThis.__extraEnv = { GEMINI_MODEL: 'gemini-3.8-flash' };
gen_calls.length = 0; [s, j] = await run({ question: '退貨幾天？', debug: true }, { overloadModels: ['gemini-3.8-flash'] });
assert.deepEqual([j.engine, j.outcome], ['gemini', '直接回答']);
assert.equal(gen_calls.filter(u => String(u).startsWith('503:')).length, 2, gen_calls.join());   // 同一個模型試 2 次才放棄
assert.ok(gen_calls.at(-1).includes('flash-lite'), gen_calls.join());
globalThis.__extraEnv = {};
// 全部模型都 503 → 退回備援，原因寫明是哪一把金鑰
[s, j] = await run({ question: '退貨幾天？', debug: true }, { overloadModels: ['gemini-3.8-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'] });
assert.ok(j.engine === 'sql' && /第 \d 把金鑰/.test(j.debug.fallbackReason), JSON.stringify(j.debug));
// 完全無關 → 不在 SOP 範圍（沒有出處、沒有延伸）
[s, j] = await run({ question: '今天天氣' }, { sim: 0.1, gen: { outcome: '不在 SOP 範圍', reply: '這題不在OO電商公司 SOP 範圍內。', sourceIds: [], extended: false } });
assert.deepEqual([j.engine, j.outcome, j.sourceChip, j.writesPending], ['gemini', '不在 SOP 範圍', '', false]);
assert.ok(calls.find(c => c.url.includes('generateContent')).body.contents[0].parts[0].text.includes('沒有找到相關'));   // 低相似度的片段不給模型
// 紅線規則相似度 0.3（低於一般門檻 0.35）仍要交給 Gemini；一般規則 0.3 則不給
[s, j] = await run({ question: '客人要我私下退款可以嗎' }, { sim: 0.3, content: 'SOP 7-1 私下退款\n規則：不可以私下退款。\n（這是紅線規則，不能違反）', gen: { outcome: '直接回答', reply: '這是紅線，不能私下退款。', sourceIds: ['rule:7-9'], extended: false } });
assert.ok(calls.find(c => c.url.includes('generateContent')).body.contents[0].parts[0].text.includes('不可以私下退款'));
assert.equal(j.outcome, '直接回答');
[s, j] = await run({ question: 'q' }, { sim: 0.3, gen: { outcome: '不在 SOP 範圍', reply: 'x', sourceIds: [], extended: false } });
assert.ok(calls.find(c => c.url.includes('generateContent')).body.contents[0].parts[0].text.includes('沒有找到相關'));
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
