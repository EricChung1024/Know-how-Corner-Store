/* 資深 7｜員工詳情（?id=員工 id）：設定到職日、員工成績單、簡答覆核 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getEmployee, updateHireDate, generatePaper, getShortReview, submitShortReview, getExamSettings } from '../data.js';
import { USE_MOCK } from '../config.js';
import { $, $$, esc, icon, phead, crumb, tbd, statusChip, demoTag, loading, failed, emptyState, toast, busy, fieldError, query, dayText } from '../ui.js';

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
    // 三次考核的考卷：每一階段一列。整區只有一個主要按鈕：第一個還沒出題的階段。
    const firstGen = e.canHaveExam && e.hireDate && !rv ? (e.stages.find(s => !s.paper && s.status !== '已完成') || {}).type : null;
    const stageRow = s => {
      let act = '';
      if (s.status === '已完成') act = s.finalScore != null ? `<span class="disp">${s.finalScore} 分</span>${statusChip(s.passed ? '通過' : '未通過')}` : statusChip('待覆核');
      else if (!e.canHaveExam) act = '<span class="mini">示範資料</span>';
      else if (!e.hireDate) act = '<span class="mini">先設定到職日</span>';
      else if (!s.paper) act = `<button type="button" class="${s.type === firstGen ? 'xk-btn' : 'xk-btn-ghost'}" data-act="gen" data-type="${esc(s.type)}">出題 ›</button>`;
      else if (s.paper.status === 'draft') act = `${statusChip('待審核')}<a class="linkbtn" href="s-paper.html?paper=${encodeURIComponent(s.paper.id)}">審核考卷 ›</a>`;
      else act = `${statusChip('已鎖定')}<span class="mini">${s.attemptStatus === 'doing' ? '作答中' : '還沒開始作答'}</span>`;
      return `<tr><td><b>${esc(s.name)}</b><br><span class="mini">滿 ${s.months} 個月・${esc(s.levelName)}・及格 ${s.passScore}</span></td>
        <td class="nowrap">${esc(s.dueDate || '—')}${s.dueDate && s.status !== '已完成' ? `<br><span class="mini">${dayText(s.daysLeft)}</span>` : ''}</td><td><div class="row">${act}</div></td></tr>`;
    };
    const paper = `<div class="scroll"><table class="tbl"><thead><tr><th>考核</th><th>考核日</th><th>考卷</th></tr></thead><tbody>${e.stages.map(stageRow).join('')}</tbody></table></div>
      <p class="mini">考核日＝到職日＋N 個月（當月沒有同一天用月底，遇週末順延到週一）。出題從題庫「已審」題目依難度隨機抽，審核後鎖定，新人才能作答。</p>`;
    const rubricOf = r => (Array.isArray(r) ? r : r ? [r] : []).filter(Boolean);
    const review = rv ? `<section class="xk-panel pad stack" aria-labelledby="rvT"><div class="row between"><h2 id="rvT" style="font-size:22px">簡答覆核・${esc(rv.examName)}</h2>${statusChip('待覆核', false)}</div>
      <p class="mini">選擇題已自動計分：${rv.mcqScore} 分。簡答共 ${rv.items.length} 題，請逐題給分。</p>
      <form id="reviewForm" class="stack-s" novalidate data-attempt="${esc(rv.attemptId)}">
        ${rv.items.map((it, k) => `<article class="card stack-s"><b class="disp" style="font-size:18px">第 ${k + 1} 題簡答</b>
          <p class="pre mini">${esc(it.stem)}</p>
          <div class="cmp"><div class="card"><span class="lbl">新人答案</span><p class="pre">${esc(it.answer || '（未作答）')}</p></div>
            <div class="card" style="background:var(--gold-tint)"><span class="lbl">參考答案</span><p class="pre">${esc(it.referenceAnswer || '—')}</p>
              ${rubricOf(it.rubric).length ? `<p class="lbl" style="margin-top:8px">得分點</p><ul class="stack-s" style="margin:0;padding-left:20px">${rubricOf(it.rubric).map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
              ${it.keyError ? `<p class="mini" style="margin-top:8px">關鍵失誤：${esc(it.keyError)}</p>` : ''}</div></div>
          <div class="field"><label for="rvScore${k}">此題得分（0–${it.maxPoints}）</label><input class="inp rv-score" id="rvScore${k}" data-qid="${esc(it.qid)}" data-max="${it.maxPoints}" type="number" min="0" max="${it.maxPoints}" step="0.5" style="width:160px"></div></article>`).join('')}
        <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="lbl" style="margin-bottom:6px">錯誤類型（可複選）</legend><div class="chips">${set.errorTypes.map(t => `<label class="opt" style="padding:8px 12px"><input type="checkbox" name="rvType" value="${esc(t)}"><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
        <div class="field"><label for="rvComment">給新人的評語</label><textarea class="inp xk-pat-notebook" id="rvComment" rows="3"></textarea></div>
        <div class="row end"><button class="xk-btn" type="submit">送出覆核 ›</button></div>
      </form></section>` : '';
    return `
    ${crumb([['員工總覽', 's-employees.html'], [e.name]])}
    ${phead('考核管理', `員工詳情・${esc(e.name)}`, '', e.demo ? demoTag() : '')}
    <section class="xk-soft pad"><div class="row between" style="align-items:flex-end">
      <dl class="kv"><dt>工號</dt><dd>${esc(e.employeeId)}</dd><dt>email</dt><dd>${esc(e.email)}</dd><dt>身分</dt><dd>${e.role === 'senior' ? '資深' : '新人'}</dd><dt>到職第</dt><dd>${e.dayNo ? e.dayNo + ' 天' : '—'}</dd></dl>
      <form id="hireForm" class="row" style="align-items:flex-end" novalidate><div class="field"><label for="hireIn">到職日</label><input class="inp" id="hireIn" type="date" value="${esc(e.hireDate || '')}" style="width:200px" ${e.demo && !e.added ? 'disabled' : ''}></div><button class="xk-btn-ghost" type="submit" ${e.demo && !e.added ? 'disabled' : ''}>儲存到職日</button></form>
      ${nx ? `<dl class="kv"><dt>下次考核</dt><dd>${esc(nx.name)}</dd><dt>考核日</dt><dd class="disp" style="font-size:20px">${esc(nx.deadline)}</dd></dl>` : ''}
    </div></section>
    ${review}
    <div class="g2">
      <section class="xk-soft pad stack-s"><div class="sec-h"><h2>${icon('quiz')}三次考核</h2></div>${paper}</section>
      <section class="xk-soft pad"><div class="sec-h"><h2>${icon('medal')}員工成績單</h2></div>
        ${e.records.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>考核</th><th>日期</th><th class="num">分數</th><th class="num">及格</th><th>結果</th></tr></thead><tbody>${e.records.map(r => `<tr><td>${esc(r.exam)}</td><td class="nowrap">${esc(r.date)}</td><td class="num">${r.score == null ? '—' : r.score + ' 分'}</td><td class="num">${r.passScore ?? '—'}</td><td>${statusChip(r.score == null ? '待覆核' : r.passed ? '通過' : '未通過')}</td></tr>`).join('')}</tbody></table></div><p class="mini" style="margin-top:8px">未通過只標示「階段認證待補強」，不降等。</p>` : '<p class="mini">還沒有考核成績。</p>'}</section>
    </div>`;
  }

  main.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.dataset.act === 'gen') {
      const done = busy(el, 'AI 出題中…');
      try { const p = await generatePaper(id, el.dataset.type); toast(p.shortage > 0 ? `已出題，還差 ${p.shortage} 題` : '已出題'); location.href = `s-paper.html?paper=${encodeURIComponent(p.id)}`; }
      catch (err) { done(); toast(err.message, 'err'); }
    }
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
      const f = e.target, scores = {};
      let bad = null;
      $$('.rv-score', f).forEach(inp => {
        const max = +inp.dataset.max, v = inp.value.trim(), n = Number(v);
        if (v === '' || !Number.isFinite(n) || n < 0 || n > max) { fieldError(inp, `請輸入 0–${max} 的分數`); bad = bad || inp; }
        else { fieldError(inp, ''); scores[inp.dataset.qid] = n; }
      });
      if (bad) { bad.focus(); return; }
      const done = busy(f.querySelector('.xk-btn'), '送出中…');
      try {
        const r = await submitShortReview(f.dataset.attempt, {scores, comment: $('#rvComment').value.trim(), errorTypes: $$('input[name=rvType]:checked').map(x => x.value)});
        toast(`已送出覆核：最終 ${r.finalScore} 分・${r.passed ? '通過' : '未通過'}`); await L.refresh(); await draw();
      } catch (err) { done(); toast(err.message, 'err'); }
    }
  });
  await draw();
}
