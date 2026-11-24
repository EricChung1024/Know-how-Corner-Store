// manager.js｜主管：小橘帶路進度路、第 1 格匯入、第 2 格 AI 統整、第 3 格逐題確認、主管版 SOP
// 經驗柑仔店 Know-how Corner Store｜SOP 統整中心 — 範例公司「好物集」與所有資料皆為虛構。

// ---------- 小橘帶路：點格子或拖曳小橘，回到做過的步驟 ----------
const STEP_NAMES = ["匯入資料", "AI 統整", "資深確認", "主管版 SOP"];
const stepPos = k => (k - .5) / STEP_NAMES.length * 100;
const stepDone = k => k === 3 ? ITEMS.every(isDone) : k === 4 ? S.generated : S.maxStep > k;
function flowStepper(n){
  return `<div class="stepper flow" id="flow">
    <div class="rider" id="rider" style="left:${stepPos(n)}%" title="拖曳小橘，可以回到前面的格子">${xiaoju({gear: "senior", label: `小橘在第 ${n} 格，可拖曳`})}</div>
    <div class="road" id="road"><div class="fill" style="width:${stepPos(S.maxStep)}%"></div></div>
    <div class="stops">${STEP_NAMES.map((s, i) => { const k = i + 1;
      return `<button type="button" class="stop ${k === n ? "on" : ""}" data-step="${k}" ${k > S.maxStep ? "disabled" : ""} ${k === n ? 'aria-current="step"' : ""}><b>第 ${k} 格${stepDone(k) ? "　✓" : ""}</b>${s}</button>`; }).join("")}</div></div>`;
}
function wireFlow(n){
  document.querySelectorAll("[data-step]").forEach(b => b.onclick = () => { if (+b.dataset.step !== n) goStep(+b.dataset.step); });
  const box = $("#flow"), road = $("#road"), rider = $("#rider");
  let drag = false;
  const at = e => { const r = road.getBoundingClientRect(); return Math.min(stepPos(S.maxStep), Math.max(stepPos(1), (e.clientX - r.left) / r.width * 100)); };
  const down = e => { drag = true; rider.classList.add("drag"); rider.style.left = at(e) + "%"; try { box.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); };
  rider.addEventListener("pointerdown", down); road.addEventListener("pointerdown", down);
  box.addEventListener("pointermove", e => { if (drag) rider.style.left = at(e) + "%"; });
  const up = e => { if (!drag) return; drag = false; rider.classList.remove("drag");
    const k = Math.min(S.maxStep, Math.max(1, Math.round(at(e) / (100 / STEP_NAMES.length) + .5)));
    if (k === n) rider.style.left = stepPos(n) + "%"; else goStep(k); };
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", () => { drag = false; rider.classList.remove("drag"); rider.style.left = stepPos(n) + "%"; });
}

