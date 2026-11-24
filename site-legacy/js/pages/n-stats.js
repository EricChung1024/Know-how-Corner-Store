/* 新人 6｜我的統計：看自己的提問習慣 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getMyQaStats } from '../data.js';
import { esc, icon, phead, bar, loading, failed, emptyState } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'qa'});
  const draw = async () => {
    loading(main);
    try {
      const s = await getMyQaStats();
      const head = phead('問答亭', '我的統計', '看自己的提問習慣。', tabs('qa'));
      if (!s.total) { main.innerHTML = head + emptyState('問過問題後，這裡會整理你最常問哪一章。', {gear: 'rookie', action: '<a class="xk-btn" href="n-ask.html">前往問小橘 ›</a>'}); return; }
      const top = s.chapters[0], fb = s.helpful + s.notHelpful + s.noFeedback, max = top ? top.count : 1;
      main.innerHTML = `${head}
      <div class="g3">
        <section class="xk-soft pad tile"><span class="t">${icon('chat')}提問數</span><span class="big">${s.total}<small>題</small></span><span class="mini">其中 ${s.sentToSenior} 題送給資深確認</span></section>
        <section class="xk-soft pad tile"><span class="t">${icon('book')}問最多的章節</span>${top ? `<span class="disp" style="font-size:24px">第 ${esc(top.no)} 章 ${esc(top.name)}</span><span class="mini">${top.count} 題</span><a class="linkbtn" href="n-sop.html?ch=${encodeURIComponent(top.no)}">去讀這一章 ›</a>` : '<span class="mini">問過的題目都不在 SOP 範圍</span>'}</section>
        <section class="xk-soft pad tile"><span class="t">${icon('pencil')}回饋比例</span><span class="big">${fb ? Math.round(s.helpful / fb * 100) : 0}<small>% 有幫助</small></span><span class="mini">有幫助 ${s.helpful}・沒幫助 ${s.notHelpful}・還沒回饋 ${s.noFeedback}</span></section>
      </div>
      ${s.chapters.length ? `<section class="xk-panel pad"><div class="sec-h"><h2>各章節提問數</h2><span class="mini">點章節名稱可以回到新人版 SOP</span></div>
        <div class="bars">${s.chapters.map(c => `<div class="barrow"><span class="lab"><a class="linkbtn" style="font-size:15px" href="n-sop.html?ch=${encodeURIComponent(c.no)}">第 ${esc(c.no)} 章 ${esc(c.name)}</a></span>${bar(c.count / max * 100, `${c.count} 題`)}<span class="v">${c.count}</span></div>`).join('')}</div></section>` : ''}`;
    } catch (e) { failed(main, e, draw); }
  };
  await draw();
}
