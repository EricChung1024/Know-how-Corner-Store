/* 新人版 SOP 與資深版 SOP 共用的畫面：章節目錄、搜尋、條目「SOP 章-條 主題」 */
import { esc, icon, statusChip, $, $$ } from './ui.js';

/**
 * @param {object} sop getPublishedSop() 的回傳
 * @param {{mode: 'newbie'|'senior', reads?: object, focus?: string}} opt
 */
export function sopBody(sop, {mode, reads = {}, focus = null}) {
  const senior = mode === 'senior';
  const toc = sop.chapters.map(c => {
    const rs = sop.rules.filter(r => r.chapter === c.no);
    const rd = rs.filter(r => reads[r.no]).length;
    const right = !rs.length ? '<span class="mini">—</span>' : senior ? `<span class="mini">${rs.length} 條</span>` : `<span class="mini">${rd}/${rs.length}</span>`;
    return `<button type="button" data-act="toch" data-ch="${esc(c.no)}"><span><span class="n">${esc(c.no)}</span>${esc(c.name)}</span>${right}</button>`;
  }).join('');
  const body = sop.chapters.map(c => {
    const rs = sop.rules.filter(r => r.chapter === c.no);
    const items = rs.map(r => {
      const isRead = !!reads[r.no];
      const chips = [r.redLine ? statusChip('紅線') : '', !senior && r.recent ? statusChip('最近更新') : '',
        senior ? `<span class="mini">生效日 ${esc(r.effective)}</span>` : isRead ? statusChip('已讀') : ''].join('');
      return `<article class="card rule ${focus === r.no ? 'focus' : ''}" id="rule-${esc(r.no)}" data-rule data-text="${esc(`${r.name} ${r.rule}`)}">
        <div class="row between"><h3>${esc(r.name)}</h3><div class="chips">${chips}</div></div>
        <p class="txt">${esc(r.rule)}</p>
        ${senior ? '' : `<div class="row between"><a class="linkbtn" href="n-ask.html?rule=${encodeURIComponent(r.no)}">${icon('chat', 'xk-icon--sm')}帶著這條問小橘</a>${isRead ? '' : `<button type="button" class="xk-btn-ghost" data-act="read" data-no="${esc(r.no)}">標為已讀</button>`}</div>`}
      </article>`;
    }).join('');
    const missing = focus && focus.split('-')[0] === c.no && !sop.rules.some(r => r.no === focus)
      ? `<div class="card rule focus" id="rule-${esc(focus)}"><h3>SOP ${esc(focus)} <span class="xk-chip xk-chip-doing tbd sm">${icon('pencil')}待補：主題</span></h3><p class="muted">這一條不在 8 條示範 SOP 裡，內容待補。</p></div>` : '';
    return `<section class="chapter" id="ch-${esc(c.no)}" data-ch><h2>${esc(c.no)}　${esc(c.name)} <small>${esc(c.desc)}</small></h2>${items}${missing}${!rs.length && !missing ? `<p class="empty-ch">本章條目不在示範資料內（完整版共 ${sop.ruleCount} 條，示範只放 ${sop.rules.length} 條）</p>` : ''}</section>`;
  }).join('');
  return `<div class="toc-layout">
    <aside class="xk-soft toc" aria-label="章節目錄"><p class="lbl" style="padding:4px 10px">章節目錄</p>${toc}</aside>
    <div class="stack">
      <div class="xk-soft pad-s row between">
        <div class="field" style="flex:1"><label for="sopQ" class="sr">搜尋 SOP</label><div class="row" style="flex-wrap:nowrap">${icon('search')}<input class="inp" id="sopQ" type="search" placeholder="搜尋條目、主題或關鍵字，例如：退款"></div></div>
        <span class="mini" id="sopHit" aria-live="polite"></span>
      </div>
      ${body}
      <p class="empty-ch" id="sopNone" hidden>找不到符合的條目，換個關鍵字試試。</p>
    </div>
  </div>`;
}

/** 搜尋與目錄跳轉。 */
export function bindSop(root) {
  const q = $('#sopQ', root);
  q.addEventListener('input', () => {
    const t = q.value.trim();
    let hit = 0;
    $$('[data-rule]', root).forEach(el => { const ok = !t || el.dataset.text.includes(t); el.hidden = !ok; if (ok) hit++; });
    $$('[data-ch]', root).forEach(sec => { sec.hidden = !!t && !sec.querySelector('[data-rule]:not([hidden])'); });
    $('#sopHit', root).textContent = t ? `找到 ${hit} 條` : '';
    $('#sopNone', root).hidden = !t || hit > 0;
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act="toch"]');
    if (b) { const t = $(`#ch-${b.dataset.ch}`, root); if (t) t.scrollIntoView({behavior: 'smooth', block: 'start'}); }
  });
}
