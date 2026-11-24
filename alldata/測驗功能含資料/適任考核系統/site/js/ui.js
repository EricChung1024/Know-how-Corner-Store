import { signOut } from './api.js';
import { errorMessage } from './format.js';

/** 建立元素；子節點為字串時一律用 textContent，避免 XSS。 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const EMPLOYEE_NAV = [['home.html', '首頁'], ['wrong.html', '錯題區'], ['records.html', '我的紀錄']];
const SUPERVISOR_NAV = [['supervisor.html', '員工總覽']];

/** 巷口服務所 LOGO：鵝黃圓角方塊＋腳掌（固定色，不改色不加陰影）。 */
export function brandMark(size = 40) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const svg = el('svg', { viewBox: '0 0 48 48', width: size, height: size, role: 'img', 'aria-label': '巷口服務所 LOGO' });
  svg.append(
    el('rect', { x: 2, y: 2, width: 44, height: 44, rx: 12, fill: '#FFC94A', stroke: '#2B1E16', 'stroke-width': 3 }),
    el('ellipse', { cx: 24, cy: 31, rx: 9.5, ry: 7.5, fill: '#2B1E16' }),
    el('ellipse', { cx: 13.5, cy: 23, rx: 3.6, ry: 4.7, fill: '#2B1E16', transform: 'rotate(-22 13.5 23)' }),
    el('ellipse', { cx: 20, cy: 15.5, rx: 3.7, ry: 4.9, fill: '#2B1E16', transform: 'rotate(-8 20 15.5)' }),
    el('ellipse', { cx: 28, cy: 15.5, rx: 3.7, ry: 4.9, fill: '#2B1E16', transform: 'rotate(8 28 15.5)' }),
    el('ellipse', { cx: 34.5, cy: 23, rx: 3.6, ry: 4.7, fill: '#2B1E16', transform: 'rotate(22 34.5 23)' }));
  return svg;
}

export function renderFooter() {
  if (!document.querySelector('footer.note')) {
    document.body.append(h('footer', { class: 'note' }, '畫面中的人名、題目與數字皆為虛構示範資料。'));
  }
}

export function renderNav(me, active) {
  const items = me.role === 'supervisor' ? SUPERVISOR_NAV : EMPLOYEE_NAV;
  const home = me.role === 'supervisor' ? 'supervisor.html' : 'home.html';
  const nav = h('nav', { class: 'nav', 'aria-label': '主選單' },
    h('a', { class: 'brand', href: home, 'aria-label': '巷口服務所 考核系統' },
      brandMark(40), h('span', { class: 'wordmark' }, '巷口服務所'), h('span', { class: 'product' }, '考核系統')),
    ...items.map(([href, label]) => h('a', { href, class: href === active ? 'active' : '' }, label)),
    h('span', { class: 'spacer' }),
    h('span', { class: 'who' }, `${me.name}（${me.role === 'supervisor' ? '主管' : '員工'}）`),
    h('button', { class: 'btn ghost', onclick: async () => { await signOut(); location.replace('index.html'); } }, '登出'));
  document.body.prepend(nav);
  document.body.prepend(h('div', { class: 'awning', 'aria-hidden': 'true' }));
  renderFooter();
}

export function showError(container, err) {
  const msg = err && err.code ? errorMessage(err.code) : (err && err.message) || '發生未知錯誤';
  container.replaceChildren(h('div', { class: 'notice error', role: 'alert' }, msg));
}

export function setBusy(container, text = '載入中…') {
  container.replaceChildren(h('p', { class: 'muted' }, text));
}
