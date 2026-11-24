/* =========================================================
   經驗柑仔店｜假資料模式（USE_MOCK = true）
   - 讀：data/ 的示範 JSON（原檔）＋ data/mock_extra.json（示範值）
   - 寫：存在瀏覽器 localStorage（key: knowhow-mock-v1），同一個瀏覽器裡新人和資深的流程能串起來
   - mockFn(name, payload)：代替 Edge Function 回應 callFn
   頁面不可以直接 import 這個檔，一律透過 js/data.js。
   網址加上 ?mockFail=1 可以模擬「讀取失敗」。
   ========================================================= */
import { today } from './config.js';
import { getSession } from './guard.js';

const STORE = 'knowhow-mock-v1';
const ROLE = {'新人': 'newbie', '資深': 'senior'};
const ASK_SENIOR = '新舊版都不符 → 請問資深';
let cache = null;

/* ---------- 讀檔與狀態 ---------- */
const wait = (ms = 120) => new Promise(r => setTimeout(r, ms));
async function load() {
  await wait();
  if (new URLSearchParams(location.search).has('mockFail')) throw new Error('示範：模擬讀取失敗（網址有 ?mockFail=1）');
  if (cache) return cache;
  const names = ['sop_samples', 'qa_cases', 'sample_questions', 'demo_accounts', 'mock_extra'];
  const res = await Promise.all(names.map(async n => {
    const r = await fetch(`data/${n}.json`);
    if (!r.ok) throw new Error(`讀不到 data/${n}.json`);
    return r.json();
  }));
  const [sop, qa, q, acc, extra] = res;
  cache = {sop, qa, questions: q.questions, accounts: acc.accounts, extra};
  cache.rule = Object.fromEntries(sop.rules.map(r => [r.no, r]));
  cache.question = Object.fromEntries(q.questions.map(x => [x.id, x]));
  return cache;
}
function fresh(c) {
  return {v: 1, seq: 1, pub: null, pubSeen: {}, flow: newFlow(), reads: {}, asks: [], pending: [], hire: {}, added: [],
    bank: {...c.extra.bank.status}, papers: [], attempts: [], wrong: []};
}
const newFlow = () => ({step: 1, imported: false, sources: [], organized: false, decisions: {}, generated: false});
function state(c) {
  try { const raw = localStorage.getItem(STORE); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
  return fresh(c);
}
function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* ignore */ } }
const nextId = (s, p) => `${p}${s.seq++}`;
function me() { const u = getSession(); if (!u) throw new Error('請先登入'); return u; }
function needSenior() { const u = me(); if (u.role !== 'senior') throw new Error('只有資深可以做這件事'); return u; }

/* ---------- 日期 ---------- */
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
function addM(iso, m) { const [y, mo, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + m, d)); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); }
const trialDeadline = hire => addM(hire, 3);
const halfDeadline = hire => addM(hire, 9);

/* ---------- 人員 ---------- */
function people(c, s) {
  const base = c.accounts.filter(a => a.email).map(a => ({name: a.name, email: a.email, employee_id: a.employee_id, role: a.role, hire_date: c.extra.hire_dates[a.employee_id] || null, source: 'account'}));
  const extra = c.extra.employees.map(e => ({...e, source: 'demo'}));
  const added = s.added.map(e => ({...e, source: 'added'}));
  return [...base, ...extra, ...added].map(p => ({...p, hire_date: s.hire[p.employee_id] || p.hire_date}));
}
const toUser = p => ({id: p.employee_id, name: p.name, email: p.email, employeeId: p.employee_id, role: ROLE[p.role] || p.role});
function trialAttempt(s, empId) {
  const paper = s.papers.find(p => p.employeeId === empId && p.type === 'trial');
  if (!paper) return {paper: null, attempt: null};
  return {paper, attempt: s.attempts.find(a => a.paperId === paper.id) || null};
}
function recordsOf(c, s, p) {
  if (p.source === 'demo') return (p.records || []).map(r => ({exam: r.exam, date: r.date, score: r.score, passed: r.passed}));
  const {attempt} = trialAttempt(s, p.employee_id);
  if (!attempt || attempt.status === 'doing') return [];
  if (attempt.status === 'submitted') return [{exam: '試用期考核', date: attempt.submittedAt, score: null, passed: null, attemptId: attempt.id}];
  const fs = finalScore(attempt);
  return [{exam: '試用期考核', date: attempt.submittedAt, score: fs, passed: fs >= c.extra.exam_settings.pass_score, attemptId: attempt.id}];
}
function nextExam(c, s, p) {
  if (!p.hire_date) return null;
  const trialDone = recordsOf(c, s, p).some(r => r.exam === '試用期考核' && r.score != null);
  return trialDone ? {name: '半年考核', deadline: halfDeadline(p.hire_date)} : {name: '試用期考核', deadline: trialDeadline(p.hire_date)};
}
function overview(c, s, p) {
  const rec = recordsOf(c, s, p), last = rec[rec.length - 1];
  const {attempt} = trialAttempt(s, p.employee_id);
  return {...toUser(p), roleLabel: p.role, hireDate: p.hire_date, dayNo: p.hire_date ? days(p.hire_date, today()) + 1 : null,
    nextExam: p.role === '新人' ? nextExam(c, s, p) : null,
    latestScore: last ? last.score : null, latestPending: !!(last && last.score == null),
    hasPendingReview: !!(attempt && attempt.status === 'submitted'), demo: p.source !== 'account', added: p.source === 'added'};
}

