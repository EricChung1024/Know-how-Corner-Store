/* 資深 9｜題庫審核：700 題逐題或批次審核；只有「已審」的題目會被抽進考卷。正確答案只在後端，這頁不顯示。 */
import { requireRole } from '../guard.js';
import { renderLayout } from '../layout.js';
import { listBank, setBankStatus, setBankStatusBulk } from '../data.js';
import { $, esc, icon, chip, phead, sopRef, statusChip, loading, failed, delegate, toast, busy, modal } from '../ui.js';

const SOURCE = {rules: '總表規則', rules_ext: '總表延伸（案件）', legacy: '通用電商題'};
const TYPE = {mcq: '選擇', tf: '是非', short: '簡答'};
const user = requireRole('senior');
if (user) {
  const {main, tabs} = await renderLayout({user, nav: 'exam'});
  const f = {status: '待審', qtype: '', level: '', source: '', q: '', page: 1};
  let first = true, b = null;

  const draw = async () => {
    if (first) loading(main);
    try {
      b = await listBank(f);
      first = false;
      main.innerHTML = view();
    } catch (e) { failed(main, e, draw); }
  };

  const sel = (key, label, opts) => `<div class="field"><label for="f-${key}">${label}</label><select class="inp" id="f-${key}" data-f="${key}">${opts.map(([v, t]) => `<option value="${v}" ${String(f[key]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;

  function view() {
    const t = b.totals;
    const segs = ['待審', '已審', '停用', '全部'].map(x => `<button type="button" class="xk-seg" data-act="status" data-v="${x}" aria-pressed="${f.status === x}">${x}${x === '待審' ? ` ${t.pending}` : x === '已審' ? ` ${t.approved}` : x === '停用' ? ` ${t.disabled}` : ''}</button>`).join('');
    const act = (q, s, label) => `<button type="button" class="xk-btn-ghost" data-act="set" data-q="${esc(q.id)}" data-s="${s}">${label}</button>`;
    const rows = b.items.map(q => {
      const acts = q.inLockedPaper ? '<span class="mini">已用在鎖定的考卷</span>' : q.status === '待審' ? act(q, '已審', '通過') + act(q, '停用', '停用') : q.status === '已審' ? act(q, '停用', '停用') : act(q, '待審', '恢復待審');
      return `<tr><td class="nowrap"><b>${esc(q.id)}</b><br><span class="mini">${esc(q.kind)}</span></td>
        <td class="nowrap">${TYPE[q.qtype]}<br><span class="mini">Lv.${q.level}</span>${q.redLine ? '<br>' + chip('alert', '紅線', 'lantern', 'sm') : ''}</td>
        <td class="q"><span class="mini">${esc(q.topic)}${q.ability ? '・' + esc(q.ability) : ''}</span><b class="clamp2">${esc(ask(q.stem))}</b><span class="mini clamp2">${esc(scene(q.stem))}</span></td>
        <td>${sopRef(q)}</td><td class="nowrap">${statusChip(q.status)}</td><td><div class="row">${acts}</div></td></tr>`;
    }).join('');
    const bulkable = f.status !== '已審' && b.matched > 0;
    return `
    ${phead('考核管理', '題庫審核', '確認題庫裡的題目合適；只有「已審」的題目會被抽進考卷。', tabs('sexam'))}
    <div class="g4">
      <div class="card tile"><span class="t">${icon('quiz')}題庫</span><span class="big">${t.total}<small>題</small></span><span class="mini">選擇 ${t.mcq}・是非 ${t.tf}・簡答 ${t.short}</span></div>
      <div class="card tile"><span class="t">${icon('stamp')}已審</span><span class="big">${t.approved}<small>題</small></span><span class="mini">會被抽進考卷</span></div>
      <div class="card tile"><span class="t">${icon('chat')}待審</span><span class="big">${t.pending}<small>題</small></span><span class="mini">案件題要資深確認內容</span></div>
      <div class="card tile"><span class="t">${icon('lantern')}停用</span><span class="big">${t.disabled}<small>題</small></span><span class="mini">不會再被抽到</span></div>
    </div>
    <section class="xk-soft pad stack-s" aria-label="篩選">
      <div class="xk-segs" role="group" aria-label="審核狀態">${segs}</div>
      <form class="row" id="filterForm" style="align-items:flex-end;flex-wrap:wrap" novalidate>
        ${sel('qtype', '題型', [['', '全部'], ['mcq', '選擇題'], ['tf', '是非題'], ['short', '簡答題']])}
        ${sel('level', '難度', [['', '全部'], [1, 'Lv.1 基礎'], [2, 'Lv.2 情境應用'], [3, 'Lv.3 綜合']])}
        ${sel('source', '來源', [['', '全部'], ['rules', '總表規則'], ['rules_ext', '總表延伸（案件）'], ['legacy', '通用電商題']])}
        <div class="field"><label for="f-q">題號、主題或關鍵字</label><input class="inp" id="f-q" value="${esc(f.q)}" placeholder="例如 L-M001、退款" style="width:220px"></div>
        <button class="xk-btn-ghost" type="submit">${icon('search', 'xk-icon--sm')}搜尋</button>
      </form>
    </section>
    <div class="row between">
      <span class="mini">符合 ${b.matched} 題${b.pages > 1 ? `・第 ${b.page} / ${b.pages} 頁` : ''}・不顯示正確答案（只在後端）</span>
      ${bulkable ? `<button type="button" class="xk-btn" data-act="bulk">篩選結果全部通過（${b.matched} 題）›</button>` : ''}
    </div>
    <div class="scroll"><table class="tbl"><thead><tr><th>題號</th><th>題型</th><th>題目</th><th>對應 SOP 條目</th><th>狀態</th><th>動作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">沒有符合的題目。</td></tr>'}</tbody></table></div>
    ${b.pages > 1 ? `<div class="row between"><button type="button" class="xk-btn-ghost" data-act="page" data-p="${b.page - 1}" ${b.page <= 1 ? 'disabled' : ''}>‹ 上一頁</button><span class="mini">第 ${b.page} / ${b.pages} 頁</span><button type="button" class="xk-btn-ghost" data-act="page" data-p="${b.page + 1}" ${b.page >= b.pages ? 'disabled' : ''}>下一頁 ›</button></div>` : ''}
    <div class="row"><a class="linkbtn" href="s-paper.html">回考卷審核 ›</a></div>`;
  }
  /** 題目最後一行是問句，前面是情境（「你是電商客服專員小安…」那行省略）。列表先顯示問句，情境縮成灰字。 */
  const lines = stem => stem.split('\n').map(x => x.trim()).filter(x => x && !/^你是電商客服專員/.test(x));
  const ask = stem => { const l = lines(stem); return l[l.length - 1] || stem; };
  const scene = stem => lines(stem).slice(0, -1).join(' ');

  const describe = () => [f.qtype && ({mcq: '選擇題', tf: '是非題', short: '簡答題'}[f.qtype]), f.level && `Lv.${f.level}`, f.source && SOURCE[f.source], f.q && `「${f.q}」`].filter(Boolean).join('、') || '全部題型與難度';
  delegate(main, {
    status: el => { f.status = el.dataset.v; f.page = 1; draw(); },
    page: el => { f.page = +el.dataset.p; draw(); window.scrollTo({top: 0}); },
    set: async el => { const done = busy(el, '…'); try { await setBankStatus(el.dataset.q, el.dataset.s); toast(`${el.dataset.q} 改為「${el.dataset.s}」`); await draw(); } catch (e) { done(); toast(e.message, 'err'); } },
    bulk: async el => {
      const ok = await modal({title: `把 ${b.matched} 題改成「已審」？`,
        body: `<p>範圍：狀態「${esc(f.status)}」・${esc(describe())}。</p><p>案件題（總表延伸、通用電商題）匯入時標「待公司主管審核」，通過後會被抽進考卷。確定內容適合貴公司再通過。</p>`,
        actions: [{label: '取消', value: false}, {label: `全部通過（${b.matched} 題）›`, value: true, primary: true}]});
      if (!ok) return;
      const done = busy(el, '處理中…');
      try { const {status, page, ...rest} = f; const r = await setBankStatusBulk({...rest, status}, '已審'); toast(`已通過 ${r.changed} 題${r.skipped ? `，${r.skipped} 題已用在鎖定考卷所以跳過` : ''}`); f.page = 1; await draw(); }
      catch (e) { done(); toast(e.message, 'err'); }
    },
  });
  main.addEventListener('change', e => { const k = e.target.dataset.f; if (!k) return; f[k] = e.target.value; f.page = 1; draw(); });
  main.addEventListener('submit', e => { if (e.target.id !== 'filterForm') return; e.preventDefault(); f.q = $('#f-q').value.trim(); f.page = 1; draw(); });
  await draw();
}
