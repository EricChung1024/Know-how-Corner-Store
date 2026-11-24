import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useAuth, useModal, useNav, useToast } from '../../lib/hooks';
import { errMsg } from '../../lib/utils';
import { Async, Bar, Chip, Icon, PageHead, RunProgress, Say, StatusChip, Xiaoju } from '../../components/ui';
import { Layout } from '../../components/Layout';
import type { ConfirmItem, SopFlow } from '../../lib/types';

const STEPS = ['匯入資料', 'AI 統整', '資深確認 12 項', '產生資深版 SOP'];

interface Run { title: string; steps: string[]; task: () => Promise<unknown>; doneText: string; okMsg: string }

/** 資深 2｜SOP 統整：一頁四步驟 匯入資料 → AI 統整 → 資深確認 12 項 → 產生資深版 SOP */
export default function SFlow() {
  const { user } = useAuth();
  const toast = useToast();
  const modal = useModal();
  const { refresh } = useNav();
  const st = useAsync(() => api.getSopFlow(), []);
  const [run, setRun] = useState<Run | null>(null);     // 處理比較久的動作（一鍵匯入、AI 統整）：顯示小橘的進度畫面
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);            // 剛發布：印章動畫
  const fileIn = useRef<HTMLInputElement>(null);
  if (!user) return null;

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg); st.reload(); refresh(); } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  };

  const road = (f: SopFlow) => {
    const pos = (k: number) => (k / 3) * 100, cur = f.generated ? 3 : f.step - 1;
    const reach = [true, f.imported, f.organized, f.confirmedCount >= f.confirmTotal];
    return (
      <div className="road" role="group" aria-label="SOP 統整四步驟進度">
        <div className="road-bar xk-pat-road" /><div className="road-fill" style={{ width: `${pos(cur)}%` }} />
        <div className="road-cat" style={{ left: `${pos(cur)}%` }}><Xiaoju expr={f.generated ? 'happy' : 'default'} gear="senior" size="" /></div>
        {STEPS.map((s, k) => {
          const done = f.generated || k < f.step - 1, now = !f.generated && k === f.step - 1;
          const stt = done ? '完成' : now ? '進行中' : '還沒開始';
          return (
            <button key={s} type="button" className={`stop ${done ? 'done' : ''} ${now ? 'now' : ''}`} style={{ left: `${pos(k)}%` }} disabled={!(reach[k] && !f.generated) || busy}
              aria-label={`第 ${k + 1} 步 ${s}：${stt}`} onClick={() => act(() => api.setFlowStep(k + 1))}>
              <span className="dot" /><b>{s}</b><small>第 {k + 1} 步・{stt}</small>
            </button>
          );
        })}
      </div>
    );
  };

  const startPackage = (f: SopFlow) => setRun({
    title: `正在匯入「${f.sourcePackage.title}」…`,
    steps: [`連線到系統裡的資料包「${f.sourcePackage.title}」`, `讀取 ${f.sourcePackage.count} 份檔案`, `分類：舊 SOP 與資料 ${f.sourcePackage.oldDocs} 份、教學逐字稿 ${f.sourcePackage.transcripts} 份`, '建立這一輪的匯入紀錄'],
    task: api.importSourcePackage, doneText: `${f.sourcePackage.count} 份都匯入了，喵。`, okMsg: `已一鍵匯入 ${f.sourcePackage.count} 份資料`,
  });
  const startOrganize = (f: SopFlow) => {
    const old = f.sources.filter(s => s.kind === '舊檔').length;
    setRun({
      title: 'AI 統整中，大約要一下下…',
      steps: [`讀取 ${f.sources.length} 份來源（舊檔 ${old}、教學逐字稿 ${f.sources.length - old}）`, '整理逐字稿，標出說話者', '修正語音辨識的錯字', '拆成一條一條規則，標出紅線', '比對新舊版本，整理要資深確認的項目'],
      task: async () => { await api.runOrganize(); await api.setFlowStep(2); }, doneText: '統整好了，換你確認，喵。', okMsg: 'AI 統整完成',
    });
  };

  const panel = (f: SopFlow): ReactNode => {
    if (f.generated && f.published) {
      return (
        <>
          <div className="row between"><div className="stack-s"><h2 style={{ fontSize: 26 }}>資深版 SOP 已產生，同時發布給新人</h2><p>版本 {f.published.version}・發布日期 {f.published.publishedAt}・確認人 {f.published.confirmedBy}</p><p className="mini">新人版 SOP 已同步更新，新人登入後會在首頁和 SOP 頁看到「最近更新」。</p></div><span className={`xk-stamp ${fresh ? '' : 'still'}`}>已發布</span></div>
          <div className="row"><Link className="xk-btn" to="/s/sop">查看資深版 SOP ›</Link>
            <button type="button" className="xk-btn-ghost" disabled={busy} onClick={async () => {
              const ok = await modal({ title: '開始新一輪統整？', body: <p>目前發布的版本不會受影響，新人還是看得到；這一輪產生後才會更新。</p>, actions: [{ label: '取消', value: false }, { label: '開始 ›', value: true, primary: true }] });
              if (ok) act(() => api.startNewRound());
            }}>開始新一輪統整</button></div>
        </>
      );
    }
    if (f.step === 1) {
      const pk = f.sourcePackage, n = f.sources.length, old = f.sources.filter(s => s.kind === '舊檔').length;
      return (
        <>
          <div className="sec-h"><h2>第 1 步　匯入資料</h2>{f.imported ? <Chip kind="done" ic="stamp" text={`已匯入 ${n} 份`} sm /> : <StatusChip text="待處理" />}</div>
          {f.resetNote ? <div className="banner"><Icon name="lantern" /><span style={{ flex: 1 }}>{f.resetNote}</span></div> : null}
          <div className="card stack-s" style={{ padding: 24 }}>
            <div className="row between">
              <div className="stack-s"><b className="disp" style={{ fontSize: 20 }}><Icon name="package" />一鍵匯入「{pk.title}」</b>
                <span className="mini">共 {pk.count} 份：舊 SOP 與資料 {pk.oldDocs} 份、教學逐字稿 {pk.transcripts} 份。檔案已放在系統裡，不用一份一份選。</span></div>
              <button type="button" className={f.imported ? 'xk-btn-ghost' : 'xk-btn'} disabled={busy} onClick={() => startPackage(f)}>{f.imported ? '重新匯入資料包' : `一鍵匯入全部資料（${pk.count} 份）›`}</button>
            </div>
          </div>
          <div className="card" style={{ borderStyle: 'dashed', display: 'grid', gap: 8, justifyItems: 'start', padding: '18px 24px' }}>
            <div className="files-up"><label className="xk-btn-ghost" htmlFor="fileIn" style={{ cursor: 'pointer' }}>另外選擇檔案</label>
              <input id="fileIn" ref={fileIn} type="file" multiple className="sr" accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.csv,.srt,.vtt,.mp3,.mp4,.m4a"
                onChange={e => { const fs = [...(e.target.files || [])]; if (fs.length) act(() => api.importSources(fs), `已匯入 ${fs.length} 份檔案`); e.target.value = ''; }} /></div>
            <p className="mini">資料包以外的檔案：Word、PDF、Excel、Markdown、LINE 匯出、CSV、逐字稿（txt、srt、vtt）都可以。</p>
          </div>
          {n ? (
            <>
              <div className="scroll"><table className="tbl"><thead><tr><th>檔名</th><th>類型</th><th>格式</th><th>日期</th><th><span className="sr">動作</span></th></tr></thead>
                <tbody>{f.sources.map(s => (
                  <tr key={s.name}><td>{s.name}</td><td>{s.kind === '教學逐字稿' ? <Chip kind="doing" ic="headset" text={s.kind} sm /> : <Chip kind="return" ic="book" text={s.kind} sm />}</td><td>{s.format}</td><td className="nowrap">{s.date}</td>
                    <td><button type="button" className="linkbtn" disabled={busy} aria-label={`拿掉 ${s.name}`} onClick={() => act(() => api.removeSource(s.name), '已拿掉')}>拿掉</button></td></tr>
                ))}</tbody></table></div>
              <p className="mini">舊檔 {old} 份・教學逐字稿 {n - old} 份</p>
            </>
          ) : null}
          <div className="row end">{f.imported ? <button type="button" className="xk-btn" disabled={busy} onClick={() => startOrganize(f)}>下一步：AI 統整 ›</button> : <button className="xk-btn-ghost" type="button" disabled>下一步：AI 統整 ›</button>}</div>
        </>
      );
    }
    if (f.step === 2) {
      const r = f.organizeResult!, old = f.sources.filter(s => s.kind === '舊檔').length;
      return (
        <>
          <div className="sec-h"><h2>第 2 步　AI 統整</h2><StatusChip text="已完成" label="統整完成" /></div>
          <p className="mini">讀取 {f.sources.length} 份來源（舊檔 {old}、教學逐字稿 {f.sources.length - old}）</p>
          <div className="chips">{['清洗', '拆規則', '整理要確認的項目'].map((s, i) => <span key={s} className="row"><Chip kind="done" ic="stamp" text={s} sm />{i < 2 ? <span aria-hidden="true">›</span> : null}</span>)}</div>
          <div className="stat4">
            <div className="card"><span className="mini">章節</span><span className="big">{r.chapters}<small>章</small></span></div>
            <div className="card"><span className="mini">規則</span><span className="big">{r.rules}<small>條</small></span></div>
            <div className="card"><span className="mini">紅線</span><span className="big">{r.redLines}<small>條</small></span></div>
            <div className="card"><span className="mini">需要資深確認</span><span className="big">{r.confirmCount}<small>項</small></span></div>
          </div>
          <div className="row end"><button type="button" className="xk-btn" disabled={busy} onClick={() => act(() => api.setFlowStep(3))}>下一步：資深確認 12 項 ›</button></div>
        </>
      );
    }
    if (f.step === 3) {
      const mark = (it: ConfirmItem) => (it.decision ? <Chip kind="done" ic="stamp" text="已確認" sm /> : <StatusChip text="待處理" label="待確認" />);
      const buttons = (it: ConfirmItem) => it.options.map(o => (
        <button key={o} type="button" className="xk-btn-ghost" style={{ textAlign: 'left' }} disabled={busy} aria-pressed={it.decision === o} onClick={() => act(() => api.saveConfirmDecision(it.id, o))}>{o}</button>
      ));
      return (
        <>
          <div className="sec-h"><h2>第 3 步　資深確認 {f.confirmTotal} 項</h2><span className="row"><span className="disp">已確認 {f.confirmedCount} / {f.confirmTotal}</span><span style={{ width: 200 }}><Bar pct={f.confirmedCount / f.confirmTotal * 100} label={`已確認 ${f.confirmedCount} / ${f.confirmTotal}`} /></span></span></div>
          <Say expr="hint" gear="senior">一次看一項：前 4 張卡是小橘整理好、可以一次確認的；後面 8 題要你決定怎麼收進 SOP，喵。</Say>
          <div className="stack-s">
            {f.confirmItems.map((it, k) => it.kind === 'batch' ? (
              <article key={it.id} className="card confirm"><div className="row between"><b className="disp" style={{ fontSize: 18 }}>第 {k + 1} 項・{it.title}</b>{mark(it)}</div>
                <details><summary className="mini" style={{ cursor: 'pointer' }}>看這 {it.batchItems?.length} 條規則</summary>
                  <ul className="stack-s" style={{ margin: '8px 0 0', paddingLeft: 20 }}>{(it.batchItems || []).map(x => <li key={x.no + x.topic}><b>SOP {x.no} {x.topic}</b>：{x.proposed}{x.older.length ? <><br /><span className="mini">舊檔：{x.older.join('；')}</span></> : null}</li>)}</ul></details>
                <div className="row">{buttons(it)}</div></article>
            ) : (
              <article key={it.id} className="card confirm"><div className="row between"><b className="disp" style={{ fontSize: 18 }}>第 {k + 1} 項・{it.name}</b>{mark(it)}</div>
                <p className="pre">{it.ask}</p>
                {it.context?.length ? <div className="card" style={{ background: 'var(--gold-tint)' }}><span className="lbl">舊檔怎麼寫</span>{it.context.map(c => <p key={c.label}>{c.label}：{c.text}{c.status ? <> <span className="mini">（{c.status}）</span></> : null}</p>)}</div> : null}
                {it.aiPick ? <p className="mini">小橘建議：{it.aiPick}</p> : null}
                <div className="stack-s">{buttons(it)}</div></article>
            ))}
          </div>
          <div className="row end">{f.confirmedCount >= f.confirmTotal ? <button type="button" className="xk-btn" disabled={busy} onClick={() => act(() => api.setFlowStep(4))}>下一步：產生資深版 SOP ›</button> : <button className="xk-btn" type="button" disabled>還有 {f.confirmTotal - f.confirmedCount} 項沒確認</button>}</div>
        </>
      );
    }
    return (
      <>
        <div className="sec-h"><h2>第 4 步　產生資深版 SOP</h2><Chip kind="new" ic="chat" text="可以產生" sm /></div>
        <dl className="kv" style={{ fontSize: 16 }}><dt>版本</dt><dd>{f.version}</dd><dt>內容</dt><dd>{f.organizeResult ? `${f.organizeResult.chapters} 章・${f.organizeResult.rules} 條・紅線 ${f.organizeResult.redLines} 條` : ''}</dd><dt>資深確認</dt><dd>{f.confirmedCount} / {f.confirmTotal} 項</dd><dt>確認人</dt><dd>{user.name}</dd></dl>
        <div className="banner"><Icon name="lightbulb" /><span style={{ flex: 1 }}>產生就等於發布：新人版 SOP 會同時更新，不用另外按發布。</span></div>
        <div className="row end"><button type="button" className="xk-btn" disabled={busy} onClick={() => act(async () => { await api.generateSeniorSop(); setFresh(true); }, '已產生資深版 SOP，新人版同步更新')}>產生資深版 SOP ›</button></div>
      </>
    );
  };

  return (
    <Layout nav="flow">
      <Async state={st}>{f => (
        <>
          <PageHead cap="SOP 統整" title="SOP 統整" sub="把舊資料整理成最新版 SOP：匯入資料 → AI 統整 → 資深確認 12 項 → 產生資深版 SOP。"
            right={f.published && !f.generated ? <span className="mini">目前版本 {f.published.version}・{f.published.publishedAt} 發布</span> : null} />
          <section className="xk-soft pad">{road(f)}</section>
          <section className="xk-panel pad stack">
            {run ? (
              <RunProgress title={run.title} steps={run.steps} task={run.task} doneText={run.doneText}
                onDone={() => { toast(run.okMsg); setRun(null); st.reload(); refresh(); }}
                onError={e => { toast(e.message, 'err'); setRun(null); st.reload(); }} />
            ) : panel(f)}
          </section>
        </>
      )}</Async>
    </Layout>
  );
}
