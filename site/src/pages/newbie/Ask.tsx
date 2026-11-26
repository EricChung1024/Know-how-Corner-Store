import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useToast } from '../../lib/hooks';
import { errMsg } from '../../lib/utils';
import { Async, canFeedback, Chip, FieldErr, Icon, LABEL, LABELS, LabelChip, PageHead, Say, Xiaoju } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';
import type { Ask } from '../../lib/types';

/** 小橘思考中：三個跳動的小點，等越久提示越不一樣（Gemini 偶爾要十幾秒，讓新人知道小橘沒當機）。 */
function Thinking() {
  const [sec, setSec] = useState(0);
  useEffect(() => { const t0 = Date.now(); const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 1000); return () => clearInterval(id); }, []);
  const text = sec < 6 ? '小橘思考中…' : sec < 15 ? '小橘正在翻 SOP，再等一下喔…' : '這題比較難，小橘還在想，快好了…';
  return (
    <div className="thinking" role="status" aria-live="polite">
      <span className="typing" aria-hidden="true"><i /><i /><i /></span>
      <span className="t-text">{text}</span>
    </div>
  );
}

/** 新人 3｜問小橘：隨時問 SOP 的問題（?rule=7-9 表示從新人版 SOP 帶著條目過來） */
export default function NAsk() {
  const [sp] = useSearchParams();
  const ctx = sp.get('rule');
  const toast = useToast();
  const st = useAsync(async () => {
    const [sugg, settings, asks] = await Promise.all([api.listSuggestedQuestions(), api.getExamSettings(), api.listMyAsks()]);
    return { sugg, reasons: settings.noHelpReasons, asks: [...asks].reverse() };
  }, []);
  const ctxName = (sugg: { ruleNo: string | null; ruleName: string | null }[]) => (sugg.find(s => s.ruleNo === ctx)?.ruleName) || `SOP ${ctx}`;
  const [input, setInput] = useState<string | null>(null);   // null＝還沒輸入過，用預設（從 SOP 帶來的前綴）
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingQ, setPendingQ] = useState<string | null>(null);   // 正在問、還沒回來的問題（顯示小橘思考中）
  const [fbOpen, setFbOpen] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const count = st.data?.asks.length ?? 0;
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [count, pendingQ]);
  useEffect(() => { setPendingQ(null); }, [count]);

  const ask = async (text: string, sugg?: { ruleNo: string | null; ruleName: string | null }[]) => {
    setBusy(true); setPendingQ(text); setInput('');
    try { await api.askXiaoju(text); st.reload(); }   // 思考中的氣泡等新回答出現在列表時才收掉（下方 effect），避免閃一下
    catch (e) { setInput(text); setPendingQ(null); toast(errMsg(e), 'err'); }
    setBusy(false);
    void sugg;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = (input ?? '').trim();
    if (!v) { setErr('請先輸入問題'); return; }
    setErr(''); ask(v);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } };
  const feedback = async (id: string, helpful: boolean, reason = '') => {
    try { await api.sendFeedback(id, helpful, reason); setFbOpen(null); toast(helpful ? '謝謝回饋' : '謝謝回饋，資深會參考原因'); st.reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };

  const answer = (a: Ask, reasons: string[]) => {
    const expr = LABEL[a.outcome]?.[3];
    let fb = null;
    if (canFeedback(a.outcome)) {
      if (a.feedback === 'up') fb = <div className="fb"><Chip kind="done" ic="stamp" text="已回饋：有幫助" sm /></div>;
      else if (a.feedback === 'down') fb = <div className="fb"><Chip kind="return" ic="pencil" text={`已回饋：沒幫助（${a.reason}）`} sm /></div>;
      else if (fbOpen === a.id) {
        fb = (
          <div className="fb" role="group" aria-label="沒幫助的原因"><span className="lbl">哪裡沒幫助？</span>
            {reasons.map(r => <button key={r} type="button" className="xk-chip xk-chip-return" style={{ cursor: 'pointer' }} onClick={() => feedback(a.id, false, r)}>{r}</button>)}
          </div>
        );
      } else {
        fb = <div className="fb"><span className="lbl">這個回答有幫助嗎？</span><button type="button" className="xk-btn-ghost sm" onClick={() => feedback(a.id, true)}>有幫助</button><button type="button" className="xk-btn-ghost sm" onClick={() => setFbOpen(a.id)}>沒幫助</button></div>;
      }
    }
    return (
      <div key={a.id}>
        <div className="xk-bubble xk-bubble-me msg-me">{a.question}</div>
        <div className="xk-cat-say msg-cat">
          <Xiaoju expr={expr || 'hint'} gear="rookie" size="" />
          <div className="xk-bubble xk-bubble-cat">
            <div className="chips"><LabelChip outcome={a.outcome} />{a.engine === 'gemini' ? <Chip kind="new" ic="lightbulb" text="Gemini AI 回答" sm /> : null}</div>
            <p className="pre">{a.reply}</p>
            {a.engine === 'gemini' ? <p className="mini">這則回答由 Gemini AI 根據公司 SOP 整理，重要規定請以「出處」的 SOP 原文為準，不確定就問資深。</p> : null}
            {a.sourceChip ? (a.ruleNo ? <Link className="linkbtn src-link" to={`/n/sop?rule=${encodeURIComponent(a.ruleNo)}`} title="到新人版 SOP 看這一條"><Icon name="book" small /> {a.sourceChip}</Link> : <p className="src">{a.sourceChip}</p>) : null}
            {a.writesPending ? <div className="reply row"><Icon name="pencil" /><span>已寫入<Link to="/n/pending">待確認清單</Link>，資深回覆後會在首頁提醒你。</span></div> : null}
            {fb}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout nav="qa">
      <Async state={st}>{({ sugg, reasons, asks }) => {
        const asked = new Set(asks.map(a => a.question));
        const order = ctx ? [...sugg.filter(s => s.ruleNo === ctx), ...sugg.filter(s => s.ruleNo !== ctx)] : sugg;
        const value = input ?? (ctx ? `關於「${ctxName(sugg)}」：` : '');
        return (
          <>
            <PageHead cap="問答亭" title="問小橘" sub="小橘依最新版 SOP 回答，每個答案都會標出處和判斷結果。" right={<Tabs group="qa" />} />
            <div className="side">
              <div className="stack">
                <section className="xk-panel chat" aria-label="和小橘的對話">
                  <div className="chat-log" ref={log} aria-live="polite">
                    <div className="xk-cat-say msg-cat"><Xiaoju expr="default" gear="rookie" size="" /><div className="xk-bubble xk-bubble-cat"><p>我是小橘。SOP 有寫的我幫你查，查不到就記下來問資深，喵。</p></div></div>
                    {asks.map(a => answer(a, reasons))}
                    {pendingQ !== null ? (
                      <div key="pending">
                        <div className="xk-bubble xk-bubble-me msg-me">{pendingQ}</div>
                        <div className="xk-cat-say msg-cat"><Xiaoju expr="hint" gear="rookie" size="" /><div className="xk-bubble xk-bubble-cat"><Thinking /></div></div>
                      </div>
                    ) : null}
                  </div>
                  {ctx ? <div className="ctx"><Chip kind="return" ic="book" text={`從「${ctxName(sugg)}」帶過來`} sm /><Link className="linkbtn" to="/n/ask" style={{ fontSize: 14 }} onClick={() => setInput('')}>取消</Link></div> : null}
                  <form className="chat-in" onSubmit={submit} noValidate>
                    <label className="sr" htmlFor="askIn">輸入問題</label>
                    <div style={{ flex: 1 }}><textarea className="inp" id="askIn" name="q" rows={1} placeholder="輸入問題，按 Enter 送出" value={value} onChange={e => setInput(e.target.value)} onKeyDown={onKey} /><FieldErr id="askIn" msg={err} /></div>
                    <button className="xk-btn" type="submit" disabled={busy}>{busy ? '小橘查詢中…' : '送出 ›'}</button>
                  </form>
                </section>
                <section className="xk-soft pad-s" aria-labelledby="lgdT">
                  <h2 id="lgdT" style={{ fontSize: 19, marginBottom: 12 }}>小橘的六種判斷</h2>
                  <div className="legend">{LABELS.map(l => <div key={l}><LabelChip outcome={l} /><p>{LABEL[l][2]}</p></div>)}</div>
                </section>
              </div>
              <aside className="stack">
                <section className="xk-soft pad-s" aria-labelledby="sgT">
                  <div className="sec-h"><h2 id="sgT" style={{ fontSize: 19 }}>常見問題</h2><span className="xk-chip xk-chip-return sm">取自問答案例</span></div>
                  <div className="sugg">
                    {order.map(s => (
                      <button key={s.id} type="button" className={ctx && s.ruleNo === ctx ? 'hot' : ''} disabled={busy} onClick={() => ask(s.question)}>
                        <span className="tag">{s.id}</span><span>{s.question}{asked.has(s.question) ? <> <span className="mini">（問過）</span></> : null}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mini" style={{ marginTop: 10 }}>也可以輸入和 SOP 無關的問題，看小橘怎麼標「不在 SOP 範圍」。</p>
                </section>
              </aside>
            </div>
          </>
        );
      }}</Async>
    </Layout>
  );
}
