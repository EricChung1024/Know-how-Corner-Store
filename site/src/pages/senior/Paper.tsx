import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useModal, useNav, useToast } from '../../lib/hooks';
import { errMsg } from '../../lib/utils';
import { Async, Chip, Empty, Icon, PageHead, SopRef, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';
import type { PaperDetail } from '../../lib/types';

const TYPE = { mcq: '選擇題', tf: '是非題', short: '簡答題' } as const;

/** 資深 8｜考卷審核（?paper=考卷 id）：出好的題目、刪題、補題、鎖定 */
export default function SPaper() {
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const modal = useModal();
  const { refresh } = useNav();
  const [picker, setPicker] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const want = sp.get('paper');

  const st = useAsync(async () => {
    const papers = await api.listPapers();
    if (!papers.length) return { papers, id: null as string | null, p: null as PaperDetail | null, bank: null };
    const id = papers.some(x => x.id === want) ? want! : (papers.find(x => x.status === 'draft') || papers[papers.length - 1]).id;
    const p = await api.getPaper(id);
    // 補題候選：同難度、已審；這一階段不出簡答就只列選擇／是非
    const bank = picker && p && p.status === 'draft' ? await api.listBank({ status: '已審', level: p.level, qtype: p.shortMax ? '' : 'choice', size: 40 }) : null;
    return { papers, id, p, bank };
  }, [want, picker]);

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try { await fn(); if (msg) toast(msg); refresh(); st.reload(); } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  };

  return (
    <Layout nav="exam">
      <PageHead cap="考核管理" title="考卷審核" sub="出好的考卷可以上線：刪題、補題，確認後鎖定。" right={<Tabs group="sexam" />} />
      <Async state={st}>{({ papers, id, p, bank }) => {
        if (!papers.length || !p || !id) return <Empty gear="senior" action={<Link className="xk-btn-ghost" to="/s/employees">前往員工總覽</Link>}>還沒有考卷。到員工詳情設定到職日，再選一次考核出題。</Empty>;
        const locked = p.status === 'locked';
        const pool = bank ? bank.items.filter(q => !p.questions.some(x => x.id === q.id)) : [];
        return (
          <>
            {papers.length > 1 ? (
              <div className="xk-segs" role="group" aria-label="選擇考卷">
                {papers.map(x => <button key={x.id} type="button" className="xk-seg" aria-pressed={x.id === id} onClick={() => { setPicker(false); setSp({ paper: x.id }); }}>{x.employeeName}・{x.examName}・{x.status === 'draft' ? '待審核' : '已鎖定'}</button>)}
              </div>
            ) : null}
            <section className="xk-panel pad stack">
              <div className="row between"><div className="stack-s"><h2 style={{ fontSize: 24 }}>{p.employeeName}・{p.examName}</h2><p className="mini">從題庫「已審」{p.levelName}題目隨機抽・{p.generatedAt}{p.deadline ? `・考核日 ${p.deadline}` : ''}・及格 {p.passScore} 分</p></div>
                {locked ? <span className={`xk-stamp ${fresh ? '' : 'still'}`}>已鎖定</span> : <StatusChip text="待審核" sm={false} />}</div>
              {locked ? <div className="banner"><Icon name="stamp" /><span style={{ flex: 1 }}>{p.lockedAt} 鎖定。{p.employeeName}現在可以在「我的考核清單」作答，題目不能再修改。</span></div> : null}
              <div className="row"><span className="disp">共 {p.questions.length} / {p.questionTarget} 題</span><span className="mini">選擇 {p.mcqCount}・簡答 {p.questions.length - p.mcqCount}（上限 {p.shortMax}）</span>{p.questions.length < p.questionTarget ? <Chip kind="alert" ic="lantern" text={`還差 ${p.questionTarget - p.questions.length} 題`} sm /> : null}</div>
              <div className="stack-s">
                {p.questions.length ? p.questions.map((q, k) => (
                  <article key={q.id} className="card stack-s">
                    <div className="row between"><div className="chips"><b className="disp" style={{ fontSize: 18 }}>第 {k + 1} 題</b><Chip kind="return" ic="quiz" text={TYPE[q.qtype]} sm />{q.redLine ? <Chip kind="alert" ic="lantern" text="紅線" sm /> : null}<span className="mini">{q.id}</span></div>
                      {locked ? null : <button type="button" className="xk-btn-ghost" disabled={busy} onClick={() => run(() => api.removePaperQuestion(id, q.id), `已刪除 ${q.id}`)}>刪題</button>}</div>
                    <p className="pre">{q.stem}</p>
                    {q.options ? <ol className="stack-s" style={{ margin: 0, paddingLeft: 24 }} type="A">{q.options.map(o => <li key={o}>{o}</li>)}</ol> : null}
                    <span className="mini"><SopRef q={q} /></span>
                  </article>
                )) : <p className="mini">考卷目前沒有題目，請補題。</p>}
              </div>
              {picker && !locked && bank ? (
                <section className="xk-soft pad-s stack-s" aria-labelledby="pkT"><div className="row between"><h3 id="pkT" style={{ fontSize: 19 }}>從題庫補題</h3><span className="mini">{p.levelName}・已審 {bank.matched} 題{bank.matched > bank.items.length ? `，列出前 ${bank.items.length} 題` : ''}</span></div>
                  {pool.length ? pool.map(q => (
                    <div key={q.id} className="card row between"><div className="stack-s" style={{ flex: 1 }}><div className="chips"><Chip kind="return" ic="quiz" text={TYPE[q.qtype]} sm /><span className="mini">{q.id}・{q.kind}</span></div><span className="clamp2">{q.stem.split('\n').filter(Boolean).pop()}</span></div>
                      <button type="button" className="xk-btn-ghost" disabled={busy} onClick={() => run(() => api.addPaperQuestion(id, q.id), `已加入 ${q.id}`)}>加入考卷</button></div>
                  )) : <p className="mini">沒有可以補的題目。先到<Link to="/s/bank">題庫審核</Link>通過更多 {p.levelName} 的題目。</p>}
                </section>
              ) : null}
              <div className="row between">
                {locked ? <span /> : <button type="button" className="xk-btn-ghost" onClick={() => setPicker(v => !v)}>{picker ? '收起補題' : '補題'}</button>}
                {locked ? <Link className="xk-btn-ghost" to="/s/bank">看題庫審核</Link> : (
                  <button type="button" className="xk-btn" disabled={!p.questions.length || busy} onClick={async () => {
                    const ok = await modal({ title: '鎖定這份考卷？', body: <p>鎖定後就不能再刪題、補題，新人會在「我的考核清單」看到「可作答」。</p>, actions: [{ label: '取消', value: false }, { label: '確定鎖定 ›', value: true, primary: true }] });
                    if (ok) { setPicker(false); setFresh(true); run(() => api.lockPaper(id), '考卷已鎖定，新人可以作答了'); }
                  }}>鎖定考卷 ›</button>
                )}
              </div>
            </section>
          </>
        );
      }}</Async>
    </Layout>
  );
}
