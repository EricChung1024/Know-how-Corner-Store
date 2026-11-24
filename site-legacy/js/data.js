/* =========================================================
   經驗柑仔店｜資料層
   頁面讀寫資料只能透過這個檔案的函式，不可以直接讀 JSON 或呼叫 Supabase。

   - USE_MOCK = true：交給 js/mock.js（讀 data/*.json，寫入存 localStorage）
   - USE_MOCK = false：走 Supabase。每個函式的 TODO(Eric) 標出要補的地方，
     下面註解的「Supabase：」寫預計對應的資料表、檢視表、RPC 或 Edge Function。
   - 所有函式都是 async；失敗時丟出 Error（message 可以直接顯示給使用者）。
   - 身分值固定為 'newbie'（新人）和 'senior'（資深）。
   - 正確答案、參考答案不會出現在任何回傳值裡。
   ========================================================= */
import { USE_MOCK, LIVE } from './config.js';
import { callFn, getSupabase } from './api.js';
import { isLive, callLive, rpc } from './live.js';
import { setSession, clearSession, getSession } from './guard.js';

const mock = () => import('./mock.js');
const notReady = name => { throw new Error(`${name}() 尚未接上 Supabase（js/data.js）`); };
/** 呼叫 Edge Function，失敗時轉成 Error。 */
async function fn(name, payload) {
  const { data, error } = await callFn(name, payload);
  if (error) throw new Error(error.message);
  return data;
}

/* =========================================================
   登入與員工
   ========================================================= */

/**
 * 登入：帳號（就是 email）＋工號／密碼。成功後寫入 sessionStorage。
 * @param {string} identifier 帳號，也就是 email
 * @param {string} secret 工號或密碼
 * @returns {Promise<{id: string, name: string, email: string, employeeId: string, role: 'newbie'|'senior'}>}
 * 真的登入（LIVE.auth）：Supabase Auth signInWithPassword（email＋工號當密碼），再讀 employees 取得姓名、身分。
 *   回傳的 id 固定是工號（假資料的其他功能用工號對人）。帳號就是 email，沒有另外的帳號名稱。
 */
export async function login(identifier, secret) {
  let user;
  if (LIVE.auth) {
    const email = String(identifier || '').trim().toLowerCase(), password = String(secret || '').trim().toUpperCase();
    if (!email.includes('@')) throw new Error('帳號是 email，請輸入完整的 email');
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('帳號或密碼不正確，請再確認一次');
    const { data: p, error: e2 } = await sb.from('employees').select('name, email, employee_id, role').eq('id', data.user.id).maybeSingle();
    if (e2 || !p) { await sb.auth.signOut(); throw new Error('這個帳號還沒有員工資料，請聯絡資深'); }
    user = { id: p.employee_id, name: p.name, email: p.email, employeeId: p.employee_id, role: p.role };
  } else if (USE_MOCK) user = await (await mock()).login(identifier, secret);
  else notReady('login');
  setSession(user);
  return user;
}

/** 登出：清掉 sessionStorage；真的登入時也要登出 Supabase。 */
export async function logout() {
  clearSession();
  if (LIVE.auth) { try { await (await getSupabase()).auth.signOut(); } catch (e) { /* 離線也要能登出 */ } }
}

/** 目前登入者（同步）。Supabase：auth.getSession() ＋ employees。 */
export const currentUser = () => getSession();

/**
 * 員工總覽（資深）：新人與新建立的帳號。
 * @returns {Promise<Array<{id, name, email, employeeId, role, roleLabel, hireDate, dayNo, nextExam: {name, deadline}|null,
 *   latestScore: number|null, latestPending: boolean, hasPendingReview: boolean, demo: boolean, added: boolean}>>}
 * Supabase：檢視表 v_employee_overview（employees ＋ exam_attempts）。
 */
export async function listEmployees() {
  if (isLive('listEmployees')) return callLive('listEmployees');
  if (USE_MOCK) return (await mock()).listEmployees();
  return notReady('listEmployees');
}

