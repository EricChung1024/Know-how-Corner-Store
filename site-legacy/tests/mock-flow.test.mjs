// 用 Node 跑假資料後端：三階段考核從出題到成績
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import assert from 'assert/strict';
const site = process.argv[2];
const mem = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
globalThis.location = {search: ''};
globalThis.fetch = async u => ({ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(site, u), 'utf8'))});
const imp = f => import(pathToFileURL(path.join(site, 'js', f)).href);
const m = await imp('mock.js');
const {setSession} = await imp('guard.js');

// 考核日
assert.equal(m.examDueDate('2026-01-31', 1), '2026-03-02'); // 2/28 是週六 → 3/2 週一
assert.equal(m.examDueDate('2026-11-02', 1), '2026-12-02'); // 週三
assert.equal(m.examDueDate('2026-11-02', 3), '2027-02-02');
assert.equal(m.examDueDate('2026-11-02', 6), '2027-05-03'); // 5/2 週日 → 5/3
assert.equal(m.examDueDate('2026-08-31', 6), '2027-03-01'); // 2/28 週日 → 3/1

const senior = await m.login('lin.peishan@haowu.example', 'HW210501');
const newbie = await m.login('chen.yuting@haowu.example', 'HW261102');
setSession(senior);
const emp = await m.getEmployee('HW261102');
assert.deepEqual(emp.stages.map(s => [s.type, s.name, s.dueDate, s.passScore]),
  [['m1', '基礎考核', '2026-12-02', 80], ['m3', '情境應用考核', '2027-02-02', 85], ['m6', '綜合考核', '2027-05-03', 90]]);
assert.equal(emp.nextExam.name, '基礎考核');

// 題庫 700 題，全部待審；批次通過 Lv.1 選擇題
let bk = await m.listBank({});
assert.deepEqual([bk.totals.total, bk.totals.pending, bk.totals.approved, bk.totals.tf], [785, 700, 85, 16]);
for (const l of [1, 2, 3]) assert.ok((await m.listBank({level: l})).matched > 0, `Lv.${l} 沒有題目`);
const r1b = await m.setBankStatusBulk({status: '待審', level: 1, qtype: 'choice'}, '已審');
assert.equal(r1b.changed, 31); // Lv.1 選擇／是非共 105 題，其中 74 題（總表規則）原本就已審
bk = await m.listBank({status: '已審', size: 10, page: 2});
assert.deepEqual([bk.matched, bk.pages, bk.items.length], [116, 12, 10]);
assert.equal((await m.listBank({q: 'L-M001'})).matched, 1);
// 基礎考核：不出簡答
const p1 = await m.mockFn('generate-paper', {employeeId: 'HW261102', type: 'm1'});
const paper1 = await m.getPaper(p1.id);
assert.ok(paper1.questions.every(q => q.qtype !== 'short'), '基礎考核不該有簡答');
assert.equal(p1.shortage, 0); assert.equal(paper1.questions.length, 20);
assert.ok(paper1.questions.every(q => q.qtype !== 'short'));
await m.setBankStatus('L-L001', '已審');
await assert.rejects(m.addPaperQuestion(p1.id, 'L-L001'), /不出簡答/);
await m.lockPaper(p1.id);

// 情境應用：可以有簡答
await m.setBankStatusBulk({status: '待審', level: 2}, '已審');
const p3 = await m.mockFn('generate-paper', {employeeId: 'HW261102', type: 'm3'});
const paper3 = await m.getPaper(p3.id);
assert.equal(paper3.questions.length, 20);
assert.ok(paper3.questions.filter(q => q.qtype === 'short').length <= 2);
assert.ok(paper3.questions.some(q => q.qtype === 'short'), '情境應用考核應可出簡答');
await m.lockPaper(p3.id);

// 新人作答基礎考核
setSession(newbie);
let exams = await m.listMyExams();
assert.deepEqual(exams.map(x => x.status), ['可作答', '可作答', '尚未開放']);
const t1 = await m.getExamForTaking('m1');
assert.equal(t1.name, '基礎考核');
const ans = Object.fromEntries(t1.questions.map(q => [q.id, 0]));
const g1 = await m.mockFn('grade-exam', {attemptId: t1.attemptId, answers: ans});
assert.equal(g1.status, 'reviewed'); // 沒簡答 → 直接出成績
const r1 = await m.getMyResult(t1.attemptId);
assert.equal(r1.examName, '基礎考核'); assert.equal(r1.passScore, 80);
assert.equal(r1.mcqScore, 90); // 示範規則：前 2 題算錯
const wrong = await m.listWrongItems();
assert.equal(wrong.length, 2);
await assert.rejects(m.setBankStatus(t1.questions[0].id, '停用'), /只有資深/);
const lockedQ = t1.questions[0].id;
assert.ok(wrong.every(w => w.examName === '基礎考核'));
let home = await m.getNewbieHome();
assert.equal(home.exam.type, 'm1'); // 新成績還沒看
await m.markResultSeen(t1.attemptId);
home = await m.getNewbieHome();
assert.equal(home.exam.type, 'm3'); assert.equal(home.exam.status, '可作答');
assert.equal((await m.getNavCounts()).exam, 1);

// 情境應用：有簡答 → 等資深覆核
const t3 = await m.getExamForTaking('m3');
const g3 = await m.mockFn('grade-exam', {attemptId: t3.attemptId, answers: Object.fromEntries(t3.questions.map(q => [q.id, q.qtype === 'short' ? '回覆' : 0]))});
assert.equal(g3.status, 'submitted');
setSession(senior);
await assert.rejects(m.setBankStatus(lockedQ, '停用'), /鎖定/);
const rv = await m.getShortReview('HW261102');
assert.equal(rv.examName, '情境應用考核');
const fin = await m.submitShortReview(rv.attemptId, {score: rv.shortMax, comment: '', errorTypes: []});
const e2 = await m.getEmployee('HW261102');
assert.equal(e2.records.length, 2);
assert.equal(e2.nextExam.name, '綜合考核');
assert.equal(e2.records[1].passed, fin.passed);
const todos = await m.getSeniorTodos();
assert.ok(todos.deadlines.length > 0);
const list = await m.listEmployees();
const wu = list.find(x => x.name === '吳佳蓉');
assert.equal(wu.nextExam.name, '綜合考核'); // 示範：已考過 m1、m3
console.log('全部通過：考核日 5 例、700 題題庫（批次審核、分頁、搜尋）、三階段出題／作答／覆核流程');
