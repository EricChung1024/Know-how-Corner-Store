import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, StatusChip, Tbd } from './ui';
import type { PublishedSop } from '../lib/types';

/** 新人版 SOP 與資深版 SOP 共用：章節目錄、搜尋、條目「SOP 章-條 主題」。 */
export function SopView({ sop, mode, reads = {}, focus = null, scrollCh = null, onRead }: {
  sop: PublishedSop; mode: 'newbie' | 'senior'; reads?: Record<string, boolean>; focus?: string | null; scrollCh?: string | null; onRead?: (no: string) => void;
}) {
  const senior = mode === 'senior';
  const [term, setTerm] = useState('');
  const t = term.trim();
  const shown = (r: PublishedSop['rules'][number]) => !t || `${r.name} ${r.rule}`.includes(t);
  const hit = sop.rules.filter(shown).length;

  // 從別的頁面帶著條目或章節過來時，跳到那個位置
  useEffect(() => {
    const id = focus ? `rule-${focus}` : scrollCh ? `ch-${scrollCh}` : null;
    if (!id) return;
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 0);
    return () => clearTimeout(timer);
  }, [focus, scrollCh]);
  const toCh = (no: string) => document.getElementById(`ch-${no}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="toc-layout">
      <aside className="xk-soft toc" aria-label="章節目錄">
        <p className="lbl" style={{ padding: '4px 10px' }}>章節目錄</p>
        {sop.chapters.map(c => {
          const rs = sop.rules.filter(r => r.chapter === c.no), rd = rs.filter(r => reads[r.no]).length;
          return (
            <button key={c.no} type="button" onClick={() => toCh(c.no)}>
              <span><span className="n">{c.no}</span>{c.name}</span>
              {!rs.length ? <span className="mini">—</span> : senior ? <span className="mini">{rs.length} 條</span> : <span className="mini">{rd}/{rs.length}</span>}
            </button>
          );
        })}
      </aside>
      <div className="stack">
        <div className="xk-soft pad-s row between">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="sopQ" className="sr">搜尋 SOP</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}><Icon name="search" /><input className="inp" id="sopQ" type="search" placeholder="搜尋條目、主題或關鍵字，例如：退款" value={term} onChange={e => setTerm(e.target.value)} /></div>
          </div>
          <span className="mini" aria-live="polite">{t ? `找到 ${hit} 條` : ''}</span>
        </div>
        {sop.chapters.map(c => {
          const rs = sop.rules.filter(r => r.chapter === c.no), vis = rs.filter(shown);
          if (t && !vis.length) return null;
          const missing = focus && focus.split('-')[0] === c.no && !sop.rules.some(r => r.no === focus);
          return (
            <section key={c.no} className="chapter" id={`ch-${c.no}`}>
              <h2>{c.no}　{c.name} <small>{c.desc}</small></h2>
              {vis.map(r => {
                const isRead = !!reads[r.no];
                return (
                  <article key={r.no} className={`card rule ${focus === r.no ? 'focus' : ''}`} id={`rule-${r.no}`}>
                    <div className="row between">
                      <h3>{r.name}</h3>
                      <div className="chips">
                        {r.redLine ? <StatusChip text="紅線" /> : null}
                        {!senior && r.recent ? <StatusChip text="最近更新" /> : null}
                        {senior ? <span className="mini">生效日 {r.effective}</span> : isRead ? <StatusChip text="已讀" /> : null}
                      </div>
                    </div>
                    <p className="txt">{r.rule}</p>
                    {senior ? null : (
                      <div className="row between">
                        <Link className="linkbtn" to={`/n/ask?rule=${encodeURIComponent(r.no)}`}><Icon name="chat" small />帶著這條問小橘</Link>
                        {isRead ? null : <button type="button" className="xk-btn-ghost" onClick={() => onRead?.(r.no)}>標為已讀</button>}
                      </div>
                    )}
                  </article>
                );
              })}
              {missing ? <div className="card rule focus" id={`rule-${focus}`}><h3>SOP {focus} <Tbd text="主題" /></h3><p className="muted">找不到這一條 SOP。</p></div> : null}
            </section>
          );
        })}
        {t && hit === 0 ? <p className="empty-ch">找不到符合的條目，換個關鍵字試試。</p> : null}
      </div>
    </div>
  );
}
