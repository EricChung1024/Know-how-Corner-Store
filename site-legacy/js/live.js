/* =========================================================
   經驗柑仔店｜真的 Supabase 版資料函式（用 rpc 呼叫資料庫函式）
   MAP：資料函式名稱 → [模組, 資料庫函式, 把參數轉成資料庫函式參數]。
   模組由 config.js 的 LIVE 開關控制；開關打開的模組，data.js 的對應函式就走這裡。
   資料庫函式在 backend/supabase/migrations/；回傳格式與 data.js 的註解一致。
   錯誤：資料庫函式用 raise exception 丟出的中文訊息會原樣變成 Error.message，可以直接顯示給使用者。
   ========================================================= */
import { getSupabase } from './api.js';
import { LIVE } from './config.js';

const none = () => ({});
const MAP = {
  /* ---- 員工與考核（migration 004） ---- */
  listEmployees:        ['exam', 'list_employees', none],
  getEmployee:          ['exam', 'get_employee', id => ({ p_employee_id: id })],
  updateHireDate:       ['exam', 'update_hire_date', (id, date) => ({ p_employee_id: id, p_date: date })],
  generatePaper:        ['exam', 'generate_paper', (employeeId, type) => ({ p_employee_id: employeeId, p_type: type })],
  listPapers:           ['exam', 'list_papers', none],
  getPaper:             ['exam', 'get_paper', paperId => ({ p_paper: paperId })],
  removePaperQuestion:  ['exam', 'remove_paper_question', (paperId, qid) => ({ p_paper: paperId, p_qid: qid })],
  addPaperQuestion:     ['exam', 'add_paper_question', (paperId, qid) => ({ p_paper: paperId, p_qid: qid })],
  lockPaper:            ['exam', 'lock_paper', paperId => ({ p_paper: paperId })],
  listMyExams:          ['exam', 'list_my_exams', none],
  getExamForTaking:     ['exam', 'start_exam', type => ({ p_type: type || null })],
  saveAnswerDraft:      ['exam', 'save_answer', (attemptId, qid, answer) => ({ p_attempt: attemptId, p_qid: qid, p_answer: answer })],
  submitExam:           ['exam', 'submit_exam', (attemptId, answers) => ({ p_attempt: attemptId, p_answers: answers || {} })],
  getMyResult:          ['exam', 'get_my_result', attemptId => ({ p_attempt: attemptId || null })],
  markResultSeen:       ['exam', 'mark_result_seen', attemptId => ({ p_attempt: attemptId })],
  listMyRecords:        ['exam', 'list_my_records', none],
  getShortReview:       ['exam', 'get_short_review', employeeId => ({ p_employee_id: employeeId })],
  submitShortReview:    ['exam', 'submit_short_review', (attemptId, review) => ({ p_attempt: attemptId, p_review: review })],
  listWrongItems:       ['exam', 'list_wrong_items', none],
  submitPractice:       ['exam', 'check_practice', (qid, choice) => ({ p_qid: qid, p_choice: choice })],

  /* ---- 設定、SOP、SOP 統整流程（migration 006） ---- */
  getExamSettings:      ['sop', 'get_exam_settings', none],
  getPublishedSop:      ['sop', 'get_published_sop', mode => ({ p_mode: mode === 'senior' ? 'senior' : 'newbie' })],
  getReadMarks:         ['sop', 'get_read_marks', none],
  markRuleRead:         ['sop', 'mark_rule_read', ruleNo => ({ p_rule_no: ruleNo })],
  getSopUpdateNotice:   ['sop', 'get_sop_update_notice', none],
  markSopUpdateSeen:    ['sop', 'mark_sop_update_seen', none],
  getSopFlow:           ['sop', 'get_sop_flow', none],
  importSourcePackage:  ['sop', 'import_source_package', none],
  importSources:        ['sop', 'import_sources', files => ({ p_files: (files || []).map(f => (typeof f === 'string' ? { name: f } : { name: f.name, lastModified: f.lastModified })) })],
  removeSource:         ['sop', 'remove_source', name => ({ p_name: name })],
  runOrganize:          ['sop', 'run_organize', none],
  setFlowStep:          ['sop', 'set_flow_step', step => ({ p_step: step })],
  saveConfirmDecision:  ['sop', 'save_confirm_decision', (itemId, decision) => ({ p_item: itemId, p_decision: decision })],
  generateSeniorSop:    ['sop', 'generate_senior_sop', none],
  startNewRound:        ['sop', 'start_new_round', none],

  /* ---- 問小橘（migration 007） ---- */
  askXiaoju:            ['qa', 'ask_xiaoju', question => ({ p_question: question })],
  listSuggestedQuestions: ['qa', 'list_suggested_questions', none],
  listMyAsks:           ['qa', 'list_my_asks', none],
  getAsk:               ['qa', 'get_ask', id => ({ p_id: id })],
  sendFeedback:         ['qa', 'send_feedback', (askId, helpful, reason) => ({ p_ask: askId, p_helpful: !!helpful, p_reason: reason || '' })],
  listMyPending:        ['qa', 'list_my_pending', none],
  markRepliesSeen:      ['qa', 'mark_replies_seen', none],
  getMyQaStats:         ['qa', 'get_my_qa_stats', none],
  listPending:          ['qa', 'list_pending', status => ({ p_status: status || '待處理' })],
  getQaStats:           ['qa', 'get_qa_stats', none],

  /* ---- 首頁與導覽（migration 008） ---- */
  getNewbieHome:        ['home', 'get_newbie_home', none],
  getSeniorTodos:       ['home', 'get_senior_todos', none],
  getNavCounts:         ['home', 'get_nav_counts', none],
};

/** 這個資料函式現在要走真的資料庫嗎？ */
export const isLive = name => !!MAP[name] && !!LIVE[MAP[name][0]];

/** 呼叫資料庫函式；失敗丟出 Error（message 可直接顯示）。 */
export async function rpc(fnName, args = {}) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc(fnName, args);
  if (error) throw new Error(error.message);
  return data;
}

export const callLive = (name, ...args) => rpc(MAP[name][1], MAP[name][2](...args));