/* ---------- SOP ---------- */
const ruleName = (c, no) => (c.rule[no] ? `SOP ${no} ${c.rule[no].topic}` : `SOP ${no}`);
const pubKey = pub => (pub ? `${pub.version}#${pub.seq}` : '');

/* ---------- 考試 ---------- */
const isShort = (c, qid) => c.question[qid].qtype === 'short';
function scoring(c, qids) {
  const mcq = qids.filter(q => !isShort(c, q)), hasShort = qids.length > mcq.length;
  return {mcqIds: mcq, hasShort, per: mcq.length ? (hasShort ? 50 : 100) / mcq.length : 0, shortMax: mcq.length ? 50 : 100, mcqMax: mcq.length ? (hasShort ? 50 : 100) : 0};
}
const finalScore = a => (a.mcqScore || 0) + (a.review ? a.review.score : 0);
const answered = v => v !== undefined && v !== null && v !== '';

/* =========================================================
   給 data.js 用的函式（名稱與 data.js 相同）
   ========================================================= */
export async function login(identifier, secret) {
  const c = await load(), s = state(c);
  const id = String(identifier || '').trim().toLowerCase(), sec = String(secret || '').trim().toUpperCase();
  const p = people(c, s).find(x => x.email && x.email.toLowerCase() === id && x.employee_id && x.employee_id.toUpperCase() === sec);
  if (!p) throw new Error('帳號或密碼不正確，請再確認一次');
  return toUser(p);
}

export async function listEmployees() {
  const c = await load(), s = state(c); needSenior();
  return people(c, s).filter(p => p.role === '新人' || p.source === 'added').map(p => overview(c, s, p));
}
export async function getEmployee(id) {
  const c = await load(), s = state(c); needSenior();
  const p = people(c, s).find(x => x.employee_id === id);
  if (!p) return null;
  const {paper, attempt} = trialAttempt(s, id);
  return {...overview(c, s, p), trialDeadline: p.hire_date ? trialDeadline(p.hire_date) : null, halfDeadline: p.hire_date ? halfDeadline(p.hire_date) : null,
    records: recordsOf(c, s, p), paper: paper ? {id: paper.id, status: paper.status, questionCount: paper.questionIds.length, generatedAt: paper.generatedAt, lockedAt: paper.lockedAt} : null,
    attemptStatus: attempt ? attempt.status : null, canHaveExam: p.source !== 'demo' && p.role === '新人'};
}
export async function updateHireDate(id, date) {
  const c = await load(), s = state(c); needSenior();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('到職日格式不正確');
  s.hire[id] = date; save(s); return {id, hireDate: date};
}

export async function getPublishedSop(mode) {
  const c = await load(), s = state(c);
  if (!s.pub) return null;
  const senior = mode === 'senior';
  return {version: s.pub.version, publishedAt: s.pub.publishedAt, confirmedBy: senior ? s.pub.confirmedBy : undefined,
    ruleCount: c.sop.meta.rule_count, redLineCount: c.sop.meta.red_line_count, title: c.sop.meta.title,
    chapters: c.sop.chapters.map(ch => ({no: ch.no, name: ch.name, desc: ch.desc})),
    rules: c.sop.rules.map(r => ({no: r.no, chapter: r.chapter, topic: r.topic, name: ruleName(c, r.no), rule: r.rule, redLine: r.red_line,
      effective: senior ? r.effective : undefined, recent: days(r.effective, s.pub.publishedAt) <= 30}))};
}
export async function getReadMarks() { const c = await load(), s = state(c); return s.reads[me().id] || {}; }
export async function markRuleRead(no) {
  const c = await load(), s = state(c), u = me();
  if (!c.rule[no]) throw new Error('找不到這一條 SOP');
  s.reads[u.id] = {...(s.reads[u.id] || {}), [no]: true}; save(s); return true;
}
export async function getSopUpdateNotice() {
  const c = await load(), s = state(c), u = me();
  if (!s.pub) return {show: false};
  const recentCount = c.sop.rules.filter(r => days(r.effective, s.pub.publishedAt) <= 30).length;
  return {show: s.pubSeen[u.id] !== pubKey(s.pub), version: s.pub.version, publishedAt: s.pub.publishedAt, recentCount};
}
export async function markSopUpdateSeen() { const c = await load(), s = state(c); s.pubSeen[me().id] = pubKey(s.pub); save(s); return true; }

