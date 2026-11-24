import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as api from './api';
import type { NavCounts, User } from './types';

/* ---------- 登入狀態 ---------- */
interface AuthCtx { user: User | null; ready: boolean; setUser: (u: User | null) => void }
const Auth = createContext<AuthCtx>({ user: null, ready: false, setUser: () => {} });
export const useAuth = () => useContext(Auth);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(api.getStoredUser());
  const [ready, setReady] = useState(false);
  useEffect(() => { api.restoreUser().then(u => { setUser(u); setReady(true); }); }, []);
  return <Auth.Provider value={{ user, ready, setUser }}>{children}</Auth.Provider>;
}

/* ---------- 讀資料：載入中／失敗／重新載入（重新載入時保留舊畫面，不閃爍、不跳捲動位置） ---------- */
export function useAsync<R>(fn: () => Promise<R>, deps: unknown[] = []) {
  const [data, setData] = useState<R | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setError(null);
    fnRef.current().then(d => { if (alive) { setData(d); setLoading(false); } }).catch(e => { if (alive) { setError(e instanceof Error ? e : new Error(String(e))); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, error, loading: loading && data === undefined, reload, setData };
}

/* ---------- 提示（送出成功／失敗） ---------- */
interface ToastCtx { toast: (msg: string, kind?: 'ok' | 'err') => void }
const ToastC = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(ToastC).toast;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setT({ msg, kind }); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setT(null), 2800);
  }, []);
  return <ToastC.Provider value={{ toast }}>{children}{t && (
    <div id="toast" role="status" className={`xk-chip ${t.kind === 'err' ? 'xk-chip-alert' : 'xk-chip-done'} toast`}>
      <img className="xk-icon" src={`${import.meta.env.BASE_URL}assets/icons/${t.kind === 'err' ? 'lantern' : 'stamp'}.svg`} alt="" />{t.msg}
    </div>)}</ToastC.Provider>;
}

/* ---------- 對話框（取代 alert／confirm） ---------- */
export interface ModalAction { label: string; value: unknown; primary?: boolean }
interface ModalOpts { title: ReactNode; body: ReactNode; actions: ModalAction[] }
const ModalC = createContext<(o: ModalOpts) => Promise<unknown>>(() => Promise.resolve(null));
export const useModal = () => useContext(ModalC);
export function ModalProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState<(ModalOpts & { resolve: (v: unknown) => void }) | null>(null);
  const ask = useCallback((o: ModalOpts) => new Promise<unknown>(resolve => setM({ ...o, resolve })), []);
  const done = (v: unknown) => { m?.resolve(v); setM(null); };
  useEffect(() => {
    if (!m) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { m.resolve(null); setM(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [m]);
  return <ModalC.Provider value={ask}>{children}{m && (
    <div className="scrim" onClick={e => { if (e.target === e.currentTarget) done(null); }}>
      <div className="xk-panel modal" role="dialog" aria-modal="true" aria-labelledby="mdT">
        <h2 id="mdT">{m.title}</h2>{m.body}
        <div className="acts">{m.actions.map((a, i) => <button key={i} type="button" autoFocus={a.primary} className={a.primary ? 'xk-btn' : 'xk-btn-ghost'} onClick={() => done(a.value)}>{a.label}</button>)}</div>
      </div>
    </div>)}</ModalC.Provider>;
}

/* ---------- 導覽列上的數字（資料變動後呼叫 refresh） ---------- */
interface NavCtx { counts: NavCounts; refresh: () => void }
const NavC = createContext<NavCtx>({ counts: {}, refresh: () => {} });
export const useNav = () => useContext(NavC);
export function NavProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<NavCounts>({});
  const refresh = useCallback(() => { if (user) api.getNavCounts().then(setCounts).catch(() => setCounts({})); }, [user]);
  useEffect(() => { refresh(); }, [refresh]);
  return <NavC.Provider value={{ counts, refresh }}>{children}</NavC.Provider>;
}
