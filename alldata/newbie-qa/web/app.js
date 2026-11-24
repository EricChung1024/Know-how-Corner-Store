"use strict";
/* =====================================================================
   經驗柑仔店｜新人問答亭（Supabase 版前端）
   - 登入：Supabase Auth（Email＋密碼）；角色存在 profiles.role
   - 問答：呼叫 Edge Function「xiaoju-answer」（Gemini 金鑰只在伺服器端）
   - 紀錄：qa_records、pending_items（RLS 控制誰能看、誰能改）
   ===================================================================== */

const CFG = window.XK_CONFIG || {};
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  kids.flat().forEach((k) => { if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k)); });
  return e;
};
const fmt = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch (e) { return iso; }
};
function banner(msg) { const b = $("#dbBanner"); b.textContent = msg; b.classList.toggle("on", !!msg); }

const ROLE_LABEL = { newbie: "新人", senior: "資深" };
const WHO_TO_ASK = "林佩珊（或張家豪）";
const JUDGES = {
  "直接回答": { cls: "st-ok", icon: "✓", desc: "問題沒提到舊說法，照最新 SOP 回答" },
  "已確認的變更": { cls: "st-chg", icon: "↻", desc: "問題提到舊版寫法，以最新版為準" },
  "舊規已失效": { cls: "st-old", icon: "⨯", desc: "想照舊版做法做，現在不能這樣做" },
  "暫時規則已過期": { cls: "st-exp", icon: "⏱", desc: "活動或大促限定，期限已過" },
  "傳言不採用": { cls: "st-old", icon: "⨯", desc: "群組閒聊，非主管公告" },
  "新舊版都不符 → 請問資深": { cls: "st-ask", icon: "!", desc: "查不到或互相矛盾，記進待確認清單" },
  "不在 SOP 範圍": { cls: "st-wait", icon: "?", desc: "和客服 SOP 無關，請問組長" },
};
const REASONS = ["答案錯誤", "看不懂", "答非所問", "查無資料", "還是要問資深", "其他"];

/* ---------- 知識庫（只用來顯示；回答由伺服器端產生） ---------- */
let KB = { chapters: {}, rules: [], tips: [], examples: [] };
let BY_KEY = {};
const ruleOf = (n) => BY_KEY[n] || null;
const ruleNo = (r) => (r.no !== "—" ? r.no : r.code);
const clsText = (n) => { const r = ruleOf(n); return r ? ruleNo(r) + " " + r.topic : n; };
const chapText = (c) => (c ? c + " " + (KB.chapters[c] || "") : "");
const chapsOf = (rec) => [...new Set((rec.sop || []).map((n) => { const r = ruleOf(n); return r && r.chapter; }).filter(Boolean))];

function statusChip(j) {
  const m = JUDGES[j] || JUDGES["不在 SOP 範圍"];
  return el("span", { class: "status " + m.cls }, m.icon + " " + (JUDGES[j] ? j : "不在 SOP 範圍"));
}
function clsView(rec) {
  const sop = rec.sop || [];
  if (!sop.length) return el("span", { class: "clsch" }, "分類：查無對應規則");
  return el("span", { class: "cls" },
    sop.map((n) => { const r = ruleOf(n); return el("span", { class: "clsc" }, el("b", {}, r ? ruleNo(r) : n), r ? r.topic : ""); }),
    el("span", { class: "clsch" }, chapsOf(rec).map((c) => "步驟 " + chapText(c)).join("、")));
}

/* ---------- 資料列 → 畫面用的物件 ---------- */
let ME = null;                 // {id, name, role}
let NAMES = {};                // user_id → 顯示名稱（資深才看得到別人）
let allQA = [], allPend = [];
const nameOf = (uid) => NAMES[uid] || (ME && uid === ME.id ? ME.name : "（未知使用者）");
const fromQA = (r) => ({
  id: r.id, uid: r.user_id, at: r.created_at, atMs: Date.parse(r.created_at), q: r.question,
  answer: r.answer, say: r.say_to_customer, judge: r.judge, sop: r.sop_nos || [], chapters: r.chapters || [],
  red: r.red_line, chip: r.source_chip, pending: r.pending, tips: r.tip_ids || [], olderSource: r.older_source,
  mode: r.mode, latencyMs: r.latency_ms,
  fb: { v: r.feedback_value, reasons: r.feedback_reasons || [], note: r.feedback_note || "", at: r.feedback_at },
});
const fromPend = (p) => ({
  id: p.id, qaId: p.qa_id, uid: p.asker_id, q: p.question, answer: p.ai_answer, sop: p.sop_nos || [],
  chapters: p.chapters || [], at: p.created_at, atMs: Date.parse(p.created_at), status: p.status,
  reply: p.reply, repliedBy: p.replied_by, repliedAt: p.replied_at,
});

