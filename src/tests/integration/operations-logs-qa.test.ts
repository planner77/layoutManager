import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeG7RuntimeFixture } from '../helpers/g7-runtime';
import { installMonotonicTestClock } from '../helpers/monotonic-clock';
import path from 'node:path';
import { StructuredLogStore, logStoreOptions } from '../../server/logging/store';
import { newSessionCandidate } from '../../server/auth/session';
import { GET as query } from '../../app/api/operations/logs/route';
import * as logQuery from '../../server/logging/query';
import { OperationLogRateLimiter, OperationLogsAccessError } from '../../server/logging/access';

let fixture: ReturnType<typeof makeG7RuntimeFixture> | undefined;
let saved: Record<string, string | undefined> = {};
beforeEach(installMonotonicTestClock);

function setup(sessionIssuedAt = Date.now()) {
  fixture = makeG7RuntimeFixture();
  const keys = [...new Set([...Object.keys(fixture.env), 'LOG_STORE_ENABLED',
    ...Object.keys(process.env).filter(key => key.startsWith('G7_'))])];
  saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) if (key.startsWith('G7_')) delete process.env[key];
  Object.assign(process.env, fixture.env, { LOG_STORE_ENABLED: 'true' });
  const db = fixture.openDb();
  const now = Date.now();
  db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',0,?,?)')
    .run('admin', 'admin', 'synthetic-hash', now, now);
  db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)')
    .run('admin', 'Admin', now);
  db.prepare('INSERT INTO "SpecialGrant"(user_id,permission,granted_at) VALUES(?,?,?)')
    .run('admin', 'logs:read', now);
  const candidate = newSessionCandidate('admin', sessionIssuedAt);
  db.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
    .run(candidate.session.id, 'admin', candidate.session.tokenHash,
      candidate.session.issuedAt, candidate.session.lastSeenAt, candidate.session.expiresAt);
  db.close();
  return { token: candidate.rawToken, sessionId: candidate.session.id };
}

function request(token: string, search = '') {
  return new Request('http://0.0.0.0/api/operations/logs' + search, {
    headers: { host: 'cad.example.test', cookie: `cad_session=${token}` },
  });
}

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fixture?.cleanup(); fixture = undefined; saved = {}; vi.restoreAllMocks();
});

test('TC-R1-003/006: authorized REST reads real L3 writer data through bounded reader and returns only DTO fields', async () => {
  const { token } = setup();
  const directory = path.join(fixture!.root, 'logs');
  const store = new StructuredLogStore({ ...logStoreOptions(), directory });
  try {
    store.enqueue({ timestamp: new Date(Date.now() - 1000).toISOString(), schemaVersion: 1,
      level: 'info', event: 'http_request_completed', component: 'api', operation: 'cad_list',
      appVersion: '0.49.0', outcome: 'success', httpStatus: 200, password: 'synthetic-canary-not-for-response' });
    await store.close();
    const original = logQuery.queryOperationLogs;
    // Only the trusted filesystem dependency points to disposable test storage;
    // the HTTP route, G7/G4, L3 writer, parser, filters and DTO all run normally.
    vi.spyOn(logQuery, 'queryOperationLogs').mockImplementation((input, actor, options) =>
      original(input, actor, { ...options, directory }));
    const response = await query(request(token, '?event=http_request_completed&operation=cad_list'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ source: 'app', event: 'http_request_completed',
      operation: 'cad_list', outcome: 'success', httpStatus: 200 });
    expect(JSON.stringify(body)).not.toContain('synthetic-canary');
    expect(body.items[0]).not.toHaveProperty('password');
  } finally { await store.close(); }
});

test('TC-R1-001: future-issued session is denied without file query (clock rollback remains fail-closed)', async () => {
  const { token } = setup(Date.now() + 60_000);
  const read = vi.spyOn(logQuery, 'queryOperationLogs');
  const response = await query(request(token));
  expect(response.status).toBe(401);
  expect(read).not.toHaveBeenCalled();
});