export async function getSopFlow() {
  const c = await load(), s = state(c); needSenior();
  const f = s.flow, x = c.extra.sop_flow;
  const items = x.confirm_items.map(it => ({id: it.id, no: it.no, name: ruleName(c, it.no), latest: c.rule[it.no].rule, old: it.old, tbd: false, decision: f.decisions[it.id] || null}));
  for (let k = items.length + 1; k <= x.confirm_total; k++) items.push({id: `t${k}`, no: null, name: `第 ${k} 項`, latest: null, old: null, tbd: true, decision: f.decisions[`t${k}`] || null});
  return {step: f.step, imported: f.imported, sources: f.sources, organized: f.organized, generated: f.generated,
    organizeResult: f.organized ? {chapters: c.sop.chapters.length, rules: c.sop.meta.rule_count, redLines: c.sop.meta.red_line_count, confirmCount: x.confirm_total} : null,
    confirmItems: items, confirmedCount: items.filter(i => i.decision).length, confirmTotal: x.confirm_total,
    version: c.sop.meta.version, published: s.pub ? {version: s.pub.version, publishedAt: s.pub.publishedAt, confirmedBy: s.pub.confirmedBy} : null};
}
export async function importSources(files) {
  const c = await load(), s = state(c); needSenior();
  s.flow.sources = files && files.length ? files.map(f => (typeof f === 'string' ? f : f.name)) : [...c.extra.sop_flow.sources];
  s.flow.imported = true; save(s); return s.flow.sources;
}
export async function setFlowStep(step) {
  const c = await load(), s = state(c); needSenior();
  const f = s.flow, done = Object.keys(f.decisions).length;
  const ok = step === 1 || (step === 2 && f.imported) || (step === 3 && f.organized) || (step === 4 && done >= c.extra.sop_flow.confirm_total);
  if (!ok) throw new Error('前一步還沒完成');
  f.step = step; save(s); return step;
}
export async function saveConfirmDecision(itemId, decision) {
  const c = await load(), s = state(c); needSenior();
  if (!['以最新版為準', '先記到待補'].includes(decision)) throw new Error('確認結果不正確');
  s.flow.decisions[itemId] = decision; save(s); return true;
}
export async function generateSeniorSop() {
  const c = await load(), s = state(c), u = needSenior();
  if (Object.keys(s.flow.decisions).length < c.extra.sop_flow.confirm_total) throw new Error('12 項還沒全部確認');
  s.pub = {version: c.sop.meta.version, publishedAt: today(), confirmedBy: u.name, seq: (s.pub ? s.pub.seq : 0) + 1};
  s.flow.generated = true; s.flow.step = 4; save(s);
  return {version: s.pub.version, publishedAt: s.pub.publishedAt};
}
export async function startNewRound() { const c = await load(), s = state(c); needSenior(); s.flow = newFlow(); save(s); return true; }

