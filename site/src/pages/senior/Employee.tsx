import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useNav, useToast } from '../../lib/hooks';
import { dayText, errMsg } from '../../lib/utils';
import { Async, Crumb, Empty, FieldErr, Icon, PageHead, StatusChip } from '../../components/ui';
import { Layout } from '../../components/Layout';
import type { EmployeeDetail, ExamSettings, ShortReview, StageRow } from '../../lib/types';

/** 資深 7｜員工詳情（?id=員工工號）：設定到職日、三次考核出題、員工成績單、簡答覆核 */
export default function SEmployee() {
  const [sp] = useSearchParams();
  const id = sp.get('id');
  const st = useAsync(async () => {
    if (!id) return null;
    const [e, rv, set] = await Promise.all([api.getEmployee(id), api.getShortReview(id), api.getExamSettings()]);
    return { e, rv, set };
  }, [id]);
  return (
    <Layout nav="exam">
      <Async state={st}>{d => {
        if (!d || !d.e) {
          return <><Crumb items={[['員工總覽', '/s/employees'], ['員工詳情']]} /><Empty gear="senior" action={<Link className="xk-btn-ghost" to="/s/employees">回員工總覽</Link>}>{!d ? '網址少了員工工號，請從員工總覽點進來。' : '找不到這位員工。'}</Empty></>;
        }
        return <Detail e={d.e} rv={d.rv} set={d.set} reload={st.reload} />;
      }}</Async>
    </Layout>
  );
}

function Detail({ e, rv, set, reload }: { e: EmployeeDetail; rv: ShortReview | null; set: ExamSettings; reload: () => void }) {
  const toast = useToast();
  const go = useNavigate();
  const { refresh } = useNav();
  const [hire, setHire] = useState(e.hireDate || '');
  const [hireErr, setHireErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setHire(e.hireDate || ''); }, [e.hireDate]);
  const nx = e.nextExam;

  const saveHire = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!hire) { setHireErr('請選擇到職日'); return; }
    setHireErr(''); setBusy(true);
    try { await api.updateHireDate(e.employeeId, hire); toast('已儲存到職日'); reload(); } catch (x) { toast(errMsg(x), 'err'); }
    setBusy(false);
  };
  const gen = async (type: StageRow['type']) => {
    setBusy(true);
    try { const p = await api.generatePaper(e.employeeId, type); toast(p.shortage > 0 ? `已出題，還差 ${p.shortage} 題` : '已出題'); refresh(); go(`/s/paper?paper=${encodeURIComponent(p.id)}`); }
    catch (x) { toast(errMsg(x), 'err'); setBusy(false); }
  };

  const firstGen = e.canHaveExam && e.hireDate && !rv ? e.stages.find(s => !s.paper && s.status !== '已完成')?.type : null;
  const stageRow = (s: StageRow) => {
    let act;
    if (s.status === '已完成') act = <>{s.finalScore != null ? <><span className="disp">{s.finalScore} 分</span><StatusChip text={s.passed ? '通過' : '未通過'} /></> : <StatusChip text="待覆核" />}</>;
    else if (!e.canHaveExam) act = <span className="mini">這位不用考核</span>;
    else if (!e.hireDate) act = <span className="mini">先設定到職日</span>;
    else if (!s.paper) act = <button type="button" className={s.type === firstGen ? 'xk-btn' : 'xk-btn-ghost'} disabled={busy} onClick={() => gen(s.type)}>出題 ›</button>;
    else if (s.paper.status === 'draft') act = <><StatusChip text="待審核" /><Link className="linkbtn" to={`/s/paper?paper=${encodeURIComponent(s.paper.id)}`}>審核考卷 ›</Link></>;
    else act = <><StatusChip text="已鎖定" /><span className="mini">{s.attemptStatus === 'doing' ? '作答中' : '還沒開始作答'}</span></>;
    return (
      <tr key={s.type}>
        <td><b>{s.name}</b><br /><span className="mini">滿 {s.months} 個月・{s.levelName}・及格 {s.passScore}</span></td>
        <td className="nowrap">{s.dueDate || '—'}{s.dueDate && s.status !== '已完成' ? <><br /><span className="mini">{dayText(s.daysLeft)}</span></> : null}</td>
        <td><div className="row">{act}</div></td>
      </tr>
    );
  };

  return (
    <>
      <Crumb items={[['員工總覽', '/s/employees'], [e.name]]} />
      <PageHead cap="考核管理" title={`員工詳情・${e.name}`} />
      <section className="xk-soft pad"><div className="row between" style={{ alignItems: 'flex-end' }}>
        <dl className="kv"><dt>工號</dt><dd>{e.employeeId}</dd><dt>email</dt><dd>{e.email}</dd><dt>身分</dt><dd>{e.role === 'senior' ? '資深' : '新人'}</dd><dt>到職第</dt><dd>{e.dayNo ? `${e.dayNo} 天` : '—'}</dd></dl>
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={saveHire} noValidate>
          <div className="field"><label htmlFor="hireIn">到職日</label><input className="inp" id="hireIn" type="date" value={hire} onChange={ev => setHire(ev.target.value)} style={{ width: 200 }} /><FieldErr id="hireIn" msg={hireErr} /></div>
          <button className="xk-btn-ghost" type="submit" disabled={busy}>儲存到職日</button>
        </form>
        {nx ? <dl className="kv"><dt>下次考核</dt><dd>{nx.name}</dd><dt>考核日</dt><dd className="disp" style={{ fontSize: 20 }}>{nx.deadline}</dd></dl> : null}
      </div></section>
      {rv ? <ReviewForm rv={rv} set={set} onDone={() => { reload(); refresh(); }} /> : null}
      <div className="g2">
        <section className="xk-soft pad stack-s"><div className="sec-h"><h2><Icon name="quiz" />三次考核</h2></div>
          <div className="scroll"><table className="tbl"><thead><tr><th>考核</th><th>考核日</th><th>考卷</th></tr></thead><tbody>{e.stages.map(stageRow)}</tbody></table></div>
          <p className="mini">考核日＝到職日＋N 個月（當月沒有同一天用月底，遇週末順延到週一）。出題從題庫「已審」題目依難度隨機抽，審核後鎖定，新人才能作答。</p></section>
        <section className="xk-soft pad"><div className="sec-h"><h2><Icon name="medal" />員工成績單</h2></div>
          {e.records.length ? (
            <><div className="scroll"><table className="tbl"><thead><tr><th>考核</th><th>日期</th><th className="num">分數</th><th className="num">及格</th><th>結果</th></tr></thead>
              <tbody>{e.records.map(r => <tr key={r.attemptId}><td>{r.exam}</td><td className="nowrap">{r.date}</td><td className="num">{r.score == null ? '—' : `${r.score} 分`}</td><td className="num">{r.passScore ?? '—'}</td><td><StatusChip text={r.score == null ? '待覆核' : r.passed ? '通過' : '未通過'} /></td></tr>)}</tbody></table></div>
              <p className="mini" style={{ marginTop: 8 }}>未通過只標示「階段認證待補強」，不降等。</p></>
          ) : <p className="mini">還沒有考核成績。</p>}
        </section>
      </div>
    </>
  );
}

