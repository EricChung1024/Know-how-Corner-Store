/* 資深 7｜員工詳情（?id=員工 id）：設定到職日、員工成績單、簡答覆核 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getEmployee, updateHireDate, generatePaper, getShortReview, submitShortReview, getExamSettings } from '../data.js';
import { USE_MOCK } from '../config.js';
import { $, $$, esc, icon, phead, crumb, tbd, statusChip, demoTag, loading, failed, emptyState, toast, busy, fieldError, query } from '../ui.js';

const DEMO_REVIEW = {score: 45, comment: '（示範）有先接住顧客情緒，也給了回覆時間。'};
const user = requireRole('senior');
if (user) {
  const L = await renderLayout({user, nav: 'exam'});
  const {main} = L;
  const id = query('id');
  const draw = async () => {
    loading(main);
    try {
      if (!id) { main.innerHTML = `${crumb([['員工總覽', 's-employees.html'], ['員工詳情']])}${emptyState('網址少了員工 id，請從員工總覽點進來。', {gear: 'senior', action: '<a class="xk-btn-ghost" href="s-employees.html">回員工總覽</a>'})}`; return; }
      const [e, rv, set] = await Promise.all([getEmployee(id), getShortReview(id), getExamSettings()]);
      if (!e) { main.innerHTML = `${crumb([['員工總覽', 's-employees.html'], ['員工詳情']])}${emptyState('找不到這位員工。', {gear: 'senior', action: '<a class="xk-btn-ghost" href="s-employees.html">回員工總覽</a>'})}`; return; }
      main.innerHTML = view(e, rv, set);
    } catch (err) { failed(main, err, draw); }
  };

  function view(e, rv, set) {
    const nx = e.nextExam;
    let paper = '<p class="mini">這位是示範資料，沒有考卷流程。</p>';
    if (e.canHaveExam) {
      if (!e.hireDate) paper = '<p>先設定到職日，才能產生試用期考卷。</p>';
      else if (!e.paper) paper = `<p>還沒有試用期考卷。確認到職日後，讓 AI 從題庫「已審」題目隨機產生一份。</p><div class="row"><button type="button" class="${rv ? 'xk-btn-ghost' : 'xk-btn'}" data-act="gen">AI 產生試用期考卷 ›</button></div>`;
      else if (e.paper.status === 'draft') paper = `<div class="row">${statusChip('待審核')}<span class="mini">${e.paper.questionCount} 題・${esc(e.paper.generatedAt)} 產生</span></div><a class="xk-btn-ghost" href="s-paper.html?paper=${encodeURIComponent(e.paper.id)}">前往考卷審核 ›</a>`;
      else paper = `<div class="row">${statusChip('已鎖定')}<span class="mini">${esc(e.paper.lockedAt)} 鎖定・新人${e.attemptStatus == null ? '還沒開始作答' : e.attemptStatus === 'doing' ? '作答中' : '已交卷'}</span></div><a class="linkbtn" href="s-paper.html?paper=${encodeURIComponent(e.paper.id)}">看考卷 ›</a>`;
    }
    const review = rv ? `<section class="xk-panel pad stack" aria-labelledby="rvT"><div class="row between"><h2 id="rvT" style="font-size:22px">簡答覆核</h2>${statusChip('待覆核', false)}</div>
      <p class="pre mini">${esc(rv.question.stem)}</p>
      <div class="cmp"><div class="card"><span class="lbl">新人答案</span><p class="pre">${esc(rv.answer || '（未作答）')}</p></div>
        <div class="card" style="border-style:dashed"><span class="lbl">參考答案</span>${tbd('由評分系統資料包帶入')}<p class="mini">參考答案只在後端，前端不顯示。</p></div></div>
      <form id="reviewForm" class="stack-s" novalidate data-attempt="${esc(rv.attemptId)}" data-max="${rv.shortMax}">
        <div class="row" style="align-items:flex-end"><div class="field"><label for="rvScore">簡答得分（0–${rv.shortMax}）</label><input class="inp" id="rvScore" type="number" min="0" max="${rv.shortMax}" step="1" style="width:160px"></div><span class="mini">選擇題已自動計分：${rv.mcqScore} 分</span></div>
        <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="lbl" style="margin-bottom:6px">錯誤類型（可複選）${set.demo ? demoTag('示範分類') : ''}</legend><div class="chips">${set.errorTypes.map(t => `<label class="opt" style="padding:8px 12px"><input type="checkbox" name="rvType" value="${esc(t)}"><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
        <div class="field"><label for="rvComment">給新人的評語</label><textarea class="inp xk-pat-notebook" id="rvComment" rows="3"></textarea></div>
        <div class="row between">${USE_MOCK ? '<button type="button" class="xk-btn-ghost" data-act="demoReview">帶入示範評分</button>' : '<span></span>'}<button class="xk-btn" type="submit">送出覆核 ›</button></div>
      </form></section>` : '';
    return `
    ${crumb([['員工總覽', 's-employees.html'], [e.name]])}
    ${phead('考核管理', `員工詳情・${esc(e.name)}`, '', e.demo ? demoTag() : '')}
    <section class="xk-soft pad"><div class="row between" style="align-items:flex-end">
      <dl class="kv"><dt>工號</dt><dd>${esc(e.employeeId)}</dd><dt>email</dt><dd>${esc(e.email)}</dd><dt>身分</dt><dd>${e.role === 'senior' ? '資深' : '新人'}</dd><dt>到職第</dt><dd>${e.dayNo ? e.dayNo + ' 天' : '—'}</dd></dl>
      <form id="hireForm" class="row" style="align-items:flex-end" novalidate><div class="field"><label for="hireIn">到職日</label><input class="inp" id="hireIn" type="date" value="${esc(e.hireDate || '')}" style="width:200px" ${e.demo && !e.added ? 'disabled' : ''}></div><button class="xk-btn-ghost" type="submit" ${e.demo && !e.added ? 'disabled' : ''}>儲存到職日</button></form>
      ${nx ? `<dl class="kv"><dt>${esc(nx.name)}期限</dt><dd class="disp" style="font-size:20px">${esc(nx.deadline)}</dd><dt>規則</dt><dd>試用期考核在到職 3 個月內，之後每 6 個月一次半年考核</dd></dl>` : ''}
    </div></section>
    ${review}
    <div class="g2">
      <section class="xk-soft pad stack-s"><div class="sec-h"><h2>${icon('quiz')}試用期考卷</h2></div>${paper}${e.canHaveExam && !rv ? `<p class="mini">${e.attemptStatus === 'reviewed' ? '簡答已覆核完成。' : '目前沒有待覆核的簡答。'}</p>` : ''}</section>
      <section class="xk-soft pad"><div class="sec-h"><h2>${icon('medal')}員工成績單</h2></div>
        ${e.records.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>考核</th><th>日期</th><th class="num">分數</th><th>結果</th></tr></thead><tbody>${e.records.map(r => `<tr><td>${esc(r.exam)}</td><td class="nowrap">${esc(r.date)}</td><td class="num">${r.score == null ? '—' : r.score + ' 分'}</td><td>${statusChip(r.score == null ? '待覆核' : r.passed ? '通過' : '未通過')}</td></tr>`).join('')}</tbody></table></div><p class="mini" style="margin-top:8px">及格 ${set.passScore} 分 ${set.demo ? demoTag() : ''}</p>` : '<p class="mini">還沒有考核成績。</p>'}</section>
    </div>`;
  }

  main.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.dataset.act === 'gen') {
      const done = busy(el, 'AI 出題中…');
      try { const p = await generatePaper(id, 'trial'); toast('AI 已產生試用期考卷'); location.href = `s-paper.html?paper=${encodeURIComponent(p.id)}`; }
      catch (err) { done(); toast(err.message, 'err'); }
    }
    if (el.dataset.act === 'demoReview') { $('#rvScore').value = DEMO_REVIEW.score; $('#rvComment').value = DEMO_REVIEW.comment; fieldError($('#rvScore'), ''); }
  });
  main.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'hireForm') {
      const inp = $('#hireIn');
      if (!inp.value) { fieldError(inp, '請選擇到職日'); return; }
      fieldError(inp, '');
      const done = busy(e.target.querySelector('button'), '儲存中…');
      try { await updateHireDate(id, inp.value); toast('已儲存到職日'); await draw(); } catch (err) { done(); toast(err.message, 'err'); }
    }
    if (e.target.id === 'reviewForm') {
      const f = e.target, inp = $('#rvScore'), max = +f.dataset.max, v = inp.value.trim(), n = Number(v);
      if (v === '' || !Number.isInteger(n) || n < 0 || n > max) { fieldError(inp, `請輸入 0–${max} 的整數`); inp.focus(); return; }
      fieldError(inp, '');
      const done = busy(f.querySelector('.xk-btn'), '送出中…');
      try {
        const r = await submitShortReview(f.dataset.attempt, {score: n, comment: $('#rvComment').value.trim(), errorTypes: $$('input[name=rvType]:checked').map(x => x.value)});
        toast(`已送出覆核：最終 ${r.finalScore} 分`); await L.refresh(); await draw();
      } catch (err) { done(); toast(err.message, 'err'); }
    }
  });
  await draw();
}
