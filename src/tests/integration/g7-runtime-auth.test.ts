import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeG7RuntimeFixture } from '../helpers/g7-runtime';
import * as runtimeDb from '../../server/g7-operational/runtime-db';
import { GET, POST } from '../../app/api/g7-runtime/[...segments]/route';
import { hashLocalPassword } from '../../server/auth/password';
import { executeG7RuntimeAdmin } from '../../server/g7-operational/runtime-admin';
import { createG3IsolatedStore } from '../../server/g7-staging/g3-store';
import { createG4IsolatedStore } from '../../server/g7-staging/g4-store';
import { createG2IsolatedStore } from '../../server/g7-staging/g2-store';
import { newSessionCandidate, SESSION_IDLE_MS } from '../../server/auth/session';

const PASSWORD = 'runtime-synthetic-password';
const INITIAL = 'runtime-initial-password';
const ORIGIN = 'https://cad.example.test';
let fixture: ReturnType<typeof makeG7RuntimeFixture> | undefined;
let hash: string;
let saved: Record<string, string | undefined> = {};
beforeAll(async () => { hash = await hashLocalPassword(PASSWORD); });
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else Object.assign(process.env, { [key]: value });
  }
  vi.restoreAllMocks();
  fixture?.cleanup(); fixture = undefined; saved = {};
});
function setup() {
  fixture = makeG7RuntimeFixture();
  const keys = [...new Set([...Object.keys(fixture.env), 'G7_RUNTIME_ALLOW_HTTP', 'G7_RUNTIME_RECOVERY_MODE',
    ...Object.keys(process.env).filter(key => key.startsWith('G7_'))])];
  saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) if (key.startsWith('G7_')) delete process.env[key];
  Object.assign(process.env, fixture.env);
  return fixture;
}
function send(method: 'GET' | 'POST', action: string, body?: object,
  cookie?: string, csrf?: string, extra: Record<string, string> = {}) {
  const headers = new Headers({ host: 'cad.example.test', origin: ORIGIN, ...extra });
  if (body) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  if (csrf) headers.set('x-csrf-token', csrf);
  const request = new Request('http://0.0.0.0:3000/api/g7-runtime/' + action,
    { method, headers, body: body ? JSON.stringify(body) : undefined });
  return (method === 'GET' ? GET : POST)(request,
    { params: Promise.resolve({ segments: action.split('/') }) });
}
async function login(name = 'admin', password = PASSWORD) {
  const response = await send('POST', 'auth/login', { login: name, password });
  const body = await response.clone().json() as { csrfToken?: string };
  return { response, csrf: body.csrfToken, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
function seed() {
  const db = fixture!.openDb();
  for (const [id, role, site] of [
    ['admin', 'Admin', 'site-a'], ['editor', 'Editor', 'site-a'],
    ['reader', 'Reader', 'site-a'], ['outsider', 'Admin', 'site-b'],
  ]) {
    db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',0,?,?)')
      .run(id, id, hash, Date.now(), Date.now());
    db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(id, role, Date.now());
    db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)').run(id, site, Date.now());
  }
  return db;
}

