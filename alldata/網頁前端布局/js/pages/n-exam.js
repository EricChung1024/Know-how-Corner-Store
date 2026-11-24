/* 新人 7｜我的考核清單：知道哪一場考核可以考、期限到什麼時候 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listMyExams, getExamSettings } from '../data.js';
import { esc, icon, phead, statusChip, loading, failed, emptyState } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const {main, tabs, counts} = await renderLayout({user, nav: 'exam'});
  const draw = async () => {
    loading(main);
    try {
      const [exams, set] = await Promise.all([listMyExams(), getExamSettings()]);
      const head = phead('考核', '我的考核清單', '知道哪一場考核可以考、期限到什麼時候。', tabs('exam'));
      if (!exams[0].deadline) { main.innerHTML = head + emptyState('還沒有設定到職日，請資深在「員工詳情」設定後，這裡會出現考核和期限。', {gear: 'rookie'}); return; }
      const [t, h] = exams;
      const action = t.status === '可作答' ? `<a class="xk-btn" href="n-taking.html">${t.attemptStatus === 'doing' ? '繼續作答' : '開始作答'} ›</a>`
        : t.status === '已完成' ? `<a class="xk-btn" href="n-result.html?attempt=${encodeURIComponent(t.attemptId)}">看成績 ›</a>`
        : '<button class="xk-btn" type="button" disabled>開始作答 ›</button>';
      const note = t.status === '尚未開放' ? '資深審核並鎖定考卷後就能作答。'
        : t.status === '可作答' ? `考卷共 ${t.questionCount} 題（選擇 ${t.mcqCount}・簡答 ${t.questionCount - t.mcqCount}），簡答由資深覆核。`
        : t.attemptStatus === 'reviewed' ? `${t.finalScore} 分・${t.finalScore >= set.passScore ? '通過' : '未通過'}` : '選擇題已計分，簡答待資深覆核。';
      main.innerHTML = `${head}
      <section class="xk-panel pad"><div class="row between" style="align-items:flex-start">
        <div class="stack-s"><div class="row"><h2 style="font-size:26px">${esc(t.name)}</h2>${statusChip(t.status, false)}</div>
          <p>期限 <b>${esc(t.deadline)}</b>（到職 3 個月內・還有 ${t.daysLeft} 天）</p><p class="mini">${esc(note)}</p></div>
        <div>${action}</div></div></section>
      <section class="xk-soft pad"><div class="row between" style="align-items:flex-start">
        <div class="stack-s"><div class="row"><h2 style="font-size:24px">${esc(h.name)}</h2>${statusChip(h.status, false)}</div>
          <p>期限 <b>${esc(h.deadline)}</b>（試用期考核之後每 6 個月一次）</p><p class="mini">試用期考核完成後開放。</p></div>
        <button class="xk-btn-ghost" type="button" disabled>尚未開放</button></div></section>
      <div class="g2">
        <a class="xk-soft pad tile" href="n-records.html"><span class="t">${icon('medal')}考核紀錄</span><span class="mini">看歷次考核的日期、分數和是否通過。</span></a>
        <a class="xk-soft pad tile" href="n-wrong.html"><span class="t">${icon('lightbulb')}錯題區・重練 ${counts.wrong ? `<span class="cnt">${counts.wrong}</span>` : ''}</span><span class="mini">答錯的題目會收在這裡，連續答對 2 次就算掌握。</span></a>
      </div>`;
    } catch (e) { failed(main, e, draw); }
  };
  await draw();
}
