/* 資深 8｜考卷審核（?paper=考卷 id）：AI 出的題目、刪題、補題、鎖定 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listPapers, getPaper, removePaperQuestion, addPaperQuestion, lockPaper, listBank } from '../data.js';
import { esc, icon, chip, phead, sopRef, statusChip, loading, failed, emptyState, delegate, toast, busy, modal, query } from '../ui.js';

const user = requireRole('senior');
if (user) {
  const L = await renderLayout({user, nav: 'exam'});
  const {main, tabs} = L;
  let paperId = query('paper'), picker = false, freshStamp = false, first = true;
  const draw = async () => {
    if (first) loading(main);
    try {
      const papers = await listPapers();
      const head = phead('考核管理', '考卷審核', '讓 AI 出的考卷可以上線：刪題、補題，確認後鎖定。', tabs('sexam'));
      first = false;
      if (!papers.length) { main.innerHTML = head + emptyState('還沒有考卷。到員工詳情設定到職日，再讓 AI 產生試用期考卷。', {gear: 'senior', action: '<a class="xk-btn-ghost" href="s-employees.html">前往員工總覽</a>'}); return; }
      if (!paperId || !papers.some(p => p.id === paperId)) paperId = (papers.find(p => p.status === 'draft') || papers[papers.length - 1]).id;
      const [p, bank] = await Promise.all([getPaper(paperId), listBank('全部')]);
      main.innerHTML = head + (papers.length > 1 ? `<div class="xk-segs" role="group" aria-label="選擇考卷">${papers.map(x => `<button type="button" class="xk-seg" data-act="pick" data-id="${esc(x.id)}" aria-pressed="${x.id === paperId}">${esc(x.employeeName)}・${x.status === 'draft' ? '待審核' : '已鎖定'}</button>`).join('')}</div>` : '') + view(p, bank);
      freshStamp = false;
    } catch (e) { failed(main, e, draw); }
  };

  function view(p, bank) {
    const locked = p.status === 'locked';
    const qcards = p.questions.map((q, k) => `<article class="card stack-s"><div class="row between"><div class="chips"><b class="disp" style="font-size:18px">第 ${k + 1} 題</b>${chip('return', q.qtype === 'mcq' ? '選擇題' : '簡答題', 'quiz', 'sm')}<span class="mini">${esc(q.id)}</span></div>${locked ? '' : `<button type="button" class="xk-btn-ghost" data-act="del" data-q="${esc(q.id)}">刪題</button>`}</div>
      <p class="pre">${esc(q.stem)}</p>${q.options ? `<ol class="stack-s" style="margin:0;padding-left:24px" type="A">${q.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>` : ''}
      <span class="mini">${sopRef(q)}</span></article>`).join('');
    const pool = bank.items.filter(q => !p.questions.some(x => x.id === q.id));
    const pick = picker && !locked ? `<section class="xk-soft pad-s stack-s" aria-labelledby="pkT"><div class="row between"><h3 id="pkT" style="font-size:19px">從題庫補題</h3><span class="mini">題庫共 ${bank.totals.total} 題，示範資料只提供 ${bank.items.length} 題</span></div>
      ${pool.length ? pool.map(q => `<div class="card row between"><div class="stack-s" style="flex:1"><div class="chips">${chip('return', q.qtype === 'mcq' ? '選擇題' : '簡答題', 'quiz', 'sm')}${statusChip(q.status)}<span class="mini">${esc(q.id)}</span></div><span class="clamp2">${esc(q.stem)}</span></div>${q.status === '已審' ? `<button type="button" class="xk-btn-ghost" data-act="add" data-q="${esc(q.id)}">加入考卷</button>` : '<span class="mini">先到<a href="s-bank.html">題庫審核</a>通過</span>'}</div>`).join('') : '<p class="mini">題庫裡的示範題目都已在考卷中。</p>'}</section>` : '';
    return `<section class="xk-panel pad stack">
      <div class="row between"><div class="stack-s"><h2 style="font-size:24px">${esc(p.employeeName)}・${esc(p.examName)}</h2><p class="mini">AI 從題庫「已審」題目隨機產生・${esc(p.generatedAt)}${p.deadline ? `・期限 ${esc(p.deadline)}` : ''}</p></div>
        ${locked ? `<span class="xk-stamp ${freshStamp ? '' : 'still'}">已鎖定</span>` : statusChip('待審核', false)}</div>
      ${locked ? `<div class="banner">${icon('stamp')}<span style="flex:1">${esc(p.lockedAt)} 鎖定。${esc(p.employeeName)}現在可以在「我的考核清單」作答，題目不能再修改。</span></div>` : ''}
      <div class="row"><span class="disp">共 ${p.questions.length} 題</span><span class="mini">選擇 ${p.mcqCount}・簡答 ${p.questions.length - p.mcqCount}</span></div>
      <div class="stack-s">${qcards || '<p class="mini">考卷目前沒有題目，請補題。</p>'}</div>
      ${pick}
      <div class="row between">${locked ? '<span></span>' : `<button type="button" class="xk-btn-ghost" data-act="picker">${picker ? '收起補題' : '補題'}</button>`}${locked ? '<a class="xk-btn-ghost" href="s-bank.html">看題庫審核</a>' : `<button type="button" class="xk-btn" data-act="lock" ${p.questions.length ? '' : 'disabled'}>鎖定考卷 ›</button>`}</div>
    </section>`;
  }

  const run = async (el, fn, msg) => { const done = busy(el, '處理中…'); try { await fn(); if (msg) toast(msg); await L.refresh(); await draw(); } catch (e) { done(); toast(e.message, 'err'); } };
  delegate(main, {
    pick: el => { paperId = el.dataset.id; picker = false; draw(); },
    picker: () => { picker = !picker; draw(); },
    del: el => run(el, () => removePaperQuestion(paperId, el.dataset.q), `已刪除 ${el.dataset.q}`),
    add: el => run(el, () => addPaperQuestion(paperId, el.dataset.q), `已加入 ${el.dataset.q}`),
    lock: async el => {
      const ok = await modal({title: '鎖定這份考卷？', body: '<p>鎖定後就不能再刪題、補題，新人會在「我的考核清單」看到「可作答」。</p>', actions: [{label: '取消', value: false}, {label: '確定鎖定 ›', value: true, primary: true}]});
      if (ok) { picker = false; freshStamp = true; run(el, () => lockPaper(paperId), '考卷已鎖定，新人可以作答了'); }
    },
  });
  await draw();
}
