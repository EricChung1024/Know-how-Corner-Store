/* 新人 2｜新人版 SOP：依章節閱讀最新規則（?rule=7-9 會跳到該條，?ch=7 會跳到該章） */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getPublishedSop, getReadMarks, getSopUpdateNotice, markSopUpdateSeen, markRuleRead } from '../data.js';
import { $, esc, icon, phead, md, loading, failed, emptyState, delegate, toast, query } from '../ui.js';
import { sopBody, bindSop } from '../sop-view.js';

const user = requireRole('newbie');
if (user) {
  const L = await renderLayout({user, nav: 'sop'});
  const {main} = L;
  const focus = query('rule');
  let first = true, notice = null;
  const draw = async () => {
    if (first) loading(main);
    try {
      const [sop, reads] = await Promise.all([getPublishedSop('newbie'), getReadMarks()]);
      if (!sop) {
        main.innerHTML = `${phead('新人版 SOP', '新人版 SOP', '依章節閱讀最新規則。')}${emptyState('資深還在統整最新版 SOP，發布後這裡就會出現，我也會在首頁提醒你。', {gear: 'rookie', action: '<a class="xk-btn-ghost" href="n-ask.html">先去問小橘</a>'})}`;
        return;
      }
      if (first) { notice = await getSopUpdateNotice(); if (notice.show) { await markSopUpdateSeen(); await L.refresh(); } }
      const rc = sop.rules.filter(r => reads[r.no]).length;
      const y = window.scrollY;
      main.innerHTML = `
        ${phead('新人版 SOP', '新人版 SOP', '依章節閱讀最新規則；紅線一定要記住。', `<span class="mini">已讀 ${rc} / ${sop.rules.length} 條</span>`)}
        ${notice && notice.show ? `<div class="banner" role="status" id="pubBanner"><span class="row">${icon('lightbulb')}<span>資深在 ${md(notice.publishedAt)} 發布了新版 SOP，<b>${notice.recentCount} 條</b>最近更新的規則已標示「最近更新」。</span></span><button type="button" class="xk-btn-ghost" data-act="closeBanner">知道了</button></div>` : ''}
        ${sopBody(sop, {mode: 'newbie', reads, focus})}`;
      bindSop(main);
      if (first) {
        const target = focus ? document.getElementById(`rule-${focus}`) : query('ch') ? document.getElementById(`ch-${query('ch')}`) : null;
        if (target) setTimeout(() => target.scrollIntoView({block: 'start'}), 0);
      } else window.scrollTo(0, y);
      first = false;
    } catch (e) { failed(main, e, draw); }
  };
  delegate(main, {
    read: async el => {
      el.disabled = true;
      try { await markRuleRead(el.dataset.no); toast(`已標為已讀：SOP ${el.dataset.no}`); await draw(); } catch (e) { el.disabled = false; toast(e.message, 'err'); }
    },
    closeBanner: () => { notice = null; const b = $('#pubBanner'); if (b) b.remove(); },
  });
  await draw();
}
