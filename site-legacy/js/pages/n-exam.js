/* 新人 7｜我的考核清單：三次考核（滿 1／3／6 個月）哪一場可以考、考核日是哪天。階段設定全部由後端提供。 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listMyExams } from '../data.js';
import { esc, icon, phead, statusChip, chip, dayText, loading, failed, emptyState } from '../ui.js';


const user = requireRole('newbie');
if (user) {
  const {main, tabs, counts} = await renderLayout({user, nav: 'exam'});
  const draw = async () => {
    loading(main);
    try {
      const exams = await listMyExams();
      const head = phead('考核', '我的考核清單', '到職滿 1、3、6 個月各有一次考核。', tabs('exam'));
      if (!exams.length || !exams[0].dueDate) { main.innerHTML = head + emptyState('還沒有設定到職日，請資深在「員工詳情」設定後，這裡會出現三次考核的日期。', {gear: 'rookie'}); return; }
      // 只有一張主要卡片：可作答的，沒有就是下一個還沒完成的
      const focus = exams.find(x => x.status === '可作答') || exams.find(x => x.status !== '已完成');
      main.innerHTML = `${head}${exams.map(x => card(x, x === focus)).join('')}
      <div class="g2">
        <a class="xk-soft pad tile" href="n-records.html"><span class="t">${icon('medal')}考核紀錄</span><span class="mini">看歷次考核的日期、分數和是否通過。</span></a>
        <a class="xk-soft pad tile" href="n-wrong.html"><span class="t">${icon('lightbulb')}錯題區・重練 ${counts.wrong ? `<span class="cnt">${counts.wrong}</span>` : ''}</span><span class="mini">答錯的題目會收在這裡，連續答對 2 次就算掌握。</span></a>
      </div>`;
    } catch (e) { failed(main, e, draw); }
  };

  function card(x, main_) {
    const btn = main_ ? 'xk-btn' : 'xk-btn-ghost';
    const action = x.status === '可作答' ? `<a class="${btn}" href="n-taking.html?stage=${encodeURIComponent(x.type)}">${x.attemptStatus === 'doing' ? '繼續作答' : '開始作答'} ›</a>`
      : x.status === '已完成' && x.attemptId ? `<a class="xk-btn-ghost" href="n-result.html?attempt=${encodeURIComponent(x.attemptId)}">看成績 ›</a>`
      : x.status === '已完成' ? ''
      : `<button class="${btn}" type="button" disabled>開始作答 ›</button>`;
    const note = x.status === '尚未開放' ? '資深出題、審核並鎖定考卷後就能作答。'
      : x.status === '可作答' ? `考卷共 ${x.questionCount} 題（選擇 ${x.mcqCount}・簡答 ${x.questionCount - x.mcqCount}）${x.questionCount > x.mcqCount ? '，簡答由資深覆核' : ''}。`
      : x.finalScore != null ? `${x.finalScore} 分・${x.passed ? '通過' : '未通過（階段認證待補強）'}` : '選擇題已計分，簡答待資深覆核。';
    return `<section class="${main_ ? 'xk-panel' : 'xk-soft'} pad"><div class="row between" style="align-items:flex-start">
      <div class="stack-s">
        <div class="row"><h2 style="font-size:${main_ ? 26 : 22}px">${esc(x.name)}</h2>${statusChip(x.status, false)}${chip('return', x.levelName, 'quiz', 'sm')}</div>
        <p>考核日 <b>${esc(x.dueDate)}</b>（到職滿 ${x.months} 個月・${x.status === '已完成' ? '已完成' : dayText(x.daysLeft)}）</p>
        <p class="mini">及格 ${x.passScore} 分・考 ${esc(x.focus)}</p>
        <p class="mini">${esc(note)}</p></div>
      <div>${action}</div></div></section>`;
  }
  await draw();
}
