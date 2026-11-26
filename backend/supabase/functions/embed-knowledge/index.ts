// 經驗柑仔店｜embed-knowledge：把 SOP 規則與問答案例變成向量，存進 knowledge_chunks（問小橘 RAG 用）。
// 只有「資深」登入後能呼叫。流程：同步知識片段（sync_knowledge）→ 找出還沒有向量的 → 呼叫 Gemini 算 → 寫回。
// 可以重複執行：沒變動的片段不會重算。SOP 或案例改過之後再執行一次就會更新。
//
// 需要的 Secrets（Edge Functions › Secrets）：
//   GEMINI_API_KEY   Gemini 的 API key（也接受 GOOGLE_API_KEY）
//   GEMINI_EMBED_MODEL（選填）預設 gemini-embedding-001
// SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動提供。
//
// 部署：supabase functions deploy embed-knowledge   （保持 Verify JWT 開啟）
// 呼叫：在網站登入資深帳號後，用 supabase.functions.invoke('embed-knowledge')；或見 backend/README.md「問小橘接 Gemini」。

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) ?? '';
const DIM = 768;

const rest = (path: string, init: RequestInit = {}) => fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
  ...init, headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'content-type': 'application/json', ...(init.headers || {}) },
});

/** 用登入者的 token 查出是誰，再確認是資深。 */
async function requireSenior(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const u = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), authorization: auth } });
  if (!u.ok) return null;
  const id = (await u.json())?.id;
  if (!id) return null;
  const r = await rest(`employees?id=eq.${encodeURIComponent(id)}&role=eq.senior&select=id`);
  const rows = r.ok ? await r.json() : [];
  return rows.length ? id : null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!(await requireSenior(req))) return json({ error: '只有資深員工可以更新知識庫' }, 403);
  const key = env('GEMINI_API_KEY') || env('GOOGLE_API_KEY');
  if (!key) return json({ error: 'Secrets 裡找不到 GEMINI_API_KEY' }, 500);
  const model = env('GEMINI_EMBED_MODEL') || 'gemini-embedding-001';

  try {
    const sync = await rest('rpc/sync_knowledge', { method: 'POST', body: '{}' });
    if (!sync.ok) throw new Error(`同步知識片段失敗 ${sync.status} ${await sync.text()}`);

    const todoRes = await rest('knowledge_chunks?embedding=is.null&select=id,content&order=id');
    if (!todoRes.ok) throw new Error(`讀取知識片段失敗 ${todoRes.status} ${await todoRes.text()}`);
    const todo: { id: string; content: string }[] = await todoRes.json();

    let done = 0;
    for (let i = 0; i < todo.length; i += 50) {
      const batch = todo.slice(i, i + 50);
      const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
        method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ requests: batch.map(c => ({ model: `models/${model}`, content: { parts: [{ text: c.content }] }, taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: DIM })) }),
      });
      if (!g.ok) throw new Error(`Gemini 算向量失敗 ${g.status} ${(await g.text()).slice(0, 300)}`);
      const vecs: { values: number[] }[] = (await g.json()).embeddings || [];
      if (vecs.length !== batch.length) throw new Error('Gemini 回傳的向量數量不對');
      const w = await rest('rpc/store_embeddings', { method: 'POST', body: JSON.stringify({ p_items: batch.map((c, k) => ({ id: c.id, embedding: vecs[k].values })) }) });
      if (!w.ok) throw new Error(`寫入向量失敗 ${w.status} ${await w.text()}`);
      done += batch.length;
    }
    const total = await rest('knowledge_chunks?select=id', { headers: { prefer: 'count=exact', range: '0-0' } });
    return json({ ok: true, embeddedNow: done, totalChunks: Number((total.headers.get('content-range') || '').split('/')[1] || 0) });
  } catch (e) {
    console.error('embed-knowledge', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
