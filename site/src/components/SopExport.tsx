import { createPortal } from 'react-dom';
import { useToast } from '../lib/hooks';
import { Icon } from './ui';
import type { PublishedSop } from '../lib/types';

/**
 * SOP 匯出（Word、PDF），資深版與新人版共用。
 * 匯出的文件（標題、檔名、內文）不寫「資深」也不寫「新人版」；標題就是 SOP 本身的名稱，檔名「客服SOP」。
 *  - 兩邊都不印版本、發布日期、條數（匯出的都是最新版）。
 *  - 新人頁匯出：不印確認人與生效日（後端本來就不給新人這兩項）。
 *  - 資深頁匯出：另外印確認人與每條規則的生效日。
 */
type Mode = 'newbie' | 'senior';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const FILE_BASE = '客服SOP';
const docTitle = (sop: PublishedSop) => sop.title;

/** 文件開頭的說明列。匯出的都是最新版，所以不印版本、發布日期、條數；只有資深頁匯出會印確認人，新人頁匯出沒有這一列。 */
function metaLine(sop: PublishedSop, m: Mode): string | null {
  return m === 'senior' ? `確認人 ${sop.confirmedBy}` : null;
}

/** 匯出 Word：產生 Word 可以直接開的 .doc（HTML 格式），不用外部函式庫；檔名與內容不寫時間。 */
function exportWord(sop: PublishedSop, m: Mode) {
  const body = sop.chapters.map(c => {
    const rs = sop.rules.filter(r => r.chapter === c.no);
    if (!rs.length) return '';
    return `<h2>${esc(c.no)} ${esc(c.name)}</h2>${rs.map(r =>
      `<h3>${esc(r.name)}${r.redLine ? '（紅線）' : ''}</h3><p>${esc(r.rule)}</p>${m === 'senior' ? `<p style="color:gray">生效日 ${esc(r.effective)}</p>` : ''}`).join('')}`;
  }).join('');
  const note = metaLine(sop, m);
  const head = note ? `<p>${esc(note)}</p>` : '';
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(docTitle(sop))}</title></head><body style="font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif"><h1>${esc(docTitle(sop))}</h1>${head}${body}</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${FILE_BASE}.doc`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 匯出 PDF：用瀏覽器的列印功能（選「另存為 PDF」），文字是真的文字、中文用電腦自己的字型，不用外部套件。
 *  列印時只顯示 PrintDoc 那份完整版面（不受畫面上搜尋篩選影響），其餘畫面由 react.css 的 @media print 隱藏。 */
function printPdf(m: Mode) {
  const old = document.title;
  document.title = FILE_BASE; // 瀏覽器用網頁標題當預設檔名
  const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
}

/** 列印／另存 PDF 用的完整版面，平常是隱藏的（見 react.css）。 */
export function SopPrintDoc({ sop, mode }: { sop: PublishedSop; mode: Mode }) {
  return createPortal(
    <div className="print-doc" lang="zh-Hant">
      <h1>{docTitle(sop)}</h1>
      {metaLine(sop, mode) ? <p className="print-meta">{metaLine(sop, mode)}</p> : null}
      {sop.chapters.map(c => {
        const rs = sop.rules.filter(r => r.chapter === c.no);
        if (!rs.length) return null;
        return (
          <section key={c.no}>
            <h2>{c.no}　{c.name}</h2>
            {rs.map(r => (
              <article key={r.no} className="print-rule">
                <h3>{r.name}{r.redLine ? <span className="print-red">【紅線】</span> : null}</h3>
                <p>{r.rule}</p>
                {mode === 'senior' ? <p className="print-meta">生效日 {r.effective}</p> : null}
              </article>
            ))}
          </section>
        );
      })}
    </div>,
    document.body,
  );
}

/** 「匯出 Word」「匯出 PDF」兩顆按鈕。 */
export function SopExportButtons({ sop, mode }: { sop: PublishedSop; mode: Mode }) {
  const toast = useToast();
  return (
    <span className="row">
      <button type="button" className="xk-btn-ghost" onClick={() => { exportWord(sop, mode); toast('已匯出 Word 檔'); }}><Icon name="book" small />匯出 Word</button>
      <button type="button" className="xk-btn" title="在列印視窗的「目的地」選「另存為 PDF」"
        onClick={() => { toast('在列印視窗的「目的地」選「另存為 PDF」'); setTimeout(() => printPdf(mode), 400); }}><Icon name="book" small />匯出 PDF</button>
    </span>
  );
}