export async function listSuggestedQuestions() {
  const c = await load();
  return c.qa.map(x => { const no = (x.check_latest.match(/SOP (\d+-\d+)/) || [])[1] || null; return {id: x.id, question: x.newbie_asks, ruleNo: no, ruleName: no ? ruleName(c, no) : null}; });
}
export async function listMyAsks() {
  const c = await load(), s = state(c), u = me();
  return s.asks.filter(a => a.userId === u.id).slice().reverse();
}
export async function getAsk(id) { const c = await load(), s = state(c), u = me(); return s.asks.find(a => a.id === id && a.userId === u.id) || null; }
export async function sendFeedback(askId, helpful, reason = '') {
  const c = await load(), s = state(c), u = me();
  const a = s.asks.find(x => x.id === askId && x.userId === u.id);
  if (!a) throw new Error('找不到這筆提問');
  if (!helpful && !c.extra.exam_settings.no_help_reasons.includes(reason)) throw new Error('請選一個原因');
  a.feedback = helpful ? 'up' : 'down'; a.reason = helpful ? '' : reason; save(s); return true;
}
export async function listMyPending() {
  const c = await load(), s = state(c), u = me();
  return s.pending.filter(p => p.userId === u.id).map(p => ({...p, isNew: p.status === '已回覆' && !p.seen}));
}
export async function markRepliesSeen() {
  const c = await load(), s = state(c), u = me();
  s.pending.forEach(p => { if (p.userId === u.id && p.status === '已回覆') p.seen = true; }); save(s); return true;
}
export async function getMyQaStats() {
  const c = await load(), s = state(c), u = me();
  const asks = s.asks.filter(a => a.userId === u.id);
  const byCh = {};
  asks.forEach(a => { if (a.ruleNo) { const ch = a.ruleNo.split('-')[0]; byCh[ch] = (byCh[ch] || 0) + 1; } });
  const fbable = asks.filter(a => a.outcome !== ASK_SENIOR && a.outcome !== '不在 SOP 範圍');
  const chapters = Object.entries(byCh).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([no, n]) => ({no, name: c.sop.chapters.find(x => x.no === no).name, count: n}));
  return {total: asks.length, sentToSenior: asks.filter(a => a.writesPending).length, chapters,
    helpful: fbable.filter(a => a.feedback === 'up').length, notHelpful: fbable.filter(a => a.feedback === 'down').length, noFeedback: fbable.filter(a => !a.feedback).length};
}
export async function listPending(status = '待處理') {
  const c = await load(), s = state(c); needSenior();
  const ppl = people(c, s);
  return s.pending.filter(p => status === '全部' || p.status === status).map(p => ({...p, askerName: (ppl.find(x => x.employee_id === p.userId) || {}).name || p.userId}));
}
export async function replyPending(id, reply) {
  const c = await load(), s = state(c), u = needSenior();
  const p = s.pending.find(x => x.id === id);
  if (!p) throw new Error('找不到這個問題');
  if (!String(reply || '').trim()) throw new Error('請輸入回覆內容');
  Object.assign(p, {status: '已回覆', reply: reply.trim(), repliedBy: u.name, repliedAt: today(), seen: false}); save(s);
  return {...p};
}
export async function getQaStats() {
  const c = await load(), s = state(c); needSenior();
  const b = c.extra.qa_stats_base, byCh = {...b.by_chapter}, byOut = {...b.by_outcome}, nh = {...b.no_help_reasons};
  let helpful = b.helpful;
  s.asks.forEach(a => {
    if (a.ruleNo) { const ch = a.ruleNo.split('-')[0]; byCh[ch] = (byCh[ch] || 0) + 1; }
    byOut[a.outcome] = (byOut[a.outcome] || 0) + 1;
    if (a.feedback === 'up') helpful++;
    if (a.feedback === 'down' && a.reason) nh[a.reason] = (nh[a.reason] || 0) + 1;
  });
  return {total: Object.values(byOut).reduce((x, y) => x + y, 0), askSenior: byOut[ASK_SENIOR] || 0, waiting: s.pending.filter(p => p.status === '待處理').length,
    helpful, notHelpful: Object.values(nh).reduce((x, y) => x + y, 0),
    chapters: Object.entries(byCh).map(([no, n]) => ({no, name: c.sop.chapters.find(x => x.no === no).name, count: n})).sort((a, b) => b.count - a.count),
    outcomes: Object.entries(byOut).map(([outcome, count]) => ({outcome, count})),
    noHelpReasons: c.extra.exam_settings.no_help_reasons.map(r => ({reason: r, count: nh[r] || 0})), demo: true};
}

