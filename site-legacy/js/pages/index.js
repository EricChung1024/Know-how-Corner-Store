/* 登入（共用）：帳號（email）＋工號／密碼，依身分進入各自的首頁 */
import { login, resetDemo } from '../data.js';
import { getSession, homeOf } from '../guard.js';
import { COMPANY, USE_MOCK, LIVE, SHOW_DEMO_ACCOUNTS } from '../config.js';
import { $, esc, say, chip, isEmail, fieldError, requireFields, busy, toast, delegate } from '../ui.js';

const ACCOUNTS = [
  {role: '新人', name: '陳宥廷', email: 'chen.yuting@haowu.example', id: 'HW261102'},
  {role: '資深', name: '林佩珊', email: 'lin.peishan@haowu.example', id: 'HW210501'},
];

const existing = getSession();
if (existing) location.replace(homeOf(existing.role));
else render();

function render() {
  const main = $('#main');
  main.innerHTML = `
  <section class="login-brand">
    <span class="brand-logo brand-logo--vertical"><img class="brand-logo__mark" src="assets/logo/mark.svg" alt=""><span class="brand-logo__text"><span class="brand-logo__name">經驗柑仔店</span><span class="brand-logo__tagline">Know-how Corner Store</span></span></span>
    <p class="login-lead">資深把經驗擺上架，<br>新人隨時來拿。</p>
    ${say('用公司 email 帳號和工號／密碼登入，系統會帶你到自己的首頁，喵。')}
  </section>
  <section class="xk-panel login-card" aria-labelledby="orgName">
    <div class="org"><h1 class="org-name" id="orgName">${esc(COMPANY.name)}</h1><p class="org-dept">${esc(COMPANY.dept)}</p></div>
    <form id="loginForm" novalidate>
      <div class="field"><label for="lgId">帳號（email）</label><input class="inp" id="lgId" name="identifier" autocomplete="username" placeholder="name@haowu.example"></div>
      <div class="field"><label for="lgSecret">工號／密碼</label><input class="inp" id="lgSecret" name="secret" type="password" autocomplete="current-password" placeholder="例如 HW000000"></div>
      <p id="lgErr" role="alert"></p>
      <button class="xk-btn wide" type="submit">登入 ›</button>
    </form>
    ${SHOW_DEMO_ACCOUNTS ? `<hr class="line"><div class="stack-s"><p class="mini">示範帳號（點一下帶入）・email 為虛構</p>
      <div class="acc">${ACCOUNTS.map(a => `<button type="button" data-act="fill" data-email="${esc(a.email)}" data-id="${esc(a.id)}"><b>${esc(a.role)} ${esc(a.name)}</b><span>${esc(a.email)}</span><span>${esc(a.id)}</span></button>`).join('')}</div></div>` : ''}
  </section>`;
  main.className = 'login';
  const allLive = Object.values(LIVE).every(Boolean);
  if (USE_MOCK && !allLive) $('#foot').innerHTML = `<span>${Object.values(LIVE).some(Boolean) ? '部分功能已接上真實資料庫，其餘為假資料' : '假資料模式'}</span><span><button type="button" class="linkbtn" id="resetBtn" style="font-size:14px;font-family:var(--font-body)">重設示範（回到第一次使用）</button></span>`;
  else $('#foot').innerHTML = `<span>${esc(COMPANY.name)}・${esc(COMPANY.dept)}</span>`;

  delegate(main, {
    fill: el => { $('#lgId').value = el.dataset.email; $('#lgSecret').value = el.dataset.id; fieldError($('#lgId'), ''); fieldError($('#lgSecret'), ''); $('#lgErr').innerHTML = ''; },
  });
  const reset = $('#resetBtn');
  if (reset) reset.addEventListener('click', async () => { await resetDemo(); toast('已重設示範資料'); });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const idIn = $('#lgId'), secIn = $('#lgSecret'), err = $('#lgErr');
    err.innerHTML = '';
    if (requireFields([[idIn, '帳號（email）'], [secIn, '工號／密碼']])) return;
    if (!isEmail(idIn.value)) { fieldError(idIn, '帳號是 email，格式不正確（例如 name@haowu.example）'); idIn.focus(); return; }
    const done = busy(e.submitter || $('#loginForm .xk-btn'), '登入中…');
    try {
      const user = await login(idIn.value, secIn.value);
      location.href = homeOf(user.role);
    } catch (ex) {
      done();
      err.innerHTML = chip('alert', ex.message, 'lantern');
    }
  });
}
