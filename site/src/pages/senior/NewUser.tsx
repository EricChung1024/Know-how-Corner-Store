import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../../lib/api';
import { errMsg, isEmail } from '../../lib/utils';
import { Chip, Crumb, FieldErr, PageHead } from '../../components/ui';
import { Layout } from '../../components/Layout';
import type { Role } from '../../lib/types';

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** 資深 10｜新增員工：建立帳號（初始密碼＝工號，請對方登入後到「帳號」頁改密碼） */
export default function SNewUser() {
  const go = useNavigate();
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('newbie');
  const [hire, setHire] = useState(todayStr());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFail('');
    const n: Record<string, string> = {};
    if (!name.trim()) n.name = '請填寫姓名';
    if (!id.trim()) n.id = '請填寫工號';
    if (!email.trim()) n.email = '請填寫 email'; else if (!isEmail(email)) n.email = 'email 格式不正確';
    setErrs(n);
    if (Object.keys(n).length) return;
    setBusy(true);
    try { const r = await api.createEmployee({ name: name.trim(), email: email.trim(), employeeId: id.trim(), role, hireDate: hire || null }); go(`/s/employees?new=${encodeURIComponent(r.id)}`); }
    catch (ex) { setFail(errMsg(ex)); setBusy(false); }
  };

  return (
    <Layout nav="exam">
      <Crumb items={[['員工總覽', '/s/employees'], ['新增員工']]} />
      <PageHead cap="考核管理" title="新增員工" sub="建立帳號後，對方用 email 帳號＋工號登入（初始密碼就是工號，請對方登入後到「帳號」頁改密碼）。" />
      <section className="xk-panel pad" style={{ maxWidth: 720 }}>
        <form className="stack" onSubmit={submit} noValidate>
          <div className="g2">
            <div className="field"><label htmlFor="nsName">姓名</label><input className="inp" id="nsName" autoComplete="off" value={name} onChange={e => setName(e.target.value)} /><FieldErr id="nsName" msg={errs.name} /></div>
            <div className="field"><label htmlFor="nsId">工號</label><input className="inp" id="nsId" autoComplete="off" placeholder="例如 HW261124（英數字 6–20 個字）" value={id} onChange={e => setId(e.target.value)} /><FieldErr id="nsId" msg={errs.id} /></div>
          </div>
          <div className="field"><label htmlFor="nsEmail">公司 email</label><input className="inp" id="nsEmail" type="email" autoComplete="off" placeholder="name@haowu.example" value={email} onChange={e => setEmail(e.target.value)} /><FieldErr id="nsEmail" msg={errs.email} /></div>
          <div className="g2">
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lbl" style={{ marginBottom: 6 }}>身分</legend>
              <div className="xk-segs">{([['newbie', '新人'], ['senior', '資深']] as [Role, string][]).map(([v, l]) => <button key={v} type="button" className="xk-seg" aria-pressed={role === v} onClick={() => setRole(v)}>{l}</button>)}</div></fieldset>
            <div className="field"><label htmlFor="nsHire">到職日</label><input className="inp" id="nsHire" type="date" value={hire} onChange={e => setHire(e.target.value)} /></div>
          </div>
          <p id="nsErr" role="alert">{fail ? <Chip kind="alert" ic="lantern" text={fail} /> : null}</p>
          <div className="row between"><Link className="xk-btn-ghost" to="/s/employees">取消</Link><button className="xk-btn" type="submit" disabled={busy}>{busy ? '建立中…' : '建立帳號 ›'}</button></div>
          <p className="hint">建立後會出現在員工總覽；新人到職滿 1、3、6 個月的三次考核日期依到職日自動算出。</p>
        </form>
      </section>
    </Layout>
  );
}
