/* 新人 3｜問小橘：隨時問 SOP 的問題（?rule=7-9 表示從新人版 SOP 帶著條目過來） */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listMyAsks, listSuggestedQuestions, askXiaoju, sendFeedback, getExamSettings } from '../data.js';
import { $, esc, icon, chip, cat, phead, labelChip, LABEL, LABELS, canFeedback, loading, failed, delegate, toast, busy, fieldError, query } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'qa'});
  const ctx = query('rule');
  let asks = [], sugg = [], reasons = [], fbOpen = null, first = true;

  const draw = async () => {
    if (first) loading(main);
    try {
      if (first) [sugg, reasons] = await Promise.all([listSuggestedQuestions(), getExamSettings().then(s => s.noHelpReasons)]);
      asks = (await listMyAsks()).slice().reverse();
      const keep = $('#askIn') ? $('#askIn').value : (ctx ? `關於「${(sugg.find(s => s.ruleNo === ctx) || {}).ruleName || 'SOP ' + ctx}」：` : '');
      main.innerHTML = view();
      $('#askIn').value = keep;
      const log = $('#chatLog'); log.scrollTop = log.scrollHeight;
      first = false;
    } catch (e) { failed(main, e, draw); }
  };

  function answer(a) {
    const [, , , expr] = LABEL[a.outcome] || [];
    let fb = '';
    if (canFeedback(a.outcome)) {
      if (a.feedback === 'up') fb = `<div class="fb">${chip('done', '已回饋：有幫助', 'stamp', 'sm')}</div>`;
      else if (a.feedback === 'down') fb = `<div class="fb">${chip('return', `已回饋：沒幫助（${a.reason}）`, 'pencil', 'sm')}</div>`;
      else if (fbOpen === a.id) fb = `<div class="fb" role="group" aria-label="沒幫助的原因"><span class="lbl">哪裡沒幫助？</span>${reasons.map(r => `<button type="button" class="xk-chip xk-chip-return" style="cursor:pointer" data-act="reason" data-id="${esc(a.id)}" data-r="${esc(r)}">${esc(r)}</button>`).join('')}<span class="xk-chip xk-chip-return demo">示範選項</span></div>`;
      else fb = `<div class="fb"><span class="lbl">這個回答有幫助嗎？</span><button type="button" class="xk-btn-ghost sm" data-act="up" data-id="${esc(a.id)}">有幫助</button><button type="button" class="xk-btn-ghost sm" data-act="down" data-id="${esc(a.id)}">沒幫助</button></div>`;
    }
    const src = a.sourceChip ? (a.ruleNo ? `<a class="linkbtn src-link" href="n-sop.html?rule=${encodeURIComponent(a.ruleNo)}" title="到新人版 SOP 看這一條">${icon('book', 'xk-icon--sm')} ${esc(a.sourceChip)}</a>` : `<p class="src">${esc(a.sourceChip)}</p>`) : '';
    const pend = a.writesPending ? `<div class="reply row">${icon('pencil')}<span>已寫入<a href="n-pending.html">待確認清單</a>，資深回覆後會寄信通知你。</span></div>` : '';
    return `<div class="xk-bubble xk-bubble-me msg-me">${esc(a.question)}</div>
      <div class="xk-cat-say msg-cat">${cat(expr || 'hint', 'rookie', '')}<div class="xk-bubble xk-bubble-cat"><div class="chips">${labelChip(a.outcome)}</div><p class="pre">${esc(a.reply)}</p>${src}${pend}${fb}</div></div>`;
  }

  function view() {
    const asked = new Set(asks.map(a => a.question));
    const order = ctx ? [...sugg.filter(s => s.ruleNo === ctx), ...sugg.filter(s => s.ruleNo !== ctx)] : sugg;
    return `
    ${phead('問答亭', '問小橘', '小橘依最新版 SOP 回答，每個答案都會標出處和判斷結果。', tabs('qa'))}
    <div class="side">
      <div class="stack">
        <section class="xk-panel chat" aria-label="和小橘的對話">
          <div class="chat-log" id="chatLog" aria-live="polite">
            <div class="xk-cat-say msg-cat">${cat('default', 'rookie', '')}<div class="xk-bubble xk-bubble-cat"><p>我是小橘。SOP 有寫的我幫你查，查不到就記下來問資深，喵。</p></div></div>
            ${asks.map(answer).join('')}
          </div>
          ${ctx ? `<div class="ctx">${chip('return', `從「${(sugg.find(s => s.ruleNo === ctx) || {}).ruleName || 'SOP ' + ctx}」帶過來`, 'book', 'sm')}<a class="linkbtn" href="n-ask.html" style="font-size:14px">取消</a></div>` : ''}
          <form class="chat-in" id="askForm" novalidate><label class="sr" for="askIn">輸入問題</label><textarea class="inp" id="askIn" name="q" rows="1" placeholder="輸入問題，按 Enter 送出"></textarea><button class="xk-btn" type="submit">送出 ›</button></form>
        </section>
        <section class="xk-soft pad-s" aria-labelledby="lgdT"><h2 id="lgdT" style="font-size:19px;margin-bottom:12px">小橘的六種判斷</h2>
          <div class="legend">${LABELS.map(l => `<div>${labelChip(l)}<p>${esc(LABEL[l][2])}</p></div>`).join('')}</div>
        </section>
      </div>
      <aside class="stack">
        <section class="xk-soft pad-s" aria-labelledby="sgT"><div class="sec-h"><h2 id="sgT" style="font-size:19px">示範問題</h2><span class="xk-chip xk-chip-return demo">取自問答案例</span></div>
          <div class="sugg">${order.map(s => `<button type="button" data-act="ask" data-q="${esc(s.question)}" class="${ctx && s.ruleNo === ctx ? 'hot' : ''}"><span class="tag">${esc(s.id)}</span><span>${esc(s.question)}${asked.has(s.question) ? ' <span class="mini">（問過）</span>' : ''}</span></button>`).join('')}</div>
          <p class="mini" style="margin-top:10px">也可以輸入和 SOP 無關的問題，看小橘怎麼標「不在 SOP 範圍」。</p>
        </section>
      </aside>
    </div>`;
  }

  async function ask(q, button) {
    const done = busy(button, '小橘查詢中…');
    try { await askXiaoju(q); $('#askIn') && ($('#askIn').value = ''); await draw(); }
    catch (e) { done(); toast(e.message, 'err'); }
  }
  const keepScroll = async () => { const y = $('#chatLog').scrollTop; await draw(); $('#chatLog').scrollTop = y; };

  delegate(main, {
    ask: el => ask(el.dataset.q, el),
    up: async el => { try { await sendFeedback(el.dataset.id, true); toast('謝謝回饋'); await keepScroll(); } catch (e) { toast(e.message, 'err'); } },
    down: async el => { fbOpen = el.dataset.id; await keepScroll(); },
    reason: async el => { try { await sendFeedback(el.dataset.id, false, el.dataset.r); fbOpen = null; toast('謝謝回饋，資深會參考原因'); await keepScroll(); } catch (e) { toast(e.message, 'err'); } },
  });
  main.addEventListener('submit', e => {
    if (e.target.id !== 'askForm') return;
    e.preventDefault();
    const inp = $('#askIn');
    if (!inp.value.trim()) { fieldError(inp, '請先輸入問題'); inp.focus(); return; }
    fieldError(inp, '');
    ask(inp.value.trim(), e.target.querySelector('button'));
  });
  main.addEventListener('keydown', e => {
    if (e.target.id === 'askIn' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); }
  });
  await draw();
}
