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
import { USE_MOCK } from './config.js';
import { callFn } from './api.js';
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
 * 登入：email／帳號＋工號／密碼。成功後寫入 sessionStorage。
 * @param {string} identifier email 或帳號
 * @param {string} secret 工號或密碼
 * @returns {Promise<{id: string, name: string, email: string, employeeId: string, role: 'newbie'|'senior'}>}
 * Supabase：尚未決定，先留空殼。可能的做法是 Edge Function 驗證後回傳 session，
 *   或 auth.signInWithPassword ＋ 表 employees（id, name, email, employee_id, role, hire_date）。
 */
export async function login(identifier, secret) {
  let user;
  if (USE_MOCK) user = await (await mock()).login(identifier, secret);
  else {
    // TODO(婉萱／Eric)：實作 Supabase 登入，回傳上面註解的欄位
    notReady('login');
  }
  setSession(user);
  return user;
}

/** 登出並清掉 sessionStorage。Supabase：auth.signOut()。 */
export async function logout() {
  // TODO(Eric)：USE_MOCK 為 false 時呼叫 (await getSupabase()).auth.signOut()
  clearSession();
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
  if (USE_MOCK) return (await mock()).listEmployees();
  return notReady('listEmployees');
}

/**
 * 員工詳情（資深）。
 * @param {string} id 員工 id（假資料模式用工號；Supabase 用 employees.id）
 * @returns {Promise<object|null>} listEmployees 的欄位，加上 trialDeadline, halfDeadline,
 *   records: [{exam, date, score, passed}], paper: {id, status, questionCount, generatedAt, lockedAt}|null,
 *   attemptStatus: 'doing'|'submitted'|'reviewed'|null, canHaveExam
 * Supabase：employees、exam_papers、exam_attempts。
 */
export async function getEmployee(id) {
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
  if (USE_MOCK) return (await mock()).getPublishedSop(mode);
  return notReady('getPublishedSop');
}

/**
 * 我已讀的條目。
 * @returns {Promise<Object<string, true>>} 例如 { '7-9': true }
 * Supabase：sop_reads（user_id, version, rule_no, read_at）。
 */
export async function getReadMarks() {
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
  if (USE_MOCK) return (await mock()).markRuleRead(ruleNo);
  return notReady('markRuleRead');
}

/**
 * 新人版 SOP 的「資深剛發布新版」提示。
 * @returns {Promise<{show: boolean, version?, publishedAt?, recentCount?}>}
 * Supabase：sop_versions ＋ sop_update_seen（user_id, version_id, seen_at）。
 */
export async function getSopUpdateNotice() {
  if (USE_MOCK) return (await mock()).getSopUpdateNotice();
  return notReady('getSopUpdateNotice');
}

/** 看過新版提示。Supabase：upsert sop_update_seen。 */
export async function markSopUpdateSeen() {
  if (USE_MOCK) return (await mock()).markSopUpdateSeen();
  return notReady('markSopUpdateSeen');
}

/* =========================================================
   SOP 統整（資深，一頁四步驟）
   ========================================================= */

/**
 * 目前這一輪統整的狀態。
 * @returns {Promise<{step: 1|2|3|4, imported, sources: string[], organized, generated,
 *   organizeResult: {chapters, rules, redLines, confirmCount}|null,
 *   confirmItems: [{id, no, name, latest, old, tbd, decision}], confirmedCount, confirmTotal, version,
 *   published: {version, publishedAt, confirmedBy}|null}>}
 *   tbd = true 的項目是資料包沒有提供內容的「待補」項
 * Supabase：sop_flows（目前一輪）、sop_sources、sop_confirm_items。
 */
export async function getSopFlow() {
  if (USE_MOCK) return (await mock()).getSopFlow();
  return notReady('getSopFlow');
}

/**
 * 第 1 步：匯入資料。
 * @param {File[]|null} files 使用者選的檔案；null 表示載入示範資料
 * @returns {Promise<string[]>} 匯入的檔名
 * Supabase：Storage 空間 sop-sources ＋ insert sop_sources。
 */
export async function importSources(files) {
  if (USE_MOCK) return (await mock()).importSources(files);
  return notReady('importSources');
}

/**
 * 第 2 步：AI 統整（清洗、拆規則）。
 * @returns {Promise<{chapters, rules, redLines, confirmCount}>}
 * Supabase：Edge Function organize-sop。
 */
export async function runOrganize() {
  return fn('organize-sop', {});
}