// ---------- 主管：第 1 格 匯入 ----------
function resetFlow(){
  clearInterval(S.cleanTimer); S.cleanN = 0; S.batch = {}; S.ans = {}; S.idx = 0; S.editing = false;
  S.maxStep = 1; S.generated = false; S.dirty = false;
}
function vImport(){
  shell(flowStepper(1), `<section class="xk-panel one flip"><div class="phead"><div class="ttl"><span class="xk-cap">第 1 格</span><h2>匯入舊 SOP 和帶新人的紀錄</h2></div></div><div class="pbody stack">
      ${bubble(hasPub() ? "把新舊 SOP 和教學錄音、螢幕錄影、線上會議的逐字稿都放進來，我會幫你比對。" : "第一次使用：做完這 4 格、產生主管版 SOP 之後，上面的「主管版 SOP」才會打開。先把新舊 SOP 和教學紀錄放進來吧。")}
      <div class="drop" id="drop"><p style="margin:0 0 12px">把檔案拖到這裡，或</p>
        <div class="row" style="justify-content:center"><label class="xk-btn-ghost" for="file">選擇檔案</label><input id="file" type="file" multiple hidden>
        <button class="xk-btn-ghost" id="loadDemo" type="button">載入示範資料（9 個檔）</button></div></div>
      <div class="tablebox"><table class="list" id="ftable" hidden><thead><tr><th>檔名</th><th>類型</th><th>格式</th><th>日期</th></tr></thead><tbody></tbody></table></div>
      <p class="small muted" id="ownNote" style="margin:0" hidden>示範版會套用好物集的統整結果；正式版才會讀取你上傳的檔案內容。</p>
      <div class="row"><button class="xk-btn" id="start" type="button" disabled>開始統整 ›</button><span class="small muted" id="startNote"></span></div>
    </div></section>`);
  wireFlow(1);
  wireCats(["支援 Word、PDF、Excel、Markdown、LINE 匯出、CSV 和逐字稿（txt、srt、vtt）。", "把新舊 SOP 和教學錄音、螢幕錄影、線上會議的逐字稿都放進來，我會幫你比對。"]);
  const changed = () => S.maxStep > 1 && fileKey(S.files) !== S.filesKey;
  const sync = () => {
    $("#ftable tbody").innerHTML = S.files.map(f => `<tr><td>${esc(f.name)}</td><td><span class="chip ${f.kind === "教學逐字稿" ? "doing" : "todo"}">${esc(f.kind)}</span></td><td>${esc(f.format)}</td><td>${esc(f.date)}</td></tr>`).join("");
    $("#ftable").hidden = !S.files.length; $("#ownNote").hidden = !S.files.some(f => f.own);
    $("#start").disabled = !S.files.length;
    $("#start").textContent = S.maxStep === 1 ? "開始統整 ›" : changed() ? "重新開始統整 ›" : "下一格：AI 統整 ›";
    $("#startNote").textContent = changed() ? "檔案換過了：重新統整後，第 2、3 格要重做。" : S.maxStep > 1 ? "檔案沒變，第 2、3 格的進度都留著。" : "";
  };
  const addOwn = list => { const tr = /\.(srt|vtt)$|逐字稿|轉錄/i;
    S.files = [...list].map(f => ({name: f.name, own: true, kind: tr.test(f.name) ? "教學逐字稿" : "舊檔", format: (f.name.split(".").pop() || "").toUpperCase(), date: new Date(f.lastModified).toLocaleDateString("sv-SE")}));
    sync(); };
  $("#loadDemo").onclick = () => { S.files = DATA.files.slice(); sync(); };
  $("#file").onchange = e => addOwn(e.target.files);
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => e.dataTransfer.files.length && addOwn(e.dataTransfer.files));
  $("#start").onclick = () => {
    if (S.maxStep === 1 || changed()) { resetFlow(); S.filesKey = fileKey(S.files); S.maxStep = 2; startCleaning(); }
    goStep(2);
  };
  sync();
}

