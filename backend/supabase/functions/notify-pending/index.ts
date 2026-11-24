// 經驗柑仔店｜notify-pending：新人的問題進到「待確認清單」時，用 Resend 寄信通知資深員工。
// 觸發：Supabase Database Webhook（pending_questions 的 INSERT），做法見 backend/README.md「寄信通知」。
//
// 需要的 Secrets（Edge Functions › Secrets）：
//   RESEND_API_KEY  Resend 的 API key
//   MAIL_FROM       寄件人，例如  經驗柑仔店 <onboarding@resend.dev>（沒有網域時用這個）
//   WEBHOOK_SECRET  自己訂一串亂數，Database Webhook 的 header x-webhook-secret 要填一樣的（防止別人亂呼叫來寄信）
//   NOTIFY_TO       （選填）固定收件人，多個用逗號分隔。沒有網域時 Resend 只能寄到註冊 Resend 的信箱，所以請填那個信箱；
//                   有網域後把它刪掉，就會改寄給資料庫裡所有資深員工的 email。
//   SITE_URL        （選填）網站網址，預設 GitHub Pages。
// SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 由 Supabase 自動提供，不用設定。
//
// 部署（沒有 JWT，改用 x-webhook-secret 驗證）：
//   supabase functions deploy notify-pending --no-verify-jwt

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async req => {
  const env = (k: string) => Deno.env.get(k) ?? '';
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env('WEBHOOK_SECRET') || req.headers.get('x-webhook-secret') !== env('WEBHOOK_SECRET')) return json({ error: 'unauthorized' }, 401);
  if (!env('RESEND_API_KEY') || !env('MAIL_FROM')) return json({ error: 'RESEND_API_KEY / MAIL_FROM 還沒設定' }, 500);

  let payload: { type?: string; table?: string; record?: Record<string, unknown> };
  try { payload = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const rec = payload.record;
  if (payload.type !== 'INSERT' || payload.table !== 'pending_questions' || !rec) return json({ skipped: true });

  const rest = async (path: string) => {
    const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, { headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` } });
    if (!r.ok) throw new Error(`讀資料失敗 ${r.status}`);
    return r.json() as Promise<Record<string, string>[]>;
  };

  try {
    const asker = (await rest(`employees?id=eq.${encodeURIComponent(String(rec.employee_id))}&select=name,employee_id`))[0];
    let to = env('NOTIFY_TO').split(',').map(s => s.trim()).filter(Boolean);
    if (!to.length) to = (await rest('employees?role=eq.senior&select=email')).map(x => x.email).filter(Boolean);
    if (!to.length) return json({ skipped: 'no recipients' });

    const site = (env('SITE_URL') || 'https://ericchung1024.github.io/Know-how-Corner-Store/').replace(/\/?$/, '/');
    const who = asker ? `${asker.name}（${asker.employee_id}）` : '新人';
    // lang="zh-Hant"＋繁體字型：沒指定時，信件軟體會用簡體字形顯示「覆」「往」等字
    const html = `<div lang="zh-Hant" style="font-family:'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif;line-height:1.7;color:#2b1d14">
<h2 style="margin:0 0 8px">${esc(who)} 問了一個小橘答不出來的問題</h2>
<blockquote style="margin:12px 0;padding:10px 14px;background:#fff3d6;border-left:4px solid #d9805f">${esc(rec.question).replace(/\n/g, '<br>')}</blockquote>
<p>請到「問答管理」回覆，回覆後新人首頁會出現提醒。</p>
<p><a href="${esc(site)}#/s/pending" style="display:inline-block;padding:10px 18px;background:#ffc94a;color:#2b1d14;border-radius:10px;text-decoration:none;font-weight:bold">前往回覆 ›</a></p>
<p style="color:#8a7a6c;font-size:12px">經驗柑仔店・自動通知</p></div>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('MAIL_FROM'), to, subject: `【經驗柑仔店】${asker?.name ?? '新人'}有問題等你回覆`, html }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('Resend 拒絕寄信', r.status, JSON.stringify(out)); return json({ error: 'Resend 拒絕寄信', detail: out }, 502); }
    return json({ sent: to.length, id: out.id });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
