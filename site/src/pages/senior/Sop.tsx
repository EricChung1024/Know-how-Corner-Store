import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { Async, Empty, PageHead } from '../../components/ui';
import { Layout } from '../../components/Layout';
import { SopView } from '../../components/SopView';
import { SopExportButtons, SopPrintDoc } from '../../components/SopExport';

/** 資深 3｜完整 SOP：查閱和匯出完整規則（?ch=7 會跳到該章）。匯出的實作在 components/SopExport.tsx（新人版共用）。 */
export default function SSop() {
  const [sp] = useSearchParams();
  const st = useAsync(() => api.getPublishedSop('senior'), []);
  return (
    <Layout nav="sop">
      <Async state={st}>{sop => !sop ? (
        <>
          <PageHead cap="完整 SOP" title="完整 SOP" sub="完成 SOP 統整四步驟後才會產生，產生就等於發布。" />
          <Empty expr="hint" gear="senior" action={<Link className="xk-btn" to="/s/flow">前往 SOP 統整 ›</Link>}>還沒有任何版本。先到「SOP 統整」完成四個步驟，產生後這裡就會打開，喵。</Empty>
        </>
      ) : (
        <>
          <PageHead cap="完整 SOP" title="完整 SOP" sub={`完整規則：${sop.ruleCount} 條，其中紅線 ${sop.redLineCount} 條`}
            right={<SopExportButtons sop={sop} mode="senior" />} />
          <p className="mini">版本 {sop.version}・發布日期 {sop.publishedAt}・確認人 {sop.confirmedBy}</p>
          <SopView sop={sop} mode="senior" scrollCh={sp.get('ch')} />
          <SopPrintDoc sop={sop} mode="senior" />
        </>
      )}</Async>
    </Layout>
  );
}
