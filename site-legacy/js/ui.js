/* =========================================================
   經驗柑仔店｜共用畫面元件
   只產生 HTML 字串與處理互動，不讀寫資料（資料一律走 data.js）。
   ========================================================= */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- 日期 ---------- */
export const md = iso => { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };
export const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/* ---------- 圖示、標籤、小橘（brand kit 的 SVG 檔） ---------- */
export const icon = (name, cls = '') => `<img class="xk-icon ${cls}" src="assets/icons/${name}.svg" alt="">`;
export const chip = (kind, text, ic, cls = '') => `<span class="xk-chip xk-chip-${kind} ${cls}">${ic ? icon(ic) : ''}${esc(text)}</span>`;
export const tbd = text => `<span class="xk-chip xk-chip-doing tbd sm">${icon('pencil')}待補：${esc(text)}</span>`;
import { LIVE } from './config.js';
/** 「示範資料」標籤：全部功能都接上真的資料庫之後就不再顯示。 */
export const demoTag = (t = '示範資料') => Object.values(LIVE).every(Boolean) ? '' : `<span class="xk-chip xk-chip-return demo">${esc(t)}</span>`;
/** 小橘：expr = default | happy | hint | confused；gear = '' | 'rookie' | 'senior'；size = '' | 'sm' | 'lg' */
export const cat = (expr = 'default', gear = '', size = 'sm') =>
  `<img class="xiaoju${size ? ' xiaoju--' + size : ''}" src="assets/mascot/xiaoju-${expr}${gear ? '-' + gear : ''}.svg" alt="店貓小橘">`;
/** 小橘＋對話泡泡（小橘只出現在對話泡泡旁與進度路上）。 */
export const say = (html, {expr = 'default', gear = '', size = 'sm', cls = ''} = {}) =>
  `<div class="xk-cat-say ${cls}">${cat(expr, gear, size)}<div class="xk-bubble xk-bubble-cat">${html}</div></div>`;
export const gearOf = user => (user && user.role === 'senior' ? 'senior' : 'rookie');

/** 小橘的六種判斷標籤：[狀態標籤樣式, 圖示, 白話說明, 小橘表情] */
export const LABEL = {
  '直接回答': ['done', 'book', 'SOP 有寫，照著做就對了', 'happy'],
  '已確認的變更': ['new', 'stamp', '規則改過，資深已確認以最新版為準', 'hint'],
  '舊規已失效': ['doing', 'lightbulb', '以前可以，現在不行了', 'hint'],
  '暫時規則已過期': ['ship', 'clock', '活動期間的暫時規定已經結束', 'hint'],
  '新舊版都不符 → 請問資深': ['alert', 'lantern', '查不到答案，已幫你記到待確認清單', 'confused'],
  '不在 SOP 範圍': ['return', 'search', '這題 SOP 沒有涵蓋', 'confused'],
};
export const LABELS = Object.keys(LABEL);
export const labelChip = (outcome, sm = true) => { const [k, ic] = LABEL[outcome] || ['return', 'search']; return chip(k, outcome, ic, sm ? 'sm' : ''); };
export const canFeedback = outcome => outcome !== '新舊版都不符 → 請問資深' && outcome !== '不在 SOP 範圍';

/** 各種狀態的固定搭配（brand kit：待處理＝chat、處理中＝headset、已完成＝stamp、需注意＝lantern）。 */
const STATUS = {
  '待處理': ['new', 'chat'], '已回覆': ['done', 'stamp'],
  '尚未開放': ['return', 'clock'], '可作答': ['new', 'quiz'], '已完成': ['done', 'stamp'], '尚未舉行': ['return', 'clock'],
  '待資深覆核': ['doing', 'headset'], '待覆核': ['doing', 'headset'],
  '待審': ['new', 'chat'], '已審': ['done', 'stamp'], '停用': ['ship', ''],
  '通過': ['done', 'stamp'], '未通過': ['alert', 'lantern'], '紅線': ['alert', 'lantern'], '最近更新': ['new', 'lightbulb'], '已讀': ['done', 'stamp'],
  '待審核': ['new', 'chat'], '已鎖定': ['done', 'stamp'],
};
export const statusChip = (text, sm = true) => { const [k, ic] = STATUS[text] || ['return', '']; return chip(k, text, ic, sm ? 'sm' : ''); };

