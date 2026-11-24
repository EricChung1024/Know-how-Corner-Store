import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster } from './roster.js';

test('parseRoster accepts "name,email" lines', () => {
  const r = parseRoster('陳宥廷,chen@example.com\n林小美,mei@example.com');
  assert.deepEqual(r.users, [{ name: '陳宥廷', email: 'chen@example.com' }, { name: '林小美', email: 'mei@example.com' }]);
  assert.deepEqual(r.errors, []);
});

test('parseRoster accepts tabs (pasted from Excel), full-width commas, spaces and either order', () => {
  const r = parseRoster('陳宥廷\tchen@example.com\n林小美，mei@example.com\nlee@example.com 李大同\n王 小明 ming@example.com');
  assert.deepEqual(r.users, [
    { name: '陳宥廷', email: 'chen@example.com' },
    { name: '林小美', email: 'mei@example.com' },
    { name: '李大同', email: 'lee@example.com' },
    { name: '王 小明', email: 'ming@example.com' },
  ]);
});

test('parseRoster skips blank lines, strips a BOM and a header row', () => {
  const r = parseRoster('﻿姓名,信箱\n\n  \n陳宥廷,chen@example.com\n');
  assert.deepEqual(r.users, [{ name: '陳宥廷', email: 'chen@example.com' }]);
  assert.deepEqual(r.errors, []);
});

test('parseRoster reports unusable lines with their line number and keeps the good ones', () => {
  const r = parseRoster('陳宥廷,chen@example.com\n只有名字\nnot-email,也不是\n林小美,mei@example.com');
  assert.equal(r.users.length, 2);
  assert.deepEqual(r.errors.map((e) => e.line), [2, 3]);
  assert.ok(r.errors.every((e) => e.reason.length > 0));
});

test('parseRoster lowercases emails and handles Windows line endings', () => {
  const r = parseRoster('甲,A@Example.COM\r\n乙,b@example.com\r\n');
  assert.deepEqual(r.users.map((u) => u.email), ['a@example.com', 'b@example.com']);
});

test('parseRoster returns nothing for empty input', () => {
  assert.deepEqual(parseRoster('  \n\n'), { users: [], errors: [] });
});
