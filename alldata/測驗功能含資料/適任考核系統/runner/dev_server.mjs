// 本機模擬後端：pglite（真 Postgres）＋ stub.sql ＋ 全部 migrations ＋ seed.sql；以 site/ 為靜態網站。
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAll, generatePassword } from '../supabase/functions/create-employees/logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sup = path.join(here, '..', 'supabase');
const site = path.join(here, '..', 'site');
export const USERS = {
  'emp1@example.com': { id: 'e0000000-0000-0000-0000-000000000001', name: '員工甲' },
  'emp2@example.com': { id: 'e0000000-0000-0000-0000-000000000002', name: '員工乙' },
  'boss@example.com': { id: 'b0000000-0000-0000-0000-000000000001', name: '主管' },
};
const PASSWORD = 'pass1234';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2' };
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error('BAD_IDENT'); return s; };
function lit(v, key) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v) && key === 'p_ids') return 'array[' + v.map(q).join(',') + ']::text[]';
  if (typeof v === 'object') return q(JSON.stringify(v)) + '::jsonb';
  return q(v);
}
function fixNumeric(res) {
  const nums = res.fields.filter((f) => f.dataTypeID === 1700).map((f) => f.name);
  const dates = res.fields.filter((f) => f.dataTypeID === 1082).map((f) => f.name);
  for (const r of res.rows) {
    for (const n of nums) if (r[n] != null) r[n] = Number(r[n]);
    for (const n of dates) if (r[n] != null) r[n] = new Date(r[n]).toISOString().slice(0, 10);
  }
  return res.rows;
}

export async function startServer(port = 0, { seed = true } = {}) {
  const db = new PGlite();
  await db.exec(readFileSync(path.join(here, 'stub.sql'), 'utf8'));
  for (const f of readdirSync(sup).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()) await db.exec(readFileSync(path.join(sup, f), 'utf8'));
  if (seed && existsSync(path.join(sup, 'seed.sql'))) await db.exec(readFileSync(path.join(sup, 'seed.sql'), 'utf8'));
  for (const [email, u] of Object.entries(USERS)) {
    await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [u.id, email, JSON.stringify({ name: u.name })]);
  }
  await db.exec("update profiles set role = 'supervisor' where id = '" + USERS['boss@example.com'].id + "'");

  // 帳號簿：模擬 Supabase Auth（含主管用 Edge Function 新增的員工）
  const accounts = new Map(Object.entries(USERS).map(([email, u]) => [email, { id: u.id, name: u.name, password: PASSWORD }]));
  const asUser = (id, fn) => db.transaction(async (tx) => {
    await tx.exec('select set_config(\'request.jwt.claims\', ' + q(JSON.stringify({ sub: id, role: 'authenticated' })) + ', true); set local role authenticated');
    return fn(tx);
  });
  let chain = Promise.resolve(); // pglite 單連線，請求排隊
  const serial = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST') {
      const body = JSON.parse(await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b || '{}')); }));
      const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const uid = req.headers['x-user'];
      try {
        if (url.pathname === '/__login') {
          const a = accounts.get(String(body.email || '').toLowerCase());
          return send(a && body.password === a.password ? { ok: true, id: a.id } : { ok: false });
        }
        if (url.pathname === '/__sql') { const rs = await serial(() => db.exec(body.sql)); return send({ data: rs.length ? rs[rs.length - 1].rows : [] }); } // 測試用管理通道（可多條語句）
        if (!uid) return send({ error: 'NOT_AUTHENTICATED' });
        if (url.pathname === '/__fn/create-employees') {   // 與真正的 Edge Function 共用 logic.js
          const me = (await serial(() => db.query('select role from profiles where id = $1', [uid]))).rows[0];
          if (me?.role !== 'supervisor') return send({ error: 'FORBIDDEN' });
          if (body.action === 'create') {
            const out = await createAll(body.users, async ({ email, name, password }) => {
              if (accounts.has(email)) return { error: { message: 'A user with this email address has already been registered' } };
              const id = crypto.randomUUID();
              await serial(() => db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify({ name })]));
              accounts.set(email, { id, name, password });
              return {};
            });
            return out.fatal ? send({ error: out.fatal }) : send({ data: { results: out.results } });
          }
          if (body.action === 'reset_password') {
            const entry = [...accounts.values()].find((a) => a.id === body.user_id);
            const t = (await serial(() => db.query('select role from profiles where id = $1', [String(body.user_id)]))).rows[0];
            if (!t || !entry) return send({ error: 'NOT_FOUND' });
            if (t.role !== 'employee') return send({ error: 'NOT_EMPLOYEE' });
            entry.password = generatePassword();
            return send({ data: { ok: true, password: entry.password } });
          }
          return send({ error: 'BAD_REQUEST' });
        }
        if (url.pathname === '/__rpc') {
          const args = Object.entries(body.args || {}).map(([k, v]) => ident(k) + ' => ' + lit(v, k)).join(', ');
          const r = await serial(() => asUser(uid, (tx) => tx.query('select ' + ident(body.name) + '(' + args + ') as r')));
          return send({ data: r.rows[0].r });
        }
        if (url.pathname === '/__select') {
          const { table, opts = {} } = body;
          const cols = (opts.columns || '*').split(',').map((c) => c.trim()).map((c) => (c === '*' ? c : ident(c))).join(', ');
          const where = Object.entries(opts.eq || {}).map(([k, v]) => ident(k) + ' = ' + lit(v)).join(' and ');
          const order = opts.order ? ' order by ' + ident(opts.order[0]) + (opts.order[1] === 'desc' ? ' desc' : ' asc') : '';
          const r = await serial(() => asUser(uid, (tx) => tx.query('select ' + cols + ' from ' + ident(table) + (where ? ' where ' + where : '') + order)));
          return send({ data: fixNumeric(r) });
        }
      } catch (e) { return send({ error: String(e.message).split('\n')[0] }); }
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    let file = path.join(site, rel);
    if (rel === '/js/api.js') file = path.join(here, 'mock_api.js');
    if (rel === '/js/config.js') file = path.join(here, 'mock_config.js');
    if ((!file.startsWith(site) && !file.startsWith(here)) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  }

  const server = http.createServer((req, res) => handle(req, res).catch((e) => { res.writeHead(500); res.end(String(e)); }));
  await new Promise((r) => server.listen(port, r));
  return { port: server.address().port, db, close: () => new Promise((r) => server.close(r)) };
}
