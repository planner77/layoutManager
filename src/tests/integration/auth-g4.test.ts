import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { migrate } from '../helpers/database';
import { applyG1Fixture, issueG1Session, openG1Fixture, seedFixtureUser,
  type IsolatedDb } from '../fixtures/auth-g1/store';
import { applyG4Fixture, createG4IsolatedStore } from '../fixtures/auth-g4/store';
import { createG4Service, handleG4Request } from '../../server/auth/g4-service';
import { csrfProof } from '../../server/auth/login-service';
import { auditRetentionCutoff } from '../../server/auth/audit';

const NOW = 1_793_000_000_000;
const ORIGIN = 'http://viewer.internal';
let directory: string;
let filename: string;
let db: IsolatedDb;
let service: ReturnType<typeof createG4Service>;
let tokens: Record<string, string>;
const ctx = (id: string, now = NOW + 10) => ({ now, requestId: id });
const v = (site: string) => ({ kind: 'version' as const, versionId: 'version-' + site });
const global = { kind: 'global' as const };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function cadRows() {
  return ['BusinessUnit', 'Product', 'CadSite', 'Building', 'CadLocation', 'CadFileVersion']
    .map(table => db.prepare('SELECT * FROM "' + table + '" ORDER BY id').all());
}
function seedCad() {
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu-a', 'Plant');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)')
    .run('product-a', 'bu-a', 'Product');
  for (const site of ['a', 'b']) {
    db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
      .run('site-' + site, 'product-a', 'Site', 'SITE');
    db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
      .run('building-' + site, 'site-' + site, 'B');
    db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,1)')
      .run('floor-' + site, 'building-' + site, 'F1');
    db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)')
      .run('version-' + site, 'floor-' + site, 'fixture.dxf', 'fixture',
        'scrypt$synthetic-delete-hash', 'DXF', 6, hash('DXF!!!'), 'storage/' + site + '.dxf', '2026-10-26');
    db.prepare('UPDATE "CadLocation" SET current_version_id=?,next_version=2 WHERE id=?')
      .run('version-' + site, 'floor-' + site);
  }
}
function seedAccount(id: string, role: 'Reader' | 'Editor' | 'Admin') {
  seedFixtureUser(db, id, id.replace('-', '_'), NOW, role === 'Admin');
  if (role !== 'Admin') {
    db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)')
      .run(id, role, NOW);
  }
}
function grantSite(id: string, site: string) {
  db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
    .run(id, site, NOW);
}
function count(table: 'AuditEvent' | 'UserSiteGrant' | 'UserRoleGrant' | 'G4ShadowOutline') {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM "' + table + '"').get()?.n);
}
async function request(action: Parameters<typeof handleG4Request>[0],
  token: string | null, input: object, opts: { csrf?: string; origin?: string } = {}) {
  const headers = new Headers({
    origin: opts.origin ?? ORIGIN,
    'x-csrf-token': opts.csrf ?? (token ? csrfProof(token) : ''),
    'x-role': 'Admin', 'x-user': 'admin-a',
  });
  if (token) headers.set('cookie', 'cad_session=' + token);
  return handleG4Request(action, new Request(ORIGIN + '/isolated-g4', {
    method: 'POST', headers, body: JSON.stringify(input),
  }), service, { ...ctx('http-request'), trustedOrigin: ORIGIN });
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'cad-auth-g1-'));
  filename = path.join(directory, 'fixture.sqlite');
  await migrate(filename);
  db = openG1Fixture(filename);
  seedCad();
  applyG1Fixture(db);
  applyG4Fixture(db);
  seedAccount('admin-a', 'Admin');
  seedAccount('editor-a', 'Editor');
  seedAccount('reader-a', 'Reader');
  seedAccount('editor-b', 'Editor');
  grantSite('editor-a', 'site-a');
  grantSite('reader-a', 'site-a');
  grantSite('editor-b', 'site-b');
  tokens = Object.fromEntries(['admin-a', 'editor-a', 'reader-a', 'editor-b']
    .map(id => [id, issueG1Session(db, id, NOW).rawToken]));
  service = createG4Service(createG4IsolatedStore(db));
});
afterEach(async () => { db.close(); await rm(directory, { recursive: true, force: true }); });

