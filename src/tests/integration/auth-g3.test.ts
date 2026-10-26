import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { chmodSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrate } from '../helpers/database';
import { applyG1Fixture, changeG1SiteGrant, disableG1User, fixtureCount,
  openG1Fixture, type IsolatedDb } from '../fixtures/auth-g1/store';
import { createG2IsolatedStore } from '../fixtures/auth-g2/store';
import { applyG3Fixture, createG3IsolatedStore, createG3LoginLimiter } from '../fixtures/auth-g3/store';
import { executeAdminSetup } from '../../server/auth/admin-setup';
import { createLoginService, type AuthStore } from '../../server/auth/login-service';
import { handleG3Request } from '../../server/auth/g3-request';
import { hashLocalPassword } from '../../server/auth/password';
import { digestSessionToken, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '../../server/auth/session';

const NOW = 1_793_000_000_000;
const OLD = 'test-only-G3-old-credential';
const NEW = 'test-only-G3-new-credential';
const ORIGIN = 'http://viewer.internal';
let oldHash: string;
let directory: string;
let filename: string;
let db: IsolatedDb;
let store: AuthStore;
let service: ReturnType<typeof createLoginService>;

beforeAll(async () => { oldHash = await hashLocalPassword(OLD); });
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'cad-auth-g1-'));
  filename = path.join(directory, 'fixture.sqlite');
  await migrate(filename);
  db = openG1Fixture(filename);
  applyG1Fixture(db);
  applyG3Fixture(db);
  store = createG3IsolatedStore(db);
  service = createLoginService(store);
});
afterEach(async () => { db.close(); await rm(directory, { recursive: true, force: true }); });

function user(id = 'user-a', login = 'user_a', mustChange = false) {
  db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(id, login, oldHash, 'ACTIVE', mustChange ? 1 : 0, NOW, NOW);
}
function role(id = 'user-a', name = 'Editor') {
  db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(id, name, NOW);
}
function site() {
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu-a', 'Plant');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('product-a', 'bu-a', 'Product');
  db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)').run('site-a', 'product-a', 'Site', 'SITE');
}
const count = (table: string) => fixtureCount(db, table);
async function login(at = NOW, id = 'login') { return service.login('USER_A', OLD, at, id); }
function request(action: Parameters<typeof handleG3Request>[0], origin: string, method: string,
  input?: object, cookie?: string, csrf?: string, limiter = createG3LoginLimiter(db), at = NOW,
  trustedOrigin = origin) {
  const headers = new Headers({ origin });
  if (cookie) headers.set('cookie', cookie);
  if (csrf) headers.set('x-csrf-token', csrf);
  return handleG3Request(action, new Request(origin + '/isolated-g3', {
    method, headers, body: input ? JSON.stringify(input) : undefined,
  }), service, { trustedOrigin, peer: 'trusted-peer', now: at, requestId: 'req-' + action,
    limiter });
}

