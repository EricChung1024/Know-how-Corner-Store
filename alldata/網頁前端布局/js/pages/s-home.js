/* 資深 1｜資深首頁：一進來就看到待辦 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getSeniorTodos } from '../data.js';
import { esc, icon, chip, say, phead, statusChip, demoTag, loading, failed } from '../ui.js';

const user = requireRole('senior');
if (user) {
  const {main} = await renderLayout({user, nav: 'home'});
  const draw = async () => {
    loading(main);
    try {
      const t = await getSeniorTodos();
      const total = t.pendingQuestions + t.pendingReviews + t.pendingPapers;
      const reviewHref = t.firstReviewEmployee ? `s-employee.html?id=${encodeURIComponent(t.firstReviewEmployee)}` : 's-employees.html';
      const paperHref = t.firstDraftPaper ? `s-paper.html?paper=${encodeURIComponent(t.firstDraftPaper)}` : 's-paper.html';
      let ns;
      if (t.pendingQuestions) ns = {t: `有 ${t.pendingQuestions} 題新人問小橘查不到，先回覆這些，喵。`, l: '回覆待確認問題 ›', h: 's-pending.html', e: 'hint'};
      else if (t.pendingReviews) ns = {t: `有 ${t.pendingReviews} 份考卷的簡答等你覆核。`, l: '覆核簡答 ›', h: reviewHref, e: 'hint'};
      else if (t.pendingPapers) ns = {t: 'AI 產生的考卷等你審核，確認後鎖定，新人才能作答。', l: '審核考卷 ›', h: paperHref, e: 'hint'};
      else if (!t.sop) ns = {t: '還沒有任何版本的 SOP。先完成 SOP 統整四步驟，產生就會發布給新人。', l: '開始 SOP 統整 ›', h: 's-flow.html', e: 'default'};
      else ns = {t: '待辦都處理完了，辛苦了，喵。', l: '看問答統計 ›', h: 's-stats.html', e: 'happy'};
      const tile = (n, label, sub, href, ic) => `<a class="card tile" href="${href}"><span class="t">${icon(ic)}${label}</span><span class="big">${n}<small>件</small></span><span class="mini">${sub}</span></a>`;
      main.innerHTML = `
      ${phead('資深首頁', `${esc(user.name.slice(1))}，今天有 ${total} 件待辦`)}
      <section class="xk-panel pad stack">
        <div class="row between">${say(esc(ns.t), {expr: ns.e, gear: 'senior'})}<a class="xk-btn" href="${ns.h}">${ns.l}</a></div>
        <div class="g3">${tile(t.pendingQuestions, '待回覆問題', '小橘查不到、寫入待確認清單的問題', 's-pending.html', 'chat')}${tile(t.pendingReviews, '待覆核簡答', '新人交卷後的簡答題', reviewHref, 'headset')}${tile(t.pendingPapers, '待審考卷', 'AI 產生、還沒鎖定的考卷', paperHref, 'quiz')}</div>
      </section>
      <div class="side">
        <section class="xk-soft pad"><div class="sec-h"><h2>${icon('clock')}考核期限快到的新人</h2>${demoTag()}</div>
          ${t.deadlines.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>新人</th><th>考核</th><th>期限</th><th class="num">剩下</th></tr></thead><tbody>
          ${t.deadlines.map(d => `<tr><td><a class="linkbtn" href="s-employee.html?id=${encodeURIComponent(d.id)}">${esc(d.name)}</a></td><td>${esc(d.exam)}</td><td class="nowrap">${esc(d.deadline)}</td><td class="num">${d.daysLeft <= 14 ? chip('alert', `${d.daysLeft} 天`, 'lantern', 'sm') : `${d.daysLeft} 天`}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="mini">目前沒有設定到職日的新人。</p>'}</section>
        <section class="xk-soft pad stack-s"><div class="sec-h"><h2>${icon('book')}SOP</h2></div>
          ${t.sop ? `<dl class="kv"><dt>最近發布日</dt><dd class="disp" style="font-size:20px">${esc(t.sop.publishedAt)}</dd><dt>版本</dt><dd>${esc(t.sop.version)}</dd><dt>確認人</dt><dd>${esc(t.sop.confirmedBy)}</dd></dl><a class="linkbtn" href="s-sop.html">看資深版 SOP ›</a>`
            : `<dl class="kv"><dt>最近發布日</dt><dd>${statusChip('尚未開放').replace('尚未開放', '尚未發布')}</dd></dl><a class="linkbtn" href="s-flow.html">前往 SOP 統整 ›</a>`}
        </section>
      </div>`;
    } catch (e) { failed(main, e, draw); }
  };
  await draw();
}