// ---------- 主管：第 2 格 AI 統整（離開頁面也會繼續跑，回來接著看） ----------
function cleanLines(){
  const c = DATA.cleaning, nFix = c.asr_fixes.reduce((a, b) => a + b.count, 0);
  return [`讀取 ${S.files.length} 個檔案（舊檔 ${S.files.filter(f => f.kind === "舊檔").length}、教學逐字稿 ${S.files.filter(f => f.kind !== "舊檔").length}）`,
    `整理逐字稿 ${c.transcript_lines} 句，「說話者 1／2」對應為林佩珊／陳宥廷`,
    `修正語音錯字 ${nFix} 處（例：好物公單→好物工單）`,
    `拆出 ${c.rules_found} 條規則，排進 9 個工作步驟`,
    `比對新舊版本，排除傳言 ${c.rumors_excluded} 則`];
}
function startCleaning(){
  clearInterval(S.cleanTimer); S.cleanN = 0;
  const fast = matchMedia("(prefers-reduced-motion: reduce)").matches;
  S.cleanTimer = setInterval(() => {
    S.cleanN++;
    const done = S.cleanN >= cleanLines().length;
    if (done) { clearInterval(S.cleanTimer); S.maxStep = Math.max(S.maxStep, 3); }
    if (S.view === "clean") paintClean(done);
  }, fast ? 60 : 650);
}
function vClean(){
  shell(flowStepper(2), `<section class="xk-panel one flip"><div class="phead"><div class="ttl"><span class="xk-cap">第 2 格</span><h2 id="ch">AI 統整中</h2></div></div>
    <div class="pbody stack"><ul class="prog" id="prog"></ul><div id="sumBox" class="stack" hidden></div>
      <div class="row" id="cfoot" hidden><button class="xk-btn" id="goConfirm" type="button">開始確認 ›</button></div></div></section>`);
  wireFlow(2); paintClean(false);
}
function paintClean(justDone){
  const lines = cleanLines(), n = Math.min(S.cleanN, lines.length);
  $("#prog").innerHTML = lines.map((l, i) => `<li class="${i < n ? "ok" : i === n ? "run" : ""}"><span class="mk">${i < n ? "✓" : i === n ? "…" : "・"}</span><span>${esc(l)}</span></li>`).join("");
  if (n < lines.length) return;
  const sm = DATA.summary, started = Object.keys(S.batch).length + Object.keys(S.ans).length;
  $("#ch").textContent = "AI 統整完成";
  $("#sumBox").innerHTML = `${bubble(`整理好了。${sm.total_rules} 條裡有 ${sm.auto_confirmed} 條你教的和舊檔一樣，我已經確認。剩下 ${sm.batch_cards + sm.questions} 項要請你判斷，我一題一題問你。`, {expr: "happy"})}
    <div class="kpis">${[[sm.total_rules, "條規則"], [sm.auto_confirmed, "條自動確認"], [sm.batch_cards, "張批次卡"], [sm.questions, "題要你判斷"]].map(([x, t]) => `<div class="xk-sheet kpi"><b>${x}</b><span>${t}</span></div>`).join("")}</div>`;
  $("#sumBox").hidden = false; $("#cfoot").hidden = false;
  $("#goConfirm").textContent = started ? `繼續確認（已確認 ${ITEMS.filter(isDone).length}／${ITEMS.length}）›` : "開始確認 ›";
  $("#goConfirm").onclick = () => goStep(3);
  wireCats();
  if (justDone) { pop($("#sumBox .xiaoju")); $("#flow").outerHTML = flowStepper(2); wireFlow(2); }
}

