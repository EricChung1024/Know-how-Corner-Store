// 主管專用：批次建立員工帳號、重設員工密碼。
// 管理者金鑰（SUPABASE_SERVICE_ROLE_KEY）只存在這個函式的環境變數裡，絕不會出現在網站程式。
// 流程：驗證呼叫者的登入權杖 → 確認 profiles.role = 'supervisor' → 才動用管理者金鑰。
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createAll, generatePassword } from './logic.js';

const cors = {
  'Access-Control-Allow-Origin': '*',   // 驗證靠 Authorization 權杖，不靠 cookie，所以允許任何來源不會增加風險
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) 呼叫者是誰？用他自己的權杖查，RLS 會讓他只讀得到自己的 profile
  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who?.user) return json({ error: 'NOT_AUTHENTICATED' }, 401);
  const { data: me } = await caller.from('profiles').select('role').eq('id', who.user.id).maybeSingle();
  if (me?.role !== 'supervisor') return json({ error: 'FORBIDDEN' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'BAD_REQUEST' }, 400); }

  // 2) 主管確認後才使用管理者金鑰
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body?.action === 'create') {
    const out = await createAll(body.users, async ({ email, name, password }) => {
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
      return { error: error ?? undefined };
    });
    if (out.fatal) return json({ error: out.fatal }, 400);
    return json({ results: out.results });
  }

  if (body?.action === 'reset_password') {
    if (typeof body.user_id !== 'string' || !UUID.test(body.user_id)) return json({ error: 'BAD_REQUEST' }, 400);
    const { data: target } = await admin.from('profiles').select('role').eq('id', body.user_id).maybeSingle();
    if (!target) return json({ error: 'NOT_FOUND' }, 404);
    if (target.role !== 'employee') return json({ error: 'NOT_EMPLOYEE' }, 400);   // 不讓這個函式重設主管密碼
    const password = generatePassword();
    const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
    if (error) return json({ error: 'RESET_FAILED' }, 500);
    return json({ ok: true, password });
  }

  return json({ error: 'BAD_REQUEST' }, 400);
});
