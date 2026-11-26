// 問小橘 RAG 測試（migration 012）：知識片段同步、向量搜尋、紀錄函式、權限。需要有 pgvector 的 PGlite（0.3.x）。
// 用法：node backend/tests/rag.test.mjs <專案根目錄> <pglite 資料夾>
// 向量用假的（前 3 維有值、其餘 0），只驗證資料庫這一側；Gemini 與 Edge Function 要用真實連線測。
import assert from 'assert/strict';
import { setup, S, N } from './_harness.mjs';
const [, , root, pgliteDir] = process.argv;
const { db, as, rpc, sup, deny } = await setup(root, pgliteDir, []);

// 最小的 SOP 與案例資料（種子檔在本機、不進 git，這裡自己造）
await db.exec(`
  insert into sop_chapters values (7, '退換貨', '退換貨規則');
  insert into sop_rules (no, chapter, topic, rule, red_line, status, basis) values
    ('7-9', 7, '退貨期限', '商品到貨 7 天內可以退貨。', false, '現行', '消保法'),
    ('7-1', 7, '紅線測試', '不可以私下退款。', true, '現行', null),
    ('7-2', 7, '舊規', '以前 14 天可退。', false, '已失效', null);
  insert into qa_cases (id, newbie_asks, check_latest, check_history, outcome, ai_should_reply, source_chip, writes_pending, rule_no) values
    ('Q01', '客人說 14 天可以退嗎', 'SOP 7-9', '舊版 14 天', '已確認的變更', '現在是 7 天，以最新版為準。', '出處：SOP 7-9 退貨期限', false, '7-9'),
    ('Q02', '客人要 3 天內到貨', null, null, '新舊版都不符 → 請問資深', '查不到，請問資深。', '', true, null);
`);

const vec = (a, b, c) => `[${[a, b, c, ...Array(765).fill(0)].join(',')}]`;
const arr = (a, b, c) => [a, b, c, ...Array(765).fill(0)];

// 1. 同步：現行規則 2 條 + 案例 2 個；已失效的規則不進知識庫
assert.equal(await rpc('sync_knowledge'), 4);
assert.deepEqual((await sup('select id from knowledge_chunks order by id')).map(r => r.id), ['case:Q01', 'case:Q02', 'rule:7-1', 'rule:7-9']);
const r79 = (await sup(`select content, source_chip from knowledge_chunks where id = 'rule:7-9'`))[0];
assert.ok(r79.content.includes('7 天內可以退貨') && r79.content.includes('依據：消保法') && r79.source_chip === '出處：SOP 7-9 退貨期限');
assert.ok((await sup(`select content from knowledge_chunks where id = 'rule:7-1'`))[0].content.includes('紅線'));

// 2. 寫入向量；維度不對會擋
assert.equal(await rpc('store_embeddings', [{ id: 'rule:7-9', embedding: arr(1, 0, 0) }, { id: 'rule:7-1', embedding: arr(0, 1, 0) }, { id: 'case:Q01', embedding: arr(0.9, 0.1, 0) }, { id: 'case:Q02', embedding: arr(0, 0, 1) }]), 4);
await deny(rpc('store_embeddings', [{ id: 'rule:7-9', embedding: [1, 2, 3] }]), /768/);
assert.equal(await rpc('sync_knowledge'), 0);   // 沒變動 → 向量保留

// 3. 搜尋：最像的排前面，相似度合理
let m = (await db.query(`select * from match_knowledge($1, 3)`, [vec(1, 0, 0)])).rows;
assert.equal(m[0].id, 'rule:7-9'); assert.equal(m[1].id, 'case:Q01'); assert.ok(m[0].similarity > 0.999 && m[1].similarity > 0.9 && m[2].similarity < 0.1);
assert.equal((await db.query(`select * from match_knowledge($1, 100)`, [vec(1, 0, 0)])).rows.length, 4);   // 上限 20、實際只有 4

// 4. 規則改了 → 該片段清掉向量（其他不動）；規則失效 → 片段刪除
await db.exec(`update sop_rules set rule = '商品到貨 10 天內可以退貨。' where no = '7-9'`);
assert.equal(await rpc('sync_knowledge'), 1);
assert.equal((await sup(`select embedding is null n from knowledge_chunks where id = 'rule:7-9'`))[0].n, true);
await db.exec(`update sop_rules set status = '已失效' where no = '7-1'`);
await rpc('sync_knowledge');
assert.equal((await sup(`select count(*) c from knowledge_chunks where id = 'rule:7-1'`))[0].c, 0);

