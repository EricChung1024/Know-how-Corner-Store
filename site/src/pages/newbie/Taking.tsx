import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useModal, useNav, useToast } from '../../lib/hooks';
import { errMsg } from '../../lib/utils';
import { Async, Chip, Crumb, Empty, PageHead, SopRef } from '../../components/ui';
import { Layout } from '../../components/Layout';
import type { ExamForTaking } from '../../lib/types';

const has = (v: unknown) => v !== undefined && v !== null && v !== '';
const TYPE_NAME = { mcq: '選擇題', tf: '是非題', short: '簡答題' } as const;

/** 新人 8｜考試作答：作答一份已鎖定的考卷（?stage=m1）。答案即時暫存，離開再回來會接著作答。 */
export default function NTaking() {
  const [sp] = useSearchParams();
  const stage = sp.get('stage');
  const st = useAsync(() => api.getExamForTaking(stage), [stage]);
  return (
    <Layout nav="exam">
      <Async state={st}>{ex => {
        if (!ex) {
          return (
            <>
              <Crumb items={[['我的考核清單', '/n/exam'], ['考試作答']]} />
              <PageHead cap="考核" title="考試作答" />
              <Empty gear="rookie" action={<Link className="xk-btn-ghost" to="/n/exam">回我的考核清單</Link>}>考卷還沒開放。資深審核並鎖定考卷後，就可以從「我的考核清單」開始作答。</Empty>
            </>
          );
        }
        if ('done' in ex) return <Navigate to={`/n/result?attempt=${encodeURIComponent(ex.attemptId)}`} replace />;
        return <Taking key={ex.attemptId} ex={ex} />;
      }}</Async>
    </Layout>
  );
}

function Taking({ ex }: { ex: ExamForTaking }) {
  const go = useNavigate();
  const toast = useToast();
  const modal = useModal();
  const { refresh } = useNav();
  const [cur, setCur] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({ ...ex.answers });
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ qid: string; val: string } | null>(null);
  const qs = ex.questions, q = qs[cur], last = cur === qs.length - 1;
  const n = qs.filter(x => has(answers[x.id])).length;

  const store = async (qid: string, val: number | string) => {
    try { await api.saveAnswerDraft(ex.attemptId, qid, val); } catch (e) { toast(`沒有存到：${errMsg(e)}`, 'err'); }
  };
  const pick = (k: number) => { setAnswers(a => ({ ...a, [q.id]: k })); store(q.id, k); };
  const type = (v: string) => {
    setAnswers(a => ({ ...a, [q.id]: v }));
    pending.current = { qid: q.id, val: v };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (pending.current) { store(pending.current.qid, pending.current.val); pending.current = null; } }, 400);
  };
  const flush = async () => { window.clearTimeout(timer.current); if (pending.current) { const p = pending.current; pending.current = null; await store(p.qid, p.val); } };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const jump = async (k: number) => { await flush(); setCur(Math.max(0, Math.min(qs.length - 1, k))); };

  const submit = async () => {
    await flush();
    const left = qs.filter(x => !has(answers[x.id])).length;
    const hasShort = qs.some(x => x.qtype === 'short');
    const ok = await modal({
      title: '確定要交卷嗎？',
      body: <><p>交卷後就不能再修改答案。{hasShort ? '簡答題會送給資深覆核，覆核後才出最終分數。' : ''}</p><p>{left ? <Chip kind="alert" ic="lantern" text={`還有 ${left} 題沒作答`} /> : <Chip kind="done" ic="stamp" text={`${qs.length} 題都作答了`} />}</p></>,
      actions: [{ label: '再檢查一下', value: false }, { label: '確定交卷 ›', value: true, primary: true }],
    });
    if (!ok) return;
    setBusy(true);
    try { const r = await api.submitExam(ex.attemptId, answers); refresh(); go(`/n/result?attempt=${encodeURIComponent(r.attemptId)}&submitted=1`); }
    catch (e) { toast(errMsg(e), 'err'); setBusy(false); }
  };

  return (
    <>
      <Crumb items={[['我的考核清單', '/n/exam'], [ex.name]]} />
      <PageHead cap="考核" title="考試作答" sub={`${ex.name}・共 ${qs.length} 題・及格 ${ex.passScore} 分・考核日 ${ex.deadline || ''}`} right={<span className="mini">已作答 {n} / {qs.length}</span>} />
      <div className="side-l">
        <aside className="xk-soft pad-s stack-s" aria-label="題號進度">
          <p className="lbl">題號進度</p>
          <div className="qroad">{qs.map((x, k) => (
            <button key={x.id} type="button" className={`qdot ${has(answers[x.id]) ? 'ok' : ''}`} aria-current={k === cur ? 'step' : undefined} aria-label={`第 ${k + 1} 題${has(answers[x.id]) ? '，已作答' : ''}`} onClick={() => jump(k)}>{k + 1}</button>
          ))}</div>
          <p className="mini">黃底＝已作答・深黃＝目前這題</p>
          <hr className="line" /><p className="mini">考卷由資深審核並鎖定，作答中可以來回修改；交卷後就不能改。</p>
        </aside>
        <section className="xk-panel pad stack" aria-labelledby="qT">
          <div className="row between"><h2 id="qT" style={{ fontSize: 22 }}>第 {cur + 1} 題・{TYPE_NAME[q.qtype]}</h2><span className="mini"><SopRef q={q} /></span></div>
          <p className="pre" style={{ fontSize: 17, lineHeight: 1.8 }}>{q.stem}</p>
          {q.qtype !== 'short' ? (
            <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="sr">選一個答案</legend>
              {(q.options || []).map((o, k) => (
                <label key={k} className="opt"><input type="radio" name="opt" value={k} checked={answers[q.id] === k} onChange={() => pick(k)} /><span className="k">{'ABCDEFG'[k]}</span><span>{o}</span></label>
              ))}
            </fieldset>
          ) : (
            <>
              <div className="field"><label htmlFor="shortAns">你的回覆</label><textarea className="inp xk-pat-notebook" id="shortAns" rows={6} placeholder="寫下你會怎麼回覆顧客" value={String(answers[q.id] ?? '')} onChange={e => type(e.target.value)} /></div>
              <div className="row between"><span className="hint">簡答交卷後由資深覆核，覆核完才會出最終分數。</span></div>
            </>
          )}
          <div className="row between" style={{ marginTop: 8 }}>
            <button type="button" className="xk-btn-ghost" disabled={cur === 0} onClick={() => jump(cur - 1)}>‹ 上一題</button>
            {last ? <button type="button" className="xk-btn" disabled={busy} onClick={submit}>{busy ? '交卷中…' : '交卷 ›'}</button> : <button type="button" className="xk-btn" onClick={() => jump(cur + 1)}>下一題 ›</button>}
          </div>
        </section>
      </div>
    </>
  );
}
