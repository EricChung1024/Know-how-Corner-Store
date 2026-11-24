// 純函式（不碰 DOM），可用 node --test 測試。
export const STAGE_NAMES = {
  0: '綜合適任考核',
  1: '第 1 章 基本規定（工單、檔案、服務時間）',
  2: '第 2 章 身分驗證與回覆時效',
  3: '第 3 章 商品資訊與缺貨',
  4: '第 4 章 優惠券與活動',
  5: '第 5 章 訂單、收件資料與發票',
  6: '第 6 章 物流與配送',
  7: '第 7 章 退換貨與退款',
  8: '第 8 章 客訴與升級',
  9: '第 9 章 工單與結案',
  10: '試用期考核',
  11: '半年考核',
  12: '基礎考核（滿 1 個月）',
  13: '情境應用考核（滿 3 個月）',
  14: '綜合考核（滿 6 個月）',
};

// 到職後依年資自動變更等級，不受考核通過與否影響；升等不增加退款、補償或其他操作權限。
export const LEVELS = { 1: 'Lv.1 客服實習生', 2: 'Lv.2 客服助理', 3: 'Lv.3 客服專員' };
// 題目難度與考核等級對應：Lv.1 抽給基礎考核、Lv.2 抽給情境應用考核、Lv.3 抽給綜合考核
export const DIFFICULTY_NAMES = { 1: 'Lv.1', 2: 'Lv.2', 3: 'Lv.3' };
export function levelLabel(level) { return LEVELS[level] || '尚未設定到職日'; }

export function stageShort(stage) {
  if (stage === 0) return '綜合';
  if (stage === 10) return '試用期';
  if (stage === 11) return '半年';
  if (stage === 12) return '基礎';
  if (stage === 13) return '情境';
  if (stage === 14) return '綜合（六月）';
  return `第 ${stage} 章`;
}

export function stageLabel(stage) {
  if (!Number.isInteger(stage) || !(stage in STAGE_NAMES)) throw new RangeError(`未知階段：${stage}`);
  return STAGE_NAMES[stage];
}

/** 把錯誤列彙總成 [{error_type, cnt}]；列可帶 cnt（已彙總）或每列算 1 次。 */
export function errorTypeCounts(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!r || !r.error_type) continue;
    m.set(r.error_type, (m.get(r.error_type) || 0) + (typeof r.cnt === 'number' ? r.cnt : 1));
  }
  return [...m.entries()]
    .map(([error_type, cnt]) => ({ error_type, cnt }))
    .sort((a, b) => b.cnt - a.cnt || a.error_type.localeCompare(b.error_type, 'zh-Hant'));
}

export function statusOf(summary) {
  if (!summary) return '未考';
  return summary.passed ? '已通過' : '未通過';
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const MESSAGES = {
  NO_QUESTIONS: '此階段尚無可用題目，請通知主管補題。',
  NO_WRONG: '目前沒有可重練的錯題（情境簡答題請對照參考答案自行複習）。',
  ATTEMPT_CLOSED: '此份考卷已交出或已結束，無法再次提交。',
  NOT_AUTHENTICATED: '請先登入。',
  FORBIDDEN: '你沒有權限執行這個操作。',
  BAD_POINTS: '分數必須介於 0 到 1。',
  NO_PAPER: '主管還沒有為你出這份考卷，請通知主管出題後再來。',
  PAPER_EXISTS: '這位員工在這個階段已經有一份尚未使用的考卷。',
  PAPER_NOT_FULL: '題數還沒補滿，請先按「隨機補到題數」。',
  PAPER_LOCKED: '考卷已鎖定出題，題目不能再修改。',
  BAD_STAGE: '這個考核階段不存在或已停用。',
  BAD_STATUS: '狀態不正確。',
  NOT_FOUND: '找不到對應的資料。',
  TOO_MANY: '一次最多建立 200 位員工。',
  BAD_REQUEST: '資料格式不正確。',
  NOT_EMPLOYEE: '只能重設員工的密碼。',
  RESET_FAILED: '重設密碼失敗，請稍後再試。',
  FUNCTION_FAILED: '伺服器功能暫時無法使用，請稍後再試。',
};

export function errorMessage(code) {
  return MESSAGES[code] || `發生錯誤（${code}）`;
}

/** ISO 時間 → 本地 "YYYY-MM-DD HH:mm"；無效或空值回 "—"。 */
export function fmtDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 考核期限狀態。due 為 'YYYY-MM-DD'（或 null）；passed 為該考核已通過。回傳 {label, level}，level：ok／soon（30 天內）／overdue／none。 */
export function dueStatus(due, passed, today = new Date()) {
  if (passed) return { label: '已通過', level: 'ok' };
  if (!due) return { label: '未設定到職日', level: 'none' };
  const d = new Date(`${due}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((d - t) / 86400000);
  if (days < 0) return { label: `已逾期 ${-days} 天（${due}）`, level: 'overdue' };
  if (days === 0) return { label: `今天到期（${due}）`, level: 'soon' };
  if (days <= 30) return { label: `剩 ${days} 天（${due}）`, level: 'soon' };
  return { label: `期限 ${due}`, level: 'ok' };
}

const CREATE_LABELS = {
  ALREADY_EXISTS: '已有帳號（未更動）',
  DUPLICATE: '名單中信箱重複',
  BAD_EMAIL: '信箱格式不正確',
  BAD_NAME: '姓名不正確（1–40 字）',
  CREATE_FAILED: '建立失敗',
};

/** 新增員工時，單一列失敗原因的中文說明。 */
export function createErrorLabel(code) {
  return CREATE_LABELS[code] || `失敗（${code}）`;
}
