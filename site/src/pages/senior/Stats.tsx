import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { Async, Bar, Empty, Icon, LABELS, LabelChip, PageHead } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';

/** 資深 5｜問答統計：看新人卡在哪裡 */
export default function SStats() {
  const st = useAsync(() => api.getQaStats(), []);
  return (
    <Layout nav="qa">
      <PageHead cap="問答管理" title="問答統計" sub="看新人卡在哪裡，決定下一次統整要補什麼。" right={<Tabs group="sqa" />} />
      <Async state={st}>{s => {
        if (!s.total) return <Empty gear="senior">還沒有新人提問。</Empty>;
        const top = s.chapters.slice(0, 5), mx = (arr: { count: number }[]) => Math.max(1, ...arr.map(x => x.count));
        const outcomes = LABELS.map(l => ({ outcome: l, count: s.outcomes.find(o => o.outcome === l)?.count ?? 0 }));
        return (
          <>
            <div className="g4">
              <div className="card tile"><span className="t"><Icon name="chat" />提問量</span><span className="big">{s.total}<small>題</small></span><span className="mini">所有新人累計</span></div>
              <div className="card tile"><span className="t"><Icon name="lantern" />請問資深</span><span className="big">{s.askSenior}<small>題</small></span><span className="mini">待回覆 {s.waiting} 題</span></div>
              <div className="card tile"><span className="t"><Icon name="stamp" />有幫助</span><span className="big">{s.helpful}<small>次</small></span><span className="mini">新人按「有幫助」</span></div>
              <div className="card tile"><span className="t"><Icon name="pencil" />沒幫助</span><span className="big">{s.notHelpful}<small>次</small></span><span className="mini">原因見下方</span></div>
            </div>
            <div className="g2">
              <section className="xk-panel pad"><div className="sec-h"><h2>最常被問的章節</h2><span className="mini">點章節回到資深版 SOP</span></div>
                <div className="bars">{top.map(c => <div key={c.no} className="barrow"><span className="lab"><Link className="linkbtn" style={{ fontSize: 15 }} to={`/s/sop?ch=${encodeURIComponent(c.no)}`}>第 {c.no} 章 {c.name}</Link></span><Bar pct={c.count / mx(top) * 100} label={`${c.count} 題`} /><span className="v">{c.count}</span></div>)}</div></section>
              <section className="xk-soft pad"><div className="sec-h"><h2>判斷結果分布</h2></div>
                <div className="bars">{outcomes.map(o => <div key={o.outcome} className="barrow"><span className="lab"><LabelChip outcome={o.outcome} /></span><Bar pct={o.count / mx(outcomes) * 100} label={`${o.count} 題`} /><span className="v">{o.count}</span></div>)}</div></section>
            </div>
            <section className="xk-soft pad"><div className="sec-h"><h2>「沒幫助」的原因</h2></div>
              <div className="bars">{s.noHelpReasons.map(r => <div key={r.reason} className="barrow"><span className="lab">{r.reason}</span><Bar pct={r.count / mx(s.noHelpReasons) * 100} label={`${r.count} 次`} /><span className="v">{r.count}</span></div>)}</div></section>
          </>
        );
      }}</Async>
    </Layout>
  );
}
