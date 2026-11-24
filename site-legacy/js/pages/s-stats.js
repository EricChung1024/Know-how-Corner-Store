/* 資深 5｜問答統計：看新人卡在哪裡 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getQaStats } from '../data.js';
import { esc, icon, phead, bar, labelChip, LABELS, demoTag, loading, failed, emptyState } from '../ui.js';

const user = requireRole('senior');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'qa'});
  const draw = async () => {
    loading(main);
    try {
      const s = await getQaStats();
      const head = phead('問答管理', '問答統計', '看新人卡在哪裡，決定下一次統整要補什麼。', tabs('sqa'));
      if (!s.total) { main.innerHTML = head + emptyState('還沒有新人提問。', {gear: 'senior'}); return; }
      const top = s.chapters.slice(0, 5), mx = arr => Math.max(1, ...arr.map(x => x.count));
      const outcomes = LABELS.map(l => ({outcome: l, count: (s.outcomes.find(o => o.outcome === l) || {count: 0}).count}));
      main.innerHTML = `${head}
      <div class="g4">
        <div class="card tile"><span class="t">${icon('chat')}提問量</span><span class="big">${s.total}<small>題</small></span><span class="mini">所有新人累計 ${s.demo ? demoTag() : ''}</span></div>
        <div class="card tile"><span class="t">${icon('lantern')}請問資深</span><span class="big">${s.askSenior}<small>題</small></span><span class="mini">待回覆 ${s.waiting} 題</span></div>
        <div class="card tile"><span class="t">${icon('stamp')}有幫助</span><span class="big">${s.helpful}<small>次</small></span><span class="mini">新人按「有幫助」</span></div>
        <div class="card tile"><span class="t">${icon('pencil')}沒幫助</span><span class="big">${s.notHelpful}<small>次</small></span><span class="mini">原因見下方</span></div>
      </div>
      <div class="g2">
        <section class="xk-panel pad"><div class="sec-h"><h2>最常被問的章節</h2><span class="mini">點章節回到資深版 SOP</span></div>
          <div class="bars">${top.map(c => `<div class="barrow"><span class="lab"><a class="linkbtn" style="font-size:15px" href="s-sop.html?ch=${encodeURIComponent(c.no)}">第 ${esc(c.no)} 章 ${esc(c.name)}</a></span>${bar(c.count / mx(top) * 100, `${c.count} 題`)}<span class="v">${c.count}</span></div>`).join('')}</div></section>
        <section class="xk-soft pad"><div class="sec-h"><h2>判斷結果分布</h2></div>
          <div class="bars">${outcomes.map(o => `<div class="barrow"><span class="lab">${labelChip(o.outcome)}</span>${bar(o.count / mx(outcomes) * 100, `${o.count} 題`)}<span class="v">${o.count}</span></div>`).join('')}</div></section>
      </div>
      <section class="xk-soft pad"><div class="sec-h"><h2>「沒幫助」的原因</h2>${demoTag('示範選項')}</div>
        <div class="bars">${s.noHelpReasons.map(r => `<div class="barrow"><span class="lab">${esc(r.reason)}</span>${bar(r.count / mx(s.noHelpReasons) * 100, `${r.count} 次`)}<span class="v">${r.count}</span></div>`).join('')}</div></section>
      ${s.demo ? '<p class="mini">統計數字為示範資料，加上實際操作的提問。</p>' : ''}`;
    } catch (e) { failed(main, e, draw); }
  };
  await draw();
}
