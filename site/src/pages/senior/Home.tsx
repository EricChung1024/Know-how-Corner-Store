import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useAuth } from '../../lib/hooks';
import { Async, Chip, Icon, PageHead, Say, StatusChip } from '../../components/ui';
import { Layout } from '../../components/Layout';
import type { ReactNode } from 'react';

/** 資深 1｜資深首頁：一進來就看到待辦 */
export default function SHome() {
  const { user } = useAuth();
  const st = useAsync(() => api.getSeniorTodos(), []);
  if (!user) return null;
  const tile = (n: number, label: string, sub: string, to: string, ic: string): ReactNode => (
    <Link className="card tile" to={to}><span className="t"><Icon name={ic} />{label}</span><span className="big">{n}<small>件</small></span><span className="mini">{sub}</span></Link>
  );
  return (
    <Layout nav="home">
      <Async state={st}>{t => {
        const total = t.pendingQuestions + t.pendingReviews + t.pendingPapers;
        const reviewTo = t.firstReviewEmployee ? `/s/employee?id=${encodeURIComponent(t.firstReviewEmployee)}` : '/s/employees';
        const paperTo = t.firstDraftPaper ? `/s/paper?paper=${encodeURIComponent(t.firstDraftPaper)}` : '/s/paper';
        let ns: { t: string; l: string; h: string; e: string };
        if (t.pendingQuestions) ns = { t: `有 ${t.pendingQuestions} 題新人問小橘查不到，先回覆這些，喵。`, l: '回覆待確認問題 ›', h: '/s/pending', e: 'hint' };
        else if (t.pendingReviews) ns = { t: `有 ${t.pendingReviews} 份考卷的簡答等你覆核。`, l: '覆核簡答 ›', h: reviewTo, e: 'hint' };
        else if (t.pendingPapers) ns = { t: 'AI 產生的考卷等你審核，確認後鎖定，新人才能作答。', l: '審核考卷 ›', h: paperTo, e: 'hint' };
        else if (!t.sop) ns = { t: '還沒有任何版本的 SOP。先完成 SOP 統整四步驟，產生就會發布給新人。', l: '開始 SOP 統整 ›', h: '/s/flow', e: 'default' };
        else ns = { t: '待辦都處理完了，辛苦了，喵。', l: '看問答統計 ›', h: '/s/stats', e: 'happy' };
        return (
          <>
            <PageHead cap="資深首頁" title={`${user.name.slice(1)}，今天有 ${total} 件待辦`} />
            <section className="xk-panel pad stack">
              <div className="row between"><Say expr={ns.e} gear="senior">{ns.t}</Say><Link className="xk-btn" to={ns.h}>{ns.l}</Link></div>
              <div className="g3">
                {tile(t.pendingQuestions, '待回覆問題', '小橘查不到、寫入待確認清單的問題', '/s/pending', 'chat')}
                {tile(t.pendingReviews, '待覆核簡答', '新人交卷後的簡答題', reviewTo, 'headset')}
                {tile(t.pendingPapers, '待審考卷', '出好題、還沒鎖定的考卷', paperTo, 'quiz')}
              </div>
            </section>
            <div className="side">
              <section className="xk-soft pad"><div className="sec-h"><h2><Icon name="clock" />考核日快到的新人</h2></div>
                {t.deadlines.length ? (
                  <div className="scroll"><table className="tbl"><thead><tr><th>新人</th><th>考核</th><th>考核日</th><th className="num">剩下</th></tr></thead>
                    <tbody>{t.deadlines.map(d => (
                      <tr key={d.id}><td><Link className="linkbtn" to={`/s/employee?id=${encodeURIComponent(d.id)}`}>{d.name}</Link></td><td>{d.exam}</td><td className="nowrap">{d.deadline}</td>
                        <td className="num">{d.daysLeft <= 14 ? <Chip kind="alert" ic="lantern" text={`${d.daysLeft} 天`} sm /> : `${d.daysLeft} 天`}</td></tr>
                    ))}</tbody></table></div>
                ) : <p className="mini">目前沒有設定到職日的新人。</p>}
              </section>
              <section className="xk-soft pad stack-s"><div className="sec-h"><h2><Icon name="book" />SOP</h2></div>
                {t.sop ? (
                  <><dl className="kv"><dt>最近發布日</dt><dd className="disp" style={{ fontSize: 20 }}>{t.sop.publishedAt}</dd><dt>版本</dt><dd>{t.sop.version}</dd><dt>確認人</dt><dd>{t.sop.confirmedBy}</dd></dl><Link className="linkbtn" to="/s/sop">看資深版 SOP ›</Link></>
                ) : (
                  <><dl className="kv"><dt>最近發布日</dt><dd><StatusChip text="尚未開放" label="尚未發布" /></dd></dl><Link className="linkbtn" to="/s/flow">前往 SOP 統整 ›</Link></>
                )}
              </section>
            </div>
          </>
        );
      }}</Async>
    </Layout>
  );
}
