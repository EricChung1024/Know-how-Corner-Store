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
            right={<button type="button" className="xk-btn" onClick={() => { exportWord(sop); toast('已匯出 Word 檔'); }}><Icon name="book" small />匯出 Word</button>} />
          <p className="mini">版本 {sop.version}・發布日期 {sop.publishedAt}・確認人 {sop.confirmedBy}</p>
          <SopView sop={sop} mode="senior" scrollCh={sp.get('ch')} />
        </>
      )}</Async>
    </Layout>
  );
}