/**
 * 員工詳情（資深）。
 * @param {string} id 員工 id（假資料模式用工號；Supabase 用 employees.id）
 * @returns {Promise<object|null>} listEmployees 的欄位，加上 stages（同 listMyExams 的每一列，另含 paper: {id, status, questionCount, mcqCount, generatedAt, lockedAt}|null）,
 *   records: [{exam, date, score, passed}], paper: {id, status, questionCount, generatedAt, lockedAt}|null,
 *   attemptStatus: 'doing'|'submitted'|'reviewed'|null, canHaveExam
 * Supabase：employees、exam_papers、exam_attempts。
 */
export async function getEmployee(id) {
  if (isLive('getEmployee')) return callLive('getEmployee', id);
  if (USE_MOCK) return (await mock()).getEmployee(id);
  return notReady('getEmployee');
}

/**
 * 設定到職日（資深）。
 * @param {string} id 員工 id
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<{id, hireDate}>}
 * Supabase：update employees set hire_date。
 */
export async function updateHireDate(id, date) {
  if (isLive('updateHireDate')) return callLive('updateHireDate', id, date);
  if (USE_MOCK) return (await mock()).updateHireDate(id, date);
  return notReady('updateHireDate');
}

/**
 * 新增員工帳號（資深）。
 * @param {{name: string, email: string, employeeId: string, role: 'newbie'|'senior', hireDate: string}} input
 * @returns {Promise<{id: string}>}
 * Supabase：Edge Function create-user（需要 service_role 建立 auth 帳號，只能在後端）＋ insert employees。
 */
export async function createEmployee(input) {
  return fn('create-user', input);
}

/* =========================================================
   SOP（閱讀）
   ========================================================= */

/**
 * 目前發布的 SOP。
 * @param {'newbie'|'senior'} mode 新人版不回傳 effective（生效日）和 confirmedBy（確認人）
 * @returns {Promise<null | {version, publishedAt, confirmedBy?, title, ruleCount, redLineCount,
 *   chapters: [{no, name, desc}], rules: [{no, chapter, topic, name, rule, redLine, effective?, recent}]}>}
 *   null 表示還沒有任何發布的版本；recent＝發布前 30 天內生效（畫面標「最近更新」）
 * Supabase：sop_versions（status = 'published' 最新一筆）、sop_chapters、sop_rules；新人用檢視表 v_sop_newbie。
 */
export async function getPublishedSop(mode) {
  if (isLive('getPublishedSop')) return callLive('getPublishedSop', mode);
  if (USE_MOCK) return (await mock()).getPublishedSop(mode);
  return notReady('getPublishedSop');
}

/**
 * 我已讀的條目。
 * @returns {Promise<Object<string, true>>} 例如 { '7-9': true }
 * Supabase：sop_reads（user_id, version, rule_no, read_at）。
 */
export async function getReadMarks() {
  if (isLive('getReadMarks')) return callLive('getReadMarks');
  if (USE_MOCK) return (await mock()).getReadMarks();
  return notReady('getReadMarks');
}

/**
 * 標記一條已讀。
 * @param {string} ruleNo 例如 '7-9'
 * @returns {Promise<true>}
 * Supabase：upsert sop_reads。
 */
export async function markRuleRead(ruleNo) {
  if (isLive('markRuleRead')) return callLive('markRuleRead', ruleNo);
  if (USE_MOCK) return (await mock()).markRuleRead(ruleNo);
  return notReady('markRuleRead');
}

/**
 * 新人版 SOP 的「資深剛發布新版」提示。
 * @returns {Promise<{show: boolean, version?, publishedAt?, recentCount?}>}
 * Supabase：sop_versions ＋ sop_update_seen（user_id, version_id, seen_at）。
 */
export async function getSopUpdateNotice() {
  if (isLive('getSopUpdateNotice')) return callLive('getSopUpdateNotice');
  if (USE_MOCK) return (await mock()).getSopUpdateNotice();
  return notReady('getSopUpdateNotice');
}

/** 看過新版提示。Supabase：upsert sop_update_seen。 */
export async function markSopUpdateSeen() {
  if (isLive('markSopUpdateSeen')) return callLive('markSopUpdateSeen');
  if (USE_MOCK) return (await mock()).markSopUpdateSeen();
  return notReady('markSopUpdateSeen');
}

