/* 資深 10｜新增員工：建立帳號 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { createEmployee } from '../data.js';
import { today } from '../config.js';
import { $, esc, chip, phead, crumb, isEmail, fieldError, requireFields, busy } from '../ui.js';

const user = requireRole('senior');
if (user) {
  const {main} = await renderLayout({user, nav: 'exam'});
  let role = 'newbie';
  main.innerHTML = `
  ${crumb([['員工總覽', 's-employees.html'], ['新增員工']])}
  ${phead('考核管理', '新增員工', '建立帳號後，對方用 email／帳號＋工號／密碼登入，系統依身分帶到對應首頁。')}
  <section class="xk-panel pad" style="max-width:720px">
    <form id="newForm" class="stack" novalidate>
      <div class="g2"><div class="field"><label for="nsName">姓名</label><input class="inp" id="nsName" autocomplete="off"></div>
        <div class="field"><label for="nsId">工號</label><input class="inp" id="nsId" autocomplete="off" placeholder="例如 HW261124"></div></div>
      <div class="field"><label for="nsEmail">公司 email</label><input class="inp" id="nsEmail" type="email" autocomplete="off" placeholder="name@haowu.example"></div>
      <div class="g2"><fieldset class="field" style="border:0;padding:0;margin:0"><legend class="lbl" style="margin-bottom:6px">身分</legend><div class="xk-segs">${[['newbie', '新人'], ['senior', '資深']].map(([v, l]) => `<button type="button" class="xk-seg" data-role="${v}" aria-pressed="${role === v}">${l}</button>`).join('')}</div></fieldset>
        <div class="field"><label for="nsHire">到職日</label><input class="inp" id="nsHire" type="date" value="${esc(today())}"></div></div>
      <p id="nsErr" role="alert"></p>
      <div class="row between"><a class="xk-btn-ghost" href="s-employees.html">取消</a><button class="xk-btn" type="submit">建立帳號 ›</button></div>
      <p class="hint">建立後會出現在員工總覽；新人的試用期考核期限依到職日自動算出。</p>
    </form>
  </section>`;
  main.addEventListener('click', e => {
    const b = e.target.closest('[data-role]');
    if (!b) return;
    role = b.dataset.role;
    main.querySelectorAll('[data-role]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.role === role)));
  });
  $('#newForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#nsName'), id = $('#nsId'), email = $('#nsEmail'), hire = $('#nsHire'), err = $('#nsErr');
    err.innerHTML = '';
    if (requireFields([[name, '姓名'], [id, '工號'], [email, 'email'], [hire, '到職日']])) return;
    if (!isEmail(email.value)) { fieldError(email, 'email 格式不正確'); email.focus(); return; }
    const done = busy(e.submitter || $('#newForm .xk-btn'), '建立中…');
    try {
      const r = await createEmployee({name: name.value.trim(), email: email.value.trim(), employeeId: id.value.trim(), role, hireDate: hire.value});
      location.href = `s-employees.html?new=${encodeURIComponent(r.id)}`;
    } catch (ex) { done(); err.innerHTML = chip('alert', ex.message, 'lantern'); }
  });
}
