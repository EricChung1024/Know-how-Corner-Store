/* 資深 4｜待確認清單：回覆。回答小橘查不到的問題，送出後顯示「已寄信通知」 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listPending, replyPending } from '../data.js';
import { USE_MOCK } from '../config.js';
import { $, esc, chip, phead, labelChip, statusChip, tbd, loading, failed, emptyState, delegate, toast, busy, modal, fieldError } from '../ui.js';

const DEMO_REPLY = '【待補】正式回覆請林佩珊提供（示範資料沒有這題的答案）。';
const user = requireRole('senior');
if (user) {
  const L = await renderLayout({user, nav: 'qa'});
  const {main, tabs} = L;
  let filter = '待處理', sel = null, list = [], first = true;
  const replyHtml = t => (t.startsWith('【待補】') ? `${tbd('資深回覆內容')}<p class="pre muted" style="margin-top:6px">${esc(t.replace('【待補】', ''))}</p>` : `<p class="pre">${esc(t)}</p>`);

  const draw = async () => {
    if (first) loading(main);
    try {
      const [shown, open] = await Promise.all([listPending(filter), listPending('待處理')]);
      list = shown; first = false;
      if (!sel || !list.find(p => p.id === sel)) sel = list[0] ? list[0].id : null;
      const keep = $('#replyIn') ? $('#replyIn').value : '';
      main.innerHTML = view(open.length);
      if ($('#replyIn') && keep) $('#replyIn').value = keep;
    } catch (e) { failed(main, e, draw); }
  };

  function view(openCount) {
    const segs = ['待處理', '已回覆', '全部'].map(x => `<button type="button" class="xk-seg" data-act="filter" data-f="${x}" aria-pressed="${filter === x}">${x}${x === '待處理' && openCount ? ` <span class="cnt">${openCount}</span>` : ''}</button>`).join('');
    const items = list.map(p => `<button type="button" class="card item" data-act="sel" data-id="${esc(p.id)}" aria-pressed="${p.id === sel}"><div class="meta">${statusChip(p.status)}<span>${esc(p.askerName)}</span><span>${esc(p.date)}</span></div><span class="clamp2">${esc(p.question)}</span></button>`).join('');
    const p = list.find(x => x.id === sel);
    const detail = !p ? emptyState(filter === '待處理' ? '目前沒有待回覆的問題。新人問小橘查不到答案時，題目會出現在這裡。' : '這個分類沒有問題。', {expr: 'happy', gear: 'senior'})
      : `<section class="xk-panel pad stack" aria-labelledby="rdT">
        <div class="row between"><h2 id="rdT" style="font-size:22px">${esc(p.askerName)}・${esc(p.date)} 提問</h2>${statusChip(p.status, false)}</div>
        <div class="quote"><p class="disp" style="font-size:18px">${esc(p.question)}</p></div>
        <div class="stack-s"><p class="lbl">小橘的判斷</p><div class="chips">${labelChip(p.outcome)}<span class="src">${esc(p.sourceChip)}</span></div><p class="mini pre">小橘回給新人：${esc(p.aiReply)}</p></div>
        <hr class="line">
        ${p.status === '已回覆'
          ? `<div class="reply"><p class="lbl" style="margin-bottom:6px">${esc(p.repliedBy)}的回覆・${esc(p.repliedAt)}</p>${replyHtml(p.reply)}</div><div class="row">${p.notifiedAt ? chip('done', `已寄信通知 ${p.askerName}`, 'stamp') : chip('alert', '還沒寄信通知', 'lantern')}</div>`
          : `<form id="replyForm" class="stack-s" novalidate><div class="field"><label for="replyIn">回覆給 ${esc(p.askerName)}</label><textarea class="inp xk-pat-notebook" id="replyIn" rows="5" placeholder="寫下正確做法；送出後會寄信通知新人"></textarea></div>
            <div class="row between">${USE_MOCK ? '<button type="button" class="xk-btn-ghost" data-act="demo">帶入示範回覆</button>' : '<span></span>'}<button class="xk-btn" type="submit">送出回覆並寄信通知 ›</button></div>
            ${USE_MOCK ? '<p class="hint">示範資料沒有這題的正式答案，「帶入示範回覆」只會放入待補標記。</p>' : ''}</form>`}
      </section>`;
    return `
    ${phead('問答管理', '待確認清單：回覆', '回答小橘查不到的問題，送出後會寄信通知提問的新人。', tabs('sqa'))}
    <div class="side-l">
      <aside class="stack-s"><div class="xk-segs" role="group" aria-label="篩選狀態">${segs}</div>${items || '<p class="mini" style="padding:8px">這個分類沒有問題。</p>'}</aside>
      ${detail}
    </div>`;
  }

  delegate(main, {
    filter: el => { filter = el.dataset.f; sel = null; draw(); },
    sel: el => { sel = el.dataset.id; draw(); },
    demo: () => { const t = $('#replyIn'); t.value = DEMO_REPLY; fieldError(t, ''); },
  });
  main.addEventListener('submit', async e => {
    if (e.target.id !== 'replyForm') return;
    e.preventDefault();
    const t = $('#replyIn');
    if (!t.value.trim()) { fieldError(t, '請輸入回覆內容'); t.focus(); return; }
    const done = busy(e.target.querySelector('.xk-btn'), '送出中…');
    try {
      const {mail} = await replyPending(sel, t.value.trim());
      t.value = ''; filter = '全部';
      await L.refresh(); await draw();
      toast('已送出回覆');
      await modal({title: mail.sent ? '已寄信通知新人' : '已通知新人', body: `<div class="mail"><dl class="kv"><dt>收件人</dt><dd>${esc(mail.toName)}（${esc(mail.to)}）</dd><dt>主旨</dt><dd>${esc(mail.subject)}</dd></dl><hr class="line"><p>你在 ${esc(mail.askedAt)} 問小橘的問題已經有回覆了：</p><div class="quote">${esc(mail.question)}</div><p>請到「經驗柑仔店 › 問答亭 › 待確認清單」查看回覆。</p></div>${mail.sent ? '' : '<p class="mini">目前還沒設定寄信服務，不會寄出 Email；新人登入後，首頁會出現這則回覆的提醒。</p>'}`,
        actions: [{label: '知道了', value: true, primary: true}]});
    } catch (ex) { done(); toast(ex.message, 'err'); }
  });
  await draw();
}