/* ---------- Supabase ---------- */
let sb = null;
async function loadData() {
  const [qa, pend] = await Promise.all([
    sb.from("qa_records").select("*").order("created_at", { ascending: false }).limit(1000),
    sb.from("pending_items").select("*").order("created_at", { ascending: false }).limit(500),
  ]);
  if (qa.error || pend.error) { banner("紀錄讀取失敗（" + ((qa.error || pend.error).message) + "），請重新整理。"); return; }
  allQA = qa.data.map(fromQA);
  allPend = pend.data.map(fromPend);
  if (ME.role === "senior") {
    const { data } = await sb.from("profiles").select("id, display_name, role");
    NAMES = Object.fromEntries((data || []).map((p) => [p.id, p.display_name]));
    NEWBIES = (data || []).filter((p) => p.role === "newbie").map((p) => ({ id: p.id, name: p.display_name }));
  }
  banner("");
  renderAll();
}

async function enter(user) {
  const { data: prof, error } = await sb.from("profiles").select("display_name, role").eq("id", user.id).single();
  if (error || !prof) { $("#lgErr").textContent = "找不到你的帳號資料，請聯絡管理者。"; await sb.auth.signOut(); return; }
  ME = { id: user.id, name: prof.display_name, role: prof.role };
  NAMES = { [ME.id]: ME.name };
  document.body.classList.remove("newbie", "senior"); document.body.classList.add(ME.role);
  document.querySelectorAll('.seg a[data-v="ask"], .seg a[data-v="mine"]').forEach((a) => (a.hidden = ME.role !== "newbie"));
  if (ME.role !== "newbie" && !["pending", "stats"].includes((location.hash || "").slice(1))) location.hash = "pending";
  $("#login").hidden = true; $("#app").hidden = false;
  $("#whoName").textContent = ME.name; $("#whoAvatar").textContent = ME.name.slice(0, 1);
  $("#whoRole").textContent = ROLE_LABEL[ME.role]; $("#logoutBtn").hidden = false;
  $("#statsTab").textContent = ME.role === "newbie" ? "我的統計" : "後台統計";
  $("#thread").replaceChildren(el("div", { class: "empty", id: "emptyThread" }, "還沒有問題。把你遇到的狀況打在下面，例如「客人說之前客服說退款要 7 天，哪個對？」"));
  empF = "all"; range = 0;
  renderRangeBar(); route(); renderAll();
  await loadData();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sb) return;
  const btn = $("#lgBtn"); btn.disabled = true; $("#lgErr").textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({ email: $("#lgEmail").value.trim(), password: $("#lgPw").value });
  btn.disabled = false; $("#lgPw").value = "";
  if (error) { $("#lgErr").textContent = "帳號或密碼不正確。"; return; }
  await enter(data.user);
});
$("#logoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
  ME = null; allQA = []; allPend = [];
  $("#app").hidden = true; $("#login").hidden = false; $("#lgEmail").focus();
});