export async function listMyExams() {
  const c = await load(), s = state(c), u = me();
  const p = people(c, s).find(x => x.employee_id === u.id);
  const hire = p && p.hire_date;
  const {paper, attempt} = trialAttempt(s, u.id);
  let status = '尚未開放';
  if (attempt && (attempt.status === 'submitted' || attempt.status === 'reviewed')) status = '已完成';
  else if (paper && paper.status === 'locked') status = '可作答';
  const sc = paper ? scoring(c, paper.questionIds) : null;
  return [
    {type: 'trial', name: '試用期考核', status, deadline: hire ? trialDeadline(hire) : null, daysLeft: hire ? days(today(), trialDeadline(hire)) : null,
      questionCount: paper && paper.status === 'locked' ? paper.questionIds.length : null, mcqCount: sc && paper.status === 'locked' ? sc.mcqIds.length : null,
      attemptId: attempt ? attempt.id : null, attemptStatus: attempt ? attempt.status : null,
      finalScore: attempt && attempt.status === 'reviewed' ? finalScore(attempt) : null},
    {type: 'half', name: '半年考核', status: '尚未開放', deadline: hire ? halfDeadline(hire) : null},
  ];
}
export async function getExamForTaking() {
  const c = await load(), s = state(c), u = me();
  const {paper} = trialAttempt(s, u.id);
  if (!paper || paper.status !== 'locked') return null;
  let a = s.attempts.find(x => x.paperId === paper.id);
  if (a && a.status !== 'doing') return {done: true, attemptId: a.id};
  if (!a) { a = {id: nextId(s, 'at'), paperId: paper.id, employeeId: u.id, answers: {}, status: 'doing', startedAt: today()}; s.attempts.push(a); save(s); }
  const p = people(c, s).find(x => x.employee_id === u.id);
  return {paperId: paper.id, attemptId: a.id, name: '試用期考核', deadline: p && p.hire_date ? trialDeadline(p.hire_date) : null,
    questions: paper.questionIds.map(id => { const q = c.question[id]; return {id, qtype: q.qtype, stem: q.stem, options: q.options || null, sop: q.sop || null, sopName: q.sop ? ruleName(c, q.sop) : null, sopKnown: !!c.rule[q.sop]}; }),
    answers: {...a.answers}};
}
export async function saveAnswerDraft(attemptId, qid, answer) {
  const c = await load(), s = state(c), u = me();
  const a = s.attempts.find(x => x.id === attemptId && x.employeeId === u.id);
  if (!a || a.status !== 'doing') throw new Error('這份考卷已經交卷');
  a.answers[qid] = answer; save(s); return true;
}
export async function getMyResult(attemptId) {
  const c = await load(), s = state(c), u = me();
  const a = attemptId ? s.attempts.find(x => x.id === attemptId && x.employeeId === u.id) : s.attempts.filter(x => x.employeeId === u.id && x.status !== 'doing').pop();
  if (!a || a.status === 'doing') return null;
  const paper = s.papers.find(p => p.id === a.paperId), sc = scoring(c, paper.questionIds), set = c.extra.exam_settings;
  const items = paper.questionIds.map(id => {
    const q = c.question[id], g = (a.graded || {})[id] || {};
    return {qid: id, qtype: q.qtype, stem: q.stem, options: q.options || null, answer: a.answers[id], sop: q.sop || null, sopName: q.sop ? ruleName(c, q.sop) : null, sopKnown: !!c.rule[q.sop],
      correct: q.qtype === 'short' ? null : !!g.correct, errorType: g.errorType || null, points: q.qtype === 'short' ? null : (g.correct ? sc.per : 0), maxPoints: q.qtype === 'short' ? sc.shortMax : sc.per};
  });
  const errorSummary = {};
  items.forEach(i => { if (i.errorType) errorSummary[i.errorType] = (errorSummary[i.errorType] || 0) + 1; });
  if (a.review) a.review.errorTypes.forEach(t => { errorSummary[t] = (errorSummary[t] || 0) + 1; });
  const fs = finalScore(a);
  return {attemptId: a.id, examName: '試用期考核', submittedAt: a.submittedAt, status: a.status, mcqScore: a.mcqScore, mcqMax: sc.mcqMax, shortMax: sc.shortMax,
    review: a.review || null, finalScore: a.status === 'reviewed' ? fs : null, passScore: set.pass_score, passed: a.status === 'reviewed' ? fs >= set.pass_score : null,
    items, errorSummary, resultSeen: !!a.resultSeen, mockGraded: true};
}
export async function markResultSeen(attemptId) { const c = await load(), s = state(c), u = me(); const a = s.attempts.find(x => x.id === attemptId && x.employeeId === u.id); if (a) { a.resultSeen = true; save(s); } return true; }
export async function listMyRecords() { const c = await load(), s = state(c), u = me(); const p = people(c, s).find(x => x.employee_id === u.id); return p ? recordsOf(c, s, p) : []; }
export async function listWrongItems() {
  const c = await load(), s = state(c), u = me();
  return s.wrong.filter(w => w.employeeId === u.id).map(w => {
    const q = c.question[w.qid];
    return {...w, stem: q.stem, options: q.options, sop: q.sop || null, sopName: q.sop ? ruleName(c, q.sop) : null, sopKnown: !!c.rule[q.sop]};
  });
}

