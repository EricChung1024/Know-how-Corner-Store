import test from 'node:test';
import assert from 'node:assert/strict';
import { errorTypeCounts, stageLabel, stageShort, statusOf, esc, errorMessage, fmtDate, dueStatus, createErrorLabel } from './format.js';

test('errorTypeCounts counts rows and sorts by count desc then name', () => {
  const rows = ['B', 'A', 'C', 'B', 'A', 'A'].map((error_type) => ({ error_type }));
  assert.deepEqual(errorTypeCounts(rows), [
    { error_type: 'A', cnt: 3 },
    { error_type: 'B', cnt: 2 },
    { error_type: 'C', cnt: 1 },
  ]);
});

test('errorTypeCounts sums pre-aggregated cnt fields', () => {
  const rows = [
    { error_type: 'X', cnt: 2 }, { error_type: 'Y', cnt: 5 }, { error_type: 'X', cnt: 4 },
  ];
  assert.deepEqual(errorTypeCounts(rows), [
    { error_type: 'X', cnt: 6 },
    { error_type: 'Y', cnt: 5 },
  ]);
});

test('errorTypeCounts ignores rows without an error type', () => {
  assert.deepEqual(errorTypeCounts([{ error_type: null }, {}]), []);
});

test('stageLabel names comprehensive exam and chapters', () => {
  assert.equal(stageLabel(0), '綜合適任考核');
  assert.match(stageLabel(7), /退換貨/);
  assert.equal(stageLabel(10), '試用期考核');
  assert.equal(stageLabel(11), '半年考核');
  assert.throws(() => stageLabel(12));
  assert.throws(() => stageLabel(-1));
});

test('statusOf maps summary rows to labels', () => {
  assert.equal(statusOf(undefined), '未考');
  assert.equal(statusOf({ passed: true, attempts: 2 }), '已通過');
  assert.equal(statusOf({ passed: false, attempts: 1 }), '未通過');
});

test('esc escapes html special characters', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('errorMessage gives friendly text for known codes and falls back for unknown', () => {
  assert.match(errorMessage('NO_QUESTIONS'), /尚無題目/);
  assert.match(errorMessage('ATTEMPT_CLOSED'), /已交出|已結束/);
  assert.match(errorMessage('SOMETHING_ELSE'), /SOMETHING_ELSE/);
});

test('fmtDate formats valid dates and tolerates empty or invalid input', () => {
  assert.equal(fmtDate(null), '—');
  assert.equal(fmtDate('not a date'), '—');
  assert.match(fmtDate('2026-11-16T12:00:00Z'), /^2026-11-1[67] \d\d:\d\d$/);
});

test('NO_WRONG message says there is nothing to practice', () => {
  assert.match(errorMessage('NO_WRONG'), /沒有可重練/);
});

test('stageShort gives compact column headers for every level', () => {
  assert.equal(stageShort(0), '綜合');
  assert.equal(stageShort(7), '第 7 章');
  assert.equal(stageShort(10), '試用期');
  assert.equal(stageShort(11), '半年');
});

test('dueStatus reports passed, missing hire date, overdue, soon and ok', () => {
  const today = new Date('2026-11-16T12:00:00');
  assert.deepEqual(dueStatus('2026-01-01', true, today), { label: '已通過', level: 'ok' });
  assert.deepEqual(dueStatus(null, false, today), { label: '未設定到職日', level: 'none' });
  assert.deepEqual(dueStatus('2026-11-06', false, today), { label: '已逾期 10 天（2026-11-06）', level: 'overdue' });
  assert.deepEqual(dueStatus('2026-11-26', false, today), { label: '剩 10 天（2026-11-26）', level: 'soon' });
  assert.deepEqual(dueStatus('2027-03-01', false, today), { label: '期限 2027-03-01', level: 'ok' });
  assert.deepEqual(dueStatus('2026-11-16', false, today), { label: '今天到期（2026-11-16）', level: 'soon' });
});

test('createErrorLabel explains each way a new account can fail', () => {
  assert.match(createErrorLabel('ALREADY_EXISTS'), /已有帳號/);
  assert.match(createErrorLabel('DUPLICATE'), /重複/);
  assert.match(createErrorLabel('BAD_EMAIL'), /信箱/);
  assert.match(createErrorLabel('BAD_NAME'), /姓名/);
  assert.match(createErrorLabel('CREATE_FAILED'), /失敗/);
  assert.match(createErrorLabel('SOMETHING'), /SOMETHING/);
});

test('errorMessage covers the account-management codes', () => {
  assert.match(errorMessage('TOO_MANY'), /200/);
  assert.match(errorMessage('NOT_EMPLOYEE'), /員工/);
  assert.match(errorMessage('FUNCTION_FAILED'), /稍後/);
});
