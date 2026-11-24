// 解析主管貼上的員工名單（純函式，可用 node --test 測試）。
// 支援：「姓名,信箱」「姓名<Tab>信箱」（直接從 Excel 貼上）、全形逗號、空白、信箱在前或在後。
const EMAIL_TOKEN = /[^\s,，;；]+@[^\s,，;；]+/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEADER = /(姓名|name)/i;
const HEADER_MAIL = /(信箱|e-?mail|mail)/i;

export function parseRoster(text) {
  const users = [];
  const errors = [];
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  let firstContent = true;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const isFirst = firstContent;
    firstContent = false;
    if (isFirst && !line.includes('@') && HEADER.test(line) && HEADER_MAIL.test(line)) return;   // 標題列
    const m = line.match(EMAIL_TOKEN);
    if (!m) return errors.push({ line: i + 1, text: line, reason: '找不到信箱' });
    const email = m[0].toLowerCase();
    if (!EMAIL_OK.test(email)) return errors.push({ line: i + 1, text: line, reason: '信箱格式不正確' });
    const name = line.replace(m[0], ' ').replace(/^[\s,，;；]+|[\s,，;；]+$/g, '').trim();
    if (!name) return errors.push({ line: i + 1, text: line, reason: '沒有姓名' });
    users.push({ name, email });
  });
  return { users, errors };
}