// 5. record_ask：直接回答、案例（含待確認）、不在範圍、錯誤輸入
const a1 = await rpc('record_ask', N, '退貨幾天內？', '直接回答', '10 天內。', '出處：SOP 7-9 退貨期限', '7-9', null, false);
assert.deepEqual([a1.outcome, a1.ruleNo, a1.writesPending, a1.pendingId], ['直接回答', '7-9', false, null]);
const a2 = await rpc('record_ask', N, '3 天內到貨？', '新舊版都不符 → 請問資深', '已記到待確認清單。', '', null, 'Q02', false);
assert.equal(a2.writesPending, true); assert.ok(a2.pendingId);   // 新舊版都不符一定寫待確認
const a2b = await rpc('record_ask', N, '3 天內到貨？', '新舊版都不符 → 請問資深', '已記到待確認清單。', '', null, 'Q02', false);
assert.equal(a2b.pendingId, a2.pendingId);   // 同一題待處理中不重複開
const a3 = await rpc('record_ask', N, '今天天氣？', '不在 SOP 範圍', '這題不在 SOP 範圍內。', '', '99-99', 'Q99', false);
assert.deepEqual([a3.ruleNo, a3.writesPending], [null, false]);   // 亂編的條號、案例編號被丟掉
assert.equal((await sup(`select case_id from qa_logs where id = '${a3.askId}'`))[0].case_id, null);
const a4 = await rpc('record_ask', N, '案例要寫待確認', '已確認的變更', '7 天。', '', null, 'Q01', true);
assert.equal(a4.writesPending, true);
await deny(rpc('record_ask', N, '亂來', '隨便', '回答', '', null, null, false), /不認得的判斷結果/);
await deny(rpc('record_ask', N, '  ', '直接回答', '回答', '', null, null, false), /請輸入問題/);
await deny(rpc('record_ask', N, '問題', '直接回答', ' ', '', null, null, false), /回答是空的/);
await deny(rpc('record_ask', '00000000-0000-0000-0000-0000000000ff', '問題', '直接回答', '回答', '', null, null, false), /找不到這位員工/);
// 紀錄真的進了新人自己的列表
await as(N, async () => {
  assert.equal((await rpc('list_my_asks')).length, 5);
  assert.ok((await rpc('list_my_asks')).every(x => x.engine === 'gemini'));   // record_ask 預設 gemini
  assert.equal(a1.engine, 'gemini');
  // 備援的 ask_xiaoju 寫的紀錄標示 sql；明確指定 engine 也行；亂填會擋
  const sqlAsk = await rpc('ask_xiaoju', '客人說 14 天可以退嗎');
  assert.equal((await rpc('get_ask', sqlAsk.askId)).engine, 'sql');
});
const a5 = await rpc('record_ask', N, '指定來源', '直接回答', '回答', '', null, null, false, 'sql');
assert.equal(a5.engine, 'sql');
await deny(rpc('record_ask', N, '亂填來源', '直接回答', '回答', '', null, null, false, 'gpt'), /不認得的回答來源/);

// 6. 權限：新人、資深、匿名都不能碰這些函式與資料表；service_role 可以
const fns = ['sync_knowledge()', `store_embeddings('[]')`, `match_knowledge('${vec(1, 0, 0)}', 1)`, `record_ask('${N}', 'q', '直接回答', 'r', '', null, null, false)`, `record_ask('${N}', 'q', '直接回答', 'r', '', null, null, false, 'gemini')`];
for (const [uid, role] of [[N, 'authenticated'], [S, 'authenticated'], [null, 'anon']]) {
  for (const f of fns) await as(uid, () => deny(db.query(`select ${f}`), /permission denied/), role);
  for (const f of fns) await as(uid, () => deny(db.query(`select ${f}`), /permission denied/), role);
  await as(uid, () => deny(db.query('select * from knowledge_chunks'), /permission denied/), role);
}
await db.exec(`set role service_role`);
assert.ok((await db.query(`select * from match_knowledge('${vec(1, 0, 0)}', 1)`)).rows.length === 1);
await db.exec(`reset role`);

console.log('rag.test.mjs 通過');