/* ---------- 第 1 格：問小橘 ---------- */
let busy = false;
async function ask(q) {
  q = q.trim(); if (!q || busy || !ME) return;
  busy = true; $("#sendBtn").disabled = true; $("#q").value = "";
  $("#emptyThread")?.remove();
  const thread = $("#thread");
  thread.append(el("div", { class: "bubble-q" }, el("div", { class: "meta" }, ME.name + "・" + fmt(new Date().toISOString())), q));
  const wait = el("div", { class: "ans loading" }, el("span", { class: "muted" }, "小橘翻 SOP 中"), el("span", { class: "dots muted" }));
  thread.append(wait); wait.scrollIntoView({ block: "nearest", behavior: "smooth" });

  const { data, error } = await sb.functions.invoke(CFG.FUNCTION_NAME || "xiaoju-answer", { body: { question: q } });
  if (error || !data || !data.record) {
    let msg = "小橘這次沒有回應，請再問一次。";
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e2) { /* 沒有詳細訊息 */ }
    wait.replaceWith(el("div", { class: "ans" }, el("div", { class: "ans-text" }, msg)));
    $("#q").value = q;
  } else {
    const rec = fromQA(data.record);
    allQA.unshift(rec);
    wait.replaceWith(renderAnswer(rec, true));
    $("#xjSay").textContent = rec.pending
      ? "這題我沒把握，已記進待確認清單，記得去問 " + WHO_TO_ASK.split("（")[0] + " 喔，喵。"
      : rec.red ? "這題碰到紅線規則，照 SOP 做最安全。" : "找到了，出處我標在下面。這樣有幫到你嗎？";
    if (rec.pending) loadData(); else renderAll();
  }
  busy = false; $("#sendBtn").disabled = false; $("#q").focus();
}
function ruleCard(r) {
  const v = r.versions || [];
  return el("details", { class: "rule" },
    el("summary", {}, el("span", { class: "no" }, ruleNo(r)), el("span", {}, r.topic),
      r.red ? el("span", { class: "red" }, "★ 紅線") : null,
      r.status !== "現行" ? el("span", { class: "status st-exp" }, r.status) : null,
      el("span", { class: "note" }, "生效 " + (r.since || "—"))),
    el("div", { class: "body" }, r.rule, el("div", { class: "note" }, "依據：" + (r.basis || "—") + (r.law ? "｜法規：" + r.law : ""))),
    v.length ? el("ul", { class: "old" }, v.map((x) => el("li", {}, x.label + "（" + x.status + "）：" + x.text))) : null);
}
function renderAnswer(rec, editable) {
  const hit = (rec.sop || []).map(ruleOf).filter(Boolean);
  const tip = KB.tips.find((t) => rec.tips && rec.tips.includes(t.code));
  return el("div", { class: "ans", "data-id": rec.id },
    el("div", { class: "ans-head" }, statusChip(rec.judge), rec.red ? el("span", { class: "red" }, "★ 涉及紅線") : null,
      rec.mode === "keyword" ? el("span", { class: "note" }, "（關鍵字備援）") : null),
    el("div", { style: "margin-bottom:6px" }, clsView(rec)),
    el("div", { class: "ans-text" }, rec.answer),
    rec.say ? el("div", { class: "say" }, el("b", {}, "對客人可以說："), rec.say) : null,
    el("div", {}, el("span", { class: "src" }, rec.chip)),
    hit.length ? el("div", { class: "rules" }, hit.map(ruleCard)) : null,
    tip ? el("div", { class: "tip" }, el("span", { class: "status st-chg" }, "經驗談"), el("div", { class: "t" }, el("b", {}, tip.who + "："), tip.how)) : null,
    feedbackBox(rec, editable && ME.role === "newbie" && rec.uid === ME.id));
}
function feedbackBox(rec, editable) {
  const box = el("div", { class: "fb" });
  const fb = rec.fb || { v: null, reasons: [], note: "" };
  if (!editable) {
    box.append(el("div", { class: "small muted" }, fb.v === "up" ? "回饋：✓ 有幫助"
      : fb.v === "down" ? "回饋：沒幫助｜" + [(fb.reasons || []).join("、"), fb.note].filter(Boolean).join("｜") : "回饋：未回饋"));
    return box;
  }
  let v = fb.v; const reasons = [...(fb.reasons || [])];
  const up = el("button", { class: "xk-btn-ghost" + (v === "up" ? " on" : ""), type: "button" }, "✓ 有幫助");
  const down = el("button", { class: "xk-btn-ghost" + (v === "down" ? " on" : ""), type: "button" }, "沒幫助");
  const status = el("span", { class: "small muted" }, fb.at ? "已留回饋・可再修改" : "這個回答有幫到你嗎？");
  const rs = el("div", { class: "fb-reasons" + (v === "down" ? " on" : "") });
  const chips = el("div", { class: "chips" }, REASONS.map((r) => {
    const b = el("button", { class: "chipbtn" + (reasons.includes(r) ? " on" : ""), type: "button", "aria-pressed": reasons.includes(r) ? "true" : "false" }, r);
    b.addEventListener("click", () => { const i = reasons.indexOf(r); if (i >= 0) reasons.splice(i, 1); else reasons.push(r); b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on")); });
    return b;
  }));
  const note = el("textarea", { rows: "2", maxlength: "300", placeholder: "補充（選填）：哪裡錯、你希望怎麼回答…" }); note.value = fb.note || "";
  const save = el("button", { class: "xk-btn", type: "button" }, "送出回饋 ›");
  rs.append(el("div", { class: "small", style: "margin-bottom:6px" }, "哪裡沒幫到你？（可複選）"), chips, note, el("div", { style: "margin-top:8px" }, save));
  async function write(nv) {
    v = nv; up.classList.toggle("on", v === "up"); down.classList.toggle("on", v === "down");
    const patch = { feedback_value: v, feedback_reasons: v === "down" ? reasons : [], feedback_note: v === "down" ? note.value.trim() : "" };
    const { error } = await sb.from("qa_records").update(patch).eq("id", rec.id);
    if (error) { status.textContent = "回饋沒有存成功（" + error.message + "），請再試一次。"; return; }
    rec.fb = { v: patch.feedback_value, reasons: patch.feedback_reasons, note: patch.feedback_note, at: new Date().toISOString() };
    allQA.forEach((x) => { if (x.id === rec.id) x.fb = rec.fb; });
    status.replaceChildren(el("span", { class: "stamp" }, "已收到"), " 謝謝，喵。可再修改");
    renderStats();
  }
  up.addEventListener("click", () => { rs.classList.remove("on"); write("up"); });
  down.addEventListener("click", () => { v = "down"; up.classList.remove("on"); down.classList.add("on"); rs.classList.add("on"); status.textContent = "選原因後按「送出回饋」"; });
  save.addEventListener("click", () => write("down"));
  box.append(el("div", { class: "fb-row" }, up, down, status), rs);
  return box;
}

/* ---------- 第 2 格：我的紀錄 ---------- */
function renderMine() {
  const L = $("#mineList"); L.replaceChildren();
  const mine = allQA.filter((x) => x.uid === ME.id);
  if (!mine.length) { L.append(el("div", { class: "empty" }, "你還沒問過問題。到「第 1 格」問小橘吧。")); return; }
  mine.forEach((r) => {
    const open = el("details", {}, el("summary", {}, "看回答與修改回饋"), renderAnswer(r, true));
    L.append(el("div", { class: "card" },
      el("div", { class: "top" }, fmt(r.at), statusChip(r.judge), r.red ? el("span", { class: "red" }, "★ 紅線") : null, fbLabel(r)),
      el("div", { class: "q" }, r.q), el("div", { style: "margin-bottom:6px" }, clsView(r)), open));
  });
}
function fbLabel(r) {
  const v = r.fb && r.fb.v;
  return v === "up" ? el("span", { class: "status st-ok" }, "✓ 有幫助") : v === "down" ? el("span", { class: "status st-ask" }, "! 沒幫助") : el("span", { class: "note" }, "未回饋");
}

/* ---------- 第 3 格：待確認清單 ---------- */
let pendF = "open";
const pendFilter = (list) => list.filter((p) => pendF === "all" || (pendF === "done" ? p.status === "done" : p.status !== "done"));
function renderPending() {
  const open = allPend.filter((p) => p.status !== "done");
  $("#pendBadge").textContent = ME.role === "senior" && open.length ? String(open.length) : "";
  $("#pendIntro").textContent = ME.role === "newbie"
    ? "小橘答不出來的題目會自動進來，由資深林佩珊回覆；回覆後一小時內會寄信通知你。這裡只看得到你自己提出的題目。"
    : "新人提出、小橘答不出來的題目都在這裡。回覆正確做法後按「標記已處理」，系統會在一小時內寄信通知新人；每天早上 9:00 也會寄信提醒你還有幾題沒回覆。";
  const W = $("#pendWrap"); W.replaceChildren();
  W.append(ME.role === "newbie"
    ? section("我提出的待確認", "由資深林佩珊回覆", allPend.filter((p) => p.uid === ME.id), false)
    : section("新人提出、待我回覆", "你回覆後按「標記已處理」", allPend, true));
}
function section(title, tag, items, canReply) {
  const list = pendFilter(items);
  const s = el("div", { class: "sec" }, el("div", { class: "sec-h" }, title, el("span", { class: "tag" }, tag + "｜" + list.length + " 題")));
  const L = el("div", { class: "list" }); s.append(L);
  if (!list.length) { L.append(el("div", { class: "empty" }, pendF === "open" ? "目前沒有待處理的題目。" : "沒有符合的題目。")); return s; }
  list.forEach((p) => L.append(pendCard(p, canReply)));
  return s;
}
function pendCard(p, canReply) {
  const done = p.status === "done";
  const card = el("div", { class: "card" },
    el("div", { class: "top" }, fmt(p.at), ME.role !== "newbie" ? "提問：" + nameOf(p.uid) : null,
      done ? el("span", { class: "status st-ok" }, "✓ 已處理") : el("span", { class: "status st-ask" }, "! 待確認")),
    el("div", { class: "q" }, p.q),
    el("div", { style: "margin-bottom:6px" }, clsView(p)),
    el("details", {}, el("summary", {}, "小橘當時的回答"), el("div", { class: "small", style: "margin-top:6px" }, p.answer)),
    done ? el("div", { class: "small", style: "margin-top:8px" }, el("b", {}, "回覆（" + (p.repliedBy ? nameOf(p.repliedBy) : "資深") + "・" + fmt(p.repliedAt) + "）："), p.reply) : null);
  if (canReply) {
    const reply = el("textarea", { rows: "2", maxlength: "500", placeholder: "回覆：正確做法是…" }); reply.value = p.reply || "";
    const btn = el("button", { class: "xk-btn", type: "button" }, done ? "更新回覆 ›" : "標記已處理 ›");
    const msg = el("span", { class: "small muted" });
    btn.addEventListener("click", async () => {
      if (!reply.value.trim()) { msg.textContent = "請先填回覆內容。"; return; }
      btn.disabled = true;
      const { error } = await sb.from("pending_items").update({ status: "done", reply: reply.value.trim() }).eq("id", p.id);
      btn.disabled = false;
      if (error) { msg.textContent = "沒有存成功（" + error.message + "）"; return; }
      msg.replaceChildren(el("span", { class: "stamp" }, "已處理"));
      loadData();
    });
    card.append(el("div", { style: "margin-top:8px" }, reply, el("div", { style: "display:flex;gap:8px;align-items:center;margin-top:8px" }, btn, msg)));
  }
  return card;
}

/* ---------- 第 4 格：統計 ---------- */
let range = 0, empF = "all", NEWBIES = [];
// 期間：新人用近 N 天（數字）；資深用今年度季度 'q1'～'q4'（台灣時間）；0＝全部
function passRange(x) {
  if (!range) return true;
  if (typeof range === "number") return x.atMs >= Date.now() - range * 86400000;
  const tw = new Date((x.atMs || 0) + 8 * 3600000), now = new Date(Date.now() + 8 * 3600000);
  if (tw.getUTCFullYear() !== now.getUTCFullYear()) return false;
  return "q" + (Math.floor(tw.getUTCMonth() / 3) + 1) === range;
}
function renderRangeBar() {
  const B = $("#rangeBar"); const copy = $("#copyCsv");
  B.querySelectorAll("[data-r], .rlab").forEach((n) => n.remove());
  const mgr = ME && ME.role !== "newbie";
  const opts = mgr
    ? [["q1", "Q1（1–3 月）"], ["q2", "Q2（4–6 月）"], ["q3", "Q3（7–9 月）"], ["q4", "Q4（10–12 月）"], ["0", "全部"]]
    : [["7", "近 7 天"], ["30", "近 30 天"], ["0", "全部"]];
  const yr = new Date(Date.now() + 8 * 3600000).getUTCFullYear();
  B.insertBefore(el("span", { class: "small muted rlab" }, mgr ? "期間（" + yr + " 年）" : "期間"), B.firstChild);
  const ref = copy.previousElementSibling;
  opts.forEach(([k, l]) => B.insertBefore(el("button", { class: "chipbtn" + (String(range) === k ? " on" : ""), type: "button", "data-r": k }, l), ref));
}
function scopeQA() {
  let d = ME.role === "newbie" ? allQA.filter((x) => x.uid === ME.id) : allQA.filter((x) => NEWBIES.some((n) => n.id === x.uid));
  if (ME.role !== "newbie" && empF !== "all") d = d.filter((x) => x.uid === empF);
  return d.filter(passRange);
}
function bars(target, rows, cls) {
  const T = $(target); T.replaceChildren();
  if (!rows.length) { T.append(el("div", { class: "note" }, "還沒有資料")); return; }
  const max = Math.max(...rows.map((r) => r[1]));
  rows.forEach(([lab, n]) => T.append(el("div", { class: "bar", title: lab + "：" + n + " 題" },
    el("span", { class: "lab" }, lab), el("span", { class: "trk" }, el("span", { class: "fill" + (cls ? " " + cls : ""), style: "width:" + (n / max * 100) + "%" })), el("span", { class: "num" }, String(n)))));
}
function countBy(arr, keyFn) { const m = new Map(); arr.forEach((x) => [].concat(keyFn(x)).filter(Boolean).forEach((k) => m.set(k, (m.get(k) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]); }
const helpRate = (d) => { const f = d.filter((x) => x.fb && x.fb.v); return f.length ? Math.round(f.filter((x) => x.fb.v === "up").length / f.length * 100) + "%" : "—"; };
function renderEmpBar() {
  const B = $("#empBar"); B.replaceChildren();
  if (ME.role === "newbie") { B.hidden = true; return; }
  B.hidden = false;
  B.append(el("span", { class: "small muted" }, "新人"));
  [["all", "全部新人"]].concat(NEWBIES.map((n) => [n.id, n.name])).forEach(([k, lab]) =>
    B.append(el("button", { class: "chipbtn" + (empF === k ? " on" : ""), type: "button", onclick: () => { empF = k; renderStats(); } }, lab)));
}
function kpi(v, l) { return el("div", { class: "kpi" }, el("div", { class: "v" }, String(v)), el("div", { class: "l" }, l)); }
function renderStats() {
  const mgr = ME.role !== "newbie";
  $("#statsTitle").textContent = mgr ? "後台統計" : "我的統計";
  $("#statsIntro").textContent = mgr ? "統計所有新人的提問，可用「新人」切換看個人狀況，找出需要加強教學的規則。" : "只統計你自己問過的題目，看看哪些規則和章節最常卡關、需要加強。";
  $("#cTopTitle").textContent = mgr ? "最常被問的規則" : "我最常問的規則";
  $("#cChapTitle").textContent = mgr ? "各章節提問數" : "我常卡關的章節";
  $("#tblTitle").textContent = mgr ? "問答紀錄" : "我的問答紀錄";
  renderEmpBar();
  const data = scopeQA();
  const fbd = data.filter((x) => x.fb && x.fb.v);
  $("#kpis").replaceChildren(
    kpi(data.length, "提問數"),
    mgr ? kpi(new Set(data.map((x) => x.uid)).size, "提問人數") : kpi(data.filter((x) => x.red).length, "碰到紅線的題目"),
    kpi(helpRate(data), "有幫助比例（已回饋 " + fbd.length + " 題）"),
    kpi(data.filter((x) => x.pending).length, mgr ? "轉待確認" : "要問資深的題目"));
  const P = $("#empPanel"); P.hidden = !mgr || empF !== "all";
  if (mgr && empF === "all") {
    const T = $("#empTbl"); T.replaceChildren();
    const base = allQA.filter(passRange);
    NEWBIES.forEach((n) => {
      const d = base.filter((x) => x.uid === n.id);
      const top = countBy(d, (x) => (x.sop || []).slice(0, 1).map(clsText))[0];
      T.append(el("tr", {}, el("td", {}, n.name), el("td", {}, "新人"), el("td", {}, String(d.length)), el("td", {}, helpRate(d)),
        el("td", {}, String(d.filter((x) => x.pending).length)), el("td", {}, String(d.filter((x) => x.red).length)),
        el("td", {}, top ? top[0] + "（" + top[1] + "）" : "—")));
    });
  }
  bars("#cTop", countBy(data, (x) => (x.sop || []).slice(0, 1).map(clsText)).slice(0, 8), "");
  bars("#cChap", countBy(data, (x) => chapsOf(x).map(chapText)).sort((a, b) => a[0].localeCompare(b[0], "zh-Hant", { numeric: true })), "gold");
  bars("#cJudge", countBy(data, (x) => x.judge), "gold");
  bars("#cReason", countBy(data.filter((x) => x.fb && x.fb.v === "down"), (x) => (x.fb.reasons && x.fb.reasons.length ? x.fb.reasons : ["未選原因"])), "");
  const tb = $("#tbl"); tb.replaceChildren();
  data.forEach((x) => tb.append(el("tr", {},
    el("td", {}, fmt(x.at)), el("td", { class: "mgr-col" }, nameOf(x.uid)), el("td", {}, x.q), el("td", {}, x.judge),
    el("td", {}, (x.sop || []).map(clsText).join("、") || "查無對應規則"), el("td", {}, chapsOf(x).map(chapText).join("、")),
    el("td", {}, x.red ? "★" : ""), el("td", {}, x.fb && x.fb.v === "up" ? "有幫助" : x.fb && x.fb.v === "down" ? "沒幫助" : "—"),
    el("td", {}, [(x.fb && x.fb.reasons || []).join("、"), x.fb && x.fb.note].filter(Boolean).join("｜")))));
  $("#tblCount").textContent = "共 " + data.length + " 筆";
}
function csv() {
  const mgr = ME.role !== "newbie";
  const head = ["時間"].concat(mgr ? ["提問者"] : []).concat(["問題", "判斷類型", "分類（規則編號／主題）", "章節", "紅線", "待確認", "回饋", "沒幫助原因", "補充", "回答", "回答方式", "回應毫秒"]);
  const esc = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
  const rows = scopeQA().map((x) => [fmt(x.at)].concat(mgr ? [nameOf(x.uid)] : []).concat([x.q, x.judge, (x.sop || []).map(clsText).join("、"),
    chapsOf(x).map(chapText).join("、"), x.red ? "是" : "", x.pending ? "是" : "", x.fb && x.fb.v === "up" ? "有幫助" : x.fb && x.fb.v === "down" ? "沒幫助" : "",
    (x.fb && x.fb.reasons || []).join("、"), x.fb && x.fb.note, x.answer, x.mode === "ai" ? "AI" : "關鍵字", x.latencyMs]));
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

/* ---------- 共用 ---------- */
function renderAll() { if (!ME) return; if (ME.role === "newbie") renderMine(); renderPending(); renderStats(); }
function route() {
  const allowed = ME && ME.role !== "newbie" ? ["pending", "stats"] : ["ask", "mine", "pending", "stats"];
  const v = (location.hash || "").slice(1); const ok = allowed.includes(v) ? v : allowed[0];
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("on", s.id === "v-" + ok));
  document.querySelectorAll(".seg a").forEach((a) => { if (a.dataset.v === ok) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
$("#askForm").addEventListener("submit", (e) => { e.preventDefault(); ask($("#q").value); });
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ask($("#q").value); } });
$("#pendFilter").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; pendF = b.dataset.f; $("#pendFilter").querySelectorAll(".chipbtn").forEach((x) => x.classList.toggle("on", x === b)); renderPending(); });
$("#rangeBar").addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (!b) return; const v = b.dataset.r; range = /^q/.test(v) ? v : +v; $("#rangeBar").querySelectorAll("[data-r]").forEach((x) => x.classList.toggle("on", x === b)); renderStats(); });
$("#copyCsv").addEventListener("click", async () => { const b = $("#copyCsv"); try { await navigator.clipboard.writeText(csv()); b.textContent = "已複製，貼到 Excel 即可"; } catch (e) { b.textContent = "瀏覽器不允許複製"; } setTimeout(() => (b.textContent = "複製 CSV（貼到 Excel）"), 2500); });
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && ME) loadData(); });