/** SOP 引用：一律「SOP 章-條 主題」；條目不在示範資料內時標待補。 */
export function sopRef(q) {
  if (!q.sop) return `<span class="muted">對應 SOP：未標示</span> ${tbd('對應條目')}`;
  if (q.sopKnown) return `<span>${esc(q.sopName)}</span>`;
  return `<span>SOP ${esc(q.sop)}</span> ${tbd('主題（不在 8 條示範 SOP 內）')}`;
}

/* ---------- 版面小元件 ---------- */
export const btn = (label, act, attrs = '', primary = false) => `<button type="button" class="${primary ? 'xk-btn' : 'xk-btn-ghost'}" data-act="${act}" ${attrs}>${label}</button>`;
export const bar = (pct, label) => `<div class="xk-lvbar" role="img" aria-label="${esc(label)}"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div>`;
export const phead = (cap, title, sub = '', right = '') =>
  `<div class="phead"><div><span class="xk-cap">${esc(cap)}</span><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="phead-r">${right}</div></div>`;
export const crumb = items => `<nav class="crumb" aria-label="目前位置">${items.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)).join(' › ')}</nav>`;

/* ---------- 四種狀態：載入中、沒有資料、讀取失敗、送出成功 ---------- */
export function loading(el, text = '載入中…') {
  el.innerHTML = `<div class="state" role="status"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div>`;
}
export function emptyState(html, {expr = 'default', gear = '', action = ''} = {}) {
  return `<div class="xk-soft pad empty">${say(html, {expr, gear})}${action ? `<div class="row" style="margin-top:16px">${action}</div>` : ''}</div>`;
}
export function failed(el, err, retry) {
  el.innerHTML = `<div class="xk-soft pad stack-s" role="alert">${chip('alert', '讀取失敗', 'lantern')}<p>${esc(err && err.message ? err.message : err)}</p><div class="row"><button type="button" class="xk-btn-ghost" id="retryBtn">重新載入</button></div></div>`;
  const b = el.querySelector('#retryBtn');
  if (b) b.addEventListener('click', () => retry ? retry() : location.reload());
}
let toastTimer = null;
/** 送出成功（或失敗）的提示。kind = 'ok' | 'err' */
export function toast(msg, kind = 'ok') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.className = `xk-chip ${kind === 'err' ? 'xk-chip-alert' : 'xk-chip-done'} toast`;
  t.innerHTML = `${icon(kind === 'err' ? 'lantern' : 'stamp')}${esc(msg)}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

/* ---------- 對話框（取代 alert／confirm） ---------- */
/**
 * @param {{title: string, body: string, actions: Array<{label: string, value: any, primary?: boolean}>}} m
 * @returns {Promise<any>} 按下的按鈕 value；按 Esc 或背景回傳 null
 */
export function modal({title, body, actions}) {
  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.className = 'scrim';
    layer.innerHTML = `<div class="xk-panel modal" role="dialog" aria-modal="true" aria-labelledby="mdT"><h2 id="mdT">${title}</h2>${body}<div class="acts">${actions.map((a, i) => `<button type="button" class="${a.primary ? 'xk-btn' : 'xk-btn-ghost'}" data-i="${i}">${a.label}</button>`).join('')}</div></div>`;
    const done = v => { document.removeEventListener('keydown', onKey); layer.remove(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(null); };
    layer.addEventListener('click', e => {
      if (e.target === layer) return done(null);
      const b = e.target.closest('button[data-i]');
      if (b) done(actions[+b.dataset.i].value);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(layer);
    (layer.querySelector('.xk-btn') || layer.querySelector('button')).focus();
  });
}

/* ---------- 表單檢查 ---------- */
export const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
/** 在欄位下方顯示錯誤；msg 為空字串時清掉。 */
export function fieldError(input, msg) {
  const id = `${input.id}-err`;
  let p = document.getElementById(id);
  if (!msg) { input.removeAttribute('aria-invalid'); if (p) p.remove(); return; }
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', id);
  if (!p) { p = document.createElement('p'); p.id = id; p.className = 'field-err'; input.insertAdjacentElement('afterend', p); }
  p.textContent = msg;
}
/** 必填檢查：回傳第一個沒填的欄位（並顯示錯誤），全部有填回傳 null。 */
export function requireFields(inputs) {
  let first = null;
  inputs.forEach(([input, label]) => {
    const empty = !String(input.value || '').trim();
    fieldError(input, empty ? `請填寫${label}` : '');
    if (empty && !first) first = input;
  });
  if (first) first.focus();
  return first;
}

/** 按鈕送出中：停用並換字，回傳還原函式。 */
export function busy(button, text = '送出中…') {
  if (!button) return () => {};
  const old = button.innerHTML; button.disabled = true; button.innerHTML = esc(text);
  return () => { button.disabled = false; button.innerHTML = old; };
}

/** 用 data-act 處理點擊。handlers: { act(el, event) } */
export function delegate(root, handlers) {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.disabled) return;
    const fn = handlers[el.dataset.act];
    if (fn) fn(el, e);
  });
}
export const query = name => new URLSearchParams(location.search).get(name);

/** 距離某天的說法：「還有 N 天」「就是今天」「已過 N 天」 */
export const dayText = n => (n > 0 ? `還有 ${n} 天` : n === 0 ? '就是今天' : `已過 ${-n} 天`);

/* ---------- 處理中動畫：會甩尾巴的小橘＋道路進度條＋逐步打勾 ----------
   小橘用品牌套件的 design-system/js/xiaoju.js 產生（尾巴 .xk-tail 會甩；「減少動態效果」時停住、步驟改成快速跑完）。
   這支檔案不是 ES module，第一次用時才載入。載不到就退回一般的小橘圖檔。 */
let xjLoad = null;
function loadXiaoju() {
  if (window.xiaoju) return Promise.resolve(window.xiaoju);
  xjLoad = xjLoad || new Promise(res => {
    const s = document.createElement('script');
    s.src = 'design-system/js/xiaoju.js';
    s.onload = () => res(window.xiaoju || null); s.onerror = () => res(null);
    document.head.append(s);
  });
  return xjLoad;
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 在 el 裡顯示處理中畫面，邊跑 task 邊一行一行打勾。task 完成且步驟都跑完才結束；task 失敗會把錯誤往外丟。
 * @param {HTMLElement} el
 * @param {{title: string, steps: string[], task: () => Promise<any>, gear?: string, doneText?: string}} opt
 */
export async function runWithProgress(el, {title, steps, task, gear = 'senior', doneText = '完成了，喵。'}) {
  const xj = await loadXiaoju();
  const art = xj ? xj({expr: 'default', gear, label: '店貓小橘（處理中）'}).replace('class="xiaoju"', 'class="xiaoju xiaoju--sm"') : cat('default', gear);
  el.innerHTML = `<div class="loader" role="status" aria-live="polite">
    <div class="xk-cat-say">${art}<div class="xk-bubble xk-bubble-cat" data-l="msg">${esc(title)}</div></div>
    <div class="loader-road" aria-hidden="true"><div class="xk-pat-road"></div><i data-l="fill"></i></div>
    <ul class="loader-steps">${steps.map(s => `<li><span class="mk" aria-hidden="true">・</span><span>${esc(s)}</span></li>`).join('')}</ul></div>`;
  const lis = [...el.querySelectorAll('.loader-steps li')], fill = el.querySelector('[data-l="fill"]');
  const paint = n => {
    lis.forEach((li, i) => { li.className = i < n ? 'ok' : i === n ? 'run' : ''; li.firstElementChild.textContent = i < n ? '✓' : i === n ? '…' : '・'; });
    fill.style.width = `${Math.round(n / steps.length * 100)}%`;
  };
  paint(0);
  const gap = reduceMotion() ? 60 : 550;
  let n = 0;
  const walk = (async () => { while (n < steps.length - 1) { await new Promise(r => setTimeout(r, gap)); paint(++n); } })();
  const [result] = await Promise.all([task(), walk]);
  paint(steps.length);
  el.querySelector('[data-l="msg"]').textContent = doneText;
  await new Promise(r => setTimeout(r, reduceMotion() ? 0 : 450));
  return result;
}