/* =========================================================
   SOP 統整（資深，一頁四步驟）
   ========================================================= */

/**
 * 目前這一輪統整的狀態。
 * @returns {Promise<{step: 1|2|3|4, imported, sources: [{name, kind: '舊檔'|'教學逐字稿', format, date, own}], organized, generated,
 *   resetNote: string（換過檔案、第 2、3 步被清掉時的說明）,
 *   sourcePackage: {title, count, oldDocs, transcripts}（一鍵匯入的資料包）,
 *   organizeResult: {chapters, rules, redLines, confirmCount}|null,
 *   confirmItems: [{id, no, name, latest, old, tbd, decision}], confirmedCount, confirmTotal, version,
 *   published: {version, publishedAt, confirmedBy}|null}>}
 *   tbd = true 的項目是資料包沒有提供內容的「待補」項
 * Supabase：sop_flows（目前一輪）、sop_sources、sop_confirm_items。
 */
export async function getSopFlow() {
  if (isLive('getSopFlow')) return callLive('getSopFlow');
  if (USE_MOCK) return (await mock()).getSopFlow();
  return notReady('getSopFlow');
}

/**
 * 第 1 步：一鍵匯入。把後端存好的來源資料包（舊 SOP＋教學逐字稿）整包匯入這一輪；自己另外選的檔案保留。
 * 換過檔案時，已做過的 AI 統整和資深確認會清掉（getSopFlow().resetNote 說明）。
 * @returns {Promise<{count: number, sources}>}
 * Supabase：Edge Function import-sop-package（Storage sop-sources/package/ → insert sop_sources）。
 */
export async function importSourcePackage() {
  if (isLive('importSourcePackage')) return callLive('importSourcePackage');
  if (USE_MOCK) return (await mock()).importSourcePackage();
  return fn('import-sop-package', {});
}

/**
 * 第 1 步：自己選的檔案，加到目前清單（同名取代）。
 * @param {File[]} files
 * @returns {Promise<Array>} 目前的來源清單（欄位同 getSopFlow().sources）
 * Supabase：上傳到 Storage sop-sources/{flow_id}/ ＋ insert sop_sources。
 */
export async function importSources(files) {
  if (isLive('importSources')) return callLive('importSources', files);
  if (USE_MOCK) return (await mock()).importSources(files);
  return notReady('importSources');
}

/** 第 1 步：從清單拿掉一份來源。Supabase：delete sop_sources（Storage 檔案保留）。 */
export async function removeSource(name) {
  if (isLive('removeSource')) return callLive('removeSource', name);
  if (USE_MOCK) return (await mock()).removeSource(name);
  return notReady('removeSource');
}

/**
 * 第 2 步：AI 統整（清洗、拆規則）。
 * @returns {Promise<{chapters, rules, redLines, confirmCount}>}
 * Supabase：Edge Function organize-sop。
 */
export async function runOrganize() {
  if (isLive('runOrganize')) return callLive('runOrganize');
  return fn('organize-sop', {});
}

/**
 * 切換到第幾步（前一步沒完成會失敗）。
 * @param {1|2|3|4} step
 * Supabase：update sop_flows set step。
 */
export async function setFlowStep(step) {
  if (isLive('setFlowStep')) return callLive('setFlowStep', step);
  if (USE_MOCK) return (await mock()).setFlowStep(step);
  return notReady('setFlowStep');
}

/**
 * 第 3 步：資深確認一項。
 * @param {string} itemId confirmItems[].id
 * @param {'以最新版為準'|'先記到待補'} decision
 * Supabase：update sop_confirm_items set decision, decided_by, decided_at。
 */
export async function saveConfirmDecision(itemId, decision) {
  if (isLive('saveConfirmDecision')) return callLive('saveConfirmDecision', itemId, decision);
  if (USE_MOCK) return (await mock()).saveConfirmDecision(itemId, decision);
  return notReady('saveConfirmDecision');
}

/**
 * 第 4 步：產生資深版 SOP，同時發布給新人（沒有另外的發布按鈕）。
 * @returns {Promise<{version, publishedAt}>}
 * Supabase：RPC publish_sop（寫入 sop_versions、sop_rules，status = 'published'）。
 */
