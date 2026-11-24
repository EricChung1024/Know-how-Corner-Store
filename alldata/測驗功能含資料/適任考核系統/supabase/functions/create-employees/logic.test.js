import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword, validateUsers, mapCreateError, createAll, MAX_USERS } from './logic.js';

// 依序回傳給定位元組（循環），每次呼叫回傳 n 個
const fakeRandom = (seq) => { let i = 0; return (n) => Uint8Array.from({ length: n }, () => seq[i++ % seq.length]); };
// 字母表索引：0–24 小寫、25–48 大寫、49–56 數字
const VALID_12 = [0, 25, 49, 1, 26, 50, 2, 27, 51, 3, 28, 52];   // → aA2bB3cC4dD5

test('generatePassword makes 12 chars from an alphabet without look-alike characters', () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePassword();
    assert.equal(p.length, 12);
    assert.match(p, /^[a-km-zA-HJ-NP-Z2-9]+$/, p);   // 沒有 l I O 0 1
    assert.match(p, /[a-z]/); assert.match(p, /[A-Z]/); assert.match(p, /[2-9]/);
  }
});

test('generatePassword maps bytes to the alphabet deterministically', () => {
  assert.equal(generatePassword(fakeRandom(VALID_12)), 'aA2bB3cC4dD5');
});

test('generatePassword discards bytes that would bias the alphabet (rejection sampling)', () => {
  // 255 超出可均勻對應的範圍：必須丟棄，而不是取餘數
  assert.equal(generatePassword(fakeRandom([255, 255, ...VALID_12])), 'aA2bB3cC4dD5');
});

test('generatePassword retries until the password has lower, upper and digit', () => {
  const onlyLower = Array.from({ length: 32 }, (_, i) => i % 25);       // 第一輪全小寫 → 被拒
  const stream = [...onlyLower, ...VALID_12, ...Array(20).fill(0)];
  assert.equal(generatePassword(fakeRandom(stream)), 'aA2bB3cC4dD5');
});

test('generatePassword gives up instead of looping forever on a broken random source', () => {
  assert.throws(() => generatePassword(() => new Uint8Array(32)), /PASSWORD_GENERATION_FAILED/);
});

test('validateUsers trims, lowercases and accepts good rows', () => {
  const r = validateUsers([{ name: '  王小明 ', email: ' Ming@Example.COM ' }]);
  assert.deepEqual(r.valid, [{ index: 0, name: '王小明', email: 'ming@example.com' }]);
  assert.deepEqual(r.errors, []);
});

test('validateUsers reports bad rows by index without dropping good ones', () => {
  const r = validateUsers([
    { name: '甲', email: 'a@example.com' },
    { name: '', email: 'b@example.com' },
    { name: '丙', email: 'not-an-email' },
    { name: 'x'.repeat(41), email: 'd@example.com' },
    { name: '戊', email: 'a@example.com' },
    { name: 123, email: 'f@example.com' },
  ]);
  assert.deepEqual(r.valid.map((u) => u.email), ['a@example.com']);
  assert.deepEqual(r.errors.map((e) => [e.index, e.error]), [[1, 'BAD_NAME'], [2, 'BAD_EMAIL'], [3, 'BAD_NAME'], [4, 'DUPLICATE'], [5, 'BAD_NAME']]);
});

test('validateUsers rejects non-arrays, empty lists and oversized batches as fatal', () => {
  assert.equal(validateUsers(null).fatal, 'BAD_REQUEST');
  assert.equal(validateUsers([]).fatal, 'BAD_REQUEST');
  assert.equal(validateUsers(Array.from({ length: MAX_USERS + 1 }, (_, i) => ({ name: 'n', email: `u${i}@example.com` }))).fatal, 'TOO_MANY');
  assert.equal(validateUsers(Array.from({ length: MAX_USERS }, (_, i) => ({ name: 'n', email: `u${i}@example.com` }))).fatal, undefined);
});

test('mapCreateError recognises an existing account and falls back for anything else', () => {
  assert.equal(mapCreateError('A user with this email address has already been registered'), 'ALREADY_EXISTS');
  assert.equal(mapCreateError('User already exists'), 'ALREADY_EXISTS');
  assert.equal(mapCreateError('Password should be at least 6 characters'), 'CREATE_FAILED');
  assert.equal(mapCreateError(undefined), 'CREATE_FAILED');
});

const counter = () => { let n = 0; return () => `pw${++n}`; };

test('createAll keeps input order, reports bad rows and maps failures, never leaking a password on failure', async () => {
  const calls = [];
  const createUser = async ({ email, name, password }) => {
    calls.push({ email, name, password });
    return email === 'dup@example.com' ? { error: { message: 'A user with this email address has already been registered' } } : {};
  };
  const r = await createAll([
    { name: '甲', email: 'a@example.com' },
    { name: '乙', email: 'bad' },
    { name: '丙', email: 'dup@example.com' },
    { name: '丁', email: 'd@example.com' },
  ], createUser, counter());
  assert.deepEqual(r.results, [
    { name: '甲', email: 'a@example.com', ok: true, password: 'pw1' },
    { name: '乙', email: 'bad', ok: false, error: 'BAD_EMAIL' },
    { name: '丙', email: 'dup@example.com', ok: false, error: 'ALREADY_EXISTS' },
    { name: '丁', email: 'd@example.com', ok: true, password: 'pw3' },
  ]);
  assert.deepEqual(calls.map((c) => c.email).sort(), ['a@example.com', 'd@example.com', 'dup@example.com']);
});

test('createAll turns a thrown error into CREATE_FAILED without aborting the batch', async () => {
  const createUser = async ({ email }) => { if (email === 'x@example.com') throw new Error('boom internal detail'); return {}; };
  const r = await createAll([{ name: 'x', email: 'x@example.com' }, { name: 'y', email: 'y@example.com' }], createUser, counter());
  assert.deepEqual(r.results.map((x) => [x.ok, x.error]), [[false, 'CREATE_FAILED'], [true, undefined]]);
  assert.ok(!JSON.stringify(r).includes('boom'));
});

test('createAll passes fatal errors through and handles a full batch', async () => {
  assert.equal((await createAll([], async () => ({}))).fatal, 'BAD_REQUEST');
  const many = Array.from({ length: 23 }, (_, i) => ({ name: `n${i}`, email: `u${i}@example.com` }));
  const r = await createAll(many, async () => ({}), counter());
  assert.equal(r.results.length, 23);
  assert.deepEqual(r.results.map((x) => x.email), many.map((x) => x.email));
  assert.equal(new Set(r.results.map((x) => x.password)).size, 23);
});
