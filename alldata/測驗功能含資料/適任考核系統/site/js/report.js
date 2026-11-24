import { h } from './ui.js';
import { errorTypeCounts } from './format.js';

const isShort = (it) => it.qtype === 'short';
const rightOf = (it) => (isShort(it) ? (it.points ?? 0) >= 1 : it.is_correct);

function renderOptions(it) {
  return h('div', { class: 'options' }, (it.options || []).map((text, i) => {
    const cls = i === it.correct ? 'right' : i === it.chosen ? 'wrong' : '';
    const mark = i === it.correct ? '✔ 正確答案' : i === it.chosen ? '✘ 你的選擇' : '';
    return h('div', { class: `option ${cls}` }, h('span', {}, text), mark ? h('strong', {}, `　${mark}`) : null);
  }));
}

export function renderItem(it, index) {
  const ok = rightOf(it);
  const body = isShort(it)
    ? [
        h('p', { class: 'muted' }, '你的作答：'), h('p', { class: 'stem' }, it.text_answer || '（未作答）'),
        h('p', { class: 'muted' }, '參考答案：'), h('p', { class: 'stem' }, it.reference_answer),
        h('p', {}, `自評得分：${it.points ?? 0} / 1`),
      ]
    : [
        renderOptions(it),
        it.chosen == null ? h('p', { class: 'muted' }, '（未作答）') : null,
      ];
  return h('article', { class: `card item ${ok ? 'right' : 'wrong'}`, 'data-qid': it.question_id },
    h('p', { class: 'muted' }, `第 ${index + 1} 題　`, h('span', { class: `badge ${ok ? 'ok' : 'bad'}` }, ok ? '答對' : '答錯')),
    h('p', { class: 'stem' }, it.stem),
    ...body,
    it.explanation ? h('p', { class: 'explanation' }, `解析：${it.explanation}`) : null,
    !ok && it.error_type
      ? h('p', {}, h('span', { class: 'badge bad' }, it.error_type), it.error_detail ? `　${it.error_detail}` : '')
      : null);
}

/** 錯誤類型長條圖；counts 為 errorTypeCounts 的結果。 */
export function renderErrorBars(counts, emptyText = '目前沒有錯誤紀錄。') {
  if (!counts.length) return h('p', { class: 'muted' }, emptyText);
  const max = Math.max(1, ...counts.map((c) => c.cnt));
  return h('div', {}, counts.map((c) => h('div', { class: 'err-row', style: 'margin:8px 0' },
    h('div', {}, `${c.error_type}：${c.cnt} 題`),
    h('div', { class: 'bar', style: `width:${Math.round((c.cnt / max) * 100)}%`, role: 'img', 'aria-label': `${c.cnt} 題` }))));
}

/** 報告總覽：錯誤類型彙總＋逐題。 */
export function renderReport(items) {
  const wrongTypes = errorTypeCounts(items.filter((it) => !rightOf(it)));
  return h('div', {},
    wrongTypes.length
      ? h('section', {}, h('h2', {}, '本次錯誤類型'),
          h('ul', { class: 'error-summary' }, wrongTypes.map((t) => h('li', {}, `${t.error_type}：${t.cnt} 題`))))
      : h('p', { class: 'notice ok' }, '本次沒有答錯的題目。'),
    h('h2', {}, '逐題檢討'),
    ...items.map(renderItem));
}
