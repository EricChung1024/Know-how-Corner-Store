import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { XIAOJU_ART } from '../lib/xiaoju-art';
import { asset, reduceMotion, sleep } from '../lib/utils';
import type { Outcome } from '../lib/types';

/* ---------- 圖示、標籤、小橘（品牌套件的 SVG 檔） ---------- */
export const Icon = ({ name, small }: { name: string; small?: boolean }) => <img className={`xk-icon${small ? ' xk-icon--sm' : ''}`} src={asset(`assets/icons/${name}.svg`)} alt="" />;

export function Chip({ kind, text, ic, sm }: { kind: string; text: ReactNode; ic?: string; sm?: boolean }) {
  return <span className={`xk-chip xk-chip-${kind}${sm ? ' sm' : ''}`}>{ic ? <Icon name={ic} /> : null}{text}</span>;
}
export const Tbd = ({ text }: { text: string }) => <span className="xk-chip xk-chip-doing tbd sm"><Icon name="pencil" />待補：{text}</span>;

/** 小橘（動畫：尾巴會甩；「減少動態效果」時由樣式停住）。expr：default／happy／hint／confused；gear：''／rookie／senior。 */
export function Xiaoju({ expr = 'default', gear = '', size = 'sm', label = '店貓小橘' }: { expr?: string; gear?: string; size?: '' | 'sm' | 'lg'; label?: string }) {
  const body = XIAOJU_ART[`${expr}|${gear || 'none'}`] || XIAOJU_ART['default|none'];
  return <svg className={`xiaoju${size ? ` xiaoju--${size}` : ''}`} viewBox="0 0 120 132" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: body }} />;
}
/** 小橘＋對話泡泡（小橘只出現在對話泡泡旁與進度路上）。 */
export function Say({ children, expr = 'default', gear = '', size = 'sm', cls = '' }: { children: ReactNode; expr?: string; gear?: string; size?: '' | 'sm' | 'lg'; cls?: string }) {
  return <div className={`xk-cat-say ${cls}`}><Xiaoju expr={expr} gear={gear} size={size} /><div className="xk-bubble xk-bubble-cat">{children}</div></div>;
}

/** 小橘的六種判斷標籤：[狀態標籤樣式, 圖示, 白話說明, 小橘表情] */
export const LABEL: Record<Outcome, [string, string, string, string]> = {
  '直接回答': ['done', 'book', 'SOP 有寫，照著做就對了', 'happy'],
  '已確認的變更': ['new', 'stamp', '規則改過，資深已確認以最新版為準', 'hint'],
  '舊規已失效': ['doing', 'lightbulb', '以前可以，現在不行了', 'hint'],
  '暫時規則已過期': ['ship', 'clock', '活動期間的暫時規定已經結束', 'hint'],
  '新舊版都不符 → 請問資深': ['alert', 'lantern', '查不到答案，已幫你記到待確認清單', 'confused'],
  '不在 SOP 範圍': ['return', 'search', '這題 SOP 沒有涵蓋', 'confused'],
};
export const LABELS = Object.keys(LABEL) as Outcome[];
export const LabelChip = ({ outcome, sm = true }: { outcome: Outcome; sm?: boolean }) => { const [k, ic] = LABEL[outcome] || ['return', 'search']; return <Chip kind={k} text={outcome} ic={ic} sm={sm} />; };
export const canFeedback = (o: Outcome) => o !== '新舊版都不符 → 請問資深' && o !== '不在 SOP 範圍';

/** 各種狀態的固定搭配（品牌套件：待處理＝chat、處理中＝headset、已完成＝stamp、需注意＝lantern）。 */
const STATUS: Record<string, [string, string]> = {
  '待處理': ['new', 'chat'], '已回覆': ['done', 'stamp'],
  '尚未開放': ['return', 'clock'], '可作答': ['new', 'quiz'], '已完成': ['done', 'stamp'], '尚未舉行': ['return', 'clock'],
  '待資深覆核': ['doing', 'headset'], '待覆核': ['doing', 'headset'],
  '待審': ['new', 'chat'], '已審': ['done', 'stamp'], '停用': ['ship', ''],
  '通過': ['done', 'stamp'], '未通過': ['alert', 'lantern'], '紅線': ['alert', 'lantern'], '最近更新': ['new', 'lightbulb'], '已讀': ['done', 'stamp'],
  '待審核': ['new', 'chat'], '已鎖定': ['done', 'stamp'], '待確認': ['new', 'chat'], '已確認': ['done', 'stamp'],
};
export const StatusChip = ({ text, sm = true, label }: { text: string; sm?: boolean; label?: string }) => { const [k, ic] = STATUS[text] || ['return', '']; return <Chip kind={k} text={label ?? text} ic={ic} sm={sm} />; };

