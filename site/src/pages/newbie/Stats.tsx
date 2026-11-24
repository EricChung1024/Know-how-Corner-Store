import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { Async, Bar, Empty, Icon, PageHead } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';

/** 新人 6｜我的統計：看自己的提問習慣 */
export default function NStats() {
  const st = useAsync(() => api.getMyQaStats(), []);
  return (
    <Layout nav="qa">
      <PageHead cap="問答亭" title="我的統計" sub="看自己的提問習慣。" right={<Tabs group="qa" />} />
      <Async state={st}>{s => {
        if (!s.total) return <Empty gear="rookie" action={<Link className="xk-btn" to="/n/ask">前往問小橘 ›</Link>}>問過問題後，這裡會整理你最常問哪一章。</Empty>;
        const top = s.chapters[0], fb = s.helpful + s.notHelpful + s.noFeedback, max = top ? top.count : 1;
        return (
          <>
            <div className="g3">
              <section className="xk-soft pad tile"><span className="t"><Icon name="chat" />提問數</span><span className="big">{s.total}<small>題</small></span><span className="mini">其中 {s.sentToSenior} 題送給資深確認</span></section>
              <section className="xk-soft pad tile"><span className="t"><Icon name="book" />問最多的章節</span>
                {top ? <><span className="disp" style={{ fontSize: 24 }}>第 {top.no} 章 {top.name}</span><span className="mini">{top.count} 題</span><Link className="linkbtn" to={`/n/sop?ch=${encodeURIComponent(top.no)}`}>去讀這一章 ›</Link></> : <span className="mini">問過的題目都不在 SOP 範圍</span>}</section>
              <section className="xk-soft pad tile"><span className="t"><Icon name="pencil" />回饋比例</span><span className="big">{fb ? Math.round(s.helpful / fb * 100) : 0}<small>% 有幫助</small></span><span className="mini">有幫助 {s.helpful}・沒幫助 {s.notHelpful}・還沒回饋 {s.noFeedback}</span></section>
            </div>
            {s.chapters.length ? (
              <section className="xk-panel pad"><div className="sec-h"><h2>各章節提問數</h2><span className="mini">點章節名稱可以回到新人版 SOP</span></div>
                <div className="bars">{s.chapters.map(c => (
                  <div key={c.no} className="barrow"><span className="lab"><Link className="linkbtn" style={{ fontSize: 15 }} to={`/n/sop?ch=${encodeURIComponent(c.no)}`}>第 {c.no} 章 {c.name}</Link></span><Bar pct={c.count / max * 100} label={`${c.count} 題`} /><span className="v">{c.count}</span></div>
                ))}</div></section>
            ) : null}
          </>
        );
      }}</Async>
    </Layout>
  );
}