test('TC-R1-002: real SQLite Audit INSERT failure returns 503 and never queries the log store', async () => {
  const { token } = setup();
  const db = fixture!.openDb();
  db.exec("CREATE TRIGGER qa_reject_log_audit BEFORE INSERT ON AuditEvent WHEN NEW.target_id='logs_read' BEGIN SELECT RAISE(ABORT,'synthetic audit insert failure'); END");
  db.close();
  const read = vi.spyOn(logQuery, 'queryOperationLogs');

  const response = await query(request(token));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: 'G7_RUNTIME_UNAVAILABLE' } });
  expect(read).not.toHaveBeenCalled();
  const check = fixture!.openDb();
  expect(check.prepare("SELECT COUNT(*) AS n FROM AuditEvent WHERE target_id='logs_read'").get()?.n).toBe(0);
  check.close();
});

test('TC-R1-001/002: revoked session is denied before file query', async () => {
  const { token, sessionId } = setup();
  const read = vi.spyOn(logQuery, 'queryOperationLogs').mockResolvedValue({
    items: [], nextCursor: null, sourceCoverage: 'app-structured-only', status: 'ok', skippedLines: 0, scanTruncated: false,
  });

  let db = fixture!.openDb();
  db.prepare('UPDATE AuthSession SET revoked_at=? WHERE id=?').run(Date.now(), sessionId);
  db.close();
  expect((await query(request(token))).status).toBe(401);
  // A revoked session is immutable by G1; use a separate setup for grant revocation.
  expect(read).not.toHaveBeenCalled();

  db = fixture!.openDb();
  const audit = db.prepare("SELECT action,outcome,target_kind,target_id FROM AuditEvent WHERE target_id='logs_read'").all();
  expect(audit.some(row => row.action === 'AUTHORIZATION_DENIED' && row.outcome === 'DENIED' && row.target_kind === 'ROLE')).toBe(true);
  db.close();

});

test('TC-R1-001/002: revoked logs:read grant is denied before file query', async () => {
  const { token } = setup();
  const read = vi.spyOn(logQuery, 'queryOperationLogs').mockResolvedValue({
    items: [], nextCursor: null, sourceCoverage: 'app-structured-only', status: 'ok', skippedLines: 0, scanTruncated: false,
  });
  const db = fixture!.openDb();
  db.prepare('DELETE FROM SpecialGrant WHERE user_id=? AND permission=?').run('admin', 'logs:read');
  db.close();
  expect((await query(request(token))).status).toBe(403);
  expect(read).not.toHaveBeenCalled();
});

test('TC-R1-003/006: authenticated empty filter values are rejected before store query', async () => {
  const { token } = setup();
  const read = vi.spyOn(logQuery, 'queryOperationLogs');
  for (const filter of ['level=', 'event=', 'operation=', 'component=', 'source=', 'outcome=', 'requestId=', 'jobId=', 'errorCode=']) {
    const response = await query(request(token, '?' + filter));
    expect(response.status, filter).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  }
  expect(read).not.toHaveBeenCalled();
});

test('TC-R1-001/002: a separately inserted expired session is denied before file query', async () => {
  const { token } = setup(Date.now() - 9 * 60 * 60 * 1000);
  const read = vi.spyOn(logQuery, 'queryOperationLogs');
  const response = await query(request(token));
  expect(response.status).toBe(401);
  expect(read).not.toHaveBeenCalled();
  const db = fixture!.openDb();
  expect(db.prepare("SELECT COUNT(*) AS n FROM AuditEvent WHERE action='AUTHORIZATION_DENIED' AND target_id='logs_read'").get()?.n).toBe(1);
  db.close();
});

test('TC-R1-006: limiter rejection maps to HTTP 429 with Retry-After and no log query', async () => {
  const { token } = setup();
  vi.spyOn(OperationLogRateLimiter.prototype, 'reserve').mockImplementation(() => {
    throw new OperationLogsAccessError('LOG_RATE_LIMITED', 429);
  });
  const read = vi.spyOn(logQuery, 'queryOperationLogs');
  const response = await query(request(token));
  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('60');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(read).not.toHaveBeenCalled();
});
