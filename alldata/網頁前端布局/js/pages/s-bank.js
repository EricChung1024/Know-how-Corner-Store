/* 資深 9｜題庫審核：確認題庫裡的題目合適 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listBank, setBankStatus } from '../data.js';
import { esc, icon, phead, sopRef, statusChip, loading, failed, delegate, toast, busy } from '../ui.js';

const user = requireRole('senior');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'exam'});
  let filter = '全部', first = true;
  const draw = async () => {
    if (first) loading(main);
    try {
      const b = await listBank(filter);
      first = false;
      const segs = ['全部', '待審', '已審', '停用'].map(x => `<button type="button" class="xk-seg" data-act="filter" data-f="${x}" aria-pressed="${filter === x}">${x}</button>`).join('');
      const act = (q, s, label) => `<button type="button" class="xk-btn-ghost" data-act="set" data-q="${esc(q)}" data-s="${s}">${label}</button>`;
      const rows = b.items.map(q => {
        const acts = q.inLockedPaper ? '<span class="mini">已用在鎖定的考卷</span>' : q.status === '待審' ? act(q.id, '已審', '通過') + act(q.id, '停用', '停用') : q.status === '已審' ? act(q.id, '停用', '停用') : act(q.id, '待審', '恢復待審');
        return `<tr><td class="nowrap">${esc(q.id)}</td><td class="nowrap">${q.qtype === 'mcq' ? '選擇' : '簡答'}</td><td class="q"><span class="clamp2">${esc(q.stem)}</span></td><td>${sopRef(q)}</td><td>${statusChip(q.status)}</td><td><div class="row">${acts}</div></td></tr>`;
      }).join('');
      main.innerHTML = `
      ${phead('考核管理', '題庫審核', '確認題庫裡的題目合適；只有「已審」的題目會被 AI 抽進考卷。', tabs('sexam'))}
      <div class="g4">
        <div class="card tile"><span class="t">${icon('quiz')}題庫</span><span class="big">${b.totals.total}<small>題</small></span></div>
        <div class="card tile"><span class="t">簡答</span><span class="big">${b.totals.short}<small>題</small></span></div>
        <div class="card tile"><span class="t">選擇</span><span class="big">${b.totals.mcq}<small>題</small></span></div>
        <div class="card tile"><span class="t">是非</span><span class="big">${b.totals.tf}<small>題</small></span></div>
      </div>
      <div class="row between"><div class="xk-segs" role="group" aria-label="篩選狀態">${segs}</div><span class="mini">示範資料只提供 3 題範例・不顯示正確答案</span></div>
      <div class="scroll"><table class="tbl"><thead><tr><th>編號</th><th>題型</th><th>題目</th><th>對應 SOP 條目</th><th>狀態</th><th>動作</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">這個狀態沒有題目。</td></tr>'}</tbody></table></div>
      <div class="row"><a class="linkbtn" href="s-paper.html">回考卷審核 ›</a></div>`;
    } catch (e) { failed(main, e, draw); }
  };
  delegate(main, {
    filter: el => { filter = el.dataset.f; draw(); },
    set: async el => { const done = busy(el, '…'); try { await setBankStatus(el.dataset.q, el.dataset.s); toast(`${el.dataset.q} 改為「${el.dataset.s}」`); await draw(); } catch (e) { done(); toast(e.message, 'err'); } },
  });
  await draw();
}