export async function generateSeniorSop() {
  if (isLive('generateSeniorSop')) return callLive('generateSeniorSop');
  if (USE_MOCK) return (await mock()).generateSeniorSop();
  return notReady('generateSeniorSop');
}

/** 開始新一輪統整（已發布的版本不受影響）。Supabase：insert sop_flows。 */
export async function startNewRound() {
  if (isLive('startNewRound')) return callLive('startNewRound');
  if (USE_MOCK) return (await mock()).startNewRound();
  return notReady('startNewRound');
}

/* =========================================================
   問答
   ========================================================= */

/**
 * 問小橘。
 * @param {string} question
 * @returns {Promise<{askId, outcome, reply, sourceChip, ruleNo, writesPending, pendingId}>}
 *   outcome 是六種判斷標籤之一；writesPending = true 時已寫入待確認清單
 * Supabase：Edge Function ask-xiaoju（Gemini 金鑰只在這裡；函式內 insert qa_logs，需要時 insert pending_questions）。
 */
export async function askXiaoju(question) {
  if (isLive('askXiaoju')) return callLive('askXiaoju', question);
  return fn('ask-xiaoju', { question });
}

/**
 * 問小橘頁右側的「示範問題」。
 * @returns {Promise<Array<{id, question, ruleNo, ruleName}>>}
 * Supabase：qa_suggestions（或常見問題表）；目前取自 qa_cases.json 的 newbie_asks。
 */
export async function listSuggestedQuestions() {
  if (isLive('listSuggestedQuestions')) return callLive('listSuggestedQuestions');
  if (USE_MOCK) return (await mock()).listSuggestedQuestions();
  return notReady('listSuggestedQuestions');
}

/**
 * 我的提問紀錄（新的在前）。
 * @returns {Promise<Array<{id, question, outcome, reply, sourceChip, ruleNo, writesPending, createdAt, feedback: 'up'|'down'|null, reason}>>}
 * Supabase：qa_logs where user_id = auth.uid()。
 */
export async function listMyAsks() {
  if (isLive('listMyAsks')) return callLive('listMyAsks');
  if (USE_MOCK) return (await mock()).listMyAsks();
  return notReady('listMyAsks');
}

/** 單筆提問（同上欄位）。Supabase：qa_logs。 */
export async function getAsk(id) {
  if (isLive('getAsk')) return callLive('getAsk', id);
  if (USE_MOCK) return (await mock()).getAsk(id);
  return notReady('getAsk');
}

/**
 * 「有幫助／沒幫助」回饋。
 * @param {string} askId
 * @param {boolean} helpful
 * @param {string} [reason] 沒幫助時必填，選項來自 getExamSettings().noHelpReasons
 * Supabase：update qa_logs set feedback, feedback_reason。
 */
export async function sendFeedback(askId, helpful, reason) {
  if (isLive('sendFeedback')) return callLive('sendFeedback', askId, helpful, reason);
  if (USE_MOCK) return (await mock()).sendFeedback(askId, helpful, reason);
  return notReady('sendFeedback');
}

/**
 * 我的待確認清單。
 * @returns {Promise<Array<{id, question, outcome, sourceChip, date, status: '待處理'|'已回覆', reply, repliedBy, repliedAt, notifiedAt, isNew}>>}
 * Supabase：pending_questions join qa_logs where user_id = auth.uid()。
 */
export async function listMyPending() {
  if (isLive('listMyPending')) return callLive('listMyPending');
  if (USE_MOCK) return (await mock()).listMyPending();
  return notReady('listMyPending');
}

/** 看過資深的回覆。Supabase：update pending_questions set seen_at。 */
export async function markRepliesSeen() {
  if (isLive('markRepliesSeen')) return callLive('markRepliesSeen');
  if (USE_MOCK) return (await mock()).markRepliesSeen();
  return notReady('markRepliesSeen');
}

/**
 * 我的統計。
 * @returns {Promise<{total, sentToSenior, chapters: [{no, name, count}], helpful, notHelpful, noFeedback}>}
 * Supabase：檢視表 v_my_qa_stats。
 */
