/* 資深 2｜SOP 統整：一頁四步驟 匯入資料 → AI 統整 → 資深確認 12 項 → 產生資深版 SOP */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getSopFlow, importSources, importSourcePackage, removeSource, runOrganize, setFlowStep, saveConfirmDecision, generateSeniorSop, startNewRound } from '../data.js';
import { $, esc, icon, chip, cat, say, phead, bar, tbd, statusChip, demoTag, loading, failed, delegate, toast, busy, modal, runWithProgress } from '../ui.js';
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
      const pk = f.sourcePackage, n = f.sources.length;
      const old = f.sources.filter(s => s.kind === '舊檔').length;
      // 一個區塊只有一個主要按鈕：還沒匯入時是「一鍵匯入」，匯入後是「下一步」
      return `<div class="sec-h"><h2>第 1 步　匯入資料</h2>${f.imported ? chip('done', `已匯入 ${n} 份`, 'stamp', 'sm') : statusChip('待處理')}</div>
        ${f.resetNote ? `<div class="banner">${icon('lantern')}<span style="flex:1">${esc(f.resetNote)}</span></div>` : ''}
        <div class="card stack-s" style="padding:24px">
          <div class="row between"><div class="stack-s"><b class="disp" style="font-size:20px">${icon('package')}一鍵匯入「${esc(pk.title)}」</b>
            <span class="mini">共 ${pk.count} 份：舊 SOP 與資料 ${pk.oldDocs} 份、教學逐字稿 ${pk.transcripts} 份。檔案已放在系統裡，不用一份一份選。</span></div>
            <button type="button" class="${f.imported ? 'xk-btn-ghost' : 'xk-btn'}" data-act="pkg">${f.imported ? '重新匯入資料包' : `一鍵匯入全部資料（${pk.count} 份）›`}</button></div>
        </div>
        <div class="card" style="border-style:dashed;display:grid;gap:8px;justify-items:start;padding:18px 24px">
          <div class="files-up"><label class="xk-btn-ghost" for="fileIn" style="cursor:pointer">另外選擇檔案</label><input id="fileIn" type="file" multiple class="sr" accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.csv,.srt,.vtt,.mp3,.mp4,.m4a"></div>
          <p class="mini">資料包以外的檔案：Word、PDF、Excel、Markdown、LINE 匯出、CSV、逐字稿（txt、srt、vtt）都可以。</p></div>
        ${n ? `<div class="scroll"><table class="tbl"><thead><tr><th>檔名</th><th>類型</th><th>格式</th><th>日期</th><th><span class="sr">動作</span></th></tr></thead><tbody>
          ${f.sources.map(s => `<tr><td>${esc(s.name)}</td><td>${s.kind === '教學逐字稿' ? chip('doing', s.kind, 'headset', 'sm') : chip('return', s.kind, 'book', 'sm')}</td><td>${esc(s.format)}</td><td class="nowrap">${esc(s.date)}</td>
            <td><button type="button" class="linkbtn" data-act="rm" data-name="${esc(s.name)}" aria-label="拿掉 ${esc(s.name)}">拿掉</button></td></tr>`).join('')}
          </tbody></table></div><p class="mini">舊檔 ${old} 份・教學逐字稿 ${n - old} 份</p>` : ''}
        <div class="row end">${f.imported ? '<button type="button" class="xk-btn" data-act="organize">下一步：AI 統整 ›</button>' : '<button class="xk-btn-ghost" type="button" disabled>下一步：AI 統整 ›</button>'}</div>`;
    }
    if (f.step === 2) {
      const r = f.organizeResult, old = f.sources.filter(s => s.kind === '舊檔').length;
      return `<div class="sec-h"><h2>第 2 步　AI 統整</h2>${statusChip('已完成').replace('已完成', '統整完成')}</div>
        <p class="mini">讀取 ${f.sources.length} 份來源（舊檔 ${old}、教學逐字稿 ${f.sources.length - old}）</p>
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
      const mark = it => (it.decision ? chip('done', '已確認', 'stamp', 'sm') : statusChip('待處理').replace('待處理', '待確認'));
      const buttons = it => it.options.map(o => `<button type="button" class="xk-btn-ghost" style="text-align:left" data-act="decide" data-id="${esc(it.id)}" data-d="${esc(o)}" aria-pressed="${it.decision === o}">${esc(o)}</button>`).join('');
      const card = (it, k) => it.kind === 'batch'
        ? `<article class="card confirm"><div class="row between"><b class="disp" style="font-size:18px">第 ${k + 1} 項・${esc(it.title)}</b>${mark(it)}</div>
            <details><summary class="mini" style="cursor:pointer">看這 ${it.batchItems.length} 條規則</summary><ul class="stack-s" style="margin:8px 0 0;padding-left:20px">${it.batchItems.map(x => `<li><b>SOP ${esc(x.no)} ${esc(x.topic)}</b>：${esc(x.proposed)}${x.older.length ? `<br><span class="mini">舊檔：${esc(x.older.join('；'))}</span>` : ''}</li>`).join('')}</ul></details>
            <div class="row">${buttons(it)}</div></article>`
        : `<article class="card confirm"><div class="row between"><b class="disp" style="font-size:18px">第 ${k + 1} 項・${esc(it.name)}</b>${mark(it)}</div>
            <p class="pre">${esc(it.ask)}</p>
            ${it.context.length ? `<div class="card" style="background:var(--gold-tint)"><span class="lbl">舊檔怎麼寫</span>${it.context.map(c => `<p>${esc(c.label)}：${esc(c.text)}${c.status ? ` <span class="mini">（${esc(c.status)}）</span>` : ''}</p>`).join('')}</div>` : ''}
            ${it.aiPick ? `<p class="mini">小橘建議：${esc(it.aiPick)}</p>` : ''}
            <div class="stack-s">${buttons(it)}</div></article>`;
      return `<div class="sec-h"><h2>第 3 步　資深確認 ${f.confirmTotal} 項</h2><span class="row"><span class="disp">已確認 ${f.confirmedCount} / ${f.confirmTotal}</span><span style="width:200px">${bar(f.confirmedCount / f.confirmTotal * 100, `已確認 ${f.confirmedCount} / ${f.confirmTotal}`)}</span></span></div>
        ${say('一次看一項：前 4 張卡是小橘整理好、可以一次確認的；後面 8 題要你決定怎麼收進 SOP，喵。', {expr: 'hint', gear: 'senior'})}
        <div class="stack-s">${f.confirmItems.map(card).join('')}</div>
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
  /** 處理比較久的動作（一鍵匯入、AI 統整）：主面板換成甩尾巴的小橘＋進度，做完重畫；失敗就回到原畫面並提示。 */
  let running = false;
  const withProgress = async (el, opt, okMsg) => {
    if (running) return;
    running = true;
    const box = main.querySelector('section.xk-panel');
    try { const r = await runWithProgress(box, opt); toast(okMsg(r)); await draw(); }
    catch (e) { toast(e.message, 'err'); await draw(); }
    finally { running = false; }
  };
  delegate(main, {
    step: el => act(el, () => setFlowStep(+el.dataset.k)),
    pkg: el => withProgress(el, {
      title: `正在匯入「${f.sourcePackage.title}」…`,
      steps: [`連線到系統裡的資料包「${f.sourcePackage.title}」`, `讀取 ${f.sourcePackage.count} 份檔案`,
        `分類：舊 SOP 與資料 ${f.sourcePackage.oldDocs} 份、教學逐字稿 ${f.sourcePackage.transcripts} 份`, '建立這一輪的匯入紀錄'],
      task: importSourcePackage, doneText: `${f.sourcePackage.count} 份都匯入了，喵。`,
    }, r => `已一鍵匯入 ${r.count} 份資料`),
    rm: el => act(el, () => removeSource(el.dataset.name), '已拿掉'),
    organize: el => {
      const old = f.sources.filter(s => s.kind === '舊檔').length;
      withProgress(el, {
        title: 'AI 統整中，大約要一下下…',
        steps: [`讀取 ${f.sources.length} 份來源（舊檔 ${old}、教學逐字稿 ${f.sources.length - old}）`, '整理逐字稿，標出說話者', '修正語音辨識的錯字',
          '拆成一條一條規則，標出紅線', '比對新舊版本，整理要資深確認的項目'],
        task: async () => { await runOrganize(); await setFlowStep(2); }, doneText: '統整好了，換你確認，喵。',
      }, () => 'AI 統整完成');
    },
    decide: el => act(el, () => saveConfirmDecision(el.dataset.id, el.dataset.d)),
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
