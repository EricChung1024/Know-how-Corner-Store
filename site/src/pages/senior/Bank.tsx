import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useModal, useToast } from '../../lib/hooks';
import { errMsg } from '../../lib/utils';
import { Async, Chip, Icon, PageHead, SopRef, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';
import type { BankFilter, BankItem, BankStatus } from '../../lib/types';

const SOURCE: Record<string, string> = { rules: '總表規則', rules_ext: '總表延伸（案件）', legacy: '通用電商題' };
const TYPE = { mcq: '選擇', tf: '是非', short: '簡答' } as const;
/** 題目最後一行是問句，前面是情境（「你是電商客服專員小安…」那行省略）。列表先顯示問句，情境縮成灰字。 */
const lines = (stem: string) => stem.split('\n').map(x => x.trim()).filter(x => x && !/^你是電商客服專員/.test(x));
const ask = (stem: string) => { const l = lines(stem); return l[l.length - 1] || stem; };
const scene = (stem: string) => lines(stem).slice(0, -1).join(' ');

/** 資深 9｜題庫審核：785 題逐題或批次審核；只有「已審」的題目會被抽進考卷。正確答案只在後端，這頁不顯示。 */
export default function SBank() {
  const toast = useToast();
  const modal = useModal();
  const [f, setF] = useState<Required<Pick<BankFilter, 'status' | 'qtype' | 'level' | 'source' | 'q' | 'page'>>>({ status: '待審', qtype: '', level: '', source: '', q: '', page: 1 });
  const [kw, setKw] = useState('');
  const [busy, setBusy] = useState(false);
  const st = useAsync(() => api.listBank(f), [f]);

  const patch = (p: Partial<typeof f>) => setF(s => ({ ...s, page: 1, ...p }));
  const setStatus = async (q: BankItem, status: BankStatus) => {
    setBusy(true);
    try { await api.setBankStatus(q.id, status); toast(`${q.id} 改為「${status}」`); st.reload(); } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  };
  const describe = () => [f.qtype && ({ mcq: '選擇題', tf: '是非題', short: '簡答題', choice: '選擇／是非題' } as Record<string, string>)[f.qtype], f.level && `Lv.${f.level}`, f.source && SOURCE[f.source], f.q && `「${f.q}」`].filter(Boolean).join('、') || '全部題型與難度';
  const bulk = async (matched: number) => {
    const ok = await modal({
      title: `把 ${matched} 題改成「已審」？`,
      body: <><p>範圍：狀態「{f.status}」・{describe()}。</p><p>案件題（總表延伸、通用電商題）匯入時標「待公司主管審核」，通過後會被抽進考卷。確定內容適合貴公司再通過。</p></>,
      actions: [{ label: '取消', value: false }, { label: `全部通過（${matched} 題）›`, value: true, primary: true }],
    });
    if (!ok) return;
    setBusy(true);
    try { const r = await api.setBankStatusBulk(f, '已審'); toast(`已通過 ${r.changed} 題${r.skipped ? `，${r.skipped} 題已用在鎖定考卷所以跳過` : ''}`); setF(s => ({ ...s, page: 1 })); st.reload(); } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  };
  const search = (e: FormEvent) => { e.preventDefault(); patch({ q: kw.trim() }); };

  return (
    <Layout nav="exam">
      <PageHead cap="考核管理" title="題庫審核" sub="確認題庫裡的題目合適；只有「已審」的題目會被抽進考卷。" right={<Tabs group="sexam" />} />
      <Async state={st}>{b => {
        const t = b.totals;
        const sel = (label: string, key: 'qtype' | 'level' | 'source', opts: [string | number, string][]) => (
          <div className="field"><label htmlFor={`f-${key}`}>{label}</label>
            <select className="inp" id={`f-${key}`} value={String(f[key])} onChange={e => patch({ [key]: e.target.value } as Partial<typeof f>)}>{opts.map(([v, tx]) => <option key={v} value={v}>{tx}</option>)}</select></div>
        );
        const act = (q: BankItem, s: BankStatus, label: string) => <button key={s} type="button" className="xk-btn-ghost" disabled={busy} onClick={() => setStatus(q, s)}>{label}</button>;
        return (
          <>
            <div className="g4">
              <div className="card tile"><span className="t"><Icon name="quiz" />題庫</span><span className="big">{t.total}<small>題</small></span><span className="mini">選擇 {t.mcq}・是非 {t.tf}・簡答 {t.short}</span></div>
              <div className="card tile"><span className="t"><Icon name="stamp" />已審</span><span className="big">{t.approved}<small>題</small></span><span className="mini">會被抽進考卷</span></div>
              <div className="card tile"><span className="t"><Icon name="chat" />待審</span><span className="big">{t.pending}<small>題</small></span><span className="mini">案件題要資深確認內容</span></div>
              <div className="card tile"><span className="t"><Icon name="lantern" />停用</span><span className="big">{t.disabled}<small>題</small></span><span className="mini">不會再被抽到</span></div>
            </div>
            <section className="xk-soft pad stack-s" aria-label="篩選">
              <div className="xk-segs" role="group" aria-label="審核狀態">
                {(['待審', '已審', '停用', '全部'] as const).map(x => <button key={x} type="button" className="xk-seg" aria-pressed={f.status === x} onClick={() => patch({ status: x })}>{x}{x === '待審' ? ` ${t.pending}` : x === '已審' ? ` ${t.approved}` : x === '停用' ? ` ${t.disabled}` : ''}</button>)}
              </div>
              <form className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={search} noValidate>
                {sel('題型', 'qtype', [['', '全部'], ['mcq', '選擇題'], ['tf', '是非題'], ['short', '簡答題']])}
                {sel('難度', 'level', [['', '全部'], [1, 'Lv.1 基礎'], [2, 'Lv.2 情境應用'], [3, 'Lv.3 綜合']])}
                {sel('來源', 'source', [['', '全部'], ['rules', '總表規則'], ['rules_ext', '總表延伸（案件）'], ['legacy', '通用電商題']])}
                <div className="field"><label htmlFor="f-q">題號、主題或關鍵字</label><input className="inp" id="f-q" value={kw} onChange={e => setKw(e.target.value)} placeholder="例如 L-M001、退款" style={{ width: 220 }} /></div>
                <button className="xk-btn-ghost" type="submit"><Icon name="search" small />搜尋</button>
              </form>
            </section>
            <div className="row between">
              <span className="mini">符合 {b.matched} 題{b.pages > 1 ? `・第 ${b.page} / ${b.pages} 頁` : ''}・不顯示正確答案（只在後端）</span>
              {f.status !== '已審' && b.matched > 0 ? <button type="button" className="xk-btn" disabled={busy} onClick={() => bulk(b.matched)}>篩選結果全部通過（{b.matched} 題）›</button> : null}
            </div>
            <div className="scroll"><table className="tbl"><thead><tr><th>題號</th><th>題型</th><th>題目</th><th>對應 SOP 條目</th><th>狀態</th><th>動作</th></tr></thead>
              <tbody>{b.items.length ? b.items.map(q => (
                <tr key={q.id}>
                  <td className="nowrap"><b>{q.id}</b><br /><span className="mini">{q.kind}</span></td>
                  <td className="nowrap">{TYPE[q.qtype]}<br /><span className="mini">Lv.{q.level}</span>{q.redLine ? <><br /><Chip kind="alert" ic="lantern" text="紅線" sm /></> : null}</td>
                  <td className="q"><span className="mini">{q.topic}{q.ability ? `・${q.ability}` : ''}</span><b className="clamp2">{ask(q.stem)}</b><span className="mini clamp2">{scene(q.stem)}</span></td>
                  <td><SopRef q={q} /></td><td className="nowrap"><StatusChip text={q.status} /></td>
                  <td><div className="row">{q.inLockedPaper ? <span className="mini">已用在鎖定的考卷</span> : q.status === '待審' ? <>{act(q, '已審', '通過')}{act(q, '停用', '停用')}</> : q.status === '已審' ? act(q, '停用', '停用') : act(q, '待審', '恢復待審')}</div></td>
                </tr>
              )) : <tr><td colSpan={6} className="muted">沒有符合的題目。</td></tr>}</tbody></table></div>
            {b.pages > 1 ? (
              <div className="row between"><button type="button" className="xk-btn-ghost" disabled={b.page <= 1} onClick={() => { setF(s => ({ ...s, page: b.page - 1 })); window.scrollTo({ top: 0 }); }}>‹ 上一頁</button><span className="mini">第 {b.page} / {b.pages} 頁</span><button type="button" className="xk-btn-ghost" disabled={b.page >= b.pages} onClick={() => { setF(s => ({ ...s, page: b.page + 1 })); window.scrollTo({ top: 0 }); }}>下一頁 ›</button></div>
            ) : null}
            <div className="row"><Link className="linkbtn" to="/s/paper">回考卷審核 ›</Link></div>
          </>
        );
      }}</Async>
    </Layout>
  );
}
