import { useState, type FormEvent } from 'react';
import { changePassword } from '../lib/api';
import { useAuth, useToast } from '../lib/hooks';
import { errMsg } from '../lib/utils';
import { Chip, FieldErr, PageHead } from '../components/ui';
import { Layout } from '../components/Layout';

/** 帳號：看自己的資料、改密碼（初始密碼是工號，登入後應該改掉）。 */
export default function Account() {
  const { user } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<{ pw?: string; pw2?: string }>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFail('');
    const n: typeof err = {};
    if (pw.length < 6) n.pw = '密碼至少 6 個字';
    if (pw2 !== pw) n.pw2 = '兩次輸入的密碼不一樣';
    setErr(n);
    if (n.pw || n.pw2) return;
    setBusy(true);
    try { await changePassword(pw); toast('密碼已更新，下次請用新密碼登入'); setPw(''); setPw2(''); }
    catch (ex) { setFail(errMsg(ex)); }
    setBusy(false);
  };

  return (
    <Layout nav="">
      <PageHead cap="帳號" title="帳號與密碼" sub="看自己的資料，並更新登入密碼。" />
      <section className="xk-soft pad" style={{ maxWidth: 720 }}>
        <dl className="kv"><dt>姓名</dt><dd>{user.name}</dd><dt>帳號（email）</dt><dd>{user.email}</dd><dt>工號</dt><dd>{user.employeeId}</dd><dt>身分</dt><dd>{user.role === 'senior' ? '資深' : '新人'}</dd></dl>
      </section>
      <section className="xk-panel pad" style={{ maxWidth: 720 }}>
        <form className="stack" onSubmit={submit} noValidate>
          <h2 style={{ fontSize: 22 }}>更新密碼</h2>
          <p className="hint">新帳號的初始密碼是工號，建議登入後馬上改掉。改完要用新密碼登入。</p>
          <div className="field"><label htmlFor="acPw">新密碼</label><input className="inp" id="acPw" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /><FieldErr id="acPw" msg={err.pw} /></div>
          <div className="field"><label htmlFor="acPw2">再輸入一次</label><input className="inp" id="acPw2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /><FieldErr id="acPw2" msg={err.pw2} /></div>
          <p role="alert">{fail ? <Chip kind="alert" ic="lantern" text={fail} /> : null}</p>
          <div className="row end"><button className="xk-btn" type="submit" disabled={busy}>{busy ? '更新中…' : '更新密碼 ›'}</button></div>
        </form>
      </section>
    </Layout>
  );
}
