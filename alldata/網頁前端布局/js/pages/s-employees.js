/* 資深 6｜員工總覽：掌握每位新人的狀態（?new=工號 會標示剛建立的帳號） */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listEmployees } from '../data.js';
import { esc, phead, statusChip, chip, demoTag, loading, failed, emptyState, toast, query } from '../ui.js';

const user = requireRole('senior');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'exam'});
  const hl = query('new');
  if (hl) toast('已建立帳號');
  const draw = async () => {
    loading(main);
    try {
      const list = await listEmployees();
      const head = phead('考核管理', '員工總覽', '掌握每位新人的到職日、下次考核和成績。', tabs('sexam'));
      const add = '<a class="xk-btn" href="s-new-user.html">新增員工 ›</a>';
      if (!list.length) { main.innerHTML = head + emptyState('還沒有新人帳號。', {gear: 'senior', action: add}); return; }
      main.innerHTML = `${head}
      <div class="row between"><span class="mini">標「示範資料」的是 Mockup 補的示範新人</span>${add}</div>
      <div class="scroll"><table class="tbl"><thead><tr><th>姓名</th><th>工號</th><th>身分</th><th>到職日</th><th>下次考核</th><th>考核期限</th><th class="num">最近成績</th><th>待覆核簡答</th></tr></thead><tbody>
      ${list.map(s => `<tr class="${hl && hl === s.id ? 'hl' : ''}"><td><a class="linkbtn" href="s-employee.html?id=${encodeURIComponent(s.id)}">${esc(s.name)}</a>${s.demo ? ' ' + demoTag() : ''}</td><td class="nowrap">${esc(s.employeeId)}</td>
        <td>${s.role === 'senior' ? chip('done', '資深', 'medal', 'sm') : chip('new', '新人', 'person', 'sm')}</td><td class="nowrap">${esc(s.hireDate || '—')}</td>
        <td>${esc(s.nextExam ? s.nextExam.name : '—')}</td><td class="nowrap">${esc(s.nextExam ? s.nextExam.deadline : '—')}</td>
        <td class="num">${s.latestPending ? '待覆核' : s.latestScore == null ? '—' : s.latestScore + ' 分'}</td><td>${s.hasPendingReview ? statusChip('待覆核') : '<span class="mini">沒有</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
    } catch (e) { failed(main, e, draw); }
  };
  await draw();
}
