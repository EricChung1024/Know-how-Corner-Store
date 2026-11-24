/* 新人 9｜成績與錯誤類型：看成績和錯在哪裡（?attempt= 指定哪一次，不給就取最近一次） */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getMyResult, markResultSeen } from '../data.js';
import { USE_MOCK } from '../config.js';
import { esc, icon, chip, say, phead, crumb, sopRef, statusChip, demoTag, loading, failed, emptyState, toast, query } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'exam'});
  if (query('submitted')) toast('已交卷');
  const draw = async () => {
    loading(main);
    try {
      const r = await getMyResult(query('attempt'));
      const head = phead('考核', '成績與錯誤類型', r ? `${esc(r.examName)}・${esc(r.submittedAt)} 交卷` : '', tabs('exam'));
      if (!r) { main.innerHTML = `${crumb([['我的考核清單', 'n-exam.html'], ['成績與錯誤類型']])}${head}${emptyState('還沒有交卷的考核。交卷後，成績和錯誤類型會出現在這裡。', {gear: 'rookie', action: '<a class="xk-btn-ghost" href="n-exam.html">回我的考核清單</a>'})}`; return; }
      const reviewed = r.status === 'reviewed';
      const scoreBox = reviewed
        ? `<div class="score"><div><span class="lbl">最終分數</span><div class="big" style="font-size:72px">${r.finalScore}<small>分</small></div><p class="mini">及格 ${r.passScore} 分 ${demoTag()}</p></div>
           <div class="stampbox"><span class="xk-stamp">${r.passed ? '通過' : '未通過'}</span></div>
           <dl class="kv"><dt>選擇題</dt><dd>${r.mcqScore} / ${r.mcqMax} 分</dd>${r.review && r.shortMax && r.items.some(i => i.qtype === 'short') ? `<dt>簡答題</dt><dd>${r.review.score} / ${r.shortMax} 分（${esc(r.review.reviewer)}覆核）</dd>` : ''}<dt>交卷日</dt><dd>${esc(r.submittedAt)}</dd></dl></div>`
        : `<div class="score"><div><span class="lbl">目前分數</span><div class="big" style="font-size:56px">${r.mcqScore}<small>/ ${r.mcqMax} 分</small></div><p class="mini">選擇題已自動計分</p></div>
           <div class="stack-s">${statusChip('待資深覆核', false)}<p>有簡答題，資深覆核後才會出最終分數和是否通過。</p><p class="mini">覆核完成會在首頁提醒你。</p></div></div>`;
      const item = (i, k) => {
        if (i.qtype === 'short') {
          return `<li class="card res"><span class="res-mark ${r.review ? 'ok' : 'wait'}" aria-hidden="true">${r.review ? '✓' : '…'}</span><div class="stack-s">
            <div class="row between"><b class="disp">第 ${k + 1} 題・簡答題</b>${r.review ? `<span class="disp">${r.review.score} / ${i.maxPoints} 分</span>` : statusChip('待資深覆核')}</div>
            <p class="mini clamp2">${esc(i.stem.split('\n').pop())}</p>
            <div class="quote"><p class="lbl" style="margin-bottom:4px">你的回覆</p><p class="pre">${esc(i.answer || '（未作答）')}</p></div>
            ${r.review ? `<div class="reply"><p class="lbl" style="margin-bottom:4px">${esc(r.review.reviewer)}的評語</p><p class="pre">${esc(r.review.comment || '—')}</p>${r.review.errorTypes.length ? `<div class="chips" style="margin-top:8px">${r.review.errorTypes.map(t => chip('alert', t, 'lantern', 'sm')).join('')}</div>` : ''}</div>` : ''}
            <span class="mini">${sopRef(i)}</span></div></li>`;
        }
        const has = i.answer !== undefined && i.answer !== null && i.answer !== '';
        return `<li class="card res"><span class="res-mark ${i.correct ? 'ok' : 'bad'}" aria-hidden="true">${i.correct ? '✓' : '✗'}</span><div class="stack-s">
          <div class="row between"><b class="disp">第 ${k + 1} 題・選擇題</b><span class="disp">${i.points} / ${i.maxPoints} 分</span></div>
          <p class="mini clamp2">${esc(i.stem.split('\n')[0])}</p>
          <p>你的答案：${has ? esc(i.options[i.answer]) : '（未作答）'}</p>
          ${i.correct ? chip('done', '答對', 'stamp', 'sm') : `<div class="chips">${chip('alert', '答錯', 'lantern', 'sm')}${i.errorType ? `<span>錯誤類型：<b>${esc(i.errorType)}</b></span>` : ''}</div>`}
          <span class="mini">${sopRef(i)}</span></div></li>`;
      };
      const types = Object.entries(r.errorSummary);
      const wrong = r.items.filter(i => i.qtype === 'mcq' && !i.correct).length;
      main.innerHTML = `
      ${crumb([['我的考核清單', 'n-exam.html'], [r.examName]])}
      ${head}
      ${USE_MOCK && r.mockGraded ? `<p class="mini">${icon('lightbulb', 'xk-icon--sm')} 示範模式：選擇題用固定的示範結果批改，不代表你選的答案真的對或錯。</p>` : ''}
      <section class="xk-panel pad">${scoreBox}</section>
      <div class="side">
        <section aria-labelledby="dtT"><h2 id="dtT" style="font-size:22px;margin-bottom:12px">每一題的結果</h2><ol class="stack-s" style="list-style:none;padding:0;margin:0">${r.items.map(item).join('')}</ol></section>
        <aside class="stack">
          <section class="xk-soft pad-s"><div class="sec-h"><h2 style="font-size:19px">錯誤類型</h2>${demoTag('示範分類')}</div>
            ${types.length ? `<div class="stack-s">${types.map(([t, v]) => `<div class="row between"><span class="row">${icon('lantern', 'xk-icon--sm')}${esc(t)}</span><b class="disp">${v} 題</b></div>`).join('')}</div>` : '<p class="mini">這次沒有錯題。</p>'}
            <p class="mini" style="margin-top:10px">分類待評分標準定稿後替換。</p></section>
          ${wrong ? `<section class="xk-soft pad-s stack-s">${say(`答錯的 ${wrong} 題收進錯題區了，連續答對 2 次就算掌握，喵。`, {expr: 'hint', gear: 'rookie'})}<a class="xk-btn" href="n-wrong.html">去錯題區重練 ›</a></section>` : ''}
          <a class="xk-btn-ghost" href="n-exam.html">回考核清單</a>
        </aside>
      </div>`;
      if (reviewed && !r.resultSeen) await markResultSeen(r.attemptId);
    } catch (e) { failed(main, e, draw); }
  };
  await draw();
}
