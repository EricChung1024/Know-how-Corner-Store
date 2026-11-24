/* =========================================================
   經驗柑仔店｜共用頁首、導覽列、分頁、頁尾
   每頁的 HTML 只放空的 #top、#main、#foot，由這裡產生內容。
   ========================================================= */
import { COMPANY, USE_MOCK } from './config.js';
import { homeOf } from './guard.js';
import { getNavCounts, logout } from './data.js';
import { esc, icon, chip } from './ui.js';

/** 導覽列（名稱與順序依頁面規格表，不可增刪改名）。 */
export const NAV = {
  newbie: [
    {key: 'home', href: 'n-home.html', label: '首頁', ic: 'storefront'},
    {key: 'sop', href: 'n-sop.html', label: '新人版 SOP', ic: 'book'},
    {key: 'qa', href: 'n-ask.html', label: '問答亭', ic: 'chat'},
    {key: 'exam', href: 'n-exam.html', label: '考核', ic: 'quiz'},
  ],
  senior: [
    {key: 'home', href: 's-home.html', label: '首頁', ic: 'storefront'},
    {key: 'flow', href: 's-flow.html', label: 'SOP 統整', ic: 'pencil'},
    {key: 'sop', href: 's-sop.html', label: '資深版 SOP', ic: 'book'},
    {key: 'qa', href: 's-pending.html', label: '問答管理', ic: 'chat'},
    {key: 'exam', href: 's-employees.html', label: '考核管理', ic: 'quiz'},
  ],
};

/** 各導覽項目底下的分頁。 */
const TABS = {
  qa: [['n-ask.html', '問小橘'], ['n-history.html', '我的提問紀錄'], ['n-pending.html', '待確認清單', 'qa'], ['n-stats.html', '我的統計']],
  exam: [['n-exam.html', '我的考核清單'], ['n-records.html', '考核紀錄'], ['n-wrong.html', '錯題區・重練', 'wrong']],
  sqa: [['s-pending.html', '待確認清單：回覆', 'qa'], ['s-stats.html', '問答統計']],
  sexam: [['s-employees.html', '員工總覽'], ['s-paper.html', '考卷審核'], ['s-bank.html', '題庫審核']],
};

const here = () => (location.pathname.split('/').pop() || 'index.html');
const cnt = n => (n ? ` <span class="cnt" aria-label="${n} 件">${n}</span>` : '');

/**
 * 產生頁首與頁尾。
 * @param {{user: object, nav: string}} opt nav：目前所在的導覽項目 key
 * @returns {Promise<{main: HTMLElement, counts: object, tabs: (group: string) => string}>}
 */
export async function renderLayout({user, nav}) {
  const state = {counts: {}};
  try { state.counts = await getNavCounts(); } catch (e) { state.counts = {}; }
  const navHtml = () => NAV[user.role].map(n => `<a class="navi" href="${n.href}" ${n.key === nav ? 'aria-current="page"' : ''}>${icon(n.ic, 'xk-icon--sm')}${n.label}${cnt(state.counts[n.key])}</a>`).join('');
  const top = document.getElementById('top');
  top.className = 'top';
  top.innerHTML = `
    <a class="brand-logo" href="${homeOf(user.role)}" aria-label="經驗柑仔店 首頁"><img class="brand-logo__mark" src="assets/logo/mark.svg" alt=""><span class="brand-logo__text"><span class="brand-logo__name">經驗柑仔店</span><span class="brand-logo__tagline">Know-how Corner Store</span></span></a>
    <nav class="nav" aria-label="主選單" id="mainNav">${navHtml()}</nav>
    <div class="who"><span class="name">${esc(user.name)}</span>${user.role === 'senior' ? chip('done', '資深', 'medal', 'sm') : chip('new', '新人', 'person', 'sm')}<button type="button" class="xk-btn-ghost sm" id="logoutBtn">登出</button></div>`;
  document.getElementById('logoutBtn').addEventListener('click', async () => { await logout(); location.href = 'index.html'; });
  document.getElementById('foot').innerHTML = footer();
  return {
    main: document.getElementById('main'),
    get counts() { return state.counts; },
    tabs: group => tabsBar(group, state.counts),
    /** 資料變動後重新讀導覽列數字（分頁數字會在頁面下次重畫時更新）。 */
    async refresh() {
      try { state.counts = await getNavCounts(); document.getElementById('mainNav').innerHTML = navHtml(); } catch (e) { /* 數字讀不到不影響頁面 */ }
    },
  };
}

/** 分頁列（目前頁面以 aria-current 標示）。 */
export function tabsBar(group, counts = {}) {
  const cur = here();
  return `<nav class="xk-segs" aria-label="分頁">${TABS[group].map(([h, l, k]) => `<a class="xk-seg" href="${h}" ${h === cur ? 'aria-current="page"' : ''}>${l}${k ? cnt(counts[k]) : ''}</a>`).join('')}</nav>`;
}

export function footer() {
  return `<span>${esc(COMPANY.name)}為虛構公司；人名、天數、分數為示範資料。SOP、問答、考題取自示範資料包。</span><span>${USE_MOCK ? '假資料模式' : ''}</span>`;
}