export async function getMyQaStats() {
  if (isLive('getMyQaStats')) return callLive('getMyQaStats');
  if (USE_MOCK) return (await mock()).getMyQaStats();
  return notReady('getMyQaStats');
}

/**
 * 待確認清單（資深）。
 * @param {'待處理'|'已回覆'|'全部'} status
 * @returns {Promise<Array<{id, userId, askerName, question, outcome, sourceChip, aiReply, date, status, reply, repliedBy, repliedAt, notifiedAt}>>}
 * Supabase：pending_questions join qa_logs join employees。
 */
export async function listPending(status) {
  if (isLive('listPending')) return callLive('listPending', status);
  if (USE_MOCK) return (await mock()).listPending(status);
  return notReady('listPending');
}

/**
 * 回覆待確認問題，並寄信通知提問的新人。
 * @param {string} id pending_questions.id
 * @param {string} reply
 * @returns {Promise<{pending: object, mail: {to, toName, subject, question, askedAt, sentAt}}>}
 * Supabase：update pending_questions（status、reply、replied_by、replied_at）→ Edge Function notify-reply（寄信，寫 notified_at）。
 */
export async function replyPending(id, reply) {
  if (LIVE.qa) {
    // 目前沒有寄信服務：只做站內通知（新人首頁會出現回覆提醒），畫面顯示的是「通知內容預覽」
    const p = await rpc('reply_pending', { p_id: id, p_reply: reply });
    return { pending: p, mail: { to: p.askerEmail, toName: p.askerName, subject: `${p.repliedBy}回覆了你在問答亭的問題`, question: p.question, askedAt: p.date, sentAt: p.repliedAt, sent: false } };
  }
  let pending;
  if (USE_MOCK) pending = await (await mock()).replyPending(id, reply);
  else notReady('replyPending');
  const mail = await fn('notify-reply', { pendingId: id });
  return { pending, mail };
}

/**
 * 問答統計（資深）。
 * @returns {Promise<{total, askSenior, waiting, helpful, notHelpful, chapters: [{no, name, count}],
 *   outcomes: [{outcome, count}], noHelpReasons: [{reason, count}], demo: boolean}>}
 * Supabase：檢視表 v_qa_stats。
 */
export async function getQaStats() {
  if (isLive('getQaStats')) return callLive('getQaStats');
  if (USE_MOCK) return (await mock()).getQaStats();
  return notReady('getQaStats');
}

/* =========================================================
   考核（新人）
   ========================================================= */

/**
 * 我的考核清單。
 * @returns {Promise<Array<{type: 'm1'|'m3'|'m6', name, months, level, levelName, focus, questionTarget, shortMax, passScore, dueDate, daysLeft, status: '尚未開放'|'可作答'|'已完成', finalScore, passed,
 *   questionCount, mcqCount, attemptId, attemptStatus, finalScore}>>}
 * Supabase：employees.hire_date ＋ exam_papers ＋ exam_attempts。
 */
export async function listMyExams() {
  if (isLive('listMyExams')) return callLive('listMyExams');
  if (USE_MOCK) return (await mock()).listMyExams();
  return notReady('listMyExams');
}

/**
 * 取得要作答的考卷（第一次進來會建立作答紀錄）。題目不含答案。
 * @param {'m1'|'m3'|'m6'} [type] 指定考核階段；不給就取第一份可作答的考卷
 * @returns {Promise<null | {done: true, attemptId} | {paperId, attemptId, type, name, passScore, deadline,
 *   questions: [{id, qtype: 'mcq'|'short', stem, options, sop, sopName, sopKnown}], answers}>}
 *   null：考卷還沒鎖定；done：已經交卷
 * Supabase：exam_papers（status = 'locked'）＋ question_bank 的公開欄位 ＋ upsert exam_attempts。
 */
export async function getExamForTaking(type) {
  if (isLive('getExamForTaking')) return callLive('getExamForTaking', type);
  if (USE_MOCK) return (await mock()).getExamForTaking(type);
  return notReady('getExamForTaking');
}

/**
 * 暫存一題的答案。
 * @param {string} attemptId
 * @param {string} qid
 * @param {number|string} answer 選擇題為選項索引，簡答為文字
 * Supabase：update exam_attempts set answers。
 */