export async function listPapers() {
  const c = await load(), s = state(c); needSenior();
  const ppl = people(c, s);
  return s.papers.map(p => ({id: p.id, employeeId: p.employeeId, employeeName: (ppl.find(x => x.employee_id === p.employeeId) || {}).name, type: p.type, status: p.status, generatedAt: p.generatedAt, lockedAt: p.lockedAt}));
}
export async function getPaper(paperId) {
  const c = await load(), s = state(c); needSenior();
  const p = s.papers.find(x => x.id === paperId);
  if (!p) return null;
  const emp = people(c, s).find(x => x.employee_id === p.employeeId);
  const sc = scoring(c, p.questionIds);
  return {id: p.id, employeeId: p.employeeId, employeeName: emp ? emp.name : p.employeeId, type: p.type, examName: '試用期考核', status: p.status,
    generatedAt: p.generatedAt, lockedAt: p.lockedAt, deadline: emp && emp.hire_date ? trialDeadline(emp.hire_date) : null, mcqCount: sc.mcqIds.length,
    questions: p.questionIds.map(id => { const q = c.question[id]; return {id, qtype: q.qtype, stem: q.stem, options: q.options || null, sop: q.sop || null, sopName: q.sop ? ruleName(c, q.sop) : null, sopKnown: !!c.rule[q.sop], bankStatus: s.bank[id]}; })};
}
export async function removePaperQuestion(paperId, qid) {
  const c = await load(), s = state(c); needSenior();
  const p = s.papers.find(x => x.id === paperId);
  if (!p || p.status !== 'draft') throw new Error('鎖定後不能再刪題');
  p.questionIds = p.questionIds.filter(x => x !== qid); save(s); return true;
}
export async function addPaperQuestion(paperId, qid) {
  const c = await load(), s = state(c); needSenior();
  const p = s.papers.find(x => x.id === paperId);
  if (!p || p.status !== 'draft') throw new Error('鎖定後不能再補題');
  if (s.bank[qid] !== '已審') throw new Error('只能補「已審」的題目');
  if (!p.questionIds.includes(qid)) p.questionIds.push(qid);
  p.questionIds.sort((a, b) => isShort(c, a) - isShort(c, b) || a.localeCompare(b)); save(s); return true;
}
export async function lockPaper(paperId) {
  const c = await load(), s = state(c); needSenior();
  const p = s.papers.find(x => x.id === paperId);
  if (!p || p.status !== 'draft') throw new Error('這份考卷已經鎖定');
  if (!p.questionIds.length) throw new Error('考卷沒有題目');
  p.status = 'locked'; p.lockedAt = today(); save(s); return {lockedAt: p.lockedAt};
}
export async function listBank(status = '全部') {
  const c = await load(), s = state(c); needSenior();
  const locked = new Set(s.papers.filter(p => p.status === 'locked').flatMap(p => p.questionIds));
  return {totals: c.extra.bank.totals, items: c.questions.filter(q => status === '全部' || s.bank[q.id] === status).map(q => ({id: q.id, qtype: q.qtype, stem: q.stem, options: q.options || null, sop: q.sop || null, sopName: q.sop ? ruleName(c, q.sop) : null, sopKnown: !!c.rule[q.sop], status: s.bank[q.id], inLockedPaper: locked.has(q.id)}))};
}
export async function setBankStatus(qid, status) {
  const c = await load(), s = state(c); needSenior();
  if (!['待審', '已審', '停用'].includes(status)) throw new Error('狀態不正確');
  if (s.papers.some(p => p.status === 'locked' && p.questionIds.includes(qid))) throw new Error('這題已用在鎖定的考卷');
  s.bank[qid] = status; save(s); return true;
}
export async function getShortReview(employeeId) {
  const c = await load(), s = state(c); needSenior();
  const {paper, attempt} = trialAttempt(s, employeeId);
  if (!attempt || attempt.status !== 'submitted') return null;
  const qid = paper.questionIds.find(id => isShort(c, id));
  const sc = scoring(c, paper.questionIds);
  return {attemptId: attempt.id, question: {id: qid, stem: c.question[qid].stem}, answer: attempt.answers[qid] || '', mcqScore: attempt.mcqScore, shortMax: sc.shortMax};
}
export async function submitShortReview(attemptId, {score, comment = '', errorTypes = []}) {
  const c = await load(), s = state(c), u = needSenior();
  const a = s.attempts.find(x => x.id === attemptId);
  if (!a || a.status !== 'submitted') throw new Error('這份考卷不在待覆核狀態');
  const sc = scoring(c, s.papers.find(p => p.id === a.paperId).questionIds);
  if (!Number.isInteger(score) || score < 0 || score > sc.shortMax) throw new Error(`簡答得分要在 0–${sc.shortMax} 之間`);
  a.review = {score, comment, errorTypes, reviewer: u.name, at: today()}; a.status = 'reviewed'; a.resultSeen = false; save(s);
  const fs = finalScore(a);
  return {finalScore: fs, passed: fs >= c.extra.exam_settings.pass_score};
}
export async function getExamSettings() {
  const c = await load();
  const x = c.extra.exam_settings;
  return {passScore: x.pass_score, errorTypes: x.error_types, noHelpReasons: x.no_help_reasons, demo: true};
}
export async function getSeniorTodos() {
  const c = await load(), s = state(c); needSenior();
  const ppl = people(c, s);
  const deadlines = ppl.filter(p => p.role === '新人' && p.hire_date).map(p => { const ne = nextExam(c, s, p); return {id: p.employee_id, name: p.name, demo: p.source !== 'account', exam: ne.name, deadline: ne.deadline}; })
    .map(x => ({...x, daysLeft: days(today(), x.deadline)})).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 4);
  const review = s.attempts.find(a => a.status === 'submitted');
  return {pendingQuestions: s.pending.filter(p => p.status === '待處理').length, pendingReviews: s.attempts.filter(a => a.status === 'submitted').length,
    pendingPapers: s.papers.filter(p => p.status === 'draft').length, firstReviewEmployee: review ? review.employeeId : null,
    firstDraftPaper: (s.papers.find(p => p.status === 'draft') || {}).id || null, deadlines,
    sop: s.pub ? {version: s.pub.version, publishedAt: s.pub.publishedAt, confirmedBy: s.pub.confirmedBy} : null};
}
export async function getNewbieHome() {
  const c = await load(), s = state(c), u = me();
  const p = people(c, s).find(x => x.employee_id === u.id) || {};
  const hire = p.hire_date || null;
  const reads = s.reads[u.id] || {};
  const {paper, attempt} = trialAttempt(s, u.id);
  const pend = s.pending.filter(x => x.userId === u.id);
  const unseen = pend.filter(x => x.status === '已回覆' && !x.seen);
  let examStatus = '尚未開放';
  if (attempt && attempt.status !== 'doing') examStatus = '已完成'; else if (paper && paper.status === 'locked') examStatus = '可作答';
  const firstUnread = c.sop.rules.find(r => !reads[r.no]);
  return {hireDate: hire, dayNo: hire ? days(hire, today()) + 1 : null, today: today(),
    trialDeadline: hire ? trialDeadline(hire) : null, daysLeft: hire ? days(today(), trialDeadline(hire)) : null,
    sop: {published: !!s.pub, read: c.sop.rules.filter(r => reads[r.no]).length, shown: c.sop.rules.length, ruleCount: c.sop.meta.rule_count,
      updated: !!s.pub && s.pubSeen[u.id] !== pubKey(s.pub), firstUnread: firstUnread ? {no: firstUnread.no, name: ruleName(c, firstUnread.no)} : null},
    exam: {status: examStatus, attemptStatus: attempt ? attempt.status : null, attemptId: attempt ? attempt.id : null,
      finalScore: attempt && attempt.status === 'reviewed' ? finalScore(attempt) : null, resultSeen: attempt ? !!attempt.resultSeen : true},
    replies: {unseen: unseen.map(x => ({id: x.id, question: x.question, repliedBy: x.repliedBy, repliedAt: x.repliedAt})), waiting: pend.filter(x => x.status === '待處理').length},
    wrongOpen: s.wrong.filter(w => w.employeeId === u.id && !w.mastered).length};
}
export async function getNavCounts() {
  const c = await load(), s = state(c), u = me();
  if (u.role === 'senior') return {qa: s.pending.filter(p => p.status === '待處理').length, exam: s.attempts.filter(a => a.status === 'submitted').length + s.papers.filter(p => p.status === 'draft').length};
  const {paper, attempt} = trialAttempt(s, u.id);
  return {sop: s.pub && s.pubSeen[u.id] !== pubKey(s.pub) ? 1 : 0, qa: s.pending.filter(p => p.userId === u.id && p.status === '已回覆' && !p.seen).length,
    exam: paper && paper.status === 'locked' && (!attempt || attempt.status === 'doing') ? 1 : 0,
    wrong: s.wrong.filter(w => w.employeeId === u.id && !w.mastered).length};
}
export async function resetDemo() { const c = await load(); save(fresh(c)); return true; }

