/* 新人 11｜錯題區・重練：把錯題練到會（連續答對 2 次就算掌握） */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listWrongItems, submitPractice } from '../data.js';
import { USE_MOCK } from '../config.js';
import { esc, icon, chip, phead, bar, sopRef, tbd, statusChip, demoTag, loading, failed, emptyState, delegate, toast } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const L = await renderLayout({user, nav: 'exam'});
  const {main, tabs} = L;
  const practice = {}; let fresh = null, first = true;
  const draw = async () => {
    if (first) loading(main);
    try {
      const list = await listWrongItems();
      const head = phead('考核', '錯題區・重練', '把錯題練到會：連續答對 2 次就算掌握。', tabs('exam'));
      first = false;
      if (!list.length) { main.innerHTML = head + emptyState('考完試後，答錯的選擇題會收在這裡。', {gear: 'rookie', action: '<a class="xk-btn-ghost" href="n-exam.html">回我的考核清單</a>'}); return; }
      const m = list.filter(w => w.mastered).length;
      main.innerHTML = `${head}
      <div class="row between"><span class="mini">共 ${list.length} 題・已掌握 ${m} 題</span><div style="width:260px">${bar(m / list.length * 100, `已掌握 ${m} / ${list.length}`)}</div></div>
      ${USE_MOCK ? `<p class="mini">${icon('lightbulb', 'xk-icon--sm')} 示範模式：重練時每次都算答對，方便示範「連續答對 2 次」。</p>` : ''}
      ${list.map(card).join('')}`;
    } catch (e) { failed(main, e, draw); }
  };
  function card(w) {
    const p = practice[w.qid];
    const dots = `<span class="streak" aria-label="連續答對 ${w.streak} / 2">${[0, 1].map(k => `<i class="${k < w.streak ? 'on' : ''}"></i>`).join('')}</span>`;
    let area;
    if (w.mastered) area = `<div class="row"><span class="xk-stamp ${fresh === w.qid ? '' : 'still'}">已掌握</span><span class="mini">連續答對 2 次</span></div>`;
    else if (p && p.open) {
      area = `<fieldset class="stack-s" style="border:0;padding:0;margin:0"><legend class="lbl" style="margin-bottom:8px">重練：選一個答案</legend>${w.options.map((o, k) => `<label class="opt"><input type="radio" name="pr-${esc(w.qid)}" data-act="pick" data-q="${esc(w.qid)}" data-k="${k}" ${p.pick === k ? 'checked' : ''} ${p.pick !== undefined ? 'disabled' : ''}><span class="k">${'ABCDEFG'[k]}</span><span>${esc(o)}</span></label>`).join('')}</fieldset>
      ${p.pick !== undefined ? `<div class="row between">${p.correct ? chip('done', `答對了・連續 ${w.streak} / 2`, 'stamp') : chip('alert', '這次沒答對，連續答對歸零', 'lantern')}<button type="button" class="xk-btn" data-act="again" data-q="${esc(w.qid)}">再練一次 ›</button></div>` : ''}`;
    } else area = `<div class="row"><button type="button" class="xk-btn" data-act="open" data-q="${esc(w.qid)}">開始重練 ›</button></div>`;
    return `<article class="xk-soft pad stack">
      <div class="row between"><div class="chips">${w.mastered ? statusChip('已完成').replace('已完成', '已掌握') : chip('alert', '練習中', 'lantern', 'sm')}<span class="mini">試用期考核・選擇題</span></div><span class="row"><span class="mini">連續答對</span>${dots}<span class="disp">${w.streak} / 2</span></span></div>
      <p class="pre" style="font-size:17px;line-height:1.8">${esc(w.stem)}</p>
      <dl class="kv"><dt>上次的答案</dt><dd>${w.chosen == null ? '（未作答）' : esc(w.options[w.chosen])}</dd><dt>錯誤類型</dt><dd>${esc(w.errorType || '—')} ${demoTag('示範分類')}</dd>
        <dt>對應 SOP</dt><dd>${w.sop ? `<a class="linkbtn" style="font-size:15px" href="n-sop.html?rule=${encodeURIComponent(w.sop)}">${w.sopKnown ? esc(w.sopName) : 'SOP ' + esc(w.sop)}</a> ${w.sopKnown ? '' : tbd('主題（不在 8 條示範 SOP 內）')}` : sopRef(w)}</dd></dl>
      ${area}
    </article>`;
  }
  delegate(main, {
    open: el => { practice[el.dataset.q] = {open: true}; draw(); },
    again: el => { practice[el.dataset.q] = {open: true}; draw(); },
    pick: async el => {
      const q = el.dataset.q, k = +el.dataset.k;
      try {
        const r = await submitPractice(q, k);
        if (r.mastered) { practice[q] = null; fresh = q; toast('連續答對 2 次，這題掌握了'); }
        else practice[q] = {open: true, pick: k, correct: r.correct};
        if (r.mastered) await L.refresh();
        await draw(); fresh = null;
      } catch (e) { toast(e.message, 'err'); }
    },
  });
  await draw();
}