export async function saveAnswerDraft(attemptId, qid, answer) {
  if (isLive('saveAnswerDraft')) return callLive('saveAnswerDraft', attemptId, qid, answer);
  if (USE_MOCK) return (await mock()).saveAnswerDraft(attemptId, qid, answer);
  return notReady('saveAnswerDraft');
}

/**
 * 交卷並批改選擇題；有簡答題時狀態為 'submitted'（待資深覆核）。
 * @param {string} attemptId
 * @param {Object} answers
 * @returns {Promise<{attemptId, status: 'submitted'|'reviewed', mcqScore, mcqMax}>}
 * Supabase：Edge Function grade-exam（正確答案只放在後端；寫 exam_attempts 與 wrong_items）。
 */
export async function submitExam(attemptId, answers) {
  if (isLive('submitExam')) return callLive('submitExam', attemptId, answers);
  return fn('grade-exam', { attemptId, answers });
}

/**
 * 我的成績與錯誤類型。
 * @param {string} [attemptId] 不給就取最近一次
 * @returns {Promise<null | {attemptId, examName, submittedAt, status, mcqScore, mcqMax, shortMax, finalScore, passScore, passed,
 *   review: {score, comment, errorTypes, reviewer, at}|null,
 *   items: [{qid, qtype, stem, options, answer, sop, sopName, sopKnown, correct, errorType, points, maxPoints}],
 *   errorSummary: Object<string, number>, resultSeen, mockGraded}>}
 *   不回傳正確選項；只回傳「這題對或錯」
 * Supabase：exam_attempts ＋ short_reviews。
 */
export async function getMyResult(attemptId) {
  if (isLive('getMyResult')) return callLive('getMyResult', attemptId);
  if (USE_MOCK) return (await mock()).getMyResult(attemptId);
  return notReady('getMyResult');
}

/** 看過覆核後的成績（首頁不再提醒）。Supabase：update exam_attempts set result_seen_at。 */
export async function markResultSeen(attemptId) {
  if (isLive('markResultSeen')) return callLive('markResultSeen', attemptId);
  if (USE_MOCK) return (await mock()).markResultSeen(attemptId);
  return notReady('markResultSeen');
}

/**
 * 考核紀錄。
 * @returns {Promise<Array<{exam, date, score: number|null, passed: boolean|null, attemptId}>>} score 為 null 表示待資深覆核
 * Supabase：exam_attempts where employee_id = 自己。
 */
export async function listMyRecords() {
  if (isLive('listMyRecords')) return callLive('listMyRecords');
  if (USE_MOCK) return (await mock()).listMyRecords();
  return notReady('listMyRecords');
}

/**
 * 錯題區。
 * @returns {Promise<Array<{qid, stem, options, chosen, errorType, sop, sopName, sopKnown, streak: 0|1|2, mastered}>>}
 * Supabase：wrong_items join question_bank（公開欄位）。
 */
export async function listWrongItems() {
  if (isLive('listWrongItems')) return callLive('listWrongItems');
  if (USE_MOCK) return (await mock()).listWrongItems();
  return notReady('listWrongItems');
}

/**
 * 錯題重練送出一次答案。連續答對 2 次就算掌握。
 * @param {string} qid
 * @param {number} choice 選項索引
 * @returns {Promise<{correct: boolean, streak, mastered, mock?: boolean}>}
 * Supabase：Edge Function check-practice（判斷對錯，update wrong_items）。
 */
export async function submitPractice(qid, choice) {
  if (isLive('submitPractice')) return callLive('submitPractice', qid, choice);
  return fn('check-practice', { qid, choice });
}

/* =========================================================
   考核（資深）
   ========================================================= */

/**
 * 考卷清單（考卷審核頁用來選要看哪一份）。
 * @returns {Promise<Array<{id, employeeId, employeeName, type, status: 'draft'|'locked', generatedAt, lockedAt}>>}
 * Supabase：exam_papers join employees。
 */
export async function listPapers() {
  if (isLive('listPapers')) return callLive('listPapers');
  if (USE_MOCK) return (await mock()).listPapers();
  return notReady('listPapers');
}

