/* 新人 5｜待確認清單（自己的）：追蹤送給資深的問題 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listMyPending, markRepliesSeen } from '../data.js';
import { esc, icon, chip, phead, statusChip, tbd, loading, failed, emptyState } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const L = await renderLayout({user, nav: 'qa'});
  const {main, tabs} = L;
  const replyHtml = t => (t.startsWith('【待補】') ? `${tbd('資深回覆內容')}<p class="pre muted" style="margin-top:6px">${esc(t.replace('【待補】', ''))}</p>` : `<p class="pre">${esc(t)}</p>`);
  const draw = async () => {
    loading(main);
    try {
      const list = await listMyPending();
      const head = phead('問答亭', '待確認清單', '追蹤送給資深的問題。', tabs('qa'));
      if (!list.length) { main.innerHTML = head + emptyState('目前沒有送給資深的問題。小橘查不到答案時，會自動把題目記到這裡。', {gear: 'rookie', action: '<a class="xk-btn-ghost" href="n-ask.html">回問小橘</a>'}); return; }
      const open = list.filter(p => p.status === '待處理').length;
      main.innerHTML = `${head}
        <div class="row"><span class="mini">待處理 ${open}・已回覆 ${list.length - open}</span></div>
        <div class="stack">${list.map(p => `<article class="card item">
          <div class="meta">${statusChip(p.status)}${p.isNew ? chip('alert', '新回覆', 'lantern', 'sm') : ''}<span>${esc(p.date)} 提問</span><span>${esc(p.sourceChip)}</span></div>
          <p class="disp" style="font-size:18px">${esc(p.question)}</p>
          ${p.status === '已回覆' ? `<div class="reply"><p class="lbl" style="margin-bottom:6px">${esc(p.repliedBy)}的回覆・${esc(p.repliedAt)}</p>${replyHtml(p.reply)}${p.notifiedAt ? `<p class="mini" style="margin-top:8px">${icon('chat', 'xk-icon--sm')} 已寄信通知到 ${esc(user.email)}</p>` : ''}</div>`
            : '<p class="mini">小橘查不到答案，已送給資深。回覆後會寄信通知你，也會出現在首頁。</p>'}
          <div class="row"><a class="linkbtn" href="n-ask.html">回問小橘</a></div></article>`).join('')}</div>`;
      if (list.some(p => p.isNew)) { await markRepliesSeen(); await L.refresh(); }
    } catch (e) { failed(main, e, draw); }
  };
  await draw();
}