// ---------- 主管：第 3 格 AI 逐題引導確認 ----------
const ITEMS = [...DATA.batches.map((b, i) => ({kind: "batch", i, title: b.title})), ...DATA.questions.map((q, i) => ({kind: "q", i, title: `${q.no} ${q.topic}`}))];
const isDone = it => it.kind === "batch" ? S.batch[it.i] !== undefined : S.ans[it.i] !== undefined;
const answerText = it => {
  if (it.kind === "batch") { const a = S.batch[it.i], n = a.filter(Boolean).length; return n === a.length ? `${DATA.batches[it.i].buttons[0]}（${n} 條）` : `確認 ${n} 條，${a.length - n} 條列入待補`; }
  const q = DATA.questions[it.i], a = S.ans[it.i]; return a.text || q.options[a.j];
};
function vConfirm(){
  const done = ITEMS.filter(isDone).length, all = done === ITEMS.length;
  if (!S.editing && !all && isDone(ITEMS[S.idx])) S.idx = ITEMS.findIndex(it => !isDone(it));
  const showAll = all && !S.editing;
  shell(flowStepper(3), `<section class="xk-panel one flip"><div class="phead"><div class="row between">
      <div class="ttl"><span class="xk-cap">第 3 格</span><h2>${showAll ? "全部確認完了" : S.editing ? `修改第 ${S.idx + 1} 項` : `第 ${S.idx + 1} 項，共 ${ITEMS.length} 項`}</h2></div>
      <div class="row"><span class="chip ${all ? "done" : "warn"}">${all ? `✓ ${ITEMS.length} 項都確認了` : `! 已確認 ${done}／${ITEMS.length}`}</span><div class="row" id="glock"></div></div></div></div>
    <div class="pbody stack"><div id="qbox" class="stack"></div><div class="row" id="qact"></div>
      ${done ? `<details ${showAll ? "open" : ""}><summary>你已經回答的 ${done} 項</summary><div class="history" style="margin-top:8px">${ITEMS.map((it, k) => isDone(it) ? `<div><span><b>${esc(it.title)}</b>：${esc(answerText(it))}</span><button class="linkbtn" type="button" data-edit="${k}">修改</button></div>` : "").join("")}</div></details>` : ""}
    </div></section>`);
  wireFlow(3);
  document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { S.idx = +b.dataset.edit; S.editing = true; vConfirm(); toTop(); });
  $("#glock").innerHTML = all
    ? `${S.generated && S.dirty ? '<span class="chip warn">! 有修改還沒套用</span>' : ""}<button class="xk-btn" type="button" id="gen">${!S.generated ? "產生主管版 SOP ›" : S.dirty ? "更新主管版 SOP ›" : "查看主管版 SOP ›"}</button>`
    : `<button class="xk-btn" type="button" disabled title="還有 ${ITEMS.length - done} 項沒確認">產生主管版 SOP ›</button>`;
  if ($("#gen")) $("#gen").onclick = () => {
    if (!S.generated || S.dirty) { S.pub = buildRun(); store.set(PUB_KEY, S.pub); S.generated = true; S.dirty = false; S.maxStep = 4; S.mtab = "all"; S.find = "";
      toast("主管版 SOP 已更新為目前版本，新人登入就會看到"); }
    go("msop");
  };
  if (showAll) {
    $("#qbox").innerHTML = bubble(S.generated && !S.dirty ? "主管版 SOP 已經是最新的。要改答案的話，在下面的清單按「修改」。" : `${ITEMS.length} 項都確認好了。按上面的「${S.generated ? "更新" : "產生"}主管版 SOP」，我把你的回答寫進去。`, {expr: "happy"});
    wireCats(); pop($("#qbox .xiaoju"));
  } else {
    renderQ();
    $("#qact").insertAdjacentHTML("beforeend", `<span class="small muted">還有 ${ITEMS.length - done} 項沒確認；12 項都確認完，上方的「產生主管版 SOP」才會打開。</span>`);
  }
}
function renderQ(){
  const it = ITEMS[S.idx], box = $("#qbox"), act = $("#qact");
  const prev = S.idx > 0 ? '<button class="xk-btn-ghost" id="prev" type="button">上一項</button>' : "";
  const commit = (store_, key, val) => { const before = JSON.stringify(store_[key]); store_[key] = val; if (S.generated && before !== JSON.stringify(val)) S.dirty = true; answered(); };
  if (it.kind === "batch") {
    const b = DATA.batches[it.i], kept = S.batch[it.i] || b.items.map(() => true), open = !!S.batch[it.i] && S.batch[it.i].includes(false);
    const intro = {NEWER: `這 ${b.items.length} 條你教的和最新的舊檔一樣，只是更舊的檔案寫法不同。我建議全部照你教的，要一起確認嗎？`,
      ADD: `這 ${b.items.length} 條是你教學時新補充的細節，舊檔沒有寫。要收進 SOP 嗎？`,
      KEEP: `這 ${b.items.length} 條你沒有教到，但舊檔寫法一致。要照舊檔沿用嗎？`,
      EXPIRED: `這 ${b.items.length} 條是已經過期的暫時規則。我會把它移到版本歷史，不放進新版。`}[b.bucket];
    box.innerHTML = `${bubble(intro, {expr: "hint"})}
      <div class="xk-sheet"><div class="row between"><b>${esc(b.title)}（${b.items.length} 條）</b><button class="linkbtn" type="button" id="each">${open ? "收起清單" : "逐條檢視"}</button></div>
      <p class="small muted" style="margin:2px 0 0">${b.items.slice(0, 4).map(x => x.no + " " + x.topic).join("、")}${b.items.length > 4 ? `……等 ${b.items.length} 條` : ""}</p>
      <div class="items" id="eachBox" ${open ? "" : "hidden"}><p class="small muted" style="margin:0">不同意的取消勾選，該條會列入「待補」，不會出現在新人版。</p>${b.items.map((x, j) => `<div class="item"><label><input type="checkbox" data-j="${j}" ${kept[j] ? "checked" : ""}><span><b>${esc(x.no)}　${esc(x.topic)}</b><br>${esc(x.proposed)}</span></label>
        ${(x.older.length || x.ev) ? `<details><summary>看依據</summary>${x.older.map(o => `<div>舊檔：${esc(o)}</div>`).join("")}${x.ev ? `<div>你在${esc(x.ev)}</div>` : ""}</details>` : ""}</div>`).join("")}</div></div>`;
    act.innerHTML = `<button class="xk-btn" id="ok" type="button"></button>${prev}`;
    const sync = () => { const n = box.querySelectorAll("input:checked").length; $("#ok").textContent = n === b.items.length ? `${b.buttons[0]} ›` : `確認勾選的 ${n} 條 ›`; };
    box.querySelectorAll("input").forEach(i => i.onchange = sync); sync();
    $("#each").onclick = () => { const h = $("#eachBox").hidden = !$("#eachBox").hidden; $("#each").textContent = h ? "逐條檢視" : "收起清單"; };
    $("#ok").onclick = () => commit(S.batch, it.i, [...box.querySelectorAll("input")].map(i => i.checked));
  } else {
    const q = DATA.questions[it.i], cur = S.ans[it.i];
    box.innerHTML = `${bubble(q.ask, {expr: "confused", who: `小橘問你｜SOP ${q.no} ${q.topic}`})}
      <div class="xk-sheet"><b>各版本怎麼寫</b><ul class="ctx">${q.context.map(c => `<li><span class="chip todo">${esc(c.label)}</span> ${esc(c.text)}</li>`).join("")}</ul>
        ${q.ev ? `<div class="quote">你在${esc(q.ev)}</div>` : ""}</div>
      <div class="opts" role="radiogroup" aria-label="選一個答案">${q.options.map((o, j) => `<label class="opt"><input type="radio" name="o" value="${j}" ${cur && cur.j === j ? "checked" : ""}><span>${esc(o)}${q.ai_pick === o ? ' <span class="chip done">✓ AI 建議</span>' : ""}</span></label>`).join("")}</div>
      <div id="otherBox" class="field" hidden><label for="other">請寫下現在的做法</label><textarea id="other">${esc(cur && cur.text || "")}</textarea></div>
      ${q.why ? `<p class="small muted" style="margin:0">${esc(q.why)}</p>` : ""}`;
    act.innerHTML = `<button class="xk-btn" id="ok" type="button" disabled>確認 ›</button><button class="xk-btn-ghost" id="fill" type="button">帶入示範答案</button>${prev}`;
    const isOther = j => /其他/.test(q.options[j]);
    const upd = () => { const r = box.querySelector("input:checked"); $("#otherBox").hidden = !(r && isOther(+r.value)); $("#ok").disabled = !r || (isOther(+r.value) && !$("#other").value.trim()); };
    box.querySelectorAll("input[type=radio]").forEach(i => i.onchange = upd); $("#other").oninput = upd; upd();
    $("#fill").onclick = () => { box.querySelector(`input[value="${q.options.indexOf(q.simulated)}"]`).checked = true; upd(); };
    $("#ok").onclick = () => { const j = +box.querySelector("input:checked").value; commit(S.ans, it.i, {j, text: isOther(j) ? $("#other").value.trim() : ""}); };
  }
  wireCats();
  if ($("#prev")) $("#prev").onclick = () => { S.idx--; S.editing = true; vConfirm(); toTop(); };
}
function answered(){
  S.editing = false;
  const k = ITEMS.findIndex((it, n) => n > S.idx && !isDone(it)), k2 = k >= 0 ? k : ITEMS.findIndex(it => !isDone(it));
  S.idx = k2 < 0 ? 0 : k2; vConfirm(); toTop();
}
function buildRun(){ // 只依主管的回答套用 review.json 的 result_rule；其餘欄位沿用模擬資料，不改內容
  const rules = DATA.rules.map(r => ({...r, pending: false, byYou: ""})), byId = Object.fromEntries(rules.map(r => [r.id, r])), pending = [];
  DATA.batches.forEach((b, i) => b.items.forEach((x, j) => { if ((S.batch[i] || [])[j] === false && b.bucket !== "EXPIRED" && byId[x.id]) { byId[x.id].pending = true; pending.push(byId[x.id]); } }));
  const decisions = DATA.questions.map((q, i) => {
    const a = S.ans[i], opt = q.options[a.j], r = byId[q.id];
    if (opt === q.simulated) r.rule = q.result_rule; else { r.rule = a.text || opt.replace(/（[^）]*）$/, ""); r.byYou = "依資深選擇修改"; }
    return {no: q.no, topic: q.topic, ask: q.ask, answer: a.text || opt};
  });
  const now = new Date();
  return {version: now.toLocaleDateString("sv-SE"), at: now.toLocaleString("zh-TW", {hour12: false}).replace(/:\d\d$/, ""), by: S.user.name, rules, pending, decisions};
}

