// =====================================================================
// 經驗柑仔店｜新人問答亭：寄信通知（Supabase Edge Function，Deno）
//
// 由資料庫排程（pg_cron）呼叫，不是給使用者按的：
//   {"job":"senior"}  每天 09:00（台灣時間）：還有沒回覆的新人題目，就寄信提醒資深
//   {"job":"newbie"}  每小時第 5 分：資深回覆過、還沒通知的題目，寄信給提問的新人
//   加上 "dry_run": true 只回傳會寄的信，不真的寄（測試用）
//
// 信件不寫問題細節，只放「前往待確認清單」連結（照使用規則文件的信件公版）。
//
// 需要的 secrets（supabase secrets set ...，不要放進 GitHub 或前端）：
//   GMAIL_USER          寄件的 Gmail 地址
//   GMAIL_APP_PASSWORD  Gmail 應用程式密碼（16 碼，需先開兩步驟驗證）
//   NOTIFY_SECRET       自訂一串亂碼，排程呼叫時要帶，避免別人觸發寄信
//   APP_URL             問答亭網址，例 https://ericchung1024.github.io/Know-how-Corner-Store/newbie-qa/
// Supabase Edge Function 不能連 25、587 埠，所以用 Gmail 的 465 埠（SSL）。
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const SENDER_NAME = "經驗柑仔店 小橘";
const SIGN = "經驗柑仔店 小橘（自動通知信，請勿直接回信）";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// 台灣日期工具
const twDate = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10); // YYYY-MM-DD
const md = (ymd: string) => `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}`;
// 「林佩珊」→「佩珊」；兩個字以下的名字照用
const givenName = (n: string) => (n && n.length >= 3 ? n.slice(1) : n || "你");

function pendingLink(): string {
  const base = (Deno.env.get("APP_URL") || "").replace(/#.*$/, "");
  return base + "#pending";
}
function letter(paragraphs: string[]): string {
  const p = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
  return `<div style="font-family:'Noto Sans TC',sans-serif;font-size:15px;line-height:1.7;color:#2B1E16">` +
    paragraphs.map(p).join("") +
    `<p style="margin:20px 0 0;color:#5C4636;font-size:13px">${esc(SIGN)}</p></div>`;
}
const linkHtml = () => `<a href="${esc(pendingLink())}" style="color:#B8452F;font-weight:700">前往待確認清單</a>`;

export function seniorMail(name: string, total: number, newYesterday: number, yesterday: string) {
  const subject = `【經驗柑仔店】目前有 ${total} 題新人問題等你回覆`;
  const first = newYesterday > 0
    ? `經驗柑仔店目前有 ${total} 題新人問題等你回覆，其中 ${newYesterday} 題是昨天（${md(yesterday)}）新增的。`
    : `經驗柑仔店目前有 ${total} 題新人問題等你回覆（昨天沒有新增）。`;
  const html = letter([
    `${esc(givenName(name))}早安：`,
    esc(first),
    `請登入新人問答亭，到「第 3 格 待確認清單」查看並回覆：${linkHtml()}`,
    "你按下「標記已處理」後，系統會在一小時內寄信通知提問的新人。",
  ]);
  return { subject, html };
}
export function newbieMail(name: string) {
  const subject = "【經驗柑仔店】你問的問題資深已經回覆了";
  const html = letter([
    `${esc(givenName(name))}你好：`,
    "你問小橘、需要資深確認的問題，資深已經回覆了。",
    `請登入新人問答亭，到「第 3 格 待確認清單」查看回覆內容：${linkHtml()}`,
    "如果你有先跟客人說「我確認後回覆您」，看完回覆後記得回覆客人。",
  ]);
  return { subject, html };
}

type Mail = { to: string; subject: string; html: string };
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
async function send(m: Mail) {
  if (!transporter) {
    const port = Number(Deno.env.get("SMTP_PORT") || 465);
    transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST") || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: Deno.env.get("GMAIL_USER"), pass: Deno.env.get("GMAIL_APP_PASSWORD") },
    });
  }
  await transporter.sendMail({
    from: { name: SENDER_NAME, address: Deno.env.get("GMAIL_USER")! },
    to: m.to, subject: m.subject, html: m.html,
  });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  if (!Deno.env.get("APP_URL")) return json({ error: "尚未設定 APP_URL" }, 500);
  let body: { job?: string; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* 空 */ }
  const dry = body.dry_run === true;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const emailOf = async (id: string) => {
    try { return (await admin.auth.admin.getUserById(id)).data.user?.email || null; }
    catch (e) { console.error("getUserById", id, e); return null; }
  };
  const out: { to: string; subject: string; ok: boolean; error?: string }[] = [];
  const deliver = async (m: Mail) => {
    if (dry) { out.push({ to: m.to, subject: m.subject, ok: true }); return true; }
    try { await send(m); out.push({ to: m.to, subject: m.subject, ok: true }); return true; }
    catch (e) { console.error("send", m.to, e); out.push({ to: m.to, subject: m.subject, ok: false, error: String(e) }); return false; }
  };

  // ---------- 每天 9:00 提醒資深 ----------
  if (body.job === "senior") {
    const { data: open, error } = await admin.from("pending_items").select("created_at").eq("status", "open");
    if (error) return json({ error: error.message }, 500);
    if (!open.length) return json({ job: "senior", skipped: "沒有待回覆的題目", sent: [] });

    const today = twDate(new Date());
    if (!dry) {
      // 同一天只寄一次（排程重跑也不會重複寄）
      const { error: dup } = await admin.from("notify_log").insert({ job: "senior_daily", sent_on: today, detail: { open: open.length } });
      if (dup) return json({ job: "senior", skipped: "今天已經寄過", sent: [] });
    }
    const yesterday = twDate(new Date(Date.now() - 86400_000));
    const newYesterday = open.filter((p) => twDate(new Date(p.created_at)) === yesterday).length;
    const { data: seniors } = await admin.from("profiles").select("id, display_name").eq("role", "senior");
    for (const s of seniors || []) {
      const to = await emailOf(s.id);
      if (!to) continue;
      await deliver({ to, ...seniorMail(s.display_name, open.length, newYesterday, yesterday) });
    }
    return json({ job: "senior", open: open.length, newYesterday, sent: out });
  }

  // ---------- 每小時通知新人 ----------
  if (body.job === "newbie") {
    const { data: items, error } = await admin.from("pending_items")
      .select("id, asker_id").eq("status", "done").is("notified_at", null);
    if (error) return json({ error: error.message }, 500);
    const byAsker = new Map<string, string[]>();
    items.forEach((p) => byAsker.set(p.asker_id, [...(byAsker.get(p.asker_id) || []), p.id]));
    for (const [asker, ids] of byAsker) {
      const [{ data: prof }, to] = await Promise.all([
        admin.from("profiles").select("display_name").eq("id", asker).single(),
        emailOf(asker),
      ]);
      if (!to) continue;
      const ok = await deliver({ to, ...newbieMail(prof?.display_name || "") });
      // 寄成功才標記，失敗的下一小時會再試
      if (ok && !dry) await admin.from("pending_items").update({ notified_at: new Date().toISOString() }).in("id", ids);
    }
    return json({ job: "newbie", replied: items.length, sent: out });
  }

  return json({ error: 'job 只能是 "senior" 或 "newbie"' }, 400);
});
