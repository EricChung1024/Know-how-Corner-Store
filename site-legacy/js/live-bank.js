/* =========================================================
   經驗柑仔店｜題庫審核（真的 Supabase 版）
   只讀 question_bank 的公開欄位；正確答案在 question_answers，前端讀不到。
   權限靠資料庫的 RLS：只有資深看得到題庫、改得了審核狀態（trigger 只允許改 status）。
   由 data.js 呼叫，頁面不要直接 import。
   ========================================================= */
import { getSupabase } from './api.js';

const COLS = 'id, source, kind, topic, ability, qtype, level, stem, options, sop, red_line, status';
const STATUSES = ['待審', '已審', '停用'];

/** PostgREST 的 or() 篩選裡逗號、括號、百分號有特殊意思，關鍵字先拿掉。 */
const clean = s => String(s || '').replace(/[,()%*\\]/g, ' ').trim();

/** 把 listBank 的篩選條件套到查詢上（列表、批次共用）。 */
function applyFilter(q, { status = '全部', qtype = '', level = '', source = '', q: kw = '' } = {}) {
  if (status && status !== '全部') q = q.eq('status', status);
  if (qtype === 'choice') q = q.neq('qtype', 'short'); else if (qtype) q = q.eq('qtype', qtype);
  if (level) q = q.eq('level', +level);
  if (source) q = q.eq('source', source);
  const k = clean(kw);
  if (k) q = q.or(`id.ilike.${k},stem.ilike.%${k}%,topic.eq.${k}`);
  return q;
}
const fail = (e, what) => { throw new Error(e.code === '42501' ? '沒有權限（只有資深可以做這件事）' : /鎖定/.test(e.message) ? e.message : `${what}失敗：${e.message}`); };

/** 已經用在「鎖定考卷」的題號（這些題目不能改審核狀態）。 */
async function lockedIds(sb) {
  const { data, error } = await sb.from('exam_papers').select('question_ids').eq('status', 'locked');
  if (error) fail(error, '讀取考卷');
  return [...new Set((data || []).flatMap(p => p.question_ids))];
}

export async function listBank(filter = {}) {
  const sb = await getSupabase();
  const size = Math.min(100, Math.max(1, +filter.size || 30)), page = Math.max(1, +filter.page || 1);
  const [locked, stats, list] = await Promise.all([
    lockedIds(sb),
    sb.from('v_question_bank_stats').select('*').single(),
    applyFilter(sb.from('question_bank').select(COLS, { count: 'exact' }), filter).order('id').range((page - 1) * size, page * size - 1),
  ]);
  if (stats.error) fail(stats.error, '讀取題庫');
  // 超過最後一頁時 PostgREST 會回 416，當成空頁處理
  if (list.error && list.status !== 416) fail(list.error, '讀取題庫');
  const lockedSet = new Set(locked);
  const t = stats.data, matched = list.count ?? 0, pages = Math.max(1, Math.ceil(matched / size));
  return {
    totals: { total: t.total, mcq: t.mcq, tf: t.tf, short: t.short, approved: t.approved, pending: t.pending, disabled: t.disabled },
    matched, page: Math.min(page, pages), pages, size,
    items: (list.data || []).map(x => ({
      id: x.id, source: x.source, kind: x.kind, redLine: x.red_line, qtype: x.qtype, level: x.level, topic: x.topic, ability: x.ability,
      stem: x.stem, options: x.options, sop: x.sop, sopName: x.sop ? `SOP ${x.sop}` : null, sopKnown: false, // SOP 內容還沒放進後端
      status: x.status, inLockedPaper: lockedSet.has(x.id),
    })),
  };
}

export async function setBankStatus(qid, status) {
  if (!STATUSES.includes(status)) throw new Error('狀態不正確');
  const sb = await getSupabase();
  const { data, error } = await sb.from('question_bank').update({ status }).eq('id', qid).select('id');
  if (error) fail(error, '更新');
  if (!data.length) throw new Error('找不到這一題，或沒有權限（只有資深可以改）');
  return true;
}

/** 批次改狀態：跟 listBank 同樣的篩選條件；已經是這個狀態的不算。 */
export async function setBankStatusBulk(filter, status) {
  if (!STATUSES.includes(status)) throw new Error('狀態不正確');
  const sb = await getSupabase();
  const { page, size, ...rest } = filter || {};
  const locked = await lockedIds(sb);
  let up = applyFilter(sb.from('question_bank').update({ status }), rest).neq('status', status);
  if (locked.length) up = up.not('id', 'in', `(${locked.map(x => `"${x}"`).join(',')})`);
  const { data, error } = await up.select('id');
  if (error) fail(error, '批次更新');
  let skipped = 0; // 符合條件、但在鎖定考卷裡所以跳過的題數
  if (locked.length) {
    const r = await applyFilter(sb.from('question_bank').select('id', { count: 'exact', head: true }), rest).neq('status', status).in('id', locked);
    skipped = r.count || 0;
  }
  return { changed: data.length, skipped };
}