/* =========================================================
   mockFn：代替 Edge Function
   ========================================================= */
const FN = {
  /** 問小橘：比對 qa_cases.json 的問句；比不到就回「不在 SOP 範圍」的通用說明。 */
  async 'ask-xiaoju'({question}) {
    const c = await load(), s = state(c), u = me();
    const q = String(question || '').trim();
    if (!q) throw new Error('請輸入問題');
    const norm = t => t.replace(/[\s，。？?、：:「」『』]/g, '');
    const hit = c.qa.find(x => norm(x.newbie_asks) === norm(q) || norm(q).includes(norm(x.newbie_asks).slice(0, 12)));
    const oos = c.extra.out_of_scope;
    const ruleNo = hit ? (hit.check_latest.match(/SOP (\d+-\d+)/) || [])[1] || null : null;
    const ask = {id: nextId(s, 'q'), userId: u.id, caseId: hit ? hit.id : null, question: q, outcome: hit ? hit.outcome : oos.outcome,
      reply: hit ? hit.ai_should_reply : oos.reply, sourceChip: hit ? hit.source_chip : '', ruleNo, writesPending: hit ? hit.writes_pending : false,
      createdAt: today(), feedback: null, reason: ''};
    s.asks.push(ask);
    let pendingId = null;
    if (ask.writesPending) {
      const open = s.pending.find(p => p.userId === u.id && p.caseId === ask.caseId && p.status === '待處理');
      if (open) pendingId = open.id;
      else { pendingId = nextId(s, 'p'); s.pending.unshift({id: pendingId, askId: ask.id, caseId: ask.caseId, userId: u.id, question: q, outcome: ask.outcome, sourceChip: ask.sourceChip, aiReply: ask.reply, date: today(), status: '待處理', reply: '', repliedBy: '', repliedAt: '', seen: false, notifiedAt: ''}); }
    }
    save(s);
    return {askId: ask.id, outcome: ask.outcome, reply: ask.reply, sourceChip: ask.sourceChip, ruleNo, writesPending: ask.writesPending, pendingId};
  },
  /** SOP 統整第 2 步：示範結果事先做好，直接回傳。 */
  async 'organize-sop'() {
    const c = await load(), s = state(c); needSenior();
    if (!s.flow.imported) throw new Error('請先匯入資料');
    s.flow.organized = true; save(s);
    return {chapters: c.sop.chapters.length, rules: c.sop.meta.rule_count, redLines: c.sop.meta.red_line_count, confirmCount: c.extra.sop_flow.confirm_total};
  },
  /** AI 隨機出題：從題庫「已審」題目取出（示範資料只有 3 題）。 */
  async 'generate-paper'({employeeId, type = 'trial'}) {
    const c = await load(), s = state(c); needSenior();
    const old = s.papers.find(p => p.employeeId === employeeId && p.type === type);
    if (old && old.status === 'locked') throw new Error('已經有鎖定的考卷');
    const ids = c.questions.filter(q => s.bank[q.id] === '已審').map(q => q.id);
    if (!ids.length) throw new Error('題庫沒有「已審」的題目');
    const paper = {id: old ? old.id : nextId(s, 'pp'), employeeId, type, status: 'draft', questionIds: ids, generatedAt: today(), lockedAt: ''};
    s.papers = s.papers.filter(p => p.id !== paper.id).concat(paper); save(s);
    return {id: paper.id};
  },
  /** 批改：用 mock_extra.json 的固定示範結果，不含正確選項。 */
  async 'grade-exam'({attemptId, answers}) {
    const c = await load(), s = state(c), u = me();
    const a = s.attempts.find(x => x.id === attemptId && x.employeeId === u.id);
    if (!a || a.status !== 'doing') throw new Error('這份考卷已經交卷');
    if (answers) a.answers = {...a.answers, ...answers};
    const paper = s.papers.find(p => p.id === a.paperId), sc = scoring(c, paper.questionIds), g = c.extra.mock_grading;
    a.graded = {}; let mcqScore = 0;
    sc.mcqIds.forEach(qid => {
      const ok = answered(a.answers[qid]) && (g[qid] ? g[qid].correct : true);
      const et = ok ? null : (answered(a.answers[qid]) ? (g[qid] && g[qid].error_type) || null : '未作答');
      a.graded[qid] = {correct: ok, errorType: et};
      if (ok) mcqScore += sc.per;
      else if (!s.wrong.some(w => w.employeeId === u.id && w.qid === qid)) s.wrong.push({employeeId: u.id, qid, chosen: answered(a.answers[qid]) ? a.answers[qid] : null, errorType: et, streak: 0, mastered: false});
    });
    a.mcqScore = Math.round(mcqScore); a.submittedAt = today();
    if (sc.hasShort) a.status = 'submitted'; else { a.status = 'reviewed'; a.review = {score: 0, comment: '', errorTypes: [], reviewer: '', at: today()}; }
    save(s);
    return {attemptId: a.id, status: a.status, mcqScore: a.mcqScore, mcqMax: sc.mcqMax};
  },
  /** 錯題重練：假資料模式一律算答對，讓「連續答對 2 次」能完整示範。 */
  async 'check-practice'({qid}) {
    const c = await load(), s = state(c), u = me();
    const w = s.wrong.find(x => x.employeeId === u.id && x.qid === qid);
    if (!w) throw new Error('錯題區沒有這一題');
    w.streak = Math.min(2, w.streak + 1); w.mastered = w.streak >= 2; save(s);
    return {correct: true, streak: w.streak, mastered: w.mastered, mock: true};
  },
  /** 寄信通知新人：假資料模式不寄信，只回傳信件內容給畫面預覽。 */
  async 'notify-reply'({pendingId}) {
    const c = await load(), s = state(c); needSenior();
    const p = s.pending.find(x => x.id === pendingId);
    if (!p) throw new Error('找不到這個問題');
    const asker = people(c, s).find(x => x.employee_id === p.userId) || {};
    p.notifiedAt = today(); save(s);
    return {to: asker.email, toName: asker.name, subject: `${p.repliedBy}回覆了你在問答亭的問題`, question: p.question, askedAt: p.date, sentAt: p.notifiedAt, mock: true};
  },
  /** 新增員工：正式版要用 service_role 建帳號，所以只能在 Edge Function 做。 */
  async 'create-user'({name, email, employeeId, role, hireDate}) {
    const c = await load(), s = state(c); needSenior();
    const id = String(employeeId || '').trim().toUpperCase(), mail = String(email || '').trim().toLowerCase();
    if (people(c, s).some(p => (p.employee_id || '').toUpperCase() === id)) throw new Error('這個工號已經有帳號了');
    if (people(c, s).some(p => (p.email || '').toLowerCase() === mail)) throw new Error('這個 email 已經有帳號了');
    s.added.push({name: name.trim(), email: mail, employee_id: id, role: role === 'senior' ? '資深' : '新人', hire_date: hireDate, records: []}); save(s);
    return {id};
  },
};
export async function mockFn(name, payload) {
  const fn = FN[name];
  if (!fn) throw new Error(`假資料模式沒有函式 ${name}`);
  return fn(payload || {});
}