/**
 * 切換到第幾步（前一步沒完成會失敗）。
 * @param {1|2|3|4} step
 * Supabase：update sop_flows set step。
 */
export async function setFlowStep(step) {
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
  if (USE_MOCK) return (await mock()).saveConfirmDecision(itemId, decision);
  return notReady('saveConfirmDecision');
}

/**
 * 第 4 步：產生資深版 SOP，同時發布給新人（沒有另外的發布按鈕）。
 * @returns {Promise<{version, publishedAt}>}
 * Supabase：RPC publish_sop（寫入 sop_versions、sop_rules，status = 'published'）。
 */
export async function generateSeniorSop() {
  if (USE_MOCK) return (await mock()).generateSeniorSop();
  return notReady('generateSeniorSop');
}

/** 開始新一輪統整（已發布的版本不受影響）。Supabase：insert sop_flows。 */
export async function startNewRound() {
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
  return fn('ask-xiaoju', { question });
}

/**
 * 問小橘頁右側的「示範問題」。
 * @returns {Promise<Array<{id, question, ruleNo, ruleName}>>}
 * Supabase：qa_suggestions（或常見問題表）；目前取自 qa_cases.json 的 newbie_asks。
 */
export async function listSuggestedQuestions() {
  if (USE_MOCK) return (await mock()).listSuggestedQuestions();
  return notReady('listSuggestedQuestions');
}

/**
 * 我的提問紀錄（新的在前）。
 * @returns {Promise<Array<{id, question, outcome, reply, sourceChip, ruleNo, writesPending, createdAt, feedback: 'up'|'down'|null, reason}>>}
 * Supabase：qa_logs where user_id = auth.uid()。
 */
export async function listMyAsks() {
  if (USE_MOCK) return (await mock()).listMyAsks();
  return notReady('listMyAsks');
}

/** 單筆提問（同上欄位）。Supabase：qa_logs。 */
export async function getAsk(id) {
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
  if (USE_MOCK) return (await mock()).sendFeedback(askId, helpful, reason);
  return notReady('sendFeedback');
}

/**
 * 我的待確認清單。
 * @returns {Promise<Array<{id, question, outcome, sourceChip, date, status: '待處理'|'已回覆', reply, repliedBy, repliedAt, notifiedAt, isNew}>>}
 * Supabase：pending_questions join qa_logs where user_id = auth.uid()。
 */
export async function listMyPending() {
  if (USE_MOCK) return (await mock()).listMyPending();
  return notReady('listMyPending');
}

/** 看過資深的回覆。Supabase：update pending_questions set seen_at。 */
export async function markRepliesSeen() {
  if (USE_MOCK) return (await mock()).markRepliesSeen();
  return notReady('markRepliesSeen');
}

/**
 * 我的統計。
 * @returns {Promise<{total, sentToSenior, chapters: [{no, name, count}], helpful, notHelpful, noFeedback}>}
 * Supabase：檢視表 v_my_qa_stats。
 */
export async function getMyQaStats() {
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
  if (USE_MOCK) return (await mock()).getQaStats();
  return notReady('getQaStats');
}

/* =========================================================
   考核（新人）
   ========================================================= */

/**
 * 我的考核清單。
 * @returns {Promise<Array<{type: 'trial'|'half', name, status: '尚未開放'|'可作答'|'已完成', deadline, daysLeft,
 *   questionCount, mcqCount, attemptId, attemptStatus, finalScore}>>}
 * Supabase：employees.hire_date ＋ exam_papers ＋ exam_attempts。
 */
export async function listMyExams() {
  if (USE_MOCK) return (await mock()).listMyExams();
  return notReady('listMyExams');
}

/**
 * 取得要作答的考卷（第一次進來會建立作答紀錄）。題目不含答案。
 * @returns {Promise<null | {done: true, attemptId} | {paperId, attemptId, name, deadline,
 *   questions: [{id, qtype: 'mcq'|'short', stem, options, sop, sopName, sopKnown}], answers}>}
 *   null：考卷還沒鎖定；done：已經交卷
 * Supabase：exam_papers（status = 'locked'）＋ question_bank 的公開欄位 ＋ upsert exam_attempts。
 */
export async function getExamForTaking() {
  if (USE_MOCK) return (await mock()).getExamForTaking();
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
  if (USE_MOCK) return (await mock()).getMyResult(attemptId);
  return notReady('getMyResult');
}

/** 看過覆核後的成績（首頁不再提醒）。Supabase：update exam_attempts set result_seen_at。 */
export async function markResultSeen(attemptId) {
  if (USE_MOCK) return (await mock()).markResultSeen(attemptId);
  return notReady('markResultSeen');
}

