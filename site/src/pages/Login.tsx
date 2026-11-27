import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { login } from '../lib/api';
import { useAuth } from '../lib/hooks';
import { COMPANY, DEMO_USERS, SHOW_DEMO_ACCOUNTS, type DemoAccount } from '../lib/config';
import { asset, errMsg, isEmail } from '../lib/utils';
import { Chip, FieldErr, Say } from '../components/ui';

export default function Login() {
  const { user, setUser } = useAuth();
  const go = useNavigate();
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [errs, setErrs] = useState<{ email?: string; secret?: string }>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<{ owner: string; a: DemoAccount } | null>(null);   // 目前自動填入的示範帳號
  if (user) return <Navigate to={user.role === 'senior' ? '/s/home' : '/n/home'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFail('');
    const next: typeof errs = {};
    if (!email.trim()) next.email = '請填寫帳號（email）'; else if (!isEmail(email)) next.email = '帳號是 email，格式不正確（例如 name@haowu.example）';
    if (!secret.trim()) next.secret = '請填寫工號／密碼';
    setErrs(next);
    if (next.email || next.secret) return;
    setBusy(true);
    try { const u = await login(email, secret); setUser(u); go(u.role === 'senior' ? '/s/home' : '/n/home'); }
    catch (ex) { setFail(errMsg(ex)); setBusy(false); }
  };
  const fill = (owner: string, a: DemoAccount) => { setEmail(a.email); setSecret(a.secret); setErrs({}); setFail(''); setPicked({ owner, a }); };

  return (
    <>
      <div className="xk-pat-awning" aria-hidden="true" />
      <main className="login" id="main">
        <section className="login-brand">
          <span className="brand-logo brand-logo--vertical">
            <img className="brand-logo__mark" src={asset('assets/logo/mark.svg')} alt="" />
            <span className="brand-logo__text"><span className="brand-logo__name">經驗柑仔店</span><span className="brand-logo__tagline">Know-how Corner Store</span></span>
          </span>
          <p className="login-lead">資深把經驗擺上架，<br />新人隨時來拿。</p>
          <Say>用公司 email 帳號和工號／密碼登入，系統會帶你到自己的首頁，喵。</Say>
        </section>
        <section className="xk-panel login-card" aria-labelledby="orgName">
          <div className="org"><h1 className="org-name" id="orgName">{COMPANY.name}</h1><p className="org-dept">{COMPANY.dept}</p></div>
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="lgId">帳號（email）</label>
              <input className="inp" id="lgId" name="identifier" autoComplete="username" placeholder="name@haowu.example" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={errs.email ? true : undefined} />
              <FieldErr id="lgId" msg={errs.email} />
            </div>
            <div className="field">
              <label htmlFor="lgSecret">工號／密碼</label>
              <input className="inp" id="lgSecret" name="secret" type="password" autoComplete="current-password" placeholder="例如 HW000000" value={secret} onChange={e => setSecret(e.target.value)} aria-invalid={errs.secret ? true : undefined} />
              <FieldErr id="lgSecret" msg={errs.secret} />
            </div>
            <p id="lgErr" role="alert">{fail ? <Chip kind="alert" ic="lantern" text={fail} /> : null}</p>
            <button className="xk-btn wide" type="submit" disabled={busy}>{busy ? '登入中…' : '登入 ›'}</button>
          </form>
          {SHOW_DEMO_ACCOUNTS && (
            <>
              <hr className="line" />
              <div className="stack-s">
                <p className="mini">示範用：先選使用者，按一下自動填入帳號與密碼，再按「登入」</p>
                <p className="demo-picked" role="status" aria-live="polite">{picked ? <>已填入：<b>{picked.owner}</b>・{picked.a.label}　{picked.a.name}</> : '還沒選擇示範帳號'}</p>
                <div className="acc-list" role="group" aria-label="自動填入示範帳號">
                  {DEMO_USERS.map(u => (
                    <div className="acc-user" key={u.owner}>
                      <span className="acc-owner">{u.owner}</span>
                      <div className="acc">
                        {u.accounts.map(a => (
                          <button key={a.role} type="button" onClick={() => fill(u.owner, a)} data-demo={a.role} data-owner={u.owner} aria-pressed={picked?.a.email === a.email}>
                            <b>{a.label}</b><span>{a.name}</span><span>{a.email}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
      <footer className="foot"><span>{COMPANY.name}・{COMPANY.dept}</span><span /></footer>
    </>
  );
}