describe('#106 G4 isolated authorization, grants and audit', () => {
  test('TC-P4-G4-001: Reader/Editor/Admin Site-Version matrix; no implicit Admin Site', () => {
    const source = cadRows();
    expect(service.permit(tokens['reader-a'], 'outline:read', v('a'), ctx('r-a')))
      .toEqual({ siteId: 'site-a' });
    for (const action of ['cad:upload', 'cad:current', 'cad:delete', 'outline:write'] as const) {
      expect(() => service.permit(tokens['reader-a'], action, v('a'), ctx('reader-deny')))
        .toThrow(expect.objectContaining({ status: 403 }));
      expect(service.permit(tokens['editor-a'], action, v('a'), ctx('editor-allow')))
        .toEqual({ siteId: 'site-a' });
      expect(() => service.permit(tokens['editor-a'], action, v('b'), ctx('cross-site')))
        .toThrow(expect.objectContaining({ status: 403 }));
      expect(() => service.permit(tokens['admin-a'], action, v('a'), ctx('admin-no-site')))
        .toThrow(expect.objectContaining({ status: 403 }));
    }
    expect(service.permit(tokens['admin-a'], 'grants:manage', global, ctx('admin-global')))
      .toEqual({ siteId: null });
    expect(() => service.permit(tokens['editor-b'], 'outline:read', v('unknown'), ctx('unknown')))
      .toThrow(expect.objectContaining({ status: 403 }));
    expect(() => service.permit(null, 'grants:manage', global, ctx('anonymous')))
      .toThrow(expect.objectContaining({ status: 401 }));
    expect(cadRows()).toEqual(source);
  });

  test('TC-P4-G4-002: Admin grants/revokes Site and Role; stale actor grants have no effect', () => {
    const admin = tokens['admin-a'];
    const reader = tokens['reader-a'];
    const change = { kind: 'site' as const, operation: 'grant' as const,
      affectedUserId: 'reader-a', value: 'site-b' };
    expect(() => service.permit(reader, 'outline:read', v('b'), ctx('before-grant')))
      .toThrow(expect.objectContaining({ status: 403 }));
    expect(() => service.grant(tokens['editor-a'], change, ctx('not-admin')))
      .toThrow(expect.objectContaining({ status: 403 }));
    service.grant(admin, change, ctx('grant-site'));
    expect(service.permit(reader, 'outline:read', v('b'), ctx('after-grant')))
      .toEqual({ siteId: 'site-b' });
    expect(() => service.grant(admin, change, ctx('duplicate-site')))
      .toThrow(expect.objectContaining({ status: 409 }));
    service.grant(admin, { ...change, operation: 'revoke' }, ctx('revoke-site'));
    expect(() => service.permit(reader, 'outline:read', v('b'), ctx('after-revoke')))
      .toThrow(expect.objectContaining({ status: 403 }));
    service.grant(admin, { kind: 'role', operation: 'grant',
      affectedUserId: 'reader-a', value: 'Editor' }, ctx('grant-editor'));
    expect(service.permit(reader, 'cad:upload', v('a'), ctx('after-role')))
      .toEqual({ siteId: 'site-a' });
    service.grant(admin, { kind: 'role', operation: 'revoke',
      affectedUserId: 'reader-a', value: 'Editor' }, ctx('revoke-editor'));
    expect(() => service.permit(reader, 'cad:upload', v('a'), ctx('after-role-revoke')))
      .toThrow(expect.objectContaining({ status: 403 }));
    const rows = db.prepare("SELECT actor_user_id,affected_user_id,site_id,action FROM \"AuditEvent\" WHERE action LIKE 'SITE_%' ORDER BY timestamp_utc").all();
    expect(rows).toEqual([
      expect.objectContaining({ actor_user_id: 'admin-a', affected_user_id: 'reader-a',
        site_id: 'site-b', action: 'SITE_GRANTED' }),
      expect.objectContaining({ actor_user_id: 'admin-a', affected_user_id: 'reader-a',
        site_id: 'site-b', action: 'SITE_REVOKED' }),
    ]);
  });

  test('TC-P4-G4-003: audit:read and logs:read are independent Admin-only grants', () => {
    const admin = tokens['admin-a'];
    const grant = (who: string, permission: string) => service.grant(admin, {
      kind: 'special', operation: 'grant', affectedUserId: who, value: permission,
    }, ctx('grant-special'));
    expect(() => service.audit(admin, 20, ctx('no-audit-grant')))
      .toThrow(expect.objectContaining({ status: 403 }));
    grant('admin-a', 'audit:read');
    expect(service.audit(admin, 20, ctx('audit-access')).some(item =>
      item.action === 'ROLE_GRANTED')).toBe(true);
    expect(() => service.permit(admin, 'logs:read', global, ctx('no-log-grant')))
      .toThrow(expect.objectContaining({ status: 403 }));
    grant('admin-a', 'logs:read');
    expect(service.permit(admin, 'logs:read', global, ctx('log-access')))
      .toEqual({ siteId: null });
    grant('reader-a', 'audit:read');
    expect(() => service.audit(tokens['reader-a'], 20, ctx('reader-audit')))
      .toThrow(expect.objectContaining({ status: 403 }));
    service.grant(admin, { kind: 'special', operation: 'revoke',
      affectedUserId: 'admin-a', value: 'audit:read' }, ctx('revoke-audit'));
    expect(() => service.audit(admin, 20, ctx('after-audit-revoke')))
      .toThrow(expect.objectContaining({ status: 403 }));
    expect(service.permit(admin, 'logs:read', global, ctx('still-logs')))
      .toEqual({ siteId: null });
  });

  test('TC-P4-G4-004: two SQLite connections serialize grant Unique/lock; no phantom commit', () => {
    const otherDb = openG1Fixture(filename);
    try {
      const other = createG4Service(createG4IsolatedStore(otherDb));
      const change = { kind: 'site' as const, operation: 'grant' as const,
        affectedUserId: 'editor-b', value: 'site-a' };
      db.exec('BEGIN IMMEDIATE');
      try {
        expect(() => other.grant(tokens['admin-a'], change, ctx('locked')))
          .toThrow(expect.objectContaining({ status: 503 }));
      } finally { db.exec('ROLLBACK'); }
      expect(db.prepare("SELECT * FROM \"UserSiteGrant\" WHERE user_id='editor-b' AND site_id='site-a'").get())
        .toBeUndefined();
      service.grant(tokens['admin-a'], change, ctx('first'));
      expect(() => other.grant(tokens['admin-a'], change, ctx('second')))
        .toThrow(expect.objectContaining({ status: 409 }));
      expect(db.prepare("SELECT COUNT(*) AS n FROM \"UserSiteGrant\" WHERE user_id='editor-b' AND site_id='site-a'").get()?.n).toBe(1);
    } finally { otherDb.close(); }
  });

  test('TC-P4-G4-005: outline create/edit/delete audit with revision CAS and creator immutable', () => {
    const editor = tokens['editor-a'];
    const source = cadRows();
    const created = service.outline(editor, { operation: 'create', versionId: 'version-a' }, ctx('created'));
    expect(created).toMatchObject({ revision: 1, deleted: false });
    expect(db.prepare('SELECT created_by,updated_by FROM "G4ShadowOutline" WHERE id=?').get(created.id))
      .toMatchObject({ created_by: 'editor-a', updated_by: 'editor-a' });
    const edited = service.outline(editor, { operation: 'edit', versionId: 'version-a',
      outlineId: created.id, expectedRevision: 1 }, ctx('edited'));
    expect(edited).toEqual({ id: created.id, revision: 2, deleted: false });
    expect(() => service.outline(editor, { operation: 'edit', versionId: 'version-a',
      outlineId: created.id, expectedRevision: 1 }, ctx('stale')))
      .toThrow(expect.objectContaining({ status: 409 }));
    expect(() => service.outline(tokens['editor-b'], { operation: 'delete',
      versionId: 'version-a', outlineId: created.id, expectedRevision: 2 }, ctx('cross-site-delete')))
      .toThrow(expect.objectContaining({ status: 403 }));
    const deleted = service.outline(editor, { operation: 'delete', versionId: 'version-a',
      outlineId: created.id, expectedRevision: 2 }, ctx('deleted'));
    expect(deleted).toEqual({ id: created.id, revision: 3, deleted: true });
    expect(db.prepare('SELECT created_by,revision,state FROM "G4ShadowOutline" WHERE id=?')
      .get(created.id)).toMatchObject({ created_by: 'editor-a', revision: 3, state: 'DELETED' });
    expect(db.prepare('SELECT action,before_revision,after_revision FROM "AuditEvent" WHERE target_id=? ORDER BY rowid')
      .all(created.id)).toEqual([
      { action: 'OUTLINE_CREATED', before_revision: null, after_revision: 1 },
      { action: 'OUTLINE_EDITED', before_revision: 1, after_revision: 2 },
      { action: 'OUTLINE_DELETED', before_revision: 2, after_revision: 3 },
    ]);
    expect(cadRows()).toEqual(source);
  });

  test('TC-P4-G4-006: failure injected into Audit rolls back grants, disabled state and outline', () => {
    const faulty = createG4Service(createG4IsolatedStore(db, { audit: true }));
    const before = count('AuditEvent');
    expect(() => faulty.grant(tokens['admin-a'], { kind: 'site', operation: 'grant',
      affectedUserId: 'editor-b', value: 'site-a' }, ctx('audit-fail-grant')))
      .toThrow(expect.objectContaining({ status: 503 }));
    expect(count('UserSiteGrant')).toBe(3);
    expect(() => faulty.disable(tokens['admin-a'], 'reader-a', ctx('audit-fail-disable')))
      .toThrow(expect.objectContaining({ status: 503 }));
    expect(db.prepare('SELECT status FROM "User" WHERE id=?').get('reader-a')?.status).toBe('ACTIVE');
    expect(() => faulty.outline(tokens['editor-a'], { operation: 'create',
      versionId: 'version-a' }, ctx('audit-fail-outline')))
      .toThrow(expect.objectContaining({ status: 503 }));
    expect(count('G4ShadowOutline')).toBe(0);
    expect(count('AuditEvent')).toBe(before);
  });

  test('TC-P4-G4-007: disable revokes sessions atomically; last Admin cannot self-disable', () => {
    const admin = tokens['admin-a'], reader = tokens['reader-a'];
    expect(() => service.disable(admin, 'admin-a', ctx('last-admin')))
      .toThrow(expect.objectContaining({ status: 409 }));
    service.disable(admin, 'reader-a', ctx('disable-reader'));
    expect(db.prepare('SELECT status FROM "User" WHERE id=?').get('reader-a')?.status)
      .toBe('DISABLED');
    expect(() => service.permit(reader, 'outline:read', v('a'), ctx('disabled-session')))
      .toThrow(expect.objectContaining({ status: 401 }));
    expect(db.prepare("SELECT revoked_at FROM \"AuthSession\" WHERE user_id='reader-a'").get()?.revoked_at)
      .toBe(ctx('disable-reader').now);
    expect(db.prepare("SELECT action,actor_user_id,affected_user_id FROM \"AuditEvent\" WHERE action='ACCOUNT_DISABLED'").get())
      .toMatchObject({ action: 'ACCOUNT_DISABLED', actor_user_id: 'admin-a', affected_user_id: 'reader-a' });
  });

  test('TC-P4-G4-008: normal Origin/CSRF and client claim rejection with 401/403 distinction', async () => {
    const input = { action: 'cad:upload', resource: v('a'), userId: 'admin-a',
      role: 'Admin', siteGrants: ['site-b'], password: 'never-in-an-audit-log' };
    const unauth = await request('permit', null, input);
    expect(unauth.status).toBe(401);
    expect((await request('permit', tokens['reader-a'], input)).status).toBe(403);
    expect((await request('permit', tokens['editor-a'], input,
      { csrf: 'bad-csrf' })).status).toBe(403);
    expect((await request('permit', tokens['editor-a'], input,
      { origin: 'http://untrusted.example' })).status).toBe(403);
    expect((await request('permit', tokens['editor-a'], input)).status).toBe(200);
    const ledger = JSON.stringify(db.prepare('SELECT * FROM "AuditEvent"').all());
    expect(ledger).not.toContain('never-in-an-audit-log');
    expect(ledger).not.toContain(tokens['editor-a']);
    expect(db.prepare("SELECT COUNT(*) AS n FROM \"AuditEvent\" WHERE action='AUTHORIZATION_DENIED'").get()?.n)
      .toBeGreaterThan(0);
  });

  test('TC-P4-G4-009: append-only FK, safe UTC, 365-day boundary, no automatic purge', () => {
    const before = cadRows();
    service.grant(tokens['admin-a'], { kind: 'site', operation: 'grant',
      affectedUserId: 'reader-a', value: 'site-b' }, ctx('utc-grant'));
    const audit = db.prepare("SELECT * FROM \"AuditEvent\" WHERE request_id='utc-grant'").get()!;
    expect(audit.timestamp_utc).toBe(new Date(ctx('utc-grant').now).toISOString());
    expect(audit.affected_user_id).toBe('reader-a');
    expect(audit.site_id).toBe('site-b');
    expect(() => db.prepare("UPDATE \"AuditEvent\" SET outcome='FAILED' WHERE request_id='utc-grant'").run())
      .toThrow('G1_AUDIT_APPEND_ONLY');
    expect(() => db.prepare("DELETE FROM \"AuditEvent\" WHERE request_id='utc-grant'").run())
      .toThrow('G1_AUDIT_APPEND_ONLY');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const cutoff = auditRetentionCutoff(new Date(NOW));
    expect(cutoff.toISOString()).toBe(new Date(NOW - 365 * 86400_000).toISOString());
    expect(count('AuditEvent')).toBeGreaterThan(0);
    expect(cadRows()).toEqual(before);
    expect(readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8'))
      .not.toContain('model G4ShadowOutline');
  });
});