describe('#153 operating Auth/Admin route integration', () => {
  test('approved inactive Site does not block login, session, management and later reactivation', async () => {
    setup(); const db=seed();
    try {
      const before=await login(); expect(before.response.status).toBe(200);
      db.prepare('UPDATE "CadSite" SET active=0 WHERE id=?').run('site-a');
      const fresh=await login(); expect(fresh.response.status).toBe(200);
      expect((await send('GET','auth/session',undefined,before.cookie)).status).toBe(200);
      expect((await send('GET','users/list',undefined,fresh.cookie)).status).toBe(200);
      const permit=(cookie:string|undefined,csrf:string|undefined)=>send('POST','access/permit',
        {action:'cad:current',resource:{kind:'site',siteId:'site-a'}},cookie,csrf);
      expect((await permit(fresh.cookie,fresh.csrf)).status).toBe(403);
      db.prepare('UPDATE "CadSite" SET active=1 WHERE id=?').run('site-a');
      expect((await send('GET','auth/session',undefined,fresh.cookie)).status).toBe(200);
      expect((await permit(fresh.cookie,fresh.csrf)).status).toBe(200);
    } finally {db.close();}
  });
  test('default OFF, malformed enablement BLOCKED, and no preview-cookie fallback', async () => {
    const f = setup();
    process.env.G7_AUTH_ENABLED = 'false'; process.env.G7_CAD_WRITE_CUTOVER_ENABLED = 'false';
    delete process.env.G7_RUNTIME_TRUST_PATH; delete process.env.G7_RUNTIME_APPROVAL_PATH;
    expect((await send('GET', 'auth/session')).status).toBe(404);
    process.env.G7_AUTH_ENABLED = 'true';
    expect((await send('GET', 'auth/session')).status).toBe(503);
    Object.assign(process.env, f.env);
    const db = seed(); db.close();
    const active = await login(); expect(active.response.status).toBe(200);
    const preview = active.cookie!.replace('cad_session=', 'cad_g7_s3_session=');
    expect((await send('GET', 'auth/session', undefined, preview)).status).toBe(401);
  });

  test('operator bootstrap/initial change/login/logout/recovery use real G2/G3 stores', async () => {
    const f = setup();
    const before = await send('POST', 'auth/login', { login: 'admin', password: INITIAL });
    expect(before.status).toBe(503);
    expect(await before.json()).toEqual({ error: { code: 'BOOTSTRAP_REQUIRED' } });
    const pristine = f.openDb();
    expect(pristine.prepare('SELECT COUNT(*) AS n FROM "AuditEvent"').get()?.n).toBe(0);
    expect(pristine.prepare('SELECT COUNT(*) AS n FROM "G3LoginAttempt"').get()?.n).toBe(0);
    pristine.close();
    const secret = path.join(f.root, 'bootstrap.secret'); writeFileSync(secret, INITIAL, { mode: 0o600 });
    expect(await executeG7RuntimeAdmin({ ...f.env, ADMIN_BOOTSTRAP_ENABLED: 'true',
      ADMIN_BOOTSTRAP_USERNAME: 'admin', ADMIN_BOOTSTRAP_PASSWORD_FILE: secret })).toBe('bootstrap');
    expect((await login('admin', INITIAL)).response.status).toBe(403);
    expect((await send('POST', 'auth/initial-change', { login: 'admin', password: INITIAL,
      newPassword: PASSWORD })).status).toBe(200);
    const admin = await login(); expect(admin.response.status).toBe(200);
    expect(admin.response.headers.get('set-cookie')).toContain('; Path=/; HttpOnly; SameSite=Strict;');
    expect(admin.response.headers.get('set-cookie')).toContain('; Secure');
    const session = await send('GET', 'auth/session', undefined, admin.cookie);
    const state = await session.json() as { actor: { id: string; roles: string[] }; runtime: { siteIds: string[] } };
    expect(state.actor.roles).toEqual(['Admin']); expect(state.runtime.siteIds).toEqual(['site-a']);
    expect((await send('POST', 'auth/logout', undefined, admin.cookie)).status).toBe(403);
    expect((await send('POST', 'auth/logout', undefined, admin.cookie, admin.csrf)).status).toBe(200);
    expect((await send('GET', 'auth/session', undefined, admin.cookie)).status).toBe(401);
    const second = await login();
    const recovery = path.join(f.root, 'recovery.secret'); writeFileSync(recovery, INITIAL, { mode: 0o600 });
    const env = { ...f.env, ADMIN_RECOVERY_ENABLED: 'true', ADMIN_RECOVERY_TARGET_USER_ID: state.actor.id,
      ADMIN_RECOVERY_ONCE_ID: 'synthetic_recovery_nonce_153', ADMIN_RECOVERY_PASSWORD_FILE: recovery };
    expect(await executeG7RuntimeAdmin(env)).toBe('recover');
    expect((await send('GET', 'auth/session', undefined, second.cookie)).status).toBe(401);
    await expect(executeG7RuntimeAdmin(env)).rejects.toThrow();
    expect((await login('admin', INITIAL)).response.status).toBe(403);
  });

  test('Reader/Editor/Admin, explicit Site scope, forged headers and immediate role/session revocation', async () => {
    setup(); const db = seed();
    try {
      const admin = await login(); const editor = await login('editor'); const reader = await login('reader');
      const permit = (identity: typeof admin, site: string) => send('POST', 'access/permit',
        { action: 'cad:current', resource: { kind: 'site', siteId: site } }, identity.cookie, identity.csrf);
      expect((await permit(editor, 'site-a')).status).toBe(200);
      expect((await permit(reader, 'site-a')).status).toBe(403);
      expect((await permit(editor, 'site-b')).status).toBe(403);
      expect((await send('POST', 'access/permit', { action: 'cad:current', resource: { kind: 'site', siteId: 'site-a' } },
        undefined, undefined, { 'x-user-id': 'admin', 'x-role': 'Admin', 'x-site-id': 'site-a' })).status).toBe(401);
      expect((await send('POST', 'access/grant', { kind: 'site', operation: 'grant', affectedUserId: 'reader', value: 'site-b' },
        admin.cookie, admin.csrf)).status).toBe(403);
      expect((await send('POST', 'access/grant', { kind: 'role', operation: 'grant', affectedUserId: 'outsider', value: 'Editor' },
        admin.cookie, admin.csrf)).status).toBe(403);
      const list = await send('GET', 'users/list', undefined, admin.cookie);
      const users = (await list.json() as { users: { id: string }[] }).users;
      expect(users.map(user => user.id)).not.toContain('outsider');
      const sites = await send('GET', 'access/sites', undefined, admin.cookie);
      expect(await sites.json()).toEqual({ sites: [{ id: 'site-a', name: 'site-a' }] });
      expect((await send('POST', 'access/grant', { kind: 'role', operation: 'revoke', affectedUserId: 'editor', value: 'Editor' },
        admin.cookie, admin.csrf)).status).toBe(200);
      expect((await permit(editor, 'site-a')).status).toBe(403);
      expect((await send('POST', 'users/revoke', { userId: 'editor' }, admin.cookie, admin.csrf)).status).toBe(200);
      expect((await send('GET', 'auth/session', undefined, editor.cookie)).status).toBe(401);
      expect(db.prepare('SELECT COUNT(*) AS n FROM "AuditEvent" WHERE action=\'AUTHORIZATION_DENIED\'').get()?.n).toBeGreaterThan(0);
    } finally { db.close(); }
  });

  test('CSRF/Host spoofing fail closed and HTTPS uses configured public authority behind internal bind URL', async () => {
    setup(); const db = seed(); db.close();
    const admin = await login(); expect(admin.response.status).toBe(200);
    expect((await send('GET', 'auth/session', undefined, admin.cookie, undefined,
      { host: 'attacker.example.test', 'x-forwarded-host': 'cad.example.test' })).status).toBe(404);
    expect((await send('POST', 'auth/login', { login: 'admin', password: PASSWORD }, undefined, undefined,
      { origin: 'https://attacker.example.test' })).status).toBe(403);
    expect((await send('POST', 'access/disable', { userId: 'reader' }, admin.cookie)).status).toBe(403);
    expect((await send('POST', 'users/revoke', { userId: 'reader' }, admin.cookie, 'forged')).status).toBe(403);
    expect((await send('POST', 'auth/login', { login: 'admin', password: 'x'.repeat(5000) })).status).toBe(413);
    expect((await send('GET', 'auth/session', undefined, admin.cookie + '; ' + admin.cookie)).status).toBe(401);
  });

  test('new account, role/site grant and Audit are usable through operating APIs', async () => {
    setup(); const db = seed();
    try {
      const admin = await login();
      const created = await send('POST', 'users/create', { login: 'newuser', initialPassword: INITIAL }, admin.cookie, admin.csrf);
      expect(created.status).toBe(201);
      const id = (await created.json() as { id: string }).id;
      for (const [kind, value, target] of [['role', 'Editor', id], ['site', 'site-a', id], ['special', 'audit:read', 'admin']]) {
        expect((await send('POST', 'access/grant', { kind, operation: 'grant', affectedUserId: target, value }, admin.cookie, admin.csrf)).status).toBe(200);
      }
      expect((await login('newuser', INITIAL)).response.status).toBe(403);
      expect((await send('POST', 'auth/initial-change', { login: 'newuser', password: INITIAL, newPassword: PASSWORD })).status).toBe(200);
      const user = await login('newuser'); expect(user.response.status).toBe(200);
      const session = await send('GET', 'auth/session', undefined, user.cookie);
      const state = await session.json() as { actor: { roles: string[]; siteGrants: string[] } };
      expect(state.actor.roles).toEqual(['Editor']); expect(state.actor.siteGrants).toEqual(['site-a']);
      const audit = await send('POST', 'access/audit', { limit: 100 }, admin.cookie, admin.csrf);
      expect(audit.status).toBe(200);
      const text = JSON.stringify(await audit.json());
      expect(text).toContain('ACCOUNT_CREATED'); expect(text).toContain('SITE_GRANTED');
      expect(text).not.toContain(PASSWORD); expect(text).not.toContain(INITIAL); expect(text).not.toContain(hash);
      expect(text).not.toContain(user.cookie!.slice('cad_session='.length));
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });

  test('Owner-approved HTTP uses HttpOnly Strict cookie without Secure only with explicit HTTP opt-in', async () => {
    const f = setup(); const db = seed(); db.close();
    f.trust.origin = 'http://cad.example.test'; f.writeTrust(); f.writeApproval({ origin: f.trust.origin });
    expect((await send('POST', 'auth/login', { login: 'admin', password: PASSWORD }, undefined, undefined,
      { origin: f.trust.origin })).status).toBe(503);
    process.env.G7_RUNTIME_ALLOW_HTTP = 'true';
    const response = await send('POST', 'auth/login', { login: 'admin', password: PASSWORD }, undefined, undefined,
      { origin: f.trust.origin });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('; HttpOnly; SameSite=Strict;');
    expect(response.headers.get('set-cookie')).not.toContain('; Secure');
  });

  test('account limiter ignores spoofed proxy peers and expires/revokes sessions', async () => {
    setup(); const db = seed();
    try {
      for (let n = 0; n < 5; n++) expect((await send('POST', 'auth/login', { login: 'reader', password: 'wrong-password' },
        undefined, undefined, { 'x-forwarded-for': '192.0.2.' + n })).status).toBe(401);
      expect((await login('reader')).response.status).toBe(429);
      const admin = await login();
      const old = newSessionCandidate('editor', Date.now() - SESSION_IDLE_MS - 1000);
      createG3IsolatedStore(db).issue('editor', hash, old.session, 'runtime_old_session');
      expect((await send('GET', 'auth/session', undefined, 'cad_session=' + old.rawToken)).status).toBe(401);
      expect((await send('POST', 'access/disable', { userId: 'reader' }, admin.cookie, admin.csrf)).status).toBe(200);
      expect((await login('reader')).response.status).toBe(429);
    } finally { db.close(); }
  });

  test('account creation, grant, disable and force-revoke roll back on Audit failure', async () => {
    setup(); const db = seed();
    try {
      const admin = await login(); const editor = await login('editor');
      const open = runtimeDb.openG7RuntimeDb;
      const injected = vi.spyOn(runtimeDb, 'openG7RuntimeDb').mockImplementation((gate, readonly) => {
        const actual = open(gate, readonly);
        if (readonly) return actual;
        return { exec: sql => actual.exec(sql), close: () => actual.close(), backup: file => actual.backup(file),
          prepare(sql) {
            const statement = actual.prepare(sql);
            if (!sql.startsWith('INSERT INTO "AuditEvent"')) return statement;
            return { get: (...values) => statement.get(...values), all: (...values) => statement.all(...values),
              run(...values) {
                if (['ACCOUNT_CREATED','ROLE_GRANTED','ACCOUNT_DISABLED','SESSION_REVOKED'].includes(String(values[4]))) {
                  throw new Error('INJECTED_AUDIT_IO');
                }
                return statement.run(...values);
              } };
          } };
      });
      expect((await send('POST', 'users/create', { login: 'newuser', initialPassword: INITIAL }, admin.cookie, admin.csrf)).status).toBe(503);
      expect(db.prepare('SELECT 1 FROM "User" WHERE login_name=\'newuser\'').get()).toBeUndefined();
      expect((await send('POST', 'access/grant', { kind: 'role', operation: 'grant', affectedUserId: 'reader', value: 'Editor' }, admin.cookie, admin.csrf)).status).toBe(503);
      expect(db.prepare('SELECT 1 FROM "UserRoleGrant" WHERE user_id=\'reader\' AND role=\'Editor\'').get()).toBeUndefined();
      expect((await send('POST', 'access/disable', { userId: 'editor' }, admin.cookie, admin.csrf)).status).toBe(503);
      expect(db.prepare('SELECT status FROM "User" WHERE id=\'editor\'').get()?.status).toBe('ACTIVE');
      expect((await send('POST', 'users/revoke', { userId: 'editor' }, admin.cookie, admin.csrf)).status).toBe(503);
      expect((await send('GET', 'auth/session', undefined, editor.cookie)).status).toBe(200);
      injected.mockRestore();
      expect((await send('POST', 'access/disable', { userId: 'editor' }, admin.cookie, admin.csrf)).status).toBe(200);
      expect((await send('GET', 'auth/session', undefined, editor.cookie)).status).toBe(401);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });

  test('approval expiry and recovery mode disable all Auth actions immediately', async () => {
    const f = setup(); const db = seed(); db.close();
    const admin = await login();
    f.writeApproval({ expiresAtUtc: new Date(Date.now() - 1).toISOString() });
    expect((await send('GET', 'auth/session', undefined, admin.cookie)).status).toBe(503);
    expect((await send('POST', 'auth/login', { login: 'admin', password: PASSWORD })).status).toBe(503);
    f.writeApproval({ expiresAtUtc: new Date(Date.now() + 3600000).toISOString() });
    process.env.G7_RUNTIME_RECOVERY_MODE = 'true';
    expect((await send('GET', 'auth/session', undefined, admin.cookie)).status).toBe(503);
  });

  test('G3/G4/G2 check approval and current session time after acquiring the transaction', () => {
    setup(); const db = seed();
    try {
      let clock = Date.now(); let inTransaction = false;
      const original = db.exec.bind(db);
      db.exec = sql => { original(sql); if (sql === 'BEGIN IMMEDIATE') { inTransaction = true; clock += SESSION_IDLE_MS + 1; }
        if (sql === 'COMMIT' || sql === 'ROLLBACK') inTransaction = false; };
      const check = () => { expect(inTransaction).toBe(true); };
      const candidate = newSessionCandidate('editor', clock);
      createG3IsolatedStore(db, {}, { assertCurrent: check, now: () => clock })
        .issue('editor', hash, candidate.session, 'runtime_session');
      expect(db.prepare('SELECT issued_at FROM "AuthSession" WHERE user_id=\'editor\'').get()?.issued_at).toBe(clock);
      expect(() => createG3IsolatedStore(db, {}, { assertCurrent: check, now: () => clock })
        .authenticate(candidate.session.tokenHash, candidate.session.issuedAt)).toThrow();
      const admin = newSessionCandidate('admin', clock);
      createG3IsolatedStore(db).issue('admin', hash, admin.session, 'runtime_admin');
      const before = db.prepare('SELECT COUNT(*) AS n FROM "UserRoleGrant"').get()?.n;
      expect(() => createG4IsolatedStore(db, {}, { siteIds: ['site-a'], assertCurrent: check, now: () => clock })
        .grant(admin.session.tokenHash, { kind: 'role', operation: 'grant', affectedUserId: 'reader', value: 'Editor' },
          { now: admin.session.issuedAt, requestId: 'runtime_grant' })).toThrow();
      expect(db.prepare('SELECT COUNT(*) AS n FROM "UserRoleGrant"').get()?.n).toBe(before);
      let checked = false;
      expect(() => createG2IsolatedStore(db, {}, { assertCurrent: () => { checked = inTransaction; throw new Error('EXPIRED'); }, now: () => clock })
        .bootstrap({ username: 'another', passwordHash: hash, now: clock, requestId: 'runtime_bootstrap' })).toThrow('EXPIRED');
      expect(checked).toBe(true);
    } finally { db.close(); }
  });

  test('operator secret FIFO is rejected without blocking and no secret or path is printed', () => {
    const f = setup(); const fifo = path.join(f.root, 'bootstrap.fifo');
    expect(spawnSync('mkfifo', ['-m', '600', fifo]).status).toBe(0);
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/g7-runtime-admin.ts', '--ack-runtime-admin'], {
      cwd: process.cwd(), env: { ...process.env, ADMIN_BOOTSTRAP_ENABLED: 'true', ADMIN_BOOTSTRAP_USERNAME: 'admin',
        ADMIN_BOOTSTRAP_PASSWORD_FILE: fifo }, encoding: 'utf8', timeout: 10000,
    });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
    expect(result.stderr).toBe('G7_RUNTIME_ADMIN_BLOCKED\n'); expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain(fifo);
  }, 15000);
});
