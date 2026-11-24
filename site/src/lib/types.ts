/* 後端（Supabase 資料庫函式）回傳的資料格式。欄位名稱以 backend/supabase/migrations/ 裡的 jsonb_build_object 為準。 */

export type Role = 'newbie' | 'senior';
export interface User { id: string; name: string; email: string; employeeId: string; role: Role }

/* ---------- 考核 ---------- */
export type StageType = 'm1' | 'm3' | 'm6';
export type StageStatus = '尚未開放' | '可作答' | '已完成';
export type AttemptStatus = 'doing' | 'submitted' | 'reviewed';
export type QType = 'mcq' | 'tf' | 'short';

export interface PaperInfo { id: string; status: 'draft' | 'locked'; questionCount: number; mcqCount: number; generatedAt: string; lockedAt: string | null }
export interface StageRow {
  type: StageType; name: string; months: number; level: number; levelName: string; focus: string;
  questionTarget: number; shortMax: number; passScore: number;
  dueDate: string | null; daysLeft: number | null; status: StageStatus;
  paper: PaperInfo | null;            // 資深看得到；新人是 null
  questionCount: number | null; mcqCount: number | null; // 新人：鎖定後才有
  attemptId: string | null; attemptStatus: AttemptStatus | null; resultSeen: boolean;
  finalScore: number | null; passed: boolean | null;
}
export interface RecordRow { exam: string; type: StageType; date: string; score: number | null; passed: boolean | null; passScore: number; attemptId: string }

export interface EmployeeOverview {
  id: string; name: string; email: string; employeeId: string; role: Role; roleLabel: string; hireDate: string | null; dayNo: number | null;
  nextExam: { type: StageType; name: string; deadline: string } | null;
  latestScore: number | null; latestPending: boolean; hasPendingReview: boolean; demo: boolean; added: boolean;
}
export interface EmployeeDetail extends EmployeeOverview { stages: StageRow[]; records: RecordRow[]; canHaveExam: boolean }

export interface PaperQuestion {
  id: string; qtype: QType; stem: string; options: string[] | null; sop: string | null; sopName: string | null; sopKnown: boolean;
  bankStatus?: string; redLine?: boolean; level?: number;
}
export interface PaperListItem { id: string; employeeId: string; employeeName: string; type: StageType; examName: string; status: 'draft' | 'locked'; generatedAt: string; lockedAt: string | null }
export interface PaperDetail {
  id: string; employeeId: string; employeeName: string; type: StageType; examName: string; level: number; levelName: string; focus: string;
  questionTarget: number; shortMax: number; passScore: number; status: 'draft' | 'locked'; generatedAt: string; lockedAt: string | null;
  deadline: string | null; mcqCount: number; questions: PaperQuestion[];
}

export interface ExamForTaking {
  paperId: string; attemptId: string; type: StageType; name: string; passScore: number; deadline: string | null;
  questions: PaperQuestion[]; answers: Record<string, number | string>;
}
export type TakingResult = ExamForTaking | { done: true; attemptId: string } | null;

export interface ResultItem {
  qid: string; qtype: QType; stem: string; options: string[] | null; answer: number | string | null; sop: string | null; sopName: string | null; sopKnown: boolean;
  maxPoints: number; correct: boolean | null; errorType: string | null; points: number | null; reviewed?: boolean;
}
export interface MyResult {
  attemptId: string; type: StageType; examName: string; submittedAt: string; status: AttemptStatus;
  mcqScore: number; mcqMax: number; shortMax: number; shortScore: number | null;
  review: { reviewer: string; comment: string; errorTypes: string[]; at: string } | null;
  finalScore: number | null; passScore: number; passed: boolean | null; redLineFailed: boolean;
  items: ResultItem[]; errorSummary: Record<string, number>; resultSeen: boolean;
}
export interface ShortReview {
  attemptId: string; examName: string; mcqScore: number;
  items: { qid: string; stem: string; answer: string | null; maxPoints: number; referenceAnswer: string | null; rubric: string[] | string | null; keyError: string | null }[];
}
export interface WrongItem {
  employeeId: string; qid: string; type: StageType | null; examName: string | null; chosen: number | null; errorType: string | null;
  streak: number; mastered: boolean; stem: string; options: string[]; sop: string | null; sopName: string | null; sopKnown: boolean;
}
export interface ExamSettings {
  stages: { type: StageType; name: string; months: number; questionCount: number; shortMax: number; passScore: number; level: number; levelName: string; focus: string }[];
  errorTypes: string[]; noHelpReasons: string[]; demo: boolean;
}

