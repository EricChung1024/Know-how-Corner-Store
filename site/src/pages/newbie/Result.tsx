import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useNav, useToast } from '../../lib/hooks';
import { Async, Chip, Crumb, Empty, Icon, PageHead, Say, SopRef, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';
import type { MyResult, ResultItem } from '../../lib/types';

/** 新人 9｜成績與錯誤類型：看成績和錯在哪裡（?attempt= 指定哪一次，不給就取最近一次） */
export default function NResult() {
  const [sp] = useSearchParams();
  const attempt = sp.get('attempt');
  const toast = useToast();
  const { refresh } = useNav();
  const st = useAsync(() => api.getMyResult(attempt), [attempt]);
  const r = st.data;
  useEffect(() => { if (sp.get('submitted')) toast('已交卷'); }, [sp, toast]);
  useEffect(() => { if (r && r.status === 'reviewed' && !r.resultSeen) api.markResultSeen(r.attemptId).then(refresh).catch(() => {}); }, [r, refresh]);

  return (
    <Layout nav="exam">
      <Async state={st}>{res => {
        const head = <PageHead cap="考核" title="成績與錯誤類型" sub={res ? `${res.examName}・${res.submittedAt} 交卷` : ''} right={<Tabs group="exam" />} />;
        if (!res) return <><Crumb items={[['我的考核清單', '/n/exam'], ['成績與錯誤類型']]} />{head}<Empty gear="rookie" action={<Link className="xk-btn-ghost" to="/n/exam">回我的考核清單</Link>}>還沒有交卷的考核。交卷後，成績和錯誤類型會出現在這裡。</Empty></>;
        return <Body r={res} head={head} />;
      }}</Async>
    </Layout>
  );
}

function Body({ r, head }: { r: MyResult; head: React.ReactNode }) {
  const reviewed = r.status === 'reviewed';
  const types = Object.entries(r.errorSummary);
  const wrong = reviewed ? r.items.filter(i => i.qtype !== 'short' && !i.correct).length : 0;

  const item = (i: ResultItem, k: number) => {
    if (i.qtype === 'short') {
      return (
        <li key={i.qid} className="card res"><span className={`res-mark ${i.reviewed ? 'ok' : 'wait'}`} aria-hidden="true">{i.reviewed ? '✓' : '…'}</span>
          <div className="stack-s">
            <div className="row between"><b className="disp">第 {k + 1} 題・簡答題</b>{i.reviewed ? <span className="disp">{i.points} / {i.maxPoints} 分</span> : <StatusChip text="待資深覆核" />}</div>
            <p className="mini clamp2">{i.stem.split('\n').pop()}</p>
            <div className="quote"><p className="lbl" style={{ marginBottom: 4 }}>你的回覆</p><p className="pre">{String(i.answer || '（未作答）')}</p></div>
            <span className="mini"><SopRef q={i} /></span>
          </div></li>
      );
    }
    const answered = i.answer !== undefined && i.answer !== null && i.answer !== '';
    return (
      <li key={i.qid} className="card res"><span className={`res-mark ${reviewed ? (i.correct ? 'ok' : 'bad') : 'wait'}`} aria-hidden="true">{reviewed ? (i.correct ? '✓' : '✗') : '…'}</span>
        <div className="stack-s">
          <div className="row between"><b className="disp">第 {k + 1} 題・{i.qtype === 'tf' ? '是非題' : '選擇題'}</b>{reviewed ? <span className="disp">{i.points} / {i.maxPoints} 分</span> : <StatusChip text="待資深覆核" />}</div>
          <p className="mini clamp2">{i.stem.split('\n')[0]}</p>
          <p>你的答案：{answered ? (i.options?.[Number(i.answer)] ?? String(i.answer)) : '（未作答）'}</p>
          {!reviewed ? null : i.correct ? <Chip kind="done" ic="stamp" text="答對" sm /> : <div className="chips"><Chip kind="alert" ic="lantern" text="答錯" sm />{i.errorType ? <span>錯誤類型：<b>{i.errorType}</b></span> : null}</div>}
          <span className="mini"><SopRef q={i} /></span>
        </div></li>
    );
  };

  return (
    <>
      <Crumb items={[['我的考核清單', '/n/exam'], [r.examName]]} />
      {head}
      <section className="xk-panel pad">
        {reviewed ? (
          <div className="score">
            <div><span className="lbl">最終分數</span><div className="big" style={{ fontSize: 72 }}>{r.finalScore}<small>分</small></div><p className="mini">及格 {r.passScore} 分{r.redLineFailed ? '・答錯了紅線題，這次不通過' : ''}</p></div>
            <div className="stampbox"><span className="xk-stamp">{r.passed ? '通過' : '未通過'}</span></div>
            <dl className="kv"><dt>選擇題</dt><dd>{r.mcqScore} / {r.mcqMax} 分</dd>{r.shortMax ? <><dt>簡答題</dt><dd>{r.shortScore} / {r.shortMax} 分{r.review ? `（${r.review.reviewer}覆核）` : ''}</dd></> : null}<dt>交卷日</dt><dd>{r.submittedAt}</dd></dl>
          </div>
        ) : (
          <div className="score">
            <div className="stack-s"><StatusChip text="待資深覆核" sm={false} /><p>你的答案已交出。資深改完題目、給完分之後，才會顯示分數、各題對錯和是否通過。</p><p className="mini">覆核完成會在首頁提醒你。</p></div>
          </div>
        )}
      </section>
      {r.review ? (
        <section className="xk-soft pad-s"><div className="reply"><p className="lbl" style={{ marginBottom: 4 }}>{r.review.reviewer}的評語</p><p className="pre">{r.review.comment || '—'}</p>
          {(r.review.errorTypes || []).length ? <div className="chips" style={{ marginTop: 8 }}>{r.review.errorTypes.map(t => <Chip key={t} kind="alert" ic="lantern" text={t} sm />)}</div> : null}</div></section>
      ) : null}
      <div className="side">
        <section aria-labelledby="dtT"><h2 id="dtT" style={{ fontSize: 22, marginBottom: 12 }}>{reviewed ? '每一題的結果' : '你交出的答案'}</h2><ol className="stack-s" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{r.items.map(item)}</ol></section>
        <aside className="stack">
          <section className="xk-soft pad-s"><div className="sec-h"><h2 style={{ fontSize: 19 }}>錯誤類型</h2></div>
            {!reviewed ? <p className="mini">覆核完成後會顯示。</p> : types.length ? <div className="stack-s">{types.map(([t, v]) => <div key={t} className="row between"><span className="row"><Icon name="lantern" small />{t}</span><b className="disp">{v} 題</b></div>)}</div> : <p className="mini">這次沒有錯題。</p>}</section>
          {wrong ? <section className="xk-soft pad-s stack-s"><Say expr="hint" gear="rookie">答錯的 {wrong} 題收進錯題區了，連續答對 2 次就算掌握，喵。</Say><Link className="xk-btn" to="/n/wrong">去錯題區重練 ›</Link></section> : null}
          <Link className="xk-btn-ghost" to="/n/exam">回考核清單</Link>
        </aside>
      </div>
    </>
  );
}
