/* 新人 8｜考試作答：作答一份已鎖定的考卷 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getExamForTaking, saveAnswerDraft, submitExam } from '../data.js';
import { USE_MOCK } from '../config.js';
import { $, esc, chip, phead, crumb, sopRef, loading, failed, emptyState, delegate, modal, toast, busy, query } from '../ui.js';

const DEMO_SHORT = '我理解您已經付款卻查不到訂單，一定很著急。我已經記下您的付款截圖和訂單編號，正在系統裡查詢，今天 18:00 前會回覆您結果。';

const user = requireRole('newbie');
if (user) {
  const {main} = await renderLayout({user, nav: 'exam'});
  let ex = null, cur = 0;
  const has = v => v !== undefined && v !== null && v !== '';

  const draw = async () => {
    loading(main);
    try {
      ex = await getExamForTaking(query('stage'));
      if (!ex) { main.innerHTML = `${crumb([['我的考核清單', 'n-exam.html'], ['考試作答']])}${phead('考核', '考試作答')}${emptyState('考卷還沒開放。資深審核並鎖定考卷後，就可以從「我的考核清單」開始作答。', {gear: 'rookie', action: '<a class="xk-btn-ghost" href="n-exam.html">回我的考核清單</a>'})}`; return; }
      if (ex.done) { location.replace(`n-result.html?attempt=${encodeURIComponent(ex.attemptId)}`); return; }
      paint();
    } catch (e) { failed(main, e, draw); }
  };

  function paint() {
    const qs = ex.questions, q = qs[cur], last = cur === qs.length - 1;
    const n = qs.filter(x => has(ex.answers[x.id])).length;
    const body = q.qtype !== 'short'
      ? `<fieldset class="stack-s" style="border:0;padding:0;margin:0"><legend class="sr">選一個答案</legend>${q.options.map((o, k) => `<label class="opt"><input type="radio" name="opt" value="${k}" data-q="${esc(q.id)}" ${ex.answers[q.id] === k ? 'checked' : ''}><span class="k">${'ABCDEFG'[k]}</span><span>${esc(o)}</span></label>`).join('')}</fieldset>`
      : `<div class="field"><label for="shortAns">你的回覆</label><textarea class="inp xk-pat-notebook" id="shortAns" data-q="${esc(q.id)}" rows="6" placeholder="寫下你會怎麼回覆顧客">${esc(ex.answers[q.id] || '')}</textarea></div>
         <div class="row between"><span class="hint">簡答交卷後由資深覆核，覆核完才會出最終分數。</span>${USE_MOCK ? `<button type="button" class="xk-btn-ghost" data-act="demo" data-q="${esc(q.id)}">帶入示範作答</button>` : ''}</div>`;
    main.innerHTML = `
    ${crumb([['我的考核清單', 'n-exam.html'], [ex.name]])}
    ${phead('考核', '考試作答', `${esc(ex.name)}・共 ${qs.length} 題・及格 ${ex.passScore} 分・考核日 ${esc(ex.deadline || '')}`, `<span class="mini" id="answered">已作答 ${n} / ${qs.length}</span>`)}
    <div class="side-l">
      <aside class="xk-soft pad-s stack-s" aria-label="題號進度"><p class="lbl">題號進度</p>
        <div class="qroad">${qs.map((x, k) => `<button type="button" class="qdot ${has(ex.answers[x.id]) ? 'ok' : ''}" data-act="jump" data-k="${k}" ${k === cur ? 'aria-current="step"' : ''} aria-label="第 ${k + 1} 題${has(ex.answers[x.id]) ? '，已作答' : ''}">${k + 1}</button>`).join('')}</div>
        <p class="mini">黃底＝已作答・深黃＝目前這題</p>
        <hr class="line"><p class="mini">考卷由資深審核並鎖定，作答中可以來回修改；交卷後就不能改。</p>
      </aside>
      <section class="xk-panel pad stack" aria-labelledby="qT">
        <div class="row between"><h2 id="qT" style="font-size:22px">第 ${cur + 1} 題・${{mcq: '選擇題', tf: '是非題', short: '簡答題'}[q.qtype]}</h2><span class="mini">${sopRef(q)}</span></div>
        <p class="pre" style="font-size:17px;line-height:1.8">${esc(q.stem)}</p>
        ${body}
        <div class="row between" style="margin-top:8px"><button type="button" class="xk-btn-ghost" data-act="prev" ${cur === 0 ? 'disabled' : ''}>‹ 上一題</button>${last ? '<button type="button" class="xk-btn" data-act="submit">交卷 ›</button>' : '<button type="button" class="xk-btn" data-act="next">下一題 ›</button>'}</div>
      </section>
    </div>`;
  }

  async function store(qid, val) {
    ex.answers[qid] = val;
    try { await saveAnswerDraft(ex.attemptId, qid, val); } catch (e) { toast(`沒有存到：${e.message}`, 'err'); }
  }
  main.addEventListener('change', async e => {
    if (e.target.name === 'opt') { await store(e.target.dataset.q, +e.target.value); paint(); }
  });
  let t = null;
  main.addEventListener('input', e => {
    if (e.target.id !== 'shortAns') return;
    ex.answers[e.target.dataset.q] = e.target.value;
    clearTimeout(t); t = setTimeout(() => store(e.target.dataset.q, e.target.value), 400);
  });
  const flush = async () => { const s = $('#shortAns'); if (s) { clearTimeout(t); await store(s.dataset.q, s.value); } };
  delegate(main, {
    jump: async el => { await flush(); cur = +el.dataset.k; paint(); },
    prev: async () => { await flush(); cur = Math.max(0, cur - 1); paint(); },
    next: async () => { await flush(); cur = Math.min(ex.questions.length - 1, cur + 1); paint(); },
    demo: async el => { await store(el.dataset.q, DEMO_SHORT); paint(); },
    submit: async el => {
      await flush();
      const left = ex.questions.filter(x => !has(ex.answers[x.id])).length;
      const hasShort = ex.questions.some(x => x.qtype === 'short');
      const ok = await modal({title: '確定要交卷嗎？', body: `<p>交卷後就不能再修改答案。${hasShort ? '簡答題會送給資深覆核，覆核後才出最終分數。' : ''}</p><p>${left ? chip('alert', `還有 ${left} 題沒作答`, 'lantern') : chip('done', `${ex.questions.length} 題都作答了`, 'stamp')}</p>`,
        actions: [{label: '再檢查一下', value: false}, {label: '確定交卷 ›', value: true, primary: true}]});
      if (!ok) return;
      const done = busy(el, '交卷中…');
      try { const r = await submitExam(ex.attemptId, ex.answers); location.href = `n-result.html?attempt=${encodeURIComponent(r.attemptId)}&submitted=1`; }
      catch (e) { done(); toast(e.message, 'err'); }
    },
  });
  await draw();
}