/* ---------- 題庫 ---------- */
export type BankStatus = '待審' | '已審' | '停用';
export interface BankFilter { status?: '全部' | BankStatus; qtype?: '' | QType | 'choice'; level?: '' | number | string; source?: '' | string; q?: string; page?: number; size?: number }
export interface BankItem {
  id: string; source: string; kind: string; redLine: boolean; qtype: QType; level: number; topic: string | null; ability: string | null;
  stem: string; options: string[] | null; sop: string | null; sopName: string | null; sopKnown: boolean; status: BankStatus; inLockedPaper: boolean;
}
export interface BankList {
  totals: { total: number; mcq: number; tf: number; short: number; approved: number; pending: number; disabled: number };
  matched: number; page: number; pages: number; size: number; items: BankItem[];
}

/* ---------- SOP ---------- */
export interface SopRule { no: string; chapter: string; topic: string; name: string; rule: string; redLine: boolean; effective: string | null; recent: boolean }
export interface PublishedSop {
  version: string; publishedAt: string; confirmedBy: string | null; ruleCount: number; redLineCount: number; title: string;
  chapters: { no: string; name: string; desc: string }[]; rules: SopRule[];
}
export interface SopUpdateNotice { show: boolean; version?: string; publishedAt?: string; recentCount?: number }
export interface FlowSource { name: string; kind: '舊檔' | '教學逐字稿'; format: string; date: string; own: boolean }
export interface ConfirmItem {
  id: string; kind: 'batch' | 'question'; no: string | null; name: string; title: string; ask: string | null; options: string[]; aiPick: string | null;
  context: { label: string; text: string; status: string }[] | null;
  batchItems: { no: string; topic: string; proposed: string; older: string[] }[] | null; resultRule: string | null; tbd: boolean; decision: string | null;
}
export interface SopFlow {
  step: 1 | 2 | 3 | 4; imported: boolean; sources: FlowSource[]; organized: boolean; generated: boolean; resetNote: string;
  sourcePackage: { title: string; count: number; oldDocs: number; transcripts: number };
  organizeResult: { chapters: number; rules: number; redLines: number; confirmCount: number } | null;
  confirmItems: ConfirmItem[]; confirmedCount: number; confirmTotal: number; version: string;
  published: { version: string; publishedAt: string; confirmedBy: string } | null;
}

/* ---------- 問小橘 ---------- */
export type Outcome = '直接回答' | '已確認的變更' | '舊規已失效' | '暫時規則已過期' | '新舊版都不符 → 請問資深' | '不在 SOP 範圍';
export interface Ask {
  id: string; userId: string; caseId: string | null; question: string; outcome: Outcome; reply: string; sourceChip: string; ruleNo: string | null;
  writesPending: boolean; createdAt: string; feedback: 'up' | 'down' | null; reason: string;
}
export interface AskResult { askId: string; outcome: Outcome; reply: string; sourceChip: string; ruleNo: string | null; writesPending: boolean; pendingId: string | null }
export interface Suggested { id: string; question: string; ruleNo: string | null; ruleName: string | null }
export interface Pending {
  id: string; askId: string; caseId: string | null; userId: string; askerName: string; askerEmail: string; question: string; outcome: Outcome; sourceChip: string;
  aiReply: string; date: string; status: '待處理' | '已回覆'; reply: string; repliedBy: string; repliedAt: string | null; seen: boolean; notifiedAt: string | null; isNew: boolean;
}
export interface MailPreview { to: string; toName: string; subject: string; question: string; askedAt: string; sentAt: string | null; sent: boolean }
export interface ChapterCount { no: string; name: string; count: number }
export interface MyQaStats { total: number; sentToSenior: number; chapters: ChapterCount[]; helpful: number; notHelpful: number; noFeedback: number }
export interface QaStats {
  total: number; askSenior: number; waiting: number; helpful: number; notHelpful: number; chapters: ChapterCount[];
  outcomes: { outcome: Outcome; count: number }[]; noHelpReasons: { reason: string; count: number }[]; demo: boolean;
}

/* ---------- 首頁、導覽 ---------- */
export interface NewbieHome {
  hireDate: string | null; dayNo: number | null; today: string;
  stages: { type: StageType; name: string; months: number; dueDate: string | null; daysLeft: number | null; status: StageStatus; passed: boolean | null }[];
  sop: { published: boolean; read: number; shown: number; ruleCount: number; updated: boolean; firstUnread: { no: string; name: string } | null };
  exam: { type: StageType; name: string; months: number; dueDate: string | null; daysLeft: number | null; status: StageStatus; attemptStatus: AttemptStatus | null; attemptId: string | null; finalScore: number | null; passed: boolean | null; resultSeen: boolean };
  replies: { unseen: { id: string; question: string; repliedBy: string; repliedAt: string }[]; waiting: number };
  wrongOpen: number;
}
export interface SeniorTodos {
  pendingQuestions: number; pendingReviews: number; pendingPapers: number; firstReviewEmployee: string | null; firstDraftPaper: string | null;
  deadlines: { id: string; name: string; demo: boolean; exam: string; deadline: string; daysLeft: number }[];
  sop: { version: string; publishedAt: string; confirmedBy: string } | null;
}
export type NavCounts = Partial<Record<'sop' | 'qa' | 'exam' | 'wrong', number>>;
