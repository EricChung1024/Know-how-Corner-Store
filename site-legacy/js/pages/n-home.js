/* 新人 1｜新人首頁：一進來就知道今天要做什麼 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getNewbieHome, askXiaoju, listSuggestedQuestions } from '../data.js';
import { $, esc, icon, chip, say, bar, phead, demoTag, md, loading, failed, requireFields, busy, toast, statusChip, dayText, days } from '../ui.js';

const user = requireRole('newbie');
if (user) {
  const {main} = await renderLayout({user, nav: 'home'});
  const draw = async () => {
    loading(main);
    try {
      const [h, sugg] = await Promise.all([getNewbieHome(), listSuggestedQuestions()]);
      main.innerHTML = view(h, sugg);
      bind();
    } catch (e) { failed(main, e, draw); }
  };
  await draw();

  function nextStep(h) {
    if (h.replies.unseen.length) return {expr: 'hint', text: `${h.replies.unseen[0].repliedBy}回覆了你的問題，先去看看，喵。`, label: '看資深的回覆 ›', href: 'n-pending.html'};
    const x = h.exam;
    if (x && x.attemptId && x.attemptStatus === 'reviewed' && !x.resultSeen) return {expr: 'happy', text: `${x.name}的成績出來了。`, label: '看成績 ›', href: `n-result.html?attempt=${encodeURIComponent(x.attemptId)}`};
    if (x && x.status === '可作答') return {expr: 'hint', text: `${x.name}可以作答了，考核日 ${x.dueDate}。`, label: x.attemptStatus === 'doing' ? '繼續作答 ›' : '開始作答 ›', href: `n-taking.html?stage=${encodeURIComponent(x.type)}`};
    if (h.wrongOpen) return {expr: 'hint', text: `錯題區還有 ${h.wrongOpen} 題，連續答對 2 次就算掌握。`, label: '去錯題區重練 ›', href: 'n-wrong.html'};
    if (h.sop.published && h.sop.firstUnread) return {expr: 'default', text: `${h.sop.updated ? '資深剛發布新版 SOP。' : ''}還有 ${h.sop.shown - h.sop.read} 條 SOP 沒讀，先讀「${h.sop.firstUnread.name}」。`, label: '繼續讀 SOP ›', href: `n-sop.html?rule=${encodeURIComponent(h.sop.firstUnread.no)}`};
    if (!h.sop.published) return {expr: 'default', text: '資深還在統整 SOP，發布後我會提醒你；有問題先問我，喵。', label: '問小橘 ›', href: 'n-ask.html'};
    return {expr: 'happy', text: '今天的進度都完成了，有問題隨時問我，喵。', label: '問小橘 ›', href: 'n-ask.html'};
  }

  function view(h, sugg) {
    const ns = nextStep(h);
    if (!h.hireDate) {
      return `${phead('新人首頁', `${esc(user.name.slice(1))}，歡迎來到經驗柑仔店`)}
      <section class="xk-panel pad stack">${say(esc(ns.text), {expr: ns.expr, gear: 'rookie', size: ''})}<div><a class="xk-btn" href="${ns.href}">${ns.label}</a></div><p class="mini">還沒有設定到職日，請資深在「員工詳情」設定後，這裡會顯示到職天數和考核期限。</p></section>`;
    }
    // 到職進度路：起點到職日，終點最後一次考核；每次考核依天數放在路上
    const last = h.stages[h.stages.length - 1];
    const span = Math.max(1, days(h.hireDate, last.dueDate));
    const pct = d => Math.max(0, Math.min(100, days(h.hireDate, d) / span * 100));
    const todayPct = pct(h.today);
    const x = h.exam, ex = x.status;
    const exNote = ex === '尚未開放' ? '資深出題並鎖定考卷後就能作答' : ex === '可作答' ? '考卷已鎖定，可以開始作答'
      : x.finalScore != null ? `成績 ${x.finalScore} 分・${x.passed ? '通過' : '未通過'}` : '簡答待資深覆核';
    const ur = h.replies.unseen;
    return `
    ${phead('新人首頁', `${esc(user.name.slice(1))}，今天這樣做就好`, '', demoTag('到職天數為示範資料'))}
    <section class="xk-panel pad" aria-label="今天的下一步">
      <div class="hero">
        <div class="next">${say(esc(ns.text), {expr: ns.expr, gear: 'rookie', size: ''})}<div><a class="xk-btn" href="${ns.href}">${ns.label}</a></div></div>
        <div class="daybox"><span class="lbl">到職第</span><span class="big">${h.dayNo}<small>天</small></span><span class="mini">到職日 ${esc(h.hireDate)}</span></div>
      </div>
      <div class="road flat split" style="margin-top:8px" role="img" aria-label="到職進度：今天是到職第 ${h.dayNo} 天；${h.stages.map(s => `${esc(s.name)} ${esc(s.dueDate)}`).join('、')}">
        <div class="road-bar xk-pat-road"></div>
        <div class="road-fill" style="width:${todayPct}%"></div>
        <div class="stop done" style="left:0"><span class="dot"></span><b>到職</b><small>${md(h.hireDate)}</small></div>
        <div class="stop now up" style="left:${todayPct}%"><span class="dot"></span><b>今天・第 ${h.dayNo} 天</b></div>
        ${h.stages.map(s => `<div class="stop ${s.status === '已完成' ? 'done' : ''}" style="left:${pct(s.dueDate)}%"><span class="dot"></span><b>滿 ${s.months} 個月</b><small>${esc(s.name)}・${md(s.dueDate)}${s.status === '已完成' ? ' ✓' : ''}</small></div>`).join('')}
      </div>
    </section>
    <div class="g3">
      <a class="xk-soft pad tile" href="n-sop.html">
        <span class="t">${icon('book')}SOP 閱讀進度</span>
        ${h.sop.published ? `<span><span class="big">${h.sop.read}</span><span class="disp"> / ${h.sop.shown} 條</span></span>${bar(h.sop.read / h.sop.shown * 100, `已讀 ${h.sop.read} / ${h.sop.shown} 條`)}${h.sop.shown < h.sop.ruleCount ? `<span class="mini">目前顯示 ${h.sop.shown} 條，完整版共 ${h.sop.ruleCount} 條</span>` : ''}${h.sop.updated ? statusChip('最近更新').replace('最近更新', 'SOP 剛更新') : ''}`
          : `${chip('return', '等資深發布', 'clock', 'sm')}<span class="mini">資深完成 SOP 統整後，這裡會顯示你的閱讀進度。</span>`}
      </a>
      <a class="xk-soft pad tile" href="n-exam.html">
        <span class="t">${icon('quiz')}下一次考核</span>
        <span class="row"><span class="disp" style="font-size:22px">${esc(x.name)}</span>${statusChip(ex)}</span>
        <span>考核日 <b class="nowrap">${esc(x.dueDate)}</b>（滿 ${x.months} 個月），${dayText(x.daysLeft)}</span>
        <span class="mini">${esc(exNote)}</span>
      </a>
      <a class="xk-soft pad tile" href="n-pending.html">
        <span class="t">${icon('chat')}資深新回覆 ${ur.length ? `<span class="cnt">${ur.length}</span>` : ''}</span>
        ${ur.length ? `<span class="row">${statusChip('已回覆')}<span class="mini">${esc(ur[0].repliedBy)}・${md(ur[0].repliedAt)}</span></span><span class="clamp2">${esc(ur[0].question)}</span>`
          : `<span>目前沒有新回覆</span><span class="mini">${h.replies.waiting ? `你有 ${h.replies.waiting} 題正在等資深回覆` : '小橘查不到的問題，會送到這裡等資深回覆'}</span>`}
      </a>
    </div>
    <section class="xk-soft pad" aria-labelledby="qkT">
      <form class="quick" id="quickAsk" novalidate>
        <h2 id="qkT" class="row" style="font-size:22px">${icon('chat')}問小橘</h2>
        <label class="sr" for="qkIn">輸入你的問題</label>
        <input class="inp" id="qkIn" name="q" placeholder="客人問的、SOP 看不懂的，直接問">
        <button class="xk-btn-ghost" type="submit">送出問題</button>
      </form>
      <div class="chips" style="margin-top:14px"><span class="mini">常見問題：</span>${sugg.slice(0, 3).map(s => `<button type="button" class="xk-chip xk-chip-return" style="cursor:pointer" data-q="${esc(s.question)}">${esc(s.question.length > 22 ? s.question.slice(0, 22) + '…' : s.question)}</button>`).join('')}</div>
    </section>`;
  }

  function bind() {
    const form = $('#quickAsk');
    if (!form) return;
    const send = async (q, button) => {
      const done = busy(button, '送出中…');
      try { await askXiaoju(q); location.href = 'n-ask.html'; } catch (e) { done(); toast(e.message, 'err'); }
    };
    form.addEventListener('submit', e => { e.preventDefault(); const inp = $('#qkIn'); if (requireFields([[inp, '問題']])) return; send(inp.value.trim(), form.querySelector('button')); });
    main.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => send(b.dataset.q, b)));
  }
}