/**
 * 一份考卷的內容（不含答案）。
 * @param {string} paperId
 * @returns {Promise<null | {id, employeeId, employeeName, type, examName, status, generatedAt, lockedAt, deadline, mcqCount,
 *   questions: [{id, qtype, stem, options, sop, sopName, sopKnown, bankStatus}]}>}
 * Supabase：exam_papers ＋ question_bank（公開欄位）。
 */
export async function getPaper(paperId) {
  if (isLive('getPaper')) return callLive('getPaper', paperId);
  if (USE_MOCK) return (await mock()).getPaper(paperId);
  return notReady('getPaper');
}

/**
 * AI 隨機產生考卷（只從「已審」題目抽）。
 * @param {string} employeeId
 * @param {'m1'|'m3'|'m6'} type 考核階段（設定來自後端 exam_stages）
 * @returns {Promise<{id: string, shortage: number}>} 新考卷 id（狀態 draft）；shortage＝題庫不夠、還差幾題
 * Supabase：Edge Function generate-paper（insert exam_papers）。
 */
export async function generatePaper(employeeId, type) {
  if (isLive('generatePaper')) return callLive('generatePaper', employeeId, type);
  return fn('generate-paper', { employeeId, type });
}

/** 刪題（只限 draft）。Supabase：update exam_papers set question_ids。 */
export async function removePaperQuestion(paperId, qid) {
  if (isLive('removePaperQuestion')) return callLive('removePaperQuestion', paperId, qid);
  if (USE_MOCK) return (await mock()).removePaperQuestion(paperId, qid);
  return notReady('removePaperQuestion');
}

/** 補題（只限 draft，題目要「已審」）。Supabase：update exam_papers set question_ids。 */
export async function addPaperQuestion(paperId, qid) {
  if (isLive('addPaperQuestion')) return callLive('addPaperQuestion', paperId, qid);
  if (USE_MOCK) return (await mock()).addPaperQuestion(paperId, qid);
  return notReady('addPaperQuestion');
}

/**
 * 鎖定考卷，鎖定後新人才能作答。
 * @returns {Promise<{lockedAt}>}
 * Supabase：update exam_papers set status = 'locked', locked_at。
 */
export async function lockPaper(paperId) {
  if (isLive('lockPaper')) return callLive('lockPaper', paperId);
  if (USE_MOCK) return (await mock()).lockPaper(paperId);
  return notReady('lockPaper');
}

/**
 * 題庫（700 題，來源 alldata/測驗資料，由 backend/tools/build-question-bank.mjs 匯入）。分頁回傳。
 * @param {{status?: '全部'|'待審'|'已審'|'停用', qtype?: 'mcq'|'short'|'', level?: 1|2|3|'', source?: 'L'|'M'|'D'|'', q?: string, page?: number, size?: number}} [filter]
 * @returns {Promise<{totals: {total, mcq, short, approved, pending, disabled}, matched, page, pages, size,
 *   items: [{id, source, qtype, level, topic, ability, stem, options, sop, sopName, sopKnown, status, inLockedPaper}]}>}
 * Supabase：question_bank ＋ 檢視表 v_question_bank_stats（答案在 question_answers，任何前端角色都讀不到）。
 */
export async function listBank(filter = {}) {
  if (LIVE.bank) return (await import('./live-bank.js')).listBank(filter);
  if (USE_MOCK) return (await mock()).listBank(filter);
  return notReady('listBank');
}

/**
 * 批次改狀態：符合篩選條件的題目全部改成 status；已用在鎖定考卷的題目跳過。
 * @returns {Promise<{changed: number, skipped: number}>}
 * Supabase：update question_bank set status where …（RLS 只允許資深；trigger 只允許改狀態）。
 */
export async function setBankStatusBulk(filter, status) {
  if (LIVE.bank) return (await import('./live-bank.js')).setBankStatusBulk(filter, status);
  if (USE_MOCK) return (await mock()).setBankStatusBulk(filter, status);
  return notReady('setBankStatusBulk');
}

