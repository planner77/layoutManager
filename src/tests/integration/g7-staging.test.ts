import { afterEach, describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveG7StagingGate, G7_STAGING_SCHEMA_ID } from '../../server/g7-staging/gate';
import { openG7StagingDb } from '../../server/g7-staging/db';
import { executeAdminSetup } from '../../server/auth/admin-setup';
import { createG2IsolatedStore } from '../../server/g7-staging/g2-store';
import { hashLocalPassword } from '../../server/auth/password';
import { GET, POST, PUT, DELETE } from '../../app/api/g7-staging/[...segments]/route';

const Sqlite = createRequire(import.meta.url)('better-sqlite3') as
  new (filename: string) => { close(): void };
const HOME = 'http://127.0.0.1:3315';
const ROOT = path.resolve(process.cwd());
const first = 'g7-staging-test-first-password';
const changed = 'g7-staging-test-changed-password';
const userPassword = 'g7-staging-test-editor-password';
let home: string | null = null;
let saved: Record<string, string | undefined> = {};
const keys = [
  'G7_STAGING_ONLY','G7_AUTH_ENABLED','G7_RELEASE_CAPABILITY',
  'G7_OPERATION_APPROVAL','G7_STAGING_ROOT','G7_STAGING_DATABASE_URL',
  'DATABASE_URL','CAD_STORAGE_PATH','G7_STAGING_ORIGIN',
  'G7_CAD_WRITE_CUTOVER_ENABLED',
] as const;
afterEach(() => {
  for (const name of keys) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  if (home) rmSync(home, { recursive: true, force: true });
  home = null;
});
type Endpoint = { params: Promise<{ segments: string[] }> };
function callPath(segment: string): Endpoint {
  return { params: Promise.resolve({ segments: segment.split('/') }) };
}
function send(method: string, segment: string, input?: object,
  cookie?: string, csrf?: string): Request {
  const headers = new Headers({ origin: HOME });
  if (input) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  if (csrf) headers.set('x-csrf-token', csrf);
  return new Request(HOME + '/api/g7-staging/' + segment, {
    method, headers, body: input ? JSON.stringify(input) : undefined,
  });
}
async function startup() {
  saved = Object.fromEntries(keys.map(name => [name, process.env[name]]));
  home = mkdtempSync(path.join(tmpdir(), 'cad-g7-staging-'));
  mkdirSync(path.join(home, 'cad'));
  const filename = path.join(home, 'fixture.sqlite');
  const database = new Sqlite(filename);
  database.close();
  const manifest = {
    scope: 'S1-STAGING-ONLY', schemaId: G7_STAGING_SCHEMA_ID,
    databasePath: filename,
    appDigest: 'sha256:' + 'a'.repeat(64),
    migratorDigest: 'sha256:' + 'b'.repeat(64),
    sourceCommit: 'c'.repeat(40),
  };
  writeFileSync(path.join(home, 'release.json'), JSON.stringify(manifest), { mode: 0o600 });
  Object.assign(process.env, {
    G7_STAGING_ONLY: 'true', G7_AUTH_ENABLED: 'true',
    G7_RELEASE_CAPABILITY: 'G7-S1-STAGING-V1',
    G7_OPERATION_APPROVAL: 'S1-STAGING-ONLY',
    G7_STAGING_ROOT: home, G7_STAGING_DATABASE_URL: 'file:' + filename,
    DATABASE_URL: 'file:' + filename, CAD_STORAGE_PATH: path.join(home, 'cad'),
    G7_STAGING_ORIGIN: HOME, G7_CAD_WRITE_CUTOVER_ENABLED: 'true',
  });
  // Formal Prisma migration against disposable stage; operational config untouched.
  const prismaCli = path.join(ROOT, 'node_modules/prisma/build/index.js');
  const outcome = spawnSync(process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', 'deploy/g7-staging/prisma.config.ts'],
    { cwd: ROOT, env: { ...process.env }, encoding: 'utf8', timeout: 90000 });
  expect(outcome.status, (outcome.stderr || outcome.stdout || '').slice(-1400)).toBe(0);
  const gate = resolveG7StagingGate(process.env);
  expect(gate).not.toBeNull();
  const db = openG7StagingDb(gate!);
  return db;
}

