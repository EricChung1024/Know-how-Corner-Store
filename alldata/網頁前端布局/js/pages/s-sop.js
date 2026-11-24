/* 資深 3｜資深版 SOP：查閱和匯出完整規則（?ch=7 會跳到該章） */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { getPublishedSop } from '../data.js';
import { esc, icon, phead, loading, failed, emptyState, delegate, toast, query } from '../ui.js';
import { sopBody, bindSop } from '../sop-view.js';

const user = requireRole('senior');
if (user) {
  const {main} = await renderLayout({user, nav: 'sop'});
  let sop = null;
  const draw = async () => {
    loading(main);
    try {
      sop = await getPublishedSop('senior');
      if (!sop) {
        main.innerHTML = `${phead('資深版 SOP', '資深版 SOP', '完成 SOP 統整四步驟後才會產生，產生就等於發布。')}${emptyState('還沒有任何版本。先到「SOP 統整」完成四個步驟，產生後這裡就會打開，喵。', {expr: 'hint', gear: 'senior', action: '<a class="xk-btn" href="s-flow.html">前往 SOP 統整 ›</a>'})}`;
        return;
      }
      main.innerHTML = `
        ${phead('資深版 SOP', '資深版 SOP', `完整規則：${sop.ruleCount} 條，其中紅線 ${sop.redLineCount} 條（示範顯示 ${sop.rules.length} 條）`, `<button type="button" class="xk-btn" data-act="word">${icon('book', 'xk-icon--sm')}匯出 Word</button>`)}
        <p class="mini">版本 ${esc(sop.version)}・發布日期 ${esc(sop.publishedAt)}・確認人 ${esc(sop.confirmedBy)}</p>
        ${sopBody(sop, {mode: 'senior'})}`;
      bindSop(main);
      const ch = query('ch');
      if (ch) { const t = document.getElementById(`ch-${ch}`); if (t) setTimeout(() => t.scrollIntoView({block: 'start'}), 0); }
    } catch (e) { failed(main, e, draw); }
  };
  delegate(main, {word: () => { exportWord(sop); toast('已匯出 Word 檔'); }});
  await draw();
}

/** 匯出 Word：產生 Word 可以直接開的 .doc（HTML 格式），不用外部函式庫；檔名與內容不寫時間。 */
function exportWord(sop) {
  const body = sop.chapters.map(c => {
    const rs = sop.rules.filter(r => r.chapter === c.no);
    return `<h2>${esc(c.no)} ${esc(c.name)}</h2>${rs.length ? rs.map(r => `<h3>${esc(r.name)}${r.redLine ? '（紅線）' : ''}</h3><p>${esc(r.rule)}</p><p style="color:gray">生效日 ${esc(r.effective)}</p>`).join('') : '<p style="color:gray">本章條目不在示範資料內。</p>'}`;
  }).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(sop.title)}</title></head><body style="font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif"><h1>${esc(sop.title)}（資深版）</h1><p>確認人 ${esc(sop.confirmedBy)}</p>${body}</body></html>`;
  const blob = new Blob(['﻿', html], {type: 'application/msword'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '資深版SOP.doc';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