/** 改題目狀態。Supabase：update question_bank set status。 */
export async function setBankStatus(qid, status) {
  if (LIVE.bank) return (await import('./live-bank.js')).setBankStatus(qid, status);
  if (USE_MOCK) return (await mock()).setBankStatus(qid, status);
  return notReady('setBankStatus');
}

/**
 * 待覆核的簡答（員工詳情頁用）。參考答案不回前端。
 * @param {string} employeeId
 * @returns {Promise<null | {attemptId, question: {id, stem}, answer, mcqScore, shortMax}>}
 * Supabase：exam_attempts（status = 'submitted'）。
 */
export async function getShortReview(employeeId) {
  if (isLive('getShortReview')) return callLive('getShortReview', employeeId);
  if (USE_MOCK) return (await mock()).getShortReview(employeeId);
  return notReady('getShortReview');
}

/**
 * 送出簡答覆核，算出最終分數。
 * @param {string} attemptId
 * @param {{score: number, comment: string, errorTypes: string[]}} review
 * @returns {Promise<{finalScore, passed}>}
 * Supabase：RPC finalize_review（insert short_reviews、update exam_attempts）。
 */
export async function submitShortReview(attemptId, review) {
  if (isLive('submitShortReview')) return callLive('submitShortReview', attemptId, review);
  if (USE_MOCK) return (await mock()).submitShortReview(attemptId, review);
  return notReady('submitShortReview');
}

/**
 * 考核與回饋的設定值。三階段考核的名稱、月數、題數、簡答上限、及格分、難度都在這裡，前端不寫死。
 * @returns {Promise<{stages: [{type, name, months, questionCount, shortMax, passScore, level, levelName, focus}],
 *   errorTypes: string[], noHelpReasons: string[], demo: boolean}>}
 * Supabase：exam_stages（三列）＋ exam_settings（單列設定表）。
 */
export async function getExamSettings() {
  if (isLive('getExamSettings')) return callLive('getExamSettings');
  if (USE_MOCK) return (await mock()).getExamSettings();
  return notReady('getExamSettings');
}

/* =========================================================
   首頁與導覽列
   ========================================================= */

/**
 * 資深首頁的待辦。
 * @returns {Promise<{pendingQuestions, pendingReviews, pendingPapers, firstReviewEmployee, firstDraftPaper,
 *   deadlines: [{id, name, demo, exam, deadline, daysLeft}], sop: {version, publishedAt, confirmedBy}|null}>}
 * Supabase：檢視表 v_senior_todos、v_employee_overview、sop_versions。
 */
export async function getSeniorTodos() {
  if (isLive('getSeniorTodos')) return callLive('getSeniorTodos');
  if (USE_MOCK) return (await mock()).getSeniorTodos();
  return notReady('getSeniorTodos');
}

/**
 * 新人首頁需要的資料。
 * @returns {Promise<{hireDate, dayNo, today, stages: [{type, name, months, dueDate, daysLeft, status, passed}],
 *   sop: {published, read, shown, ruleCount, updated, firstUnread},
 *   exam: {type, name, months, dueDate, daysLeft, status, attemptStatus, attemptId, finalScore, passed, resultSeen}|null（首頁焦點的那一次考核）,
 *   replies: {unseen: [{id, question, repliedBy, repliedAt}], waiting}, wrongOpen}>}
 * Supabase：檢視表 v_newbie_home（或拆成上面幾個函式）。
 */
export async function getNewbieHome() {
  if (isLive('getNewbieHome')) return callLive('getNewbieHome');
  if (USE_MOCK) return (await mock()).getNewbieHome();
  return notReady('getNewbieHome');
}

/**
 * 導覽列與分頁上的數字。
 * @returns {Promise<{sop?, qa, exam, wrong?}>}
 * Supabase：檢視表 v_nav_counts。
 */
export async function getNavCounts() {
  if (isLive('getNavCounts')) return callLive('getNavCounts');
  if (USE_MOCK) return (await mock()).getNavCounts();
  return notReady('getNavCounts');
}

/** 只在假資料模式：清掉 localStorage 的示範紀錄，回到第一次使用。 */
export async function resetDemo() {
  if (USE_MOCK) return (await mock()).resetDemo();
  return false;
}