describe('#109 G7 S1 isolated staging integration', () => {
  test('001~014: Prisma, bootstrap, HTTP session, grants, CAD/SHA/Audit, rollback, OFF', async () => {
    const db = await startup();
    const now = Date.now();
    const siteId = randomUUID(), floorId = randomUUID();
    const adminSecret = path.join(home!, 'admin.secret');
    writeFileSync(adminSecret, first, { mode: 0o600, flag: 'wx' });
    const init = await executeAdminSetup({
      ADMIN_BOOTSTRAP_ENABLED: 'true',
      ADMIN_BOOTSTRAP_USERNAME: 'stageadmin',
      ADMIN_BOOTSTRAP_PASSWORD_FILE: adminSecret,
    }, createG2IsolatedStore(db), 'g7s1-bootstrap', now);
    expect(init.kind).toBe('bootstrap');
    const adminId = init.kind === 'bootstrap' ? init.userId : '';
    // Create disposable CAD chain and an Editor fixture, then grant Role/Site
    // via actual staged HTTP admin API, NOT via client role claims.
    const bu = randomUUID(), product = randomUUID(), building = randomUUID();
    db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(bu, 'Test BU');
    db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)')
      .run(product, bu, 'Test Product');
    db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
      .run(siteId, product, 'Staging Site', 'SITE');
    db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
      .run(building, siteId, 'Staging Building');
    db.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)')
      .run(floorId, building, 'Staging Floor');
    const editorId = randomUUID();
    const editorHash = await hashLocalPassword(userPassword);
    db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(editorId, 'stageeditor', editorHash, 'ACTIVE', 0, now, now);
    db.close();
    const denied = await POST(send('POST', 'auth/login',
      { login: 'stageadmin', password: first }), callPath('auth/login'));
    expect(denied.status).toBe(403);
    const initial = await POST(send('POST', 'auth/initial-change',
      { login: 'stageadmin', password: first, newPassword: changed }), callPath('auth/initial-change'));
    expect(initial.status).toBe(200);
    const adminLogin = await POST(send('POST', 'auth/login',
      { login: 'stageadmin', password: changed }), callPath('auth/login'));
    expect(adminLogin.status).toBe(200);
    const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
    const adminCSRF = (await adminLogin.json()).csrfToken as string;
    expect(adminCookie).toContain('cad_session=');
    expect(adminCSRF).toBeTruthy();
    const roleGrant = await POST(send('POST', 'access/grant', {
      kind: 'role', operation: 'grant', affectedUserId: editorId, value: 'Editor',
    }, adminCookie, adminCSRF), callPath('access/grant'));
    expect(roleGrant.status).toBe(200);
    const siteGrant = await POST(send('POST', 'access/grant', {
      kind: 'site', operation: 'grant', affectedUserId: editorId, value: siteId,
    }, adminCookie, adminCSRF), callPath('access/grant'));
    expect(siteGrant.status).toBe(200);
    const editorLogin = await POST(send('POST', 'auth/login',
      { login: 'stageeditor', password: userPassword }), callPath('auth/login'));
    expect(editorLogin.status).toBe(200);
    const editorCookie = editorLogin.headers.get('set-cookie')?.split(';')[0];
    const editorCSRF = (await editorLogin.json()).csrfToken as string;
    const data = Buffer.from('0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n');
    const upload = await POST(send('POST', 'cad/upload', {
      siteId, locationId: floorId, originalFilename: 'smoke.dxf',
      dxfBase64: data.toString('base64'), deletePassword: 'staging-delete-only',
      makeCurrent: false,
    }, editorCookie, editorCSRF), callPath('cad/upload'));
    expect(upload.status, await upload.clone().text()).toBe(201);
    const created = await upload.json() as { id: string; sha256: string };
    const content = await GET(new Request(HOME+'/api/g7-staging/cad/content?versionId='+created.id),
      callPath('cad/content'));
    expect(Buffer.from(await content.arrayBuffer())).toEqual(data);
    const anonList = await GET(new Request(HOME+'/api/g7-staging/cad/list'), callPath('cad/list'));
    expect(anonList.status).toBe(200);
    expect(JSON.stringify(await anonList.json())).toContain(created.id);
    const current = await PUT(send('PUT', 'cad/current', {
      locationId: floorId, versionId: created.id,
    }, editorCookie, editorCSRF), callPath('cad/current'));
    expect(current.status).toBe(200);
    const badDelete = await DELETE(send('DELETE', 'cad/version', {
      versionId: created.id, password: 'invalid-password',
    }, editorCookie, editorCSRF), callPath('cad/version'));
    expect(badDelete.status).toBe(403);
    const snapshot = path.join(home!, 'snapshot.sqlite');
    const dbAfter = openG7StagingDb(resolveG7StagingGate(process.env)!);
    await dbAfter.backup(snapshot);
    const before = dbAfter.prepare('SELECT id,sha256 FROM "CadFileVersion" WHERE id=?').get(created.id);
    expect(before?.sha256).toBe(created.sha256);
    dbAfter.close();
    const deletion = await DELETE(send('DELETE', 'cad/version', {
      versionId: created.id, password: 'staging-delete-only',
    }, editorCookie, editorCSRF), callPath('cad/version'));
    expect(deletion.status, await deletion.clone().text()).toBe(200);
    const after = openG7StagingDb(resolveG7StagingGate(process.env)!);
    expect(after.prepare('SELECT id FROM "CadFileVersion" WHERE id=?').get(created.id)).toBeUndefined();
    expect(Number(after.prepare('SELECT COUNT(*) n FROM "AuditEvent" WHERE action=?').get('CAD_VERSION_DELETED')?.n)).toBe(1);
    expect(after.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
    after.close();
    copyFileSync(snapshot, path.join(home!, 'fixture.sqlite'));
    const restored = openG7StagingDb(resolveG7StagingGate(process.env)!);
    expect(restored.prepare('SELECT sha256 FROM "CadFileVersion" WHERE id=?').get(created.id)?.sha256)
      .toBe(created.sha256);
    expect(restored.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
    expect(adminId).toBeTruthy();
    restored.close();
    process.env.G7_AUTH_ENABLED = 'false';
    expect((await GET(new Request(HOME+'/api/g7-staging/cad/list'), callPath('cad/list'))).status)
      .toBe(404);
  }, 120000);
});