// ---------- 主管：主管版 SOP（搜尋＋分類標籤；畫面內容＝匯出的 Word） ----------
function vMsop(){
  const doc = S.pub, m = sopModel("senior", doc);
  if (S.mtab !== "all" && !m.secs.some(s => s.id === S.mtab)) S.mtab = "all";
  shell("", `<section class="xk-panel one flip"><div class="phead">
      <div class="row between">
        <div><h2 class="mtitle">主管版 SOP</h2><p class="small muted" style="margin:2px 0 0">最後更新 ${esc(doc.at)}｜${esc(doc.by)} 確認</p></div>
        <div class="row">${S.dirty ? '<span class="chip warn">! 第 3 格有修改還沒套用</span>' : '<span class="chip done">✓ 新人看到的就是這一版</span>'}<button class="xk-btn" type="button" id="exDocx">匯出 Word ›</button></div></div>
      <input class="search" id="find" type="search" placeholder="搜尋規則：例如 退款、鑑賞期、7-9" aria-label="搜尋主管版 SOP" value="${esc(S.find)}">
      <div class="tabs" role="tablist" aria-label="分類">${[{id: "all", tab: "全部"}, ...m.secs].map(s => `<button class="tab" role="tab" type="button" data-tab="${s.id}" aria-selected="${S.mtab === s.id}">${esc(s.tab)}</button>`).join("")}</div>
    </div><div class="pbody"><div id="docbox"></div></div></section>`);
  const render = () => {
    const q = S.find.trim();
    $("#docbox").innerHTML = sopDocHTML("senior", doc, S.mtab === "all" && !q ? null : S.mtab === "all" ? m.secs.map(s => s.id) : [S.mtab]);
    if (q) highlight($("#docbox"), q);
  };
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { S.mtab = b.dataset.tab; document.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b))); render(); toTop(); });
  $("#find").oninput = e => { S.find = e.target.value; render(); toTop(); };
  render();
  $("#exDocx").onclick = () => exportDocx("senior", doc);
}
function highlight(root, q){
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  let hits = 0;
  root.querySelectorAll(".sd-sec").forEach(sec => {
    let secHits = 0;
    sec.querySelectorAll("tbody tr").forEach(tr => {
      const ok = tr.textContent.includes(q); tr.hidden = !ok;
      if (ok) { secHits++; tr.querySelectorAll("td").forEach(td => { td.innerHTML = td.innerHTML.replace(/>([^<]+)</g, (mm, t) => ">" + t.replace(re, x => `<mark>${x}</mark>`) + "<").replace(/^([^<]+)/, t => t.replace(re, x => `<mark>${x}</mark>`)); }); }
    });
    sec.hidden = !secHits; hits += secHits;
  });
  if (!hits) root.insertAdjacentHTML("beforeend", `<p class="empty">找不到「${esc(q)}」。換個關鍵字試試，例如「退款」或「7-9」。</p>`);
}
