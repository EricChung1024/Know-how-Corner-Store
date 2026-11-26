import { useState, type FormEvent } from 'react';
import * as api from '../../lib/api';
import { useAsync, useModal, useNav, useToast } from '../../lib/hooks';
import { errMsg } from '../../lib/utils';
import { Async, Chip, Empty, FieldErr, LabelChip, PageHead, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';

type Filter = '待處理' | '已回覆' | '全部';

/** 資深 4｜待確認清單：回覆。回答小橘查不到的問題；目前沒有寄信服務，送出後做站內通知 */
export default function SPending() {
  const toast = useToast();
  const modal = useModal();
  const { refresh } = useNav();
  const [filter, setFilter] = useState<Filter>('待處理');
  const [sel, setSel] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const st = useAsync(async () => { const [shown, open] = await Promise.all([api.listPending(filter), api.listPending('待處理')]); return { shown, open: open.length }; }, [filter]);

  const send = async (e: FormEvent, id: string) => {
    e.preventDefault();
    if (!reply.trim()) { setErr('請輸入回覆內容'); return; }
    setErr(''); setBusy(true);
    try {
      const { mail } = await api.replyPending(id, reply.trim());
      setReply(''); setFilter('全部'); st.reload(); refresh();
      toast('已送出回覆');
      await modal({
        title: mail.sent ? '已寄信通知新人' : '已通知新人',
        body: <><div className="mail"><dl className="kv"><dt>通知對象</dt><dd>{mail.toName}（{mail.to}）</dd><dt>主旨</dt><dd>{mail.subject}</dd></dl><hr className="line" /><p>你在 {mail.askedAt} 問小橘的問題已經有回覆了：</p><div className="quote">{mail.question}</div><p>請到「經驗柑仔店 › 問答亭 › 待確認清單」查看回覆。</p></div>
        </>,
        actions: [{ label: '知道了', value: true, primary: true }],
      });
    } catch (ex) { toast(errMsg(ex), 'err'); }
    setBusy(false);
  };

  return (
    <Layout nav="qa">
      <PageHead cap="問答管理" title="待確認清單：回覆" sub="回答小橘查不到的問題，送出後新人的首頁會出現回覆提醒。" right={<Tabs group="sqa" />} />
      <Async state={st}>{({ shown, open }) => {
        const cur = shown.find(p => p.id === sel) ?? shown[0] ?? null;
        return (
          <div className="side-l">
            <aside className="stack-s">
              <div className="xk-segs" role="group" aria-label="篩選狀態">
                {(['待處理', '已回覆', '全部'] as Filter[]).map(x => <button key={x} type="button" className="xk-seg" aria-pressed={filter === x} onClick={() => { setFilter(x); setSel(null); }}>{x}{x === '待處理' && open ? <> <span className="cnt">{open}</span></> : null}</button>)}
              </div>
              {shown.length ? shown.map(p => (
                <button key={p.id} type="button" className="card item" aria-pressed={p.id === cur?.id} onClick={() => setSel(p.id)}>
                  <div className="meta"><StatusChip text={p.status} /><span>{p.askerName}</span><span>{p.date}</span></div><span className="clamp2">{p.question}</span>
                </button>
              )) : <p className="mini" style={{ padding: 8 }}>這個分類沒有問題。</p>}
            </aside>
            {!cur ? <Empty expr="happy" gear="senior">{filter === '待處理' ? '目前沒有待回覆的問題。新人問小橘查不到答案時，題目會出現在這裡。' : '這個分類沒有問題。'}</Empty> : (
              <section className="xk-panel pad stack" aria-labelledby="rdT">
                <div className="row between"><h2 id="rdT" style={{ fontSize: 22 }}>{cur.askerName}・{cur.date} 提問</h2><StatusChip text={cur.status} sm={false} /></div>
                <div className="quote"><p className="disp" style={{ fontSize: 18 }}>{cur.question}</p></div>
                <div className="stack-s"><p className="lbl">小橘的判斷</p><div className="chips"><LabelChip outcome={cur.outcome} /><span className="src">{cur.sourceChip}</span></div><p className="mini pre">小橘回給新人：{cur.aiReply}</p></div>
                <hr className="line" />
                {cur.status === '已回覆' ? (
                  <><div className="reply"><p className="lbl" style={{ marginBottom: 6 }}>{cur.repliedBy}的回覆・{cur.repliedAt}</p><p className="pre">{cur.reply}</p></div>
                    <div className="row">{cur.notifiedAt ? <Chip kind="done" ic="stamp" text={`已通知 ${cur.askerName}`} /> : <Chip kind="alert" ic="lantern" text="還沒通知" />}</div></>
                ) : (
                  <form className="stack-s" onSubmit={e => send(e, cur.id)} noValidate>
                    <div className="field"><label htmlFor="replyIn">回覆給 {cur.askerName}</label><textarea className="inp xk-pat-notebook" id="replyIn" rows={5} placeholder="寫下正確做法；送出後新人會收到通知" value={reply} onChange={e => setReply(e.target.value)} /><FieldErr id="replyIn" msg={err} /></div>
                    <div className="row end"><button className="xk-btn" type="submit" disabled={busy}>{busy ? '送出中…' : '送出回覆並通知新人 ›'}</button></div>
                  </form>
                )}
              </section>
            )}
          </div>
        );
      }}</Async>
    </Layout>
  );
}
