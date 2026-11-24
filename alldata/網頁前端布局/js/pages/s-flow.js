/* 資深 2｜SOP 統整：一頁四步驟 匯入資料 → AI 統整 → 資深確認 12 項 → 產生資深版 SOP */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getSopFlow, importSources, runOrganize, setFlowStep, saveConfirmDecision, generateSeniorSop, startNewRound } from '../data.js';
import { $, esc, icon, chip, cat, say, phead, bar, tbd, statusChip, demoTag, loading, failed, delegate, toast, busy, modal } from '../ui.js';
import { USE_MOCK } from '../config.js';

const STEPS = ['匯入資料', 'AI 統整', '資深確認 12 項', '產生資深版 SOP'];
const user = requireRole('senior');
if (user) {
  const {main} = await renderLayout({user, nav: 'flow'});
  let f = null, first = true, freshStamp = false;
  const draw = async () => {
    if (first) loading(main);
    try { f = await getSopFlow(); main.innerHTML = view(); first = false; freshStamp = false; }
    catch (e) { failed(main, e, draw); }
  };

  function road() {
    const pos = k => (k / 3) * 100, cur = f.generated ? 3 : f.step - 1;
    const reach = [true, f.imported, f.organized, f.confirmedCount >= f.confirmTotal];
    const stops = STEPS.map((s, k) => {
      const done = f.generated || k < f.step - 1, now = !f.generated && k === f.step - 1;
      const st = done ? '完成' : now ? '進行中' : '還沒開始';
      return `<button type="button" class="stop ${done ? 'done' : ''} ${now ? 'now' : ''}" style="left:${pos(k)}%" data-act="step" data-k="${k + 1}" ${reach[k] && !f.generated ? '' : 'disabled'} aria-label="第 ${k + 1} 步 ${s}：${st}"><span class="dot"></span><b>${s}</b><small>第 ${k + 1} 步・${st}</small></button>`;
    }).join('');
    return `<div class="road" role="group" aria-label="SOP 統整四步驟進度"><div class="road-bar xk-pat-road"></div><div class="road-fill" style="width:${pos(cur)}%"></div><div class="road-cat" style="left:${pos(cur)}%">${cat(f.generated ? 'happy' : 'default', 'senior', '')}</div>${stops}</div>`;
  }

  function panel() {
    if (f.generated) {
      return `<div class="row between"><div class="stack-s"><h2 style="font-size:26px">資深版 SOP 已產生，同時發布給新人</h2><p>版本 ${esc(f.published.version)}・發布日期 ${esc(f.published.publishedAt)}・確認人 ${esc(f.published.confirmedBy)}</p><p class="mini">新人版 SOP 已同步更新，新人登入後會在首頁和 SOP 頁看到「最近更新」。</p></div><span class="xk-stamp ${freshStamp ? '' : 'still'}">已發布</span></div>
        <div class="row"><a class="xk-btn" href="s-sop.html">查看資深版 SOP ›</a><button type="button" class="xk-btn-ghost" data-act="newRound">開始新一輪統整</button></div>`;
    }
    if (f.step === 1) {
      return `<div class="sec-h"><h2>第 1 步　匯入資料</h2>${f.imported ? chip('done', `已匯入 ${f.sources.length} 份`, 'stamp', 'sm') : statusChip('待處理')}</div>
        <p>把舊 SOP 和教學紀錄放進來，AI 會清洗、拆成一條一條規則。</p>
        ${f.imported ? `<div class="files">${f.sources.map(s => `<div class="card">${icon('book')}<b class="disp">${esc(s)}</b>${chip('done', '已匯入', 'stamp', 'sm')}</div>`).join('')}</div><p class="mini">${demoTag()} 資料包只列出這幾份來源名稱。</p>` : ''}
        <div class="card" style="border-style:dashed;display:grid;gap:12px;justify-items:start;padding:24px">
          <div class="files-up"><label class="xk-btn-ghost" for="fileIn" style="cursor:pointer">選擇檔案</label><input id="fileIn" type="file" multiple class="sr" accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.csv,.mp3,.mp4,.m4a">${USE_MOCK ? '<span class="mini">或</span><button type="button" class="xk-btn-ghost" data-act="demo">載入示範資料</button>' : ''}</div>
          <p class="mini">舊 SOP 手冊、檢核表、小抄、教學紀錄都可以。</p></div>
        <div class="row end">${f.imported ? '<button type="button" class="xk-btn" data-act="organize">下一步：AI 統整 ›</button>' : '<button class="xk-btn" type="button" disabled>下一步：AI 統整 ›</button>'}</div>`;
    }
    if (f.step === 2) {
      const r = f.organizeResult;
      return `<div class="sec-h"><h2>第 2 步　AI 統整</h2>${statusChip('已完成').replace('已完成', '統整完成')}</div>
        <div class="chips">${['清洗', '拆規則', '整理要確認的項目'].map(s => chip('done', s, 'stamp', 'sm')).join('<span aria-hidden="true">›</span>')}</div>
        <div class="stat4">
          <div class="card"><span class="mini">章節</span><span class="big">${r.chapters}<small>章</small></span></div>
          <div class="card"><span class="mini">規則</span><span class="big">${r.rules}<small>條</small></span></div>
          <div class="card"><span class="mini">紅線</span><span class="big">${r.redLines}<small>條</small></span></div>
          <div class="card"><span class="mini">需要資深確認</span><span class="big">${r.confirmCount}<small>項</small></span></div>
        </div>
        <div class="row end"><button type="button" class="xk-btn" data-act="step" data-k="3">下一步：資深確認 12 項 ›</button></div>`;
    }
    if (f.step === 3) {
      const real = f.confirmItems.filter(i => !i.tbd), rest = f.confirmItems.filter(i => i.tbd);
      const restDone = rest.every(i => i.decision);
      const cards = real.map((it, k) => `<article class="card confirm"><div class="row between"><b class="disp" style="font-size:18px">第 ${k + 1} 項・${esc(it.name)}</b>${it.decision ? chip('done', it.decision, 'stamp', 'sm') : statusChip('待處理').replace('待處理', '待確認')}</div>
        <div class="cmp"><div class="card" style="background:var(--gold-tint)"><span class="lbl">最新版</span><p>${esc(it.latest)}</p></div><div class="card"><span class="lbl">舊檔</span><p>${esc(it.old)}</p></div></div>
        <div class="row"><span>兩者不同，要以哪一個為準？</span>${['以最新版為準', '先記到待補'].map(d => `<button type="button" class="xk-btn-ghost" data-act="decide" data-id="${esc(it.id)}" data-d="${d}" aria-pressed="${it.decision === d}">${d}</button>`).join('')}</div></article>`).join('');
      return `<div class="sec-h"><h2>第 3 步　資深確認 12 項</h2><span class="row"><span class="disp">已確認 ${f.confirmedCount} / ${f.confirmTotal}</span><span style="width:200px">${bar(f.confirmedCount / f.confirmTotal * 100, `已確認 ${f.confirmedCount} / ${f.confirmTotal}`)}</span></span></div>
        ${say('一次看一項，新舊版不同的地方由你決定，喵。', {expr: 'hint', gear: 'senior'})}
        <div class="stack-s">${cards}
          <article class="card confirm" style="border-style:dashed"><div class="row between"><b class="disp" style="font-size:18px">第 ${real.length + 1}–${f.confirmTotal} 項</b>${restDone ? chip('done', '已帶入示範確認', 'stamp', 'sm') : tbd(`${rest.length} 項的內容（資料包未提供）`)}</div>
            <p class="mini">示範資料只看得到 ${real.map(i => 'SOP ' + esc(i.no)).join('、')} 的新舊差異，其餘 ${rest.length} 項待補。</p>
            ${restDone ? '' : `<div class="row"><button type="button" class="xk-btn-ghost" data-act="rest">帶入示範確認（${rest.length} 項）</button></div>`}</article></div>
        <div class="row end">${f.confirmedCount >= f.confirmTotal ? '<button type="button" class="xk-btn" data-act="step" data-k="4">下一步：產生資深版 SOP ›</button>' : `<button class="xk-btn" type="button" disabled>還有 ${f.confirmTotal - f.confirmedCount} 項沒確認</button>`}</div>`;
    }
    return `<div class="sec-h"><h2>第 4 步　產生資深版 SOP</h2>${chip('new', '可以產生', 'chat', 'sm')}</div>
      <dl class="kv" style="font-size:16px"><dt>版本</dt><dd>${esc(f.version)}</dd><dt>內容</dt><dd>${f.organizeResult ? `${f.organizeResult.chapters} 章・${f.organizeResult.rules} 條・紅線 ${f.organizeResult.redLines} 條` : ''}</dd><dt>資深確認</dt><dd>${f.confirmedCount} / ${f.confirmTotal} 項</dd><dt>確認人</dt><dd>${esc(user.name)}</dd></dl>
      <div class="banner">${icon('lightbulb')}<span style="flex:1">產生就等於發布：新人版 SOP 會同時更新，不用另外按發布。</span></div>
      <div class="row end"><button type="button" class="xk-btn" data-act="generate">產生資深版 SOP ›</button></div>`;
  }

  const view = () => `
    ${phead('SOP 統整', 'SOP 統整', '把舊資料整理成最新版 SOP：匯入資料 → AI 統整 → 資深確認 12 項 → 產生資深版 SOP。', f.published && !f.generated ? `<span class="mini">目前版本 ${esc(f.published.version)}・${esc(f.published.publishedAt)} 發布</span>` : '')}
    <section class="xk-soft pad">${road()}</section>
    <section class="xk-panel pad stack">${panel()}</section>`;

  const act = async (el, fn, okMsg) => {
    const done = busy(el, '處理中…');
    try { await fn(); if (okMsg) toast(okMsg); await draw(); } catch (e) { done(); toast(e.message, 'err'); }
  };
  delegate(main, {
    step: el => act(el, () => setFlowStep(+el.dataset.k)),
    demo: el => act(el, () => importSources(null), '已載入示範資料'),
    organize: el => act(el, async () => { await runOrganize(); await setFlowStep(2); }, 'AI 統整完成'),
    decide: el => act(el, () => saveConfirmDecision(el.dataset.id, el.dataset.d)),
    rest: el => act(el, async () => { for (const i of f.confirmItems.filter(x => x.tbd && !x.decision)) await saveConfirmDecision(i.id, '以最新版為準'); }, '已帶入示範確認'),
    generate: el => act(el, async () => { await generateSeniorSop(); freshStamp = true; }, '已產生資深版 SOP，新人版同步更新'),
    newRound: async el => {
      const ok = await modal({title: '開始新一輪統整？', body: '<p>目前發布的版本不會受影響，新人還是看得到；這一輪產生後才會更新。</p>', actions: [{label: '取消', value: false}, {label: '開始 ›', value: true, primary: true}]});
      if (ok) act(el, () => startNewRound());
    },
  });
  main.addEventListener('change', e => {
    if (e.target.id !== 'fileIn' || !e.target.files.length) return;
    act(e.target, () => importSources([...e.target.files]), `已匯入 ${e.target.files.length} 份檔案`);
  });
  await draw();
}
