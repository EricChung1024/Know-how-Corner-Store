/* 新人 4｜我的提問紀錄：回頭看自己問過什麼 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listMyAsks } from '../data.js';
import { esc, icon, chip, cat, phead, labelChip, LABEL, LABELS, canFeedback, loading, failed, emptyState, delegate, modal } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'qa'});
  let asks = [];
  const fbText = a => {
    if (!canFeedback(a.outcome)) return '<span class="mini">不需回饋</span>';
    if (a.feedback === 'up') return chip('done', '有幫助', 'stamp', 'sm');
    if (a.feedback === 'down') return chip('return', `沒幫助・${a.reason}`, 'pencil', 'sm');
    return '<span class="mini">還沒回饋</span>';
  };
  const draw = async () => {
    loading(main);
    try {
      asks = await listMyAsks();
      const head = phead('問答亭', '我的提問紀錄', '回頭看自己問過什麼，以及小橘當時怎麼判斷。', tabs('qa'));
      if (!asks.length) { main.innerHTML = head + emptyState('你還沒問過問題。到「問小橘」問第一題吧，喵。', {gear: 'rookie', action: '<a class="xk-btn" href="n-ask.html">前往問小橘 ›</a>'}); return; }
      main.innerHTML = `${head}
        <div class="row between"><span class="mini">共 ${asks.length} 筆</span><div class="chips">${LABELS.filter(l => asks.some(a => a.outcome === l)).map(l => labelChip(l)).join('')}</div></div>
        <div class="scroll"><table class="tbl"><thead><tr><th>日期</th><th>問題</th><th>判斷結果</th><th>回饋</th><th><span class="sr">動作</span></th></tr></thead><tbody>
        ${asks.map(a => `<tr><td class="nowrap">${esc(a.createdAt)}</td><td class="q">${esc(a.question)}</td><td>${labelChip(a.outcome)}</td><td>${fbText(a)}</td><td><button type="button" class="xk-btn-ghost" data-act="open" data-id="${esc(a.id)}">看對話</button></td></tr>`).join('')}
        </tbody></table></div>`;
    } catch (e) { failed(main, e, draw); }
  };
  delegate(main, {
    open: async el => {
      const a = asks.find(x => x.id === el.dataset.id);
      const [, , , expr] = LABEL[a.outcome] || [];
      const go = await modal({title: `${esc(a.createdAt)} 的對話`, body: `<div class="stack-s"><div class="xk-bubble xk-bubble-me msg-me">${esc(a.question)}</div>
        <div class="xk-cat-say msg-cat">${cat(expr || 'hint', 'rookie', '')}<div class="xk-bubble xk-bubble-cat"><div class="chips">${labelChip(a.outcome)}</div><p class="pre">${esc(a.reply)}</p>${a.sourceChip ? `<p class="src">${icon('book', 'xk-icon--sm')} ${esc(a.sourceChip)}</p>` : ''}</div></div>
        <p class="mini">回饋：${fbText(a).replace(/<[^>]+>/g, '')}</p></div>`,
        actions: [{label: '關閉', value: null}, {label: '回問小橘 ›', value: 'ask', primary: true}]});
      if (go === 'ask') location.href = 'n-ask.html';
    },
  });
  await draw();
}
