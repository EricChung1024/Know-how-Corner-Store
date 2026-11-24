/* 新人 10｜考核紀錄：看歷次成績 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listMyRecords, listMyExams, getExamSettings } from '../data.js';
import { esc, phead, statusChip, demoTag, loading, failed, emptyState } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'exam'});
  const draw = async () => {
    loading(main);
    try {
      const [rec, exams, set] = await Promise.all([listMyRecords(), listMyExams(), getExamSettings()]);
      const head = phead('考核', '考核紀錄', '看歷次考核的成績。', tabs('exam'));
      const upcoming = exams.filter(x => !rec.some(r => r.exam === x.name) && x.deadline);
      if (!rec.length && !upcoming.length) { main.innerHTML = head + emptyState('還沒有考核紀錄。', {gear: 'rookie'}); return; }
      main.innerHTML = `${head}
      <div class="scroll"><table class="tbl"><thead><tr><th>考核</th><th>日期</th><th class="num">分數</th><th>是否通過</th><th><span class="sr">動作</span></th></tr></thead><tbody>
      ${rec.map(r => `<tr><td class="disp">${esc(r.exam)}</td><td class="nowrap">${esc(r.date)}</td><td class="num">${r.score == null ? '—' : r.score + ' 分'}</td><td>${statusChip(r.score == null ? '待資深覆核' : r.passed ? '通過' : '未通過')}</td><td>${r.attemptId ? `<a class="linkbtn" href="n-result.html?attempt=${encodeURIComponent(r.attemptId)}">看成績</a>` : ''}</td></tr>`).join('')}
      ${upcoming.map(x => `<tr><td class="disp">${esc(x.name)}</td><td class="nowrap muted">期限 ${esc(x.deadline)}</td><td class="num muted">—</td><td>${statusChip(x.status === '可作答' ? '可作答' : '尚未舉行')}</td><td></td></tr>`).join('')}
      </tbody></table></div>
      <p class="mini">及格 ${set.passScore} 分 ${demoTag()}</p>`;
    } catch (e) { failed(main, e, draw); }
  };
  await draw();
}
