import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useToast } from '../../lib/hooks';
import { Async, Empty, Icon, PageHead } from '../../components/ui';
import { Layout } from '../../components/Layout';
import { SopView } from '../../components/SopView';
import type { PublishedSop } from '../../lib/types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** 匯出 Word：產生 Word 可以直接開的 .doc（HTML 格式），不用外部函式庫；檔名與內容不寫時間。 */
function exportWord(sop: PublishedSop) {
  const body = sop.chapters.map(c => {
    const rs = sop.rules.filter(r => r.chapter === c.no);
    return `<h2>${esc(c.no)} ${esc(c.name)}</h2>${rs.map(r => `<h3>${esc(r.name)}${r.redLine ? '（紅線）' : ''}</h3><p>${esc(r.rule)}</p><p style="color:gray">生效日 ${esc(r.effective)}</p>`).join('')}`;
  }).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(sop.title)}</title></head><body style="font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif"><h1>${esc(sop.title)}（資深版）</h1><p>確認人 ${esc(sop.confirmedBy)}</p>${body}</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '資深版SOP.doc';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 匯出 PDF：用瀏覽器的列印功能（選「另存為 PDF」），文字是真的文字、中文用電腦自己的字型，不用外部套件。
 *  列印時只顯示下面這份完整版面（不受畫面上搜尋篩選影響），其餘畫面由 react.css 的 @media print 隱藏。 */
function printPdf() {
  const old = document.title;
  document.title = '資深版SOP'; // 瀏覽器用網頁標題當預設檔名
  const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
}

function PrintDoc({ sop }: { sop: PublishedSop }) {
  return createPortal(
    <div className="print-doc" lang="zh-Hant">
      <h1>{sop.title}（資深版）</h1>
      <p className="print-meta">版本 {sop.version}・發布日期 {sop.publishedAt}・確認人 {sop.confirmedBy}・共 {sop.ruleCount} 條，其中紅線 {sop.redLineCount} 條</p>
      {sop.chapters.map(c => {
        const rs = sop.rules.filter(r => r.chapter === c.no);
        if (!rs.length) return null;
        return (
          <section key={c.no}>
            <h2>{c.no}　{c.name}</h2>
            {rs.map(r => (
              <article key={r.no} className="print-rule">
                <h3>SOP {r.no}　{r.name}{r.redLine ? <span className="print-red">【紅線】</span> : null}</h3>
                <p>{r.rule}</p>
                <p className="print-meta">生效日 {r.effective}</p>
              </article>
            ))}
          </section>
        );
      })}
    </div>,
    document.body,
  );
}

/** 資深 3｜資深版 SOP：查閱和匯出完整規則（?ch=7 會跳到該章） */
export default function SSop() {
  const [sp] = useSearchParams();
  const toast = useToast();
  const st = useAsync(() => api.getPublishedSop('senior'), []);
  return (
    <Layout nav="sop">
      <Async state={st}>{sop => !sop ? (
        <>
          <PageHead cap="資深版 SOP" title="資深版 SOP" sub="完成 SOP 統整四步驟後才會產生，產生就等於發布。" />
          <Empty expr="hint" gear="senior" action={<Link className="xk-btn" to="/s/flow">前往 SOP 統整 ›</Link>}>還沒有任何版本。先到「SOP 統整」完成四個步驟，產生後這裡就會打開，喵。</Empty>
        </>
      ) : (
        <>
          <PageHead cap="資深版 SOP" title="資深版 SOP" sub={`完整規則：${sop.ruleCount} 條，其中紅線 ${sop.redLineCount} 條`}
            right={<span className="row">
              <button type="button" className="xk-btn-ghost" onClick={() => { exportWord(sop); toast('已匯出 Word 檔'); }}><Icon name="book" small />匯出 Word</button>
              <button type="button" className="xk-btn" title="在列印視窗的「目的地」選「另存為 PDF」" onClick={() => { toast('在列印視窗的「目的地」選「另存為 PDF」'); setTimeout(printPdf, 400); }}><Icon name="book" small />匯出 PDF</button>
            </span>} />
          <p className="mini">版本 {sop.version}・發布日期 {sop.publishedAt}・確認人 {sop.confirmedBy}</p>
          <SopView sop={sop} mode="senior" scrollCh={sp.get('ch')} />
          <PrintDoc sop={sop} />
        </>
      )}</Async>
    </Layout>
  );
}
