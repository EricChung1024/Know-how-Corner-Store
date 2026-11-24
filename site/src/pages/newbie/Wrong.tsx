import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useNav, useToast } from '../../lib/hooks';
import { errMsg } from '../../lib/utils';
import { Async, Bar, Chip, Empty, PageHead, SopRef, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';
import type { WrongItem } from '../../lib/types';

interface Practice { open: boolean; pick?: number; correct?: boolean }

/** 新人 11｜錯題區・重練：把錯題練到會（連續答對 2 次就算掌握） */
export default function NWrong() {
  const st = useAsync(() => api.listWrongItems(), []);
  const toast = useToast();
  const { refresh } = useNav();
  const [practice, setPractice] = useState<Record<string, Practice | null>>({});
  const [fresh, setFresh] = useState<string | null>(null);

  const pick = async (w: WrongItem, k: number) => {
    try {
      const r = await api.submitPractice(w.qid, k);
      if (r.mastered) { setPractice(p => ({ ...p, [w.qid]: null })); setFresh(w.qid); toast('連續答對 2 次，這題掌握了'); refresh(); }
      else setPractice(p => ({ ...p, [w.qid]: { open: true, pick: k, correct: r.correct } }));
      st.reload();
    } catch (e) { toast(errMsg(e), 'err'); }
  };

  const card = (w: WrongItem) => {
    const p = practice[w.qid];
    let area;
    if (w.mastered) area = <div className="row"><span className={`xk-stamp ${fresh === w.qid ? '' : 'still'}`}>已掌握</span><span className="mini">連續答對 2 次</span></div>;
    else if (p && p.open) {
      area = (
        <>
          <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lbl" style={{ marginBottom: 8 }}>重練：選一個答案</legend>
            {w.options.map((o, k) => <label key={k} className="opt"><input type="radio" name={`pr-${w.qid}`} checked={p.pick === k} disabled={p.pick !== undefined} onChange={() => pick(w, k)} /><span className="k">{'ABCDEFG'[k]}</span><span>{o}</span></label>)}
          </fieldset>
          {p.pick !== undefined ? <div className="row between">{p.correct ? <Chip kind="done" ic="stamp" text={`答對了・連續 ${w.streak} / 2`} /> : <Chip kind="alert" ic="lantern" text="這次沒答對，連續答對歸零" />}<button type="button" className="xk-btn" onClick={() => setPractice(s => ({ ...s, [w.qid]: { open: true } }))}>再練一次 ›</button></div> : null}
        </>
      );
    } else area = <div className="row"><button type="button" className="xk-btn" onClick={() => setPractice(s => ({ ...s, [w.qid]: { open: true } }))}>開始重練 ›</button></div>;
    return (
      <article key={w.qid} className="xk-soft pad stack">
        <div className="row between">
          <div className="chips">{w.mastered ? <StatusChip text="已完成" label="已掌握" /> : <Chip kind="alert" ic="lantern" text="練習中" sm />}<span className="mini">{w.examName || '考核'}・{w.options.length === 2 ? '是非題' : '選擇題'}</span></div>
          <span className="row"><span className="mini">連續答對</span><span className="streak" aria-label={`連續答對 ${w.streak} / 2`}>{[0, 1].map(k => <i key={k} className={k < w.streak ? 'on' : ''} />)}</span><span className="disp">{w.streak} / 2</span></span>
        </div>
        <p className="pre" style={{ fontSize: 17, lineHeight: 1.8 }}>{w.stem}</p>
        <dl className="kv"><dt>上次的答案</dt><dd>{w.chosen == null ? '（未作答）' : w.options[w.chosen]}</dd><dt>錯誤類型</dt><dd>{w.errorType || '—'}</dd>
          <dt>對應 SOP</dt><dd>{w.sop ? <Link className="linkbtn" style={{ fontSize: 15 }} to={`/n/sop?rule=${encodeURIComponent(w.sop)}`}>{w.sopKnown ? w.sopName : `SOP ${w.sop}`}</Link> : <SopRef q={w} />}</dd></dl>
        {area}
      </article>
    );
  };

  return (
    <Layout nav="exam">
      <PageHead cap="考核" title="錯題區・重練" sub="把錯題練到會：連續答對 2 次就算掌握。" right={<Tabs group="exam" />} />
      <Async state={st}>{list => {
        if (!list.length) return <Empty gear="rookie" action={<Link className="xk-btn-ghost" to="/n/exam">回我的考核清單</Link>}>考完試後，答錯的選擇題會收在這裡。</Empty>;
        const m = list.filter(w => w.mastered).length;
        return (
          <>
            <div className="row between"><span className="mini">共 {list.length} 題・已掌握 {m} 題</span><div style={{ width: 260 }}><Bar pct={m / list.length * 100} label={`已掌握 ${m} / ${list.length}`} /></div></div>
            {list.map(card)}
          </>
        );
      }}</Async>
    </Layout>
  );
}
