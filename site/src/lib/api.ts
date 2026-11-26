/* =========================================================
   經驗柑仔店｜資料層（頁面讀寫資料只能走這裡）
   - 登入、登出：Supabase Auth（帳號＝email，密碼＝工號），再讀 employees 取得姓名與身分。
   - 其餘全部呼叫資料庫函式（rpc）；權限由資料庫的 RLS 與函式本身強制，前端的身分判斷只是方便。
   - 失敗時丟出 Error；message 是資料庫函式用 raise exception 丟出的中文訊息，可以直接顯示給使用者。
   ========================================================= */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';
import type * as T from './types';

/** 登入狀態存在 sessionStorage：關掉分頁就登出。 */
export const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: sessionStorage, persistSession: true, autoRefreshToken: true },
});

async function rpc<R>(fn: string, args: Record<string, unknown> = {}): Promise<R> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as R;
}

/* ---------- 登入 ---------- */
const USER_KEY = 'knowhow-user';
export const getStoredUser = (): T.User | null => { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch { return null; } };
const storeUser = (u: T.User | null) => { try { u ? sessionStorage.setItem(USER_KEY, JSON.stringify(u)) : sessionStorage.removeItem(USER_KEY); } catch { /* 無痕模式 */ } };

/** 帳號就是 email；密碼是工號（不分大小寫）。 */
export async function login(email: string, secret: string): Promise<T.User> {
  const mail = String(email || '').trim().toLowerCase(), password = String(secret || '').trim().toUpperCase();
  if (!mail.includes('@')) throw new Error('帳號是 email，請輸入完整的 email');
  const { data, error } = await sb.auth.signInWithPassword({ email: mail, password });
  if (error) throw new Error('帳號或密碼不正確，請再確認一次');
  const { data: p, error: e2 } = await sb.from('employees').select('name, email, employee_id, role').eq('id', data.user.id).maybeSingle();
  if (e2 || !p) { await sb.auth.signOut(); throw new Error('這個帳號還沒有員工資料，請聯絡資深'); }
  const user: T.User = { id: p.employee_id, name: p.name, email: p.email, employeeId: p.employee_id, role: p.role };
  storeUser(user);
  return user;
}
export async function logout() { storeUser(null); try { await sb.auth.signOut(); } catch { /* 離線也要能登出 */ } }
/** 啟動時確認登入狀態還有效（分頁還在、Supabase session 也還在）。 */
export async function restoreUser(): Promise<T.User | null> {
  const u = getStoredUser();
  if (!u) return null;
  const { data } = await sb.auth.getSession();
  if (!data.session) { storeUser(null); return null; }
  return u;
}
export async function changePassword(newPassword: string) {
  if (newPassword.length < 6) throw new Error('密碼至少 6 個字');
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/* ---------- 員工 ---------- */
export const listEmployees = () => rpc<T.EmployeeOverview[]>('list_employees');
export const getEmployee = (id: string) => rpc<T.EmployeeDetail | null>('get_employee', { p_employee_id: id });
export const updateHireDate = (id: string, date: string) => rpc<{ id: string; hireDate: string }>('update_hire_date', { p_employee_id: id, p_date: date });
export const createEmployee = (i: { name: string; email: string; employeeId: string; role: T.Role; hireDate: string | null }) =>
  rpc<{ id: string }>('create_employee', { p_name: i.name, p_email: i.email, p_employee_id: i.employeeId, p_role: i.role, p_hire_date: i.hireDate || null });

/* ---------- 考核：資深 ---------- */
export const generatePaper = (employeeId: string, type: T.StageType) => rpc<{ id: string; shortage: number }>('generate_paper', { p_employee_id: employeeId, p_type: type });
export const listPapers = () => rpc<T.PaperListItem[]>('list_papers');
export const getPaper = (paperId: string) => rpc<T.PaperDetail | null>('get_paper', { p_paper: paperId });
export const removePaperQuestion = (paperId: string, qid: string) => rpc<boolean>('remove_paper_question', { p_paper: paperId, p_qid: qid });
export const addPaperQuestion = (paperId: string, qid: string) => rpc<boolean>('add_paper_question', { p_paper: paperId, p_qid: qid });
export const lockPaper = (paperId: string) => rpc<{ lockedAt: string }>('lock_paper', { p_paper: paperId });
export const getShortReview = (employeeId: string) => rpc<T.ShortReview | null>('get_short_review', { p_employee_id: employeeId });
export const submitShortReview = (attemptId: string, review: { scores: Record<string, number>; comment: string; errorTypes: string[] }) =>
  rpc<{ finalScore: number; passed: boolean }>('submit_short_review', { p_attempt: attemptId, p_review: review });

/* ---------- 考核：新人 ---------- */
export const listMyExams = () => rpc<T.StageRow[]>('list_my_exams');
export const getExamForTaking = (type?: string | null) => rpc<T.TakingResult>('start_exam', { p_type: type || null });
export const saveAnswerDraft = (attemptId: string, qid: string, answer: number | string) => rpc<boolean>('save_answer', { p_attempt: attemptId, p_qid: qid, p_answer: answer });
export const submitExam = (attemptId: string, answers: Record<string, number | string>) =>
  rpc<{ attemptId: string; status: T.AttemptStatus; mcqScore: number; mcqMax: number }>('submit_exam', { p_attempt: attemptId, p_answers: answers || {} });
export const getMyResult = (attemptId?: string | null) => rpc<T.MyResult | null>('get_my_result', { p_attempt: attemptId || null });
export const markResultSeen = (attemptId: string) => rpc<boolean>('mark_result_seen', { p_attempt: attemptId });
export const listMyRecords = () => rpc<T.RecordRow[]>('list_my_records');
export const listWrongItems = () => rpc<T.WrongItem[]>('list_wrong_items');
export const submitPractice = (qid: string, choice: number) => rpc<{ correct: boolean; streak: number; mastered: boolean }>('check_practice', { p_qid: qid, p_choice: choice });
export const getExamSettings = () => rpc<T.ExamSettings>('get_exam_settings');

/* ---------- 題庫審核 ---------- */
const COLS = 'id, source, kind, topic, ability, qtype, level, stem, options, sop, red_line, status';
const BANK_STATUSES = ['待審', '已審', '停用'];
/** PostgREST 的 or() 篩選裡逗號、括號、百分號有特殊意思，關鍵字先拿掉。 */
const clean = (s: string) => String(s || '').replace(/[,()%*\\]/g, ' ').trim();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(q: any, f: T.BankFilter = {}) {
  const { status = '全部', qtype = '', level = '', source = '', q: kw = '' } = f;
  if (status && status !== '全部') q = q.eq('status', status);
  if (qtype === 'choice') q = q.neq('qtype', 'short'); else if (qtype) q = q.eq('qtype', qtype);
  if (level) q = q.eq('level', +level);
  if (source) q = q.eq('source', source);
  const k = clean(kw);
  if (k) q = q.or(`id.ilike.${k},stem.ilike.%${k}%,topic.eq.${k}`);
  return q;
}
const bankFail = (e: { code?: string; message: string }, what: string): never => {
  throw new Error(e.code === '42501' ? '沒有權限（只有資深可以做這件事）' : /鎖定/.test(e.message) ? e.message : `${what}失敗：${e.message}`);
};
async function lockedIds(): Promise<string[]> {
  const { data, error } = await sb.from('exam_papers').select('question_ids').eq('status', 'locked');
  if (error) bankFail(error, '讀取考卷');
  return [...new Set((data || []).flatMap((p: { question_ids: string[] }) => p.question_ids))];
}
export async function listBank(filter: T.BankFilter = {}): Promise<T.BankList> {
  const size = Math.min(100, Math.max(1, +(filter.size || 30))), page = Math.max(1, +(filter.page || 1));
  const [locked, rules, stats, list] = await Promise.all([
    lockedIds(),
    sb.from('sop_rules').select('no, topic'),
    sb.from('v_question_bank_stats').select('*').single(),
    applyFilter(sb.from('question_bank').select(COLS, { count: 'exact' }), filter).order('id').range((page - 1) * size, page * size - 1),
  ]);
  if (stats.error) bankFail(stats.error, '讀取題庫');
  if (list.error && list.status !== 416) bankFail(list.error, '讀取題庫'); // 超過最後一頁會回 416，當成空頁
  const topic = new Map<string, string>(((rules.data || []) as { no: string; topic: string }[]).map(r => [r.no, r.topic]));
  const lockedSet = new Set(locked), t = stats.data as T.BankList['totals'], matched = list.count ?? 0, pages = Math.max(1, Math.ceil(matched / size));
  return {
    totals: { total: t.total, mcq: t.mcq, tf: t.tf, short: t.short, approved: t.approved, pending: t.pending, disabled: t.disabled },
    matched, page: Math.min(page, pages), pages, size,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: ((list.data || []) as any[]).map(x => ({
      id: x.id, source: x.source, kind: x.kind, redLine: x.red_line, qtype: x.qtype, level: x.level, topic: x.topic, ability: x.ability, stem: x.stem,
      options: x.options, sop: x.sop, sopName: x.sop ? `SOP ${x.sop}${topic.has(x.sop) ? ' ' + topic.get(x.sop) : ''}` : null, sopKnown: !!x.sop && topic.has(x.sop), status: x.status, inLockedPaper: lockedSet.has(x.id),
    })),
  };
}
export async function setBankStatus(qid: string, status: T.BankStatus) {
  if (!BANK_STATUSES.includes(status)) throw new Error('狀態不正確');
  const { data, error } = await sb.from('question_bank').update({ status }).eq('id', qid).select('id');
  if (error) bankFail(error, '更新');
  if (!data || !data.length) throw new Error('找不到這一題，或沒有權限（只有資深可以改）');
  return true;
}
/** 批次改狀態：跟 listBank 同樣的篩選條件；已經是這個狀態的不算；鎖定考卷裡的題目跳過。 */
export async function setBankStatusBulk(filter: T.BankFilter, status: T.BankStatus): Promise<{ changed: number; skipped: number }> {
  if (!BANK_STATUSES.includes(status)) throw new Error('狀態不正確');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { page, size, ...rest } = filter || {};
  const locked = await lockedIds();
  let up = applyFilter(sb.from('question_bank').update({ status }), rest).neq('status', status);
  if (locked.length) up = up.not('id', 'in', `(${locked.map(x => `"${x}"`).join(',')})`);
  const { data, error } = await up.select('id');
  if (error) bankFail(error, '批次更新');
  let skipped = 0;
  if (locked.length) {
    const r = await applyFilter(sb.from('question_bank').select('id', { count: 'exact', head: true }), rest).neq('status', status).in('id', locked);
    skipped = r.count || 0;
  }
  return { changed: (data || []).length, skipped };
}

/* ---------- SOP ---------- */
export const getPublishedSop = (mode: 'newbie' | 'senior') => rpc<T.PublishedSop | null>('get_published_sop', { p_mode: mode });
export const getReadMarks = () => rpc<Record<string, boolean>>('get_read_marks');
export const markRuleRead = (no: string) => rpc<boolean>('mark_rule_read', { p_rule_no: no });
export const getSopUpdateNotice = () => rpc<T.SopUpdateNotice>('get_sop_update_notice');
export const markSopUpdateSeen = () => rpc<boolean>('mark_sop_update_seen');

/* ---------- SOP 統整（資深） ---------- */
export const getSopFlow = () => rpc<T.SopFlow>('get_sop_flow');
export const importSourcePackage = () => rpc<{ count: number; sources: T.FlowSource[] }>('import_source_package');
export const importSources = (files: File[]) => rpc<T.FlowSource[]>('import_sources', { p_files: files.map(f => ({ name: f.name, lastModified: f.lastModified })) });
export const removeSource = (name: string) => rpc<T.FlowSource[]>('remove_source', { p_name: name });
export const runOrganize = () => rpc<{ chapters: number; rules: number; redLines: number; confirmCount: number }>('run_organize');
export const setFlowStep = (step: number) => rpc<number>('set_flow_step', { p_step: step });
export const saveConfirmDecision = (itemId: string, decision: string) => rpc<boolean>('save_confirm_decision', { p_item: itemId, p_decision: decision });
export const generateSeniorSop = () => rpc<{ version: string; publishedAt: string }>('generate_senior_sop');
export const startNewRound = () => rpc<boolean>('start_new_round');

/* ---------- 問小橘 ---------- */
/**
 * 問小橘：優先呼叫 Edge Function ask-xiaoju（Gemini＋向量搜尋）。
 * 函式還沒部署、Gemini 出問題、網路不通時，改用資料庫函式 ask_xiaoju（SQL 比對版），所以沒部署前網站照常能用。
 * 函式明確回報「問題有問題」（空白、太長）時直接顯示訊息，不重試。
 */
export async function askXiaoju(question: string): Promise<T.AskResult> {
  const { data, error } = await sb.functions.invoke('ask-xiaoju', { body: { question } });
  if (!error && data && !data.error) return data as T.AskResult;
  const res = (error as { context?: Response } | null)?.context;
  if (res && res.status === 400) throw new Error((await res.json().catch(() => ({})))?.error || '問題格式不對');
  return rpc<T.AskResult>('ask_xiaoju', { p_question: question });
}
/** 資深限定：同步 SOP／案例成知識片段，並呼叫 Gemini 為有變動的片段重新算向量（Edge Function embed-knowledge，可重複執行）。 */
export async function rebuildKnowledge(): Promise<{ embeddedNow: number; totalChunks: number }> {
  const { data, error } = await sb.functions.invoke('embed-knowledge', { body: {} });
  if (error) {
    const res = (error as { context?: Response }).context;
    const body = res ? await res.json().catch(() => null) : null;
    throw new Error(body?.error || (res?.status === 404 ? '知識庫函式還沒部署（embed-knowledge）' : '更新知識庫失敗，請稍後再試'));
  }
  if (!data || data.error) throw new Error(data?.error || '更新知識庫失敗');
  return { embeddedNow: Number(data.embeddedNow) || 0, totalChunks: Number(data.totalChunks) || 0 };
}
export const listSuggestedQuestions = () => rpc<T.Suggested[]>('list_suggested_questions');
export const listMyAsks = () => rpc<T.Ask[]>('list_my_asks');
export const getAsk = (id: string) => rpc<T.Ask | null>('get_ask', { p_id: id });
export const sendFeedback = (askId: string, helpful: boolean, reason = '') => rpc<boolean>('send_feedback', { p_ask: askId, p_helpful: helpful, p_reason: reason });
export const listMyPending = () => rpc<T.Pending[]>('list_my_pending');
export const markRepliesSeen = () => rpc<boolean>('mark_replies_seen');
export const getMyQaStats = () => rpc<T.MyQaStats>('get_my_qa_stats');
export const listPending = (status = '待處理') => rpc<T.Pending[]>('list_pending', { p_status: status });
/** 目前沒有寄信服務：只做站內通知（新人首頁會出現回覆提醒）；畫面誠實顯示「已通知」，不說「已寄信」。 */
export async function replyPending(id: string, reply: string): Promise<{ pending: T.Pending; mail: T.MailPreview }> {
  const p = await rpc<T.Pending>('reply_pending', { p_id: id, p_reply: reply });
  return { pending: p, mail: { to: p.askerEmail, toName: p.askerName, subject: `${p.repliedBy}回覆了你在問答亭的問題`, question: p.question, askedAt: p.date, sentAt: p.repliedAt, sent: false } };
}
export const getQaStats = () => rpc<T.QaStats>('get_qa_stats');

/* ---------- 首頁與導覽 ---------- */
export const getNewbieHome = () => rpc<T.NewbieHome>('get_newbie_home');
export const getSeniorTodos = () => rpc<T.SeniorTodos>('get_senior_todos');
export const getNavCounts = () => rpc<T.NavCounts>('get_nav_counts');