/** SOP 引用：一律「SOP 章-條 主題」。 */
export function SopRef({ q }: { q: { sop: string | null; sopName: string | null; sopKnown: boolean } }) {
  if (!q.sop) return <><span className="muted">對應 SOP：未標示</span> <Tbd text="對應條目" /></>;
  return q.sopKnown ? <span>{q.sopName}</span> : <><span>SOP {q.sop}</span> <Tbd text="主題" /></>;
}

/* ---------- 版面小元件 ---------- */
export const Bar = ({ pct, label }: { pct: number; label: string }) => <div className="xk-lvbar" role="img" aria-label={label}><i style={{ width: `${Math.max(0, Math.min(100, pct)).toFixed(1)}%` }} /></div>;
export function PageHead({ cap, title, sub, right }: { cap: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return <div className="phead"><div><span className="xk-cap">{cap}</span><h1>{title}</h1>{sub ? <p className="sub">{sub}</p> : null}</div><div className="phead-r">{right}</div></div>;
}
export function Crumb({ items }: { items: [string, string?][] }) {
  return <nav className="crumb" aria-label="目前位置">{items.map(([t, h], i) => <span key={i}>{i > 0 ? ' › ' : ''}{h ? <Link to={h}>{t}</Link> : <span>{t}</span>}</span>)}</nav>;
}

/* ---------- 四種狀態：載入中、沒有資料、讀取失敗（送出成功用 toast） ---------- */
export const Loading = ({ text = '載入中…' }: { text?: string }) => <div className="state" role="status"><span className="spinner" aria-hidden="true" />{text}</div>;
export function Empty({ children, expr = 'default', gear = '', action }: { children: ReactNode; expr?: string; gear?: string; action?: ReactNode }) {
  return <div className="xk-soft pad empty"><Say expr={expr} gear={gear}>{children}</Say>{action ? <div className="row" style={{ marginTop: 16 }}>{action}</div> : null}</div>;
}
export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return <div className="xk-soft pad stack-s" role="alert"><Chip kind="alert" ic="lantern" text="讀取失敗" /><p>{error.message}</p><div className="row"><button type="button" className="xk-btn-ghost" onClick={retry ?? (() => location.reload())}>重新載入</button></div></div>;
}
/** 載入中／失敗／有資料三種畫面的外框。 */
export function Async<R>({ state, children }: { state: { data: R | undefined; error: Error | null; loading: boolean; reload: () => void }; children: (data: R) => ReactNode }) {
  if (state.error && state.data === undefined) return <ErrorBox error={state.error} retry={state.reload} />;
  if (state.loading || state.data === undefined) return <Loading />;
  return <>{children(state.data)}</>;
}

/* ---------- 欄位錯誤 ---------- */
export const FieldErr = ({ id, msg }: { id: string; msg?: string }) => (msg ? <p id={`${id}-err`} className="field-err">{msg}</p> : null);

/* ---------- 處理中動畫：會甩尾巴的小橘＋道路進度條＋逐步打勾 ---------- */
interface ProgressProps<R> { title: string; steps: string[]; task: () => Promise<R>; onDone: (r: R) => void; onError: (e: Error) => void; gear?: string; doneText?: string }
/** 元件一出現就開始執行 task；task 完成且步驟都跑完才呼叫 onDone；task 失敗呼叫 onError。 */
export function RunProgress<R>({ title, steps, task, onDone, onError, gear = 'senior', doneText = '完成了，喵。' }: ProgressProps<R>) {
  const [n, setN] = useState(0);
  const [msg, setMsg] = useState(title);
  useEffect(() => {
    let alive = true;
    const gap = reduceMotion() ? 60 : 550;
    (async () => {
      const taskP = task();
      taskP.catch(() => {});
      const walk = (async () => { for (let i = 1; i < steps.length; i++) { await sleep(gap); if (!alive) return; setN(i); } })();
      try {
        const [res] = await Promise.all([taskP, walk]);
        if (!alive) return;
        setN(steps.length); setMsg(doneText);
        await sleep(reduceMotion() ? 0 : 450);
        if (alive) onDone(res);
      } catch (e) { if (alive) onError(e instanceof Error ? e : new Error(String(e))); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="xk-cat-say"><Xiaoju expr="default" gear={gear} size="sm" label="店貓小橘（處理中）" /><div className="xk-bubble xk-bubble-cat">{msg}</div></div>
      <div className="loader-road" aria-hidden="true"><div className="xk-pat-road" /><i style={{ width: `${Math.round(n / steps.length * 100)}%` }} /></div>
      <ul className="loader-steps">{steps.map((s, i) => { const cls = i < n ? 'ok' : i === n ? 'run' : ''; return <li key={i} className={cls}><span className="mk" aria-hidden="true">{i < n ? '✓' : i === n ? '…' : '・'}</span><span>{s}</span></li>; })}</ul>
    </div>
  );
}