/** 簡答覆核：每一題簡答各給一個分數（滿分＝一題的分數），看得到參考答案與得分點。 */
function ReviewForm({ rv, set, onDone }: { rv: ShortReview; set: ExamSettings; onDone: () => void }) {
  const toast = useToast();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const rubricOf = (r: ShortReview['items'][number]['rubric']) => (Array.isArray(r) ? r : r ? [r] : []).filter(Boolean);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const out: Record<string, number> = {}, bad: Record<string, string> = {};
    rv.items.forEach(it => {
      const v = (scores[it.qid] ?? '').trim(), n = Number(v);
      if (v === '' || !Number.isFinite(n) || n < 0 || n > it.maxPoints) bad[it.qid] = `請輸入 0–${it.maxPoints} 的分數`; else out[it.qid] = n;
    });
    setErrs(bad);
    if (Object.keys(bad).length) return;
    setBusy(true);
    try { const r = await api.submitShortReview(rv.attemptId, { scores: out, comment: comment.trim(), errorTypes: types }); toast(`已送出覆核：最終 ${r.finalScore} 分・${r.passed ? '通過' : '未通過'}`); onDone(); }
    catch (x) { toast(errMsg(x), 'err'); setBusy(false); }
  };

  return (
    <section className="xk-panel pad stack" aria-labelledby="rvT">
      <div className="row between"><h2 id="rvT" style={{ fontSize: 22 }}>簡答覆核・{rv.examName}</h2><StatusChip text="待覆核" sm={false} /></div>
      <p className="mini">選擇題已自動計分：{rv.mcqScore} 分。簡答共 {rv.items.length} 題，請逐題給分。</p>
      <form className="stack-s" onSubmit={submit} noValidate>
        {rv.items.map((it, k) => (
          <article key={it.qid} className="card stack-s"><b className="disp" style={{ fontSize: 18 }}>第 {k + 1} 題簡答</b>
            <p className="pre mini">{it.stem}</p>
            <div className="cmp">
              <div className="card"><span className="lbl">新人答案</span><p className="pre">{it.answer || '（未作答）'}</p></div>
              <div className="card" style={{ background: 'var(--gold-tint)' }}><span className="lbl">參考答案</span><p className="pre">{it.referenceAnswer || '—'}</p>
                {rubricOf(it.rubric).length ? <><p className="lbl" style={{ marginTop: 8 }}>得分點</p><ul className="stack-s" style={{ margin: 0, paddingLeft: 20 }}>{rubricOf(it.rubric).map(r => <li key={r}>{r}</li>)}</ul></> : null}
                {it.keyError ? <p className="mini" style={{ marginTop: 8 }}>關鍵失誤：{it.keyError}</p> : null}</div>
            </div>
            <div className="field"><label htmlFor={`rvScore${k}`}>此題得分（0–{it.maxPoints}）</label>
              <input className="inp" id={`rvScore${k}`} type="number" min={0} max={it.maxPoints} step={0.5} style={{ width: 160 }} value={scores[it.qid] ?? ''} onChange={ev => setScores(s => ({ ...s, [it.qid]: ev.target.value }))} /><FieldErr id={`rvScore${k}`} msg={errs[it.qid]} /></div>
          </article>
        ))}
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lbl" style={{ marginBottom: 6 }}>錯誤類型（可複選）</legend>
          <div className="chips">{set.errorTypes.map(t => <label key={t} className="opt" style={{ padding: '8px 12px' }}><input type="checkbox" checked={types.includes(t)} onChange={ev => setTypes(a => ev.target.checked ? [...a, t] : a.filter(x => x !== t))} /><span>{t}</span></label>)}</div></fieldset>
        <div className="field"><label htmlFor="rvComment">給新人的評語</label><textarea className="inp xk-pat-notebook" id="rvComment" rows={3} value={comment} onChange={ev => setComment(ev.target.value)} /></div>
        <div className="row end"><button className="xk-btn" type="submit" disabled={busy}>{busy ? '送出中…' : '送出覆核 ›'}</button></div>
      </form>
    </section>
  );
}
