import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useNav, useToast } from '../../lib/hooks';
import { errMsg, md } from '../../lib/utils';
import { Async, Empty, Icon, PageHead } from '../../components/ui';
import { Layout } from '../../components/Layout';
import { SopView } from '../../components/SopView';
import { SopExportButtons, SopPrintDoc } from '../../components/SopExport';

/** 新人 2｜完整 SOP：依章節閱讀最新規則（?rule=7-9 跳到該條，?ch=7 跳到該章） */
export default function NSop() {
  const [sp] = useSearchParams();
  const toast = useToast();
  const { refresh } = useNav();
  const [bannerOpen, setBannerOpen] = useState(true);
  const st = useAsync(async () => {
    const [sop, reads] = await Promise.all([api.getPublishedSop('newbie'), api.getReadMarks()]);
    const notice = sop ? await api.getSopUpdateNotice() : null;
    return { sop, reads, notice };
  }, []);
  // 看過「剛更新」提示就記下來（導覽列的數字會消失）；這一輪還是會顯示提示橫幅
  const showNotice = st.data?.notice?.show;
  useEffect(() => { if (showNotice) api.markSopUpdateSeen().then(refresh).catch(() => {}); }, [showNotice, refresh]);

  const read = async (no: string) => {
    try { await api.markRuleRead(no); toast(`已標為已讀：SOP ${no}`); st.reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };

  return (
    <Layout nav="sop">
      <Async state={st}>{({ sop, reads, notice }) => {
        if (!sop) {
          return (
            <>
              <PageHead cap="完整 SOP" title="完整 SOP" sub="依章節閱讀最新規則。" />
              <Empty gear="rookie" action={<Link className="xk-btn-ghost" to="/n/ask">先去問小橘</Link>}>資深還在統整最新版 SOP，發布後這裡就會出現，我也會在首頁提醒你。</Empty>
            </>
          );
        }
        const rc = sop.rules.filter(r => reads[r.no]).length;
        return (
          <>
            <PageHead cap="完整 SOP" title="完整 SOP" sub="依章節閱讀最新規則；紅線一定要記住。"
              right={<span className="row"><span className="mini">已讀 {rc} / {sop.rules.length} 條</span><SopExportButtons sop={sop} mode="newbie" /></span>} />
            {notice?.show && bannerOpen ? (
              <div className="banner" role="status">
                <span className="row"><Icon name="lightbulb" /><span>資深在 {md(notice.publishedAt)} 發布了新版 SOP，<b>{notice.recentCount} 條</b>最近更新的規則已標示「最近更新」。</span></span>
                <button type="button" className="xk-btn-ghost" onClick={() => setBannerOpen(false)}>知道了</button>
              </div>
            ) : null}
            <SopView sop={sop} mode="newbie" reads={reads} focus={sp.get('rule')} scrollCh={sp.get('ch')} onRead={read} />
            <SopPrintDoc sop={sop} mode="newbie" />
          </>
        );
      }}</Async>
    </Layout>
  );
}
