// newbie.js｜新人：新人版 SOP 閱讀、閱讀進度（依字數估時間）
// 經驗柑仔店 Know-how Corner Store｜SOP 統整中心 — 範例公司「好物集」與所有資料皆為虛構。

// ---------- 新人：新人版 SOP（分類標籤＋閱讀進度；畫面內容＝匯出的 Word） ----------
const READ_SECS = () => sopModel("newbie", S.pub).secs;
function needSec(s){ // 依內容字數估算閱讀時間（每分鐘約 250 字），最少 20 秒
  const chars = (s.title + s.desc + s.rows.map(r => r.cells.map(c => typeof c === "string" ? c : c.lines ? c.lines.join("") : (c.topic + c.text)).join("")).join("") + (s.tips || []).map(t => t.type + t.tip).join("")).length;
  return Math.max(20, Math.round(chars / 250 * 60));
}
let timer = null;
function stopTimer(){ clearInterval(timer); timer = null; }
function progKey(){ return `knowhow-read-${S.user.id}-${S.pub.version}-${S.pub.at}`; }
function vRead(){
  if (!hasPub()) {
    shell("", `<section class="xk-panel one flip"><div class="phead"><div class="ttl"><span class="xk-cap">新人版 SOP</span><h2>你好，${esc(S.user.name.slice(1))}</h2></div></div>
      <div class="pbody">${bubble("新人版 SOP 還在準備中。主管完成第一次統整後，這裡就會出現，到時候再登入看看。", {expr: "hint"})}</div></section>`);
    wireCats(); return;
  }
  const doc = S.pub, secs = READ_SECS();
  const P = store.get(progKey()) || {};
  secs.forEach(s => { s.need = needSec(s); P[s.id] = Math.min(P[s.id] || 0, s.need); });
  if (!S.rtab || (S.rtab !== "all" && !secs.some(s => s.id === S.rtab))) S.rtab = (secs.find(s => P[s.id] < s.need) || secs[0]).id;
  const totalNeed = secs.reduce((a, s) => a + s.need, 0);
  const fmt = n => n < 60 ? `${n} 秒` : `${Math.ceil(n / 60 * 2) / 2} 分鐘`;
  shell("", `<section class="xk-panel one flip"><div class="phead">
    <div class="row between">
      <div class="ttl"><span class="xk-cap">新人版 SOP</span><h2>你好，${esc(S.user.name.slice(1))}</h2><span class="small muted">整份約 ${Math.ceil(totalNeed / 60)} 分鐘</span></div>
      <button class="xk-btn" type="button" id="exDocx">匯出 Word ›</button>
    </div>
    <div class="stepper read" aria-label="閱讀進度">
      <div class="rider" id="rider">${xiaoju({gear: "rookie", label: "小橘陪你讀到這裡"})}</div>
      <div class="road"><div class="fill" id="rfill"></div></div>
      <div class="row between small" style="margin-top:6px"><span class="muted"><span id="rtext"></span>｜<span id="rdone"></span></span></div>
    </div>
    <div class="tabs" role="tablist" aria-label="分類">${secs.map(s => `<button class="tab" role="tab" type="button" data-tab="${s.id}" aria-selected="${S.rtab === s.id}">${esc(s.tab)}<span class="ok" data-ok="${s.id}"></span><span class="mini" data-mini="${s.id}"></span></button>`).join("")}<button class="tab" role="tab" type="button" data-tab="all" aria-selected="${S.rtab === "all"}">整份 SOP</button></div>
  </div><div class="pbody"><div id="docbox"></div><div id="readSay" style="margin-top:16px"></div><div class="row" id="nextRow" style="margin-top:12px"></div></div></section>`, `<label class="speed"><input type="checkbox" id="speed" ${S.speed > 1 ? "checked" : ""}> 簡報示範用：閱讀時間加速 10 倍</label>`);
  const say = (t, expr = "default") => { $("#readSay").innerHTML = bubble(t, {expr}); wireCats(["慢慢看沒關係，切換分類時進度會留著。", "看到舊檔寫的不一樣，以這份為準。", "不確定的規則，先回客人「確認後幾點前回覆您」，再去問帶你的學長姐。"]); };
  const paint = () => {
    const got = secs.reduce((a, s) => a + Math.min(P[s.id], s.need), 0), pct = Math.round(got / totalNeed * 100), doneN = secs.filter(s => P[s.id] >= s.need).length;
    $("#rfill").style.width = pct + "%"; $("#rider").style.left = `calc(${pct}% * .92 + 4%)`;
    $("#rtext").textContent = `閱讀進度 ${pct}%`; $("#rdone").textContent = `已讀完 ${doneN}／${secs.length} 格`;
    secs.forEach(s => { const r = Math.min(1, P[s.id] / s.need);
      document.querySelector(`[data-mini="${s.id}"]`).style.width = (r * 100) + "%";
      document.querySelector(`[data-ok="${s.id}"]`).textContent = r >= 1 ? "✓" : ""; });
  };
  const showStatus = fresh => {
    const i = secs.findIndex(s => s.id === S.rtab), s = secs[i];
    if (!s) { say("這是整份新人版，和匯出的 Word 一樣。"); $("#nextRow").innerHTML = ""; return; }
    const done = P[s.id] >= s.need, allDone = secs.every(x => P[x.id] >= x.need);
    say(allDone ? "整份新人版都讀完了。之後有更新，我會在這裡提醒你。" : done ? `「${s.tab}」這一格讀完了。` : `「${s.tab}」慢慢看，切換分類時進度會留著。`, done ? "happy" : "default");
    $("#nextRow").innerHTML = `${done ? `<span class="stamp ${fresh ? "go" : ""}">已讀</span>` : ""}
      ${secs[i + 1] ? `<button class="xk-btn-ghost" type="button" id="nextSec">下一格：${esc(secs[i + 1].tab)} ›</button>` : ""}`;
    if ($("#nextSec")) $("#nextSec").onclick = () => select(secs[i + 1].id);
    if (fresh) pop($("#readSay .xiaoju"));
  };
  const select = id => {
    S.rtab = id; document.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x.dataset.tab === id)));
    $("#docbox").innerHTML = sopDocHTML("newbie", doc, id === "all" ? null : [id]);
    paint(); showStatus(false); toTop();
    const t = document.querySelector(`[data-tab="${id}"]`); if (t) t.scrollIntoView({inline: "nearest", block: "nearest"});
  };
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => select(b.dataset.tab));
  $("#exDocx").onclick = () => exportDocx("newbie", doc);
  $("#speed").onchange = e => { S.speed = e.target.checked ? 10 : 1; };
  select(S.rtab);
  timer = setInterval(() => {
    if (document.visibilityState !== "visible" || S.rtab === "all") return;
    const s = secs.find(x => x.id === S.rtab); if (!s || P[s.id] >= s.need) return;
    P[s.id] = Math.min(s.need, P[s.id] + S.speed); store.set(progKey(), P); paint();
    if (P[s.id] >= s.need) showStatus(true);
  }, 1000);
}
