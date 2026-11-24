// 純邏輯（不碰網路與 Deno API），可用 node --test 測試；index.ts 負責接 HTTP 與 Supabase。
export const MAX_USERS = 200;

// 去掉容易看錯的字元（I l O 0 1）
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const ALPHABET = LOWER + UPPER + DIGIT;
const LIMIT = 256 - (256 % ALPHABET.length);   // 超過的位元組丟棄，避免取餘數造成偏差

const defaultRandom = (n) => crypto.getRandomValues(new Uint8Array(n));

/** 產生 12 碼初始密碼，保證含小寫、大寫與數字。randomBytes 可注入以便測試。 */
export function generatePassword(randomBytes = defaultRandom, length = 12) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let out = '';
    while (out.length < length) {
      for (const b of randomBytes(32)) {
        if (b >= LIMIT) continue;
        out += ALPHABET[b % ALPHABET.length];
        if (out.length === length) break;
      }
    }
    if (/[a-z]/.test(out) && /[A-Z]/.test(out) && /[2-9]/.test(out)) return out;
  }
  throw new Error('PASSWORD_GENERATION_FAILED');   // 亂數來源壞掉時不要無窮迴圈
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 驗證名單。回傳 {valid:[{index,name,email}], errors:[{index,email,error}]}；整批不合法時回 {fatal}。 */
export function validateUsers(users) {
  if (!Array.isArray(users) || users.length === 0) return { fatal: 'BAD_REQUEST', valid: [], errors: [] };
  if (users.length > MAX_USERS) return { fatal: 'TOO_MANY', valid: [], errors: [] };
  const valid = [];
  const errors = [];
  const seen = new Set();
  users.forEach((u, index) => {
    const name = typeof u?.name === 'string' ? u.name.trim() : '';
    const rawEmail = typeof u?.email === 'string' ? u.email.trim().toLowerCase() : '';
    if (!name || name.length > 40) return errors.push({ index, email: rawEmail, error: 'BAD_NAME' });
    if (!rawEmail || rawEmail.length > 254 || !EMAIL_RE.test(rawEmail)) return errors.push({ index, email: rawEmail, error: 'BAD_EMAIL' });
    if (seen.has(rawEmail)) return errors.push({ index, email: rawEmail, error: 'DUPLICATE' });
    seen.add(rawEmail);
    valid.push({ index, name, email: rawEmail });
  });
  return { valid, errors };
}

/** 把 Supabase 建立帳號的錯誤訊息歸類成固定代碼（不把內部訊息回給前端）。 */
export function mapCreateError(message) {
  return /already|registered|exists/i.test(String(message ?? '')) ? 'ALREADY_EXISTS' : 'CREATE_FAILED';
}

const CONCURRENCY = 5;

/**
 * 依序（每次同時 5 筆）建立帳號，結果維持輸入順序。
 * createUser({email,name,password}) 回傳 {error?:{message}}；丟出例外也會被當成建立失敗。
 * 失敗列不帶密碼；內部錯誤訊息一律不外洩，只回固定代碼。
 */
export async function createAll(users, createUser, genPassword = generatePassword) {
  const v = validateUsers(users);
  if (v.fatal) return { fatal: v.fatal };
  const results = new Array(users.length);
  for (const e of v.errors) results[e.index] = { name: String(users[e.index]?.name ?? '').trim(), email: e.email, ok: false, error: e.error };
  for (let i = 0; i < v.valid.length; i += CONCURRENCY) {
    await Promise.all(v.valid.slice(i, i + CONCURRENCY).map(async ({ index, name, email }) => {
      const password = genPassword();
      try {
        const { error } = (await createUser({ email, name, password })) ?? {};
        results[index] = error ? { name, email, ok: false, error: mapCreateError(error.message) } : { name, email, ok: true, password };
      } catch {
        results[index] = { name, email, ok: false, error: 'CREATE_FAILED' };
      }
    }));
  }
  return { results };
}