describe('#105 G3 isolated login and session', () => {
  test('001: known, missing, wrong and disabled credentials; denied audit excludes input', async () => {
    user();
    await expect(service.login('USER_A', 'wrong-secret-canary', NOW, 'bad-1'))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    await expect(service.login('missing_user', OLD, NOW, 'bad-2'))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(count('AuthSession')).toBe(0);
    expect(count('AuditEvent')).toBe(2);
    const denied = JSON.stringify(db.prepare('SELECT * FROM "AuditEvent"').all());
    expect(denied).not.toContain('wrong-secret-canary');
    expect(denied).not.toContain('missing_user');
    db.prepare("UPDATE \"User\" SET status='DISABLED' WHERE id='user-a'").run();
    await expect(login()).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED', status: 403 });
    expect(count('AuthSession')).toBe(0);
  });

  test('002: must-change account has no session; old credential required; fresh login follows reset', async () => {
    user('user-a', 'user_a', true);
    await expect(login()).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED', status: 403 });
    expect(count('AuthSession')).toBe(0);
    await expect(service.initialChange('user_a', 'wrong', NEW, NOW, 'initial-bad'))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    for (const candidate of ['short', OLD]) {
      await expect(service.initialChange('user_a', OLD, candidate, NOW, 'initial-invalid'))
        .rejects.toMatchObject({ code: 'BAD_INPUT' });
    }
    const before = count('AuditEvent');
    await expect(createLoginService(createG3IsolatedStore(db, { change: true }))
      .initialChange('user_a', OLD, NEW, NOW + 1, 'initial-fault'))
      .rejects.toThrow('G3_INJECTED_CHANGE_FAILURE');
    expect(db.prepare('SELECT must_change_password FROM "User" WHERE id=?').get('user-a')?.must_change_password).toBe(1);
    expect(count('AuditEvent')).toBe(before);
    await service.initialChange('user_a', OLD, NEW, NOW + 1, 'initial-ok');
    expect(db.prepare('SELECT must_change_password FROM "User" WHERE id=?').get('user-a')?.must_change_password).toBe(0);
    await expect(login(NOW + 2)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const logged = await service.login('user_a', NEW, NOW + 2, 'new-login');
    expect(logged.rawToken).toHaveLength(43);
    expect(count('AuditEvent')).toBeGreaterThan(0);
  });

  test('002: actual G2 bootstrap credential enters G3 must-change flow', async () => {
    const secret = path.join(directory, 'first.secret');
    writeFileSync(secret, OLD, { mode: 0o600 }); chmodSync(secret, 0o600);
    const result = await executeAdminSetup({
      ADMIN_BOOTSTRAP_ENABLED: 'true', ADMIN_BOOTSTRAP_USERNAME: 'Initial_Admin',
      ADMIN_BOOTSTRAP_PASSWORD_FILE: secret,
    }, createG2IsolatedStore(db), 'g2-in-g3', NOW);
    expect(result.kind).toBe('bootstrap');
    const first = await request('login', ORIGIN, 'POST', {
      login: 'INITIAL_ADMIN', password: OLD,
    }, undefined, undefined, createG3LoginLimiter(db), NOW + 1);
    expect(first.status).toBe(403);
    expect(first.headers.get('set-cookie')).toBeNull();
    expect(count('AuthSession')).toBe(0);
    const changed = await request('initial-change', ORIGIN, 'POST', {
      login: 'initial_admin', password: OLD, newPassword: NEW,
    }, undefined, undefined, createG3LoginLimiter(db), NOW + 2);
    expect(changed.status).toBe(200);
    expect(changed.headers.get('set-cookie')).toContain('Max-Age=0');
    await expect(service.login('initial_admin', NEW, NOW + 3, 'first-fresh-login'))
      .resolves.toHaveProperty('rawToken');
  });

  test('003: password change revokes every session; failure rollback leaves hash/sessions/audit intact', async () => {
    user();
    const a = await login(NOW, 'a');
    const b = await login(NOW + 1, 'b');
    const before = count('AuditEvent');
    const faulty = createLoginService(createG3IsolatedStore(db, { change: true }));
    await expect(faulty.changePassword(a.rawToken, OLD, NEW, NOW + 2, 'change-fault'))
      .rejects.toThrow('G3_INJECTED_CHANGE_FAILURE');
    expect(db.prepare('SELECT password_hash FROM "User" WHERE id=?').get('user-a')?.password_hash).toBe(oldHash);
    expect(count('AuditEvent')).toBe(before);
    expect(service.authenticate(a.rawToken, NOW + 3).actor.id).toBe('user-a');
    await service.changePassword(a.rawToken, OLD, NEW, NOW + 4, 'change-ok');
    for (const raw of [a.rawToken, b.rawToken]) {
      expect(() => service.authenticate(raw, NOW + 5)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    }
    await expect(login(NOW + 5)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(service.login('user_a', NEW, NOW + 5, 'fresh')).resolves.toHaveProperty('rawToken');
  });

  test('004: hash-only 32-byte token, idle/absolute boundaries, monotonic touch and reopen', async () => {
    user();
    const issued = await login();
    expect(Buffer.from(issued.rawToken, 'base64url')).toHaveLength(32);
    const row = db.prepare('SELECT * FROM "AuthSession"').get();
    expect(row?.token_hash).toBe(digestSessionToken(issued.rawToken));
    expect(JSON.stringify(row)).not.toContain(issued.rawToken);
    expect(Number(row?.expires_at) - Number(row?.issued_at)).toBe(SESSION_ABSOLUTE_MS);
    expect(service.authenticate(issued.rawToken, NOW + SESSION_IDLE_MS - 1).actor.id).toBe('user-a');
    expect(() => service.authenticate(issued.rawToken, NOW + SESSION_IDLE_MS - 2))
      .toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    db.close(); db = openG1Fixture(filename);
    service = createLoginService(createG3IsolatedStore(db));
    expect(service.authenticate(issued.rawToken, NOW + SESSION_IDLE_MS).actor.id).toBe('user-a');
    for (let i = 2; i <= 16; i++) {
      const at = NOW + i * (SESSION_IDLE_MS - 1);
      expect(service.authenticate(issued.rawToken, at).actor.id).toBe('user-a');
    }
    expect(service.authenticate(issued.rawToken, NOW + SESSION_ABSOLUTE_MS - 1).actor.id).toBe('user-a');
    expect(() => service.authenticate(issued.rawToken, NOW + SESSION_ABSOLUTE_MS))
      .toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    const fresh = await login(NOW + SESSION_ABSOLUTE_MS, 'fresh-idle');
    expect(() => service.authenticate(fresh.rawToken, NOW + SESSION_ABSOLUTE_MS + SESSION_IDLE_MS))
      .toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });

  test('005/006: three slots across connections, fourth 409, lock/failure rollback, idle slot reuse', async () => {
    user();
    const other = openG1Fixture(filename);
    try {
      const services = [service, createLoginService(createG3IsolatedStore(other))];
      const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) =>
        services[i % 2].login('user_a', OLD, NOW, 'slot-' + i)));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(3);
      expect(results.filter(result => result.status === 'rejected').every(result =>
        result.reason?.code === 'SESSION_LIMIT')).toBe(true);
      expect(count('AuthSession')).toBe(3);
      expect(count('AuditEvent')).toBe(3);
      db.exec('BEGIN IMMEDIATE');
      try {
        await expect(services[1].login('user_a', OLD, NOW + 5, 'locked'))
          .rejects.toThrow(/locked|busy/i);
      } finally { db.exec('ROLLBACK'); }
      expect(count('AuthSession')).toBe(3);
      const faulty = createLoginService(createG3IsolatedStore(db, { audit: true }));
      await expect(faulty.login('user_a', OLD, NOW + SESSION_IDLE_MS + 5, 'audit-fault'))
        .rejects.toThrow('G3_INJECTED_AUDIT_FAILURE');
      expect(count('AuthSession')).toBe(3);
      await expect(service.login('user_a', OLD, NOW + SESSION_IDLE_MS + 5, 'slot-reused'))
        .resolves.toHaveProperty('rawToken');
      expect(count('AuthSession')).toBe(4);
    } finally { other.close(); }
  });

  test('006: CAS rejects login and password change after a concurrent credential change', async () => {
    user();
    const old = store.credential('user_a')!;
    const newHash = await hashLocalPassword(NEW);
    db.prepare('UPDATE "User" SET password_hash=? WHERE id=?').run(newHash, old.id);
    const candidate = (await import('../../server/auth/session')).newSessionCandidate(old.id, NOW + 1);
    expect(() => store.issue(old.id, old.passwordHash, candidate.session, 'stale-login'))
      .toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    expect(() => store.change(old.id, old.passwordHash, false, newHash, NOW + 1, 'stale-change'))
      .toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    expect(count('AuthSession')).toBe(0);
  });

  test('006: normal change rechecks its session after asynchronous credential work', async () => {
    user();
    const logged = await login();
    const tokenHash = digestSessionToken(logged.rawToken);
    const wrapped: AuthStore = {
      ...store,
      change(...args) {
        store.revoke(tokenHash, NOW + 2, 'interleaved-logout');
        store.change(...args);
      },
    };
    await expect(createLoginService(wrapped).changePassword(logged.rawToken, OLD, NEW,
      NOW + 2, 'stale-normal-change')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(db.prepare('SELECT password_hash FROM "User" WHERE id=?').get('user-a')?.password_hash).toBe(oldHash);
  });

  test('005: independent processes cannot commit more than three sessions', async () => {
    user();
    const worker = fileURLToPath(new URL('../fixtures/auth-g3/login-worker.ts', import.meta.url));
    const run = (index: number) => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', worker],
        { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
      let result = '';
      let diagnostic = '';
      child.stdout.on('data', chunk => { result += String(chunk); });
      child.stderr.on('data', chunk => { diagnostic += String(chunk); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(result) : reject(new Error('G3_WORKER_FAILED:' + diagnostic)));
      child.stdin.end(JSON.stringify({ filename, password: OLD, now: NOW, requestId: 'worker-' + index }));
    });
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => run(i)));
    expect(results.filter(result => result === 'OK').length).toBeLessThanOrEqual(3);
    expect(results.filter(result => result === 'OK').length).toBeGreaterThan(0);
    expect(results.every(result => ['OK', 'SESSION_LIMIT', 'SQLITE_BUSY', 'SQLITE_CONSTRAINT_TRIGGER'].includes(result))).toBe(true);
    expect(count('AuthSession')).toBe(results.filter(result => result === 'OK').length);
    expect(count('AuditEvent')).toBe(count('AuthSession'));
  });

  test('011: limiter budget is shared across connections and resets at expiry', () => {
    const other = openG1Fixture(filename);
    try {
      const first = createG3LoginLimiter(db);
      const second = createG3LoginLimiter(other);
      for (let i = 0; i < 5; i++) (i % 2 ? first : second).reserve('peer:user_a', NOW);
      expect(() => second.reserve('peer:user_a', NOW)).toThrow('LOGIN_RATE_LIMITED');
      expect(() => first.reserve('peer:user_a', NOW + 60_000)).not.toThrow();
      expect(db.prepare('SELECT count(*) AS n FROM "G3LoginAttempt"').get()?.n).toBe(1);
      first.reset('peer:user_a');
      expect(() => second.reserve('peer:user_a', NOW + 60_001)).not.toThrow();
    } finally { other.close(); }
  });

  test('011: limiter cleanup failure does not discard a committed login cookie', async () => {
    user();
    const limiter = {
      reserve() { /* accepted */ },
      reset() { throw new Error('injected reset failure'); },
    };
    const response = await request('login', ORIGIN, 'POST', { login: 'user_a', password: OLD },
      undefined, undefined, limiter);
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie');
    expect(cookie).toContain('cad_session=');
    expect((await request('session', ORIGIN, 'GET', undefined, cookie!)).status).toBe(200);
  });

  test('010: authenticated HTTP password change requires session-bound CSRF and fresh login', async () => {
    user();
    const response = await request('login', ORIGIN, 'POST', { login: 'user_a', password: OLD });
    const cookie = response.headers.get('set-cookie')!;
    const csrf = (await response.json()).csrfToken as string;
    const input = { password: OLD, newPassword: NEW, actorId: 'another-user' };
    expect((await request('change', ORIGIN, 'POST', input, cookie, 'wrong')).status).toBe(403);
    const changed = await request('change', ORIGIN, 'POST', input, cookie, csrf);
    expect(changed.status).toBe(200);
    expect(changed.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await request('session', ORIGIN, 'GET', undefined, cookie)).status).toBe(401);
    expect((await request('login', ORIGIN, 'POST', { login: 'user_a', password: NEW },
      undefined, undefined, createG3LoginLimiter(db), NOW + 1)).status).toBe(200);
  });

  test('007: logout single token, idempotent retry, and injected rollback', async () => {
    user();
    const a = await login(NOW, 'a');
    const b = await login(NOW + 1, 'b');
    const faulty = createLoginService(createG3IsolatedStore(db, { revoke: true }));
    expect(() => faulty.logout(a.rawToken, NOW + 2, 'revoke-fault')).toThrow();
    expect(service.authenticate(a.rawToken, NOW + 3).actor.id).toBe('user-a');
    service.logout(a.rawToken, NOW + 4, 'revoke-ok');
    service.logout(a.rawToken, NOW + 5, 'revoke-again');
    expect(() => service.authenticate(a.rawToken, NOW + 5)).toThrow();
    expect(service.authenticate(b.rawToken, NOW + 5).actor.id).toBe('user-a');
    expect(db.prepare("SELECT COUNT(*) AS n FROM \"AuditEvent\" WHERE action='SESSION_REVOKED'").get()?.n).toBe(1);
  });

  test('008: G1 disable and G2 recovery revoke live G3 sessions', async () => {
    user('admin-a', 'admin_a'); role('admin-a', 'Admin');
    user();
    const admin = await service.login('admin_a', OLD, NOW, 'admin-session');
    const ordinary = await login(NOW, 'ordinary-session');
    disableG1User(db, 'admin-a', 'user-a', NOW + 1, 'disable');
    expect(() => service.authenticate(ordinary.rawToken, NOW + 2)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    const secret = path.join(directory, 'recovery.secret');
    writeFileSync(secret, NEW, { mode: 0o600 }); chmodSync(secret, 0o600);
    await executeAdminSetup({ ADMIN_RECOVERY_ENABLED: 'true',
      ADMIN_RECOVERY_TARGET_USER_ID: 'admin-a', ADMIN_RECOVERY_ONCE_ID: 'g3_recovery_nonce_2026',
      ADMIN_RECOVERY_PASSWORD_FILE: secret }, createG2IsolatedStore(db), 'recovery', NOW + 3);
    expect(() => service.authenticate(admin.rawToken, NOW + 4)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    await expect(service.login('admin_a', NEW, NOW + 4, 'recover-login'))
      .rejects.toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
  });

  test('009: actor is rebuilt from current DB grants, ignores request claims', async () => {
    site(); user('admin-a', 'admin_a'); role('admin-a', 'Admin'); user(); role();
    const token = (await login()).rawToken;
    expect(service.authenticate(token, NOW + 1).actor).toMatchObject({ roles: ['Editor'], siteGrants: [] });
    changeG1SiteGrant(db, 'admin-a', 'user-a', 'site-a', true, NOW + 2, 'grant');
    db.prepare('INSERT INTO "SpecialGrant"(user_id,permission,granted_at) VALUES(?,?,?)')
      .run('user-a', 'audit:read', NOW + 2);
    expect(service.authenticate(token, NOW + 3).actor).toMatchObject({
      id: 'user-a', roles: ['Editor'], siteGrants: ['site-a'], specialGrants: ['audit:read'],
    });
    expect(JSON.stringify(service.authenticate(token, NOW + 4))).not.toContain(oldHash);
    expect(() => service.authenticate(null, NOW + 4)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });

  test.each(['http://viewer.internal', 'http://127.0.0.1:3000'])(
    '010/011: %s Origin, cookie roundtrip, CSRF, logout, limiter', async origin => {
      user();
      const limiter = createG3LoginLimiter(db);
      const input = { login: 'user_a', password: OLD, role: 'Admin', siteId: 'site-a' };
      const loginResponse = await request('login', origin, 'POST', input, undefined, undefined, limiter);
      expect(loginResponse.status).toBe(200);
      const cookie = loginResponse.headers.get('set-cookie')!;
      expect(cookie).toContain('HttpOnly; SameSite=Strict; Max-Age=28800');
      expect(cookie).not.toContain('Secure');
      const csrf = (await loginResponse.json()).csrfToken as string;
      const session = await request('session', origin, 'GET', undefined, cookie);
      expect(session.status).toBe(200);
      expect((await session.json()).actor.roles).toEqual([]);
      expect((await request('logout', origin, 'POST', undefined, cookie, 'bad')).status).toBe(403);
      const logout = await request('logout', origin, 'POST', undefined, cookie, csrf);
      expect(logout.status).toBe(200);
      expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
      expect((await request('session', origin, 'GET', undefined, cookie)).status).toBe(401);
      expect((await request('logout', origin, 'POST', undefined, cookie)).status).toBe(200);
      expect((await request('login', 'http://untrusted', 'POST', input, undefined,
        undefined, createG3LoginLimiter(db), NOW, origin)).status).toBe(403);
      const limited = createG3LoginLimiter(db);
      for (let i = 0; i < 5; i++) {
        expect((await request('login', origin, 'POST', { login: 'user_a', password: 'bad' },
          undefined, undefined, limited, NOW + 100)).status).toBe(401);
      }
      expect((await request('login', origin, 'POST', input, undefined, undefined,
        limited, NOW + 100)).status).toBe(429);
      expect((await request('login', origin, 'POST', input, undefined, undefined,
        limited, NOW + 60_100)).status).toBe(200);
    });

  test('012: fixture leaves shipped Prisma and CAD tables unchanged', async () => {
    site(); user();
    db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run('building-a', 'site-a', 'B1');
    db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,1)')
      .run('floor-a', 'building-a', 'F1');
    db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)')
      .run('version-a', 'floor-a', 'synthetic.dxf', 'fixture', 'scrypt$synthetic-delete-hash',
        'DXF', 4, 'a'.repeat(64), 'storage/synthetic.dxf', '2026-10-26');
    db.prepare('UPDATE "CadLocation" SET current_version_id=?,next_version=2 WHERE id=?')
      .run('version-a', 'floor-a');
    const cadTables = ['BusinessUnit', 'Product', 'CadSite', 'Building', 'CadLocation',
      'CadFileVersion', 'CadDeletionJob'];
    const snapshot = () => cadTables.map(table => JSON.stringify(
      db.prepare('SELECT * FROM "' + table + '" ORDER BY id').all()));
    const before = snapshot();
    const token = (await login()).rawToken;
    service.authenticate(token, NOW + 1);
    service.logout(token, NOW + 2, 'cad-unchanged');
    expect(snapshot()).toEqual(before);
    const shipped = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    // G7 S2 includes client-only Auth model declarations, but the default
    // operating migrator still must NOT carry the G7 physical DDL.
    expect(shipped).toContain('model AuthSession {');
    expect(readdirSync(new URL('../../prisma/migrations/', import.meta.url)))
      .not.toContain('202610260001_g7_staging_auth');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
