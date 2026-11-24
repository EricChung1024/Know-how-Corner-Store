// app.js｜狀態 S、登入頁、版面 shell()、頁面與導覽列登記（PAGES／NAV）、匯出 Word
// 經驗柑仔店 Know-how Corner Store｜SOP 統整中心 — 範例公司「好物集」與所有資料皆為虛構。

// ---------- 狀態 ----------
const PUB_KEY = "knowhow-sop-published";
const S = {user: null, view: "", shown: "", step: 1, maxStep: 1, files: [], filesKey: "", cleanN: 0, cleanTimer: null,
  batch: {}, ans: {}, idx: 0, editing: false, generated: false, dirty: false, pub: null, mtab: "all", find: "", rtab: "", speed: 1};
S.pub = store.get(PUB_KEY); // 第一次使用：沒有任何版本，主管版 SOP 鎖住，直到第一次統整完成
const hasPub = () => !!(S.pub && S.pub.rules);
const lockSVG = `<svg class="lockic" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const footer = (extra = "") => `<footer class="note"><span>示範資料：好物集為虛構公司，人名、訂單與數字皆為示範；示範登入不會檢查密碼，也不會送出任何資料。</span>${extra}</footer>`;
const fileKey = list => list.map(f => f.name).join("|");
function toTop(){ window.scrollTo({top: 0}); }  // 換分類、換題目時回到頁面頂端

// ---------- 登入（由上往下，一個畫面看完） ----------
let pickRole = "manager";
function renderLogin(){
  stopTimer(); S.user = null; S.view = "login"; S.shown = "login";
  $("#app").className = "wrap login-wrap";
  $("#app").innerHTML = `
  <section class="storefront flip">
    <div class="sign">${markSVG}<div><h1>經驗柑仔店</h1><p class="en">Know-how Corner Store</p><p class="muted" style="margin:6px 0 0">資深把經驗交給 AI 整理，新人隨時來拿：讀 SOP、問問題、做測驗、看見自己的進步。</p></div></div>
    <div class="scene">
      <div class="street" aria-hidden="true"><div class="bld a"><div class="grille"></div></div><div class="bld b"><div class="awning"></div><div class="door"></div></div><div class="bld c"><div class="awning"></div></div></div>
      <div class="hello"><div class="bubble" aria-live="polite"><div class="who">小橘</div><div class="say-text" id="helloText">早安，選好身分再登入，我帶你進店裡。</div></div></div>
      <button class="catbtn sitcat" id="sitcat" type="button" aria-label="小橘：再說一次">${xiaoju({expr: "default"})}</button>
    </div>
  </section>
  <section class="xk-panel flip" style="animation-delay:.12s">
    <span class="xk-cap">登入</span>
    <form id="lf" class="lform" novalidate>
      <div class="xk-seg" role="group" aria-label="身分">
        <button type="button" data-r="manager" aria-pressed="${pickRole === "manager"}">主管</button>
        <button type="button" data-r="newbie" aria-pressed="${pickRole === "newbie"}">新人</button>
      </div>
      <div class="fields">
        <div class="field"><label for="acc">帳號</label><input id="acc" autocomplete="off" placeholder="${ACCOUNTS[pickRole].id}"></div>
        <div class="field"><label for="pw">密碼</label><input id="pw" type="password" autocomplete="off"></div>
      </div>
      <p class="err" id="err"></p>
      <div class="row"><button class="xk-btn" type="submit">登入</button><button class="xk-btn-ghost" type="button" id="fillDemo">帶入示範帳號</button></div>
    </form>
  </section>${footer('<button class="linkbtn" id="resetDemo" type="button">重設示範（回到第一次使用）</button>')}`;
  let armed = 0;
  $("#resetDemo").onclick = () => {
    if (Date.now() - armed > 4000) { armed = Date.now(); $("#resetDemo").textContent = "再按一次就重設"; return; }
    try { Object.keys(localStorage).filter(k => k.startsWith("knowhow-")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    resetFlow(); S.step = 1; S.files = []; S.filesKey = ""; S.pub = null; S.mtab = "all"; S.find = ""; S.rtab = "";
    $("#resetDemo").textContent = "重設示範（回到第一次使用）"; armed = 0; toast("已重設：回到第一次使用，主管版 SOP 尚未統整");
  };
  const hello = ["早安，選好身分再登入，我帶你進店裡。", "主管負責整理 SOP，新人負責把它看熟。", "忘記帳號的話，按「帶入示範帳號」就好。"];
  let k = 0;
  $("#sitcat").onclick = () => { pop($("#sitcat svg")); $("#helloText").textContent = hello[++k % hello.length]; };
  document.querySelectorAll(".xk-seg button").forEach(b => b.onclick = () => {
    pickRole = b.dataset.r;
    document.querySelectorAll(".xk-seg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#acc").placeholder = ACCOUNTS[pickRole].id; $("#err").textContent = "";
  });
  $("#fillDemo").onclick = () => { $("#acc").value = ACCOUNTS[pickRole].id; $("#pw").value = "demo"; $("#err").textContent = ""; };
  $("#lf").onsubmit = e => {
    e.preventDefault();
    const a = $("#acc").value.trim(), p = $("#pw").value;
    const other = Object.entries(ACCOUNTS).find(([k2, v]) => v.id === a && k2 !== pickRole);
    if (!a || !p) { $("#err").textContent = "請輸入帳號和密碼。"; return; }
    if (other) { $("#err").textContent = `這是${other[1].role}帳號，請先切換到「${other[1].role}」。`; return; }
    if (a !== ACCOUNTS[pickRole].id) { $("#err").textContent = "帳號或密碼不正確。"; return; }
    S.user = {...ACCOUNTS[pickRole], key: pickRole};
    go(HOME[pickRole]());
  };
}

// ---------- 版面：頂欄＋（進度路）＋一個內容區塊，整頁一起捲動 ----------
function shell(top, body, extraFoot = ""){
  const nav = navHTML();
  const u = S.user, changed = S.shown !== S.view; S.shown = S.view;
  $("#app").className = "wrap app";
  $("#app").innerHTML = `<div class="pagetop"><header class="top">
      <div class="brand">${markSVG}<span class="disp">經驗柑仔店</span><span class="chip role">${esc(u.role)}</span></div>
      ${nav}
      <div class="who"><span class="small">${esc(u.name)}｜${esc(u.title)}</span><button class="xk-btn-ghost" type="button" id="logout">登出</button></div>
    </header>${top}</div>${body}${footer(extraFoot)}`;
  if (!changed) document.querySelectorAll("#app .flip").forEach(el => el.classList.remove("flip"));
  $("#logout").onclick = () => { stopTimer(); renderLogin(); window.scrollTo({top: 0}); };
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
}
// ---------- 頁面與導覽列登記 ----------
// 組員新增頁面（問答、測驗、評分…）時：在 PAGES 加一筆、在 NAV 加一顆按鈕，再寫一個 render 函式。
// 詳細步驟見交接說明「新增頁面」。
const FLOW = ["import", "clean", "confirm"];       // 主管「SOP 統整」的第 1～3 格
const PAGES = {
  import:  {role: "manager", render: () => vImport()},
  clean:   {role: "manager", render: () => vClean()},
  confirm: {role: "manager", render: () => vConfirm()},
  msop:    {role: "manager", render: () => vMsop(), locked: () => !hasPub()},   // 第一次統整完成前鎖住
  read:    {role: "newbie",  render: () => vRead()},
};
const NAV = {   // 每個身分頂欄上的按鈕；只有一顆時不顯示導覽列（新人目前只有一頁）
  manager: [{to: "flow", label: "SOP 統整"}, {to: "msop", label: "主管版 SOP", lockedTip: "完成第一次統整、產生主管版 SOP 後開放"}],
  newbie:  [{to: "read", label: "新人版 SOP"}],
};
const HOME = {manager: () => FLOW[Math.min(S.step, S.maxStep) - 1], newbie: () => "read"};  // 登入後、或去不了的頁面改去這裡
function navHTML(){
  const items = NAV[S.user.key] || [];
  if (items.length < 2) return "";
  return `<nav class="xk-seg" aria-label="主要">${items.map(n => {
    const p = PAGES[n.to], locked = !!(p && p.locked && p.locked());
    const cur = n.to === "flow" ? FLOW.includes(S.view) : S.view === n.to;
    return locked ? `<button type="button" disabled title="${esc(n.lockedTip || "尚未開放")}">${lockSVG}${esc(n.label)}</button>`
      : `<button type="button" data-go="${n.to}" ${cur ? 'aria-current="page"' : ""}>${esc(n.label)}</button>`;
  }).join("")}</nav>`;
}
function go(v){
  if (!S.user) return renderLogin();
  const role = S.user.key;
  if (v === "flow") v = HOME.manager();
  const p = PAGES[v];
  if (!p || p.role !== role || (p.locked && p.locked())) v = HOME[role]();
  stopTimer(); S.view = v; window.scrollTo({top: 0});
  if (FLOW.includes(v)) S.step = FLOW.indexOf(v) + 1;
  PAGES[v].render();
}
function goStep(k){
  if (k < 1 || k > S.maxStep) return;
  if (k === 4) { go("msop"); return; }
  go(FLOW[k - 1]);
}

// ---------- 匯出（Word；檔名與內容不含時間） ----------
let dlP = null;
async function save(filename, blob){
  try { if (window.claude && claude.use) { dlP = dlP || claude.use("downloads"); const dl = await dlP;
      if (dl) { await dl.save({filename, data: blob}); toast("已送出下載：" + filename); return; } } }
  catch (e) { if (e && e.code === "declined") { toast("已取消下載"); return; } toast("這裡不能下載這個檔案"); return; }
  try { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); toast("已下載：" + filename); }
  catch (e) { toast("這個畫面不能下載檔案，請改用正式網頁版"); }
}
async function exportDocx(mode, doc){
  try { const blob = await sopDocxBlob(mode, doc); save(`好物集客服SOP_${mode === "senior" ? "主管版" : "新人版"}.docx`, blob); }
  catch (e) { toast("Word 產生器還沒載入，請確認網路連線後再試一次"); }
}
