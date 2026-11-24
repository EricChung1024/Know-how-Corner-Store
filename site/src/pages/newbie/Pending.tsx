import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useAuth, useNav } from '../../lib/hooks';
import { Async, Chip, Empty, Icon, PageHead, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';

/** 新人 5｜待確認清單（自己的）：追蹤送給資深的問題；打開即標記已看過新回覆 */
export default function NPending() {
  const { user } = useAuth();
  const { refresh } = useNav();
  const st = useAsync(() => api.listMyPending(), []);
  const hasNew = st.data?.some(p => p.isNew);
  useEffect(() => { if (hasNew) api.markRepliesSeen().then(refresh).catch(() => {}); }, [hasNew, refresh]);
  return (
    <Layout nav="qa">
      <PageHead cap="問答亭" title="待確認清單" sub="追蹤送給資深的問題。" right={<Tabs group="qa" />} />
      <Async state={st}>{list => list.length === 0 ? (
        <Empty gear="rookie" action={<Link className="xk-btn-ghost" to="/n/ask">回問小橘</Link>}>目前沒有送給資深的問題。小橘查不到答案時，會自動把題目記到這裡。</Empty>
      ) : (
        <>
          <div className="row"><span className="mini">待處理 {list.filter(p => p.status === '待處理').length}・已回覆 {list.filter(p => p.status === '已回覆').length}</span></div>
          <div className="stack">{list.map(p => (
            <article key={p.id} className="card item">
              <div className="meta"><StatusChip text={p.status} />{p.isNew ? <Chip kind="alert" ic="lantern" text="新回覆" sm /> : null}<span>{p.date} 提問</span><span>{p.sourceChip}</span></div>
              <p className="disp" style={{ fontSize: 18 }}>{p.question}</p>
              {p.status === '已回覆' ? (
                <div className="reply"><p className="lbl" style={{ marginBottom: 6 }}>{p.repliedBy}的回覆・{p.repliedAt}</p><p className="pre">{p.reply}</p>
                  {p.notifiedAt ? <p className="mini" style={{ marginTop: 8 }}><Icon name="chat" small /> 資深回覆時已通知你（{user?.email}）</p> : null}</div>
              ) : <p className="mini">小橘查不到答案，已送給資深。資深回覆後會出現在首頁，也會在導覽列提醒你。</p>}
              <div className="row"><Link className="linkbtn" to="/n/ask">回問小橘</Link></div>
            </article>
          ))}</div>
        </>
      )}</Async>
    </Layout>
  );
}