/**
 * 考核紀錄。
 * @returns {Promise<Array<{exam, date, score: number|null, passed: boolean|null, attemptId}>>} score 為 null 表示待資深覆核
 * Supabase：exam_attempts where employee_id = 自己。
 */
export async function listMyRecords() {
  if (USE_MOCK) return (await mock()).listMyRecords();
  return notReady('listMyRecords');
}

/**
 * 錯題區。
 * @returns {Promise<Array<{qid, stem, options, chosen, errorType, sop, sopName, sopKnown, streak: 0|1|2, mastered}>>}
 * Supabase：wrong_items join question_bank（公開欄位）。
 */
export async function listWrongItems() {
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
  if (USE_MOCK) return (await mock()).getPaper(paperId);
  return notReady('getPaper');
}

/**
 * AI 隨機產生考卷（只從「已審」題目抽）。
 * @param {string} employeeId
 * @param {'trial'|'half'} type
 * @returns {Promise<{id: string}>} 新考卷 id（狀態 draft）
 * Supabase：Edge Function generate-paper（insert exam_papers）。
 */
export async function generatePaper(employeeId, type = 'trial') {
  return fn('generate-paper', { employeeId, type });
}

/** 刪題（只限 draft）。Supabase：update exam_papers set question_ids。 */
export async function removePaperQuestion(paperId, qid) {
  if (USE_MOCK) return (await mock()).removePaperQuestion(paperId, qid);
  return notReady('removePaperQuestion');
}

/** 補題（只限 draft，題目要「已審」）。Supabase：update exam_papers set question_ids。 */
export async function addPaperQuestion(paperId, qid) {
  if (USE_MOCK) return (await mock()).addPaperQuestion(paperId, qid);
  return notReady('addPaperQuestion');
}

/**
 * 鎖定考卷，鎖定後新人才能作答。
 * @returns {Promise<{lockedAt}>}
 * Supabase：update exam_papers set status = 'locked', locked_at。
 */
export async function lockPaper(paperId) {
  if (USE_MOCK) return (await mock()).lockPaper(paperId);
  return notReady('lockPaper');
}

/**
 * 題庫。
 * @param {'全部'|'待審'|'已審'|'停用'} status
 * @returns {Promise<{totals: {total, short, mcq, tf}, items: [{id, qtype, stem, options, sop, sopName, sopKnown, status, inLockedPaper}]}>}
 * Supabase：question_bank（答案放在另一張只有 Edge Function 讀得到的表 question_answers，RLS 不開放）。
 */
export async function listBank(status) {
  if (USE_MOCK) return (await mock()).listBank(status);
  return notReady('listBank');
}

/** 改題目狀態。Supabase：update question_bank set status。 */
export async function setBankStatus(qid, status) {
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
  if (USE_MOCK) return (await mock()).submitShortReview(attemptId, review);
  return notReady('submitShortReview');
}

/**
 * 考核與回饋的設定值（目前是示範值）。
 * @returns {Promise<{passScore, errorTypes: string[], noHelpReasons: string[], demo: boolean}>}
 * Supabase：exam_settings（單列設定表）。
 */
export async function getExamSettings() {
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
  if (USE_MOCK) return (await mock()).getSeniorTodos();
  return notReady('getSeniorTodos');
}

/**
 * 新人首頁需要的資料。
 * @returns {Promise<{hireDate, dayNo, today, trialDeadline, daysLeft,
 *   sop: {published, read, shown, ruleCount, updated, firstUnread},
 *   exam: {status, attemptStatus, attemptId, finalScore, resultSeen},
 *   replies: {unseen: [{id, question, repliedBy, repliedAt}], waiting}, wrongOpen}>}
 * Supabase：檢視表 v_newbie_home（或拆成上面幾個函式）。
 */
export async function getNewbieHome() {
  if (USE_MOCK) return (await mock()).getNewbieHome();
  return notReady('getNewbieHome');
}

/**
 * 導覽列與分頁上的數字。
 * @returns {Promise<{sop?, qa, exam, wrong?}>}
 * Supabase：檢視表 v_nav_counts。
 */
export async function getNavCounts() {
  if (USE_MOCK) return (await mock()).getNavCounts();
  return notReady('getNavCounts');
}

/** 只在假資料模式：清掉 localStorage 的示範紀錄，回到第一次使用。 */
export async function resetDemo() {
  if (USE_MOCK) return (await mock()).resetDemo();
  return false;
}
