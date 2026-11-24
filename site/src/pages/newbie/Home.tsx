import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useAuth, useToast } from '../../lib/hooks';
import { dayText, days, errMsg, md } from '../../lib/utils';
import { Async, Bar, Chip, FieldErr, Icon, PageHead, Say, StatusChip } from '../../components/ui';
import { Layout } from '../../components/Layout';
import type { NewbieHome } from '../../lib/types';

interface Step { expr: string; text: string; label: string; to: string }

/** 新人 1｜首頁：一進來就知道今天要做什麼 */
export default function NHome() {
  const { user } = useAuth();
  const go = useNavigate();
  const toast = useToast();
  const st = useAsync(() => Promise.all([api.getNewbieHome(), api.listSuggestedQuestions()]), []);
  const [q, setQ] = useState('');
  const [qErr, setQErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const given = user.name.slice(1);

  const ask = async (text: string) => {
    setBusy(true);
    try { await api.askXiaoju(text); go('/n/ask'); } catch (e) { toast(errMsg(e), 'err'); setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (!q.trim()) { setQErr('請填寫問題'); return; } setQErr(''); ask(q.trim()); };

  const nextStep = (h: NewbieHome): Step => {
    const x = h.exam;
    if (h.replies.unseen.length) return { expr: 'hint', text: `${h.replies.unseen[0].repliedBy}回覆了你的問題，先去看看，喵。`, label: '看資深的回覆 ›', to: '/n/pending' };
    if (x && x.attemptId && x.attemptStatus === 'reviewed' && !x.resultSeen) return { expr: 'happy', text: `${x.name}的成績出來了。`, label: '看成績 ›', to: `/n/result?attempt=${encodeURIComponent(x.attemptId)}` };
    if (x && x.status === '可作答') return { expr: 'hint', text: `${x.name}可以作答了，考核日 ${x.dueDate}。`, label: x.attemptStatus === 'doing' ? '繼續作答 ›' : '開始作答 ›', to: `/n/taking?stage=${encodeURIComponent(x.type)}` };
    if (h.wrongOpen) return { expr: 'hint', text: `錯題區還有 ${h.wrongOpen} 題，連續答對 2 次就算掌握。`, label: '去錯題區重練 ›', to: '/n/wrong' };
    if (h.sop.published && h.sop.firstUnread) return { expr: 'default', text: `${h.sop.updated ? '資深剛發布新版 SOP。' : ''}還有 ${h.sop.shown - h.sop.read} 條 SOP 沒讀，先讀「${h.sop.firstUnread.name}」。`, label: '繼續讀 SOP ›', to: `/n/sop?rule=${encodeURIComponent(h.sop.firstUnread.no)}` };
    if (!h.sop.published) return { expr: 'default', text: '資深還在統整 SOP，發布後我會提醒你；有問題先問我，喵。', label: '問小橘 ›', to: '/n/ask' };
    return { expr: 'happy', text: '今天的進度都完成了，有問題隨時問我，喵。', label: '問小橘 ›', to: '/n/ask' };
  };

  return (
    <Layout nav="home">
      <Async state={st}>{([h, sugg]) => {
        const ns = nextStep(h);
        if (!h.hireDate) {
          return (
            <>
              <PageHead cap="新人首頁" title={`${given}，歡迎來到經驗柑仔店`} />
              <section className="xk-panel pad stack">
                <Say expr={ns.expr} gear="rookie" size="">{ns.text}</Say>
                <div><Link className="xk-btn" to={ns.to}>{ns.label}</Link></div>
                <p className="mini">還沒有設定到職日，請資深在「員工詳情」設定後，這裡會顯示到職天數和考核期限。</p>
              </section>
            </>
          );
        }
        // 到職進度路：起點到職日，終點最後一次考核；每次考核依天數放在路上
        const last = h.stages[h.stages.length - 1];
        const span = Math.max(1, days(h.hireDate, last.dueDate!));
        const pct = (d: string) => Math.max(0, Math.min(100, days(h.hireDate!, d) / span * 100));
        const todayPct = pct(h.today);
        const x = h.exam, ur = h.replies.unseen;
        const exNote = x.status === '尚未開放' ? '資深出題並鎖定考卷後就能作答' : x.status === '可作答' ? '考卷已鎖定，可以開始作答'
          : x.finalScore != null ? `成績 ${x.finalScore} 分・${x.passed ? '通過' : '未通過'}` : '簡答待資深覆核';
        return (
          <>
            <PageHead cap="新人首頁" title={`${given}，今天這樣做就好`} />
            <section className="xk-panel pad" aria-label="今天的下一步">
              <div className="hero">
                <div className="next"><Say expr={ns.expr} gear="rookie" size="">{ns.text}</Say><div><Link className="xk-btn" to={ns.to}>{ns.label}</Link></div></div>
                <div className="daybox"><span className="lbl">到職第</span><span className="big">{h.dayNo}<small>天</small></span><span className="mini">到職日 {h.hireDate}</span></div>
              </div>
              <div className="road flat split" style={{ marginTop: 8 }} role="img" aria-label={`到職進度：今天是到職第 ${h.dayNo} 天；${h.stages.map(s => `${s.name} ${s.dueDate}`).join('、')}`}>
                <div className="road-bar xk-pat-road" />
                <div className="road-fill" style={{ width: `${todayPct}%` }} />
                <div className="stop done" style={{ left: 0 }}><span className="dot" /><b>到職</b><small>{md(h.hireDate)}</small></div>
                <div className="stop now up" style={{ left: `${todayPct}%` }}><span className="dot" /><b>今天・第 {h.dayNo} 天</b></div>
                {h.stages.map(s => (
                  <div key={s.type} className={`stop ${s.status === '已完成' ? 'done' : ''}`} style={{ left: `${pct(s.dueDate!)}%` }}>
                    <span className="dot" /><b>滿 {s.months} 個月</b><small>{s.name}・{md(s.dueDate)}{s.status === '已完成' ? ' ✓' : ''}</small>
                  </div>
                ))}
              </div>
            </section>
            <div className="g3">
              <Link className="xk-soft pad tile" to="/n/sop">
                <span className="t"><Icon name="book" />SOP 閱讀進度</span>
                {h.sop.published ? (
                  <>
                    <span><span className="big">{h.sop.read}</span><span className="disp"> / {h.sop.shown} 條</span></span>
                    <Bar pct={h.sop.read / h.sop.shown * 100} label={`已讀 ${h.sop.read} / ${h.sop.shown} 條`} />
                    {h.sop.updated ? <StatusChip text="最近更新" label="SOP 剛更新" /> : null}
                  </>
                ) : (
                  <><Chip kind="return" ic="clock" text="等資深發布" sm /><span className="mini">資深完成 SOP 統整後，這裡會顯示你的閱讀進度。</span></>
                )}
              </Link>
              <Link className="xk-soft pad tile" to="/n/exam">
                <span className="t"><Icon name="quiz" />下一次考核</span>
                <span className="row"><span className="disp" style={{ fontSize: 22 }}>{x.name}</span><StatusChip text={x.status} /></span>
                <span>考核日 <b className="nowrap">{x.dueDate}</b>（滿 {x.months} 個月），{dayText(x.daysLeft)}</span>
                <span className="mini">{exNote}</span>
              </Link>
              <Link className="xk-soft pad tile" to="/n/pending">
                <span className="t"><Icon name="chat" />資深新回覆 {ur.length ? <span className="cnt">{ur.length}</span> : null}</span>
                {ur.length ? (
                  <>
                    <span className="row"><StatusChip text="已回覆" /><span className="mini">{ur[0].repliedBy}・{md(ur[0].repliedAt)}</span></span>
                    <span className="clamp2">{ur[0].question}</span>
                  </>
                ) : (
                  <><span>目前沒有新回覆</span><span className="mini">{h.replies.waiting ? `你有 ${h.replies.waiting} 題正在等資深回覆` : '小橘查不到的問題，會送到這裡等資深回覆'}</span></>
                )}
              </Link>
            </div>
            <section className="xk-soft pad" aria-labelledby="qkT">
              <form className="quick" onSubmit={submit} noValidate>
                <h2 id="qkT" className="row" style={{ fontSize: 22 }}><Icon name="chat" />問小橘</h2>
                <label className="sr" htmlFor="qkIn">輸入你的問題</label>
                <div><input className="inp" id="qkIn" name="q" placeholder="客人問的、SOP 看不懂的，直接問" value={q} onChange={e => setQ(e.target.value)} /><FieldErr id="qkIn" msg={qErr} /></div>
                <button className="xk-btn-ghost" type="submit" disabled={busy}>{busy ? '送出中…' : '送出問題'}</button>
              </form>
              <div className="chips" style={{ marginTop: 14 }}>
                <span className="mini">常見問題：</span>
                {sugg.slice(0, 3).map(s => (
                  <button key={s.id} type="button" className="xk-chip xk-chip-return" style={{ cursor: 'pointer' }} disabled={busy} onClick={() => ask(s.question)}>
                    {s.question.length > 22 ? `${s.question.slice(0, 22)}…` : s.question}
                  </button>
                ))}
              </div>
            </section>
          </>
        );
      }}</Async>
    </Layout>
  );
}