/* ---------- 啟動 ---------- */
(async function start() {
  try {
    KB = await (await fetch("kb.json", { cache: "no-cache" })).json();
    KB.rules.forEach((r) => { BY_KEY[r.code] = r; if (r.no !== "—") BY_KEY[r.no] = r; });
    $("#kbVer").textContent = KB.version;
    KB.examples.forEach((e) => $("#examples").append(el("button", { class: "chipbtn", type: "button", style: "text-align:left;border-radius:12px;line-height:22px", onclick: () => { $("#q").value = e.q; $("#q").focus(); } }, e.q)));
  } catch (e) {
    $("#lgErr").textContent = "讀不到知識庫 kb.json，請先執行 node scripts/build-kb.mjs。";
  }
  Object.entries(JUDGES).forEach(([k, m]) => $("#legend").append(el("div", {}, statusChip(k), el("div", { class: "note", style: "margin:2px 0 0 4px" }, m.desc))));
  route();
  if (!window.supabase || !CFG.SUPABASE_URL || /你的專案/.test(CFG.SUPABASE_URL)) {
    $("#lgErr").textContent = "尚未設定 Supabase：請把 config.example.js 複製成 config.js 並填入專案網址與 anon key。";
    $("#lgBtn").disabled = true;
    return;
  }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(data.session.user); else $("#lgEmail").focus();
})();
