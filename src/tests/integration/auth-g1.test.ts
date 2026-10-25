import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile, copyFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrate } from '../helpers/database';
import { requirePermission, type UserAccess } from '../../domain/auth';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '../../server/auth/session';
import {
  applyG1Fixture, changeG1SiteGrant, changeG1RoleGrant, changeG1SpecialGrant, consumeG1Recovery, disableG1User,
  fixtureCount, issueG1Session, changeG1Password, openG1Fixture, resolveG1VersionSite,
  seedFixtureUser, type IsolatedDb,
} from '../fixtures/auth-g1/store';

const NOW = 1_793_000_000_000;
let directory: string;
let filename: string;
let db: IsolatedDb;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const FIXTURE_DXF = '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n';

function seedCad(): void {
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu-a', 'Plant');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('product-a', 'bu-a', 'Material Control');
  for (const site of ['site-a','site-b']) {
    db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
      .run(site, 'product-a', site, 'SITE');
    db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
      .run('building-' + site, site, 'Building');
    db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,1)')
      .run('floor-' + site, 'building-' + site, 'F1');
    const id = 'version-' + site;
    db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)')
      .run(id, 'floor-' + site, 'cad.dxf', 'fixture', 'scrypt$synthetic-delete-hash',
        'DXF', Buffer.byteLength(FIXTURE_DXF, 'utf8'), hash(FIXTURE_DXF), 'storage/' + site + '.dxf', '2026-10-25');
    db.prepare('UPDATE "CadLocation" SET current_version_id=?,next_version=2 WHERE id=?')
      .run(id, 'floor-' + site);
  }
}
function cadSnapshot() {
  const tables = ['BusinessUnit','Product','CadSite','Building','CadLocation','CadFileVersion','CadDeletionJob'];
  return tables.map(table => ({
    table,
    rows: db.prepare('SELECT * FROM "' + table + '" ORDER BY id').all(),
  }));
}
const fkViolations = () => db.prepare('PRAGMA foreign_key_check').all();

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'cad-auth-g1-'));
  filename = path.join(directory, 'fixture.sqlite');
  // Reproduce the actual six existing migrations, not a mocked CAD schema.
  await migrate(filename);
  db = openG1Fixture(filename);
  seedCad();
});
afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

describe('Issue #103 G1 isolated persistence contract', () => {
  test('TC-P4-G1-001: actual CAD migration baseline, additive G1 DDL, FK and rollback', () => {
    const before = cadSnapshot();
    expect(() => applyG1Fixture(db, true)).toThrow('G1_INJECTED_MIGRATION_FAILURE');
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='User'").get()).toBeUndefined();
    expect(cadSnapshot()).toEqual(before);
    applyG1Fixture(db);
    expect(fkViolations()).toEqual([]);
    expect(cadSnapshot()).toEqual(before);
    expect(() => applyG1Fixture(db)).toThrow(); // no silent duplicate migration
    expect(() => openG1Fixture('/data/production.sqlite')).toThrow('G1_FIXTURE_PATH_REQUIRED');
    const contract = readFileSync(new URL('../fixtures/auth-g1/schema.prisma', import.meta.url), 'utf8');
    for (const model of ['User','AuthSession','UserRoleGrant','UserSiteGrant','SpecialGrant','AuditEvent','AdminRecoveryNonce']) {
      expect(contract).toContain('model ' + model + ' {');
    }
    // The currently shipped Prisma schema must not be altered by G1.
    const current = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    expect(current).not.toContain('model AuthSession {');
  });

  test('TC-P4-G1-002: unique login, grant FK, role/special permission boundaries, immutable user ID', () => {
    applyG1Fixture(db);
    seedFixtureUser(db, 'user-a', 'user_a', NOW);
    expect(() => seedFixtureUser(db, 'user-b', 'user_a', NOW)).toThrow();
    expect(() => seedFixtureUser(db, 'user-c', 'User_C', NOW)).toThrow(); // normalized lowercase only
    expect(() => db.prepare("UPDATE \"User\" SET id='renamed' WHERE id='user-a'").run()).toThrow();
    expect(() => db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
      .run('user-a', 'missing-site', NOW)).toThrow();
    expect(() => db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)')
      .run('user-a', 'SuperUser', NOW)).toThrow();
    db.prepare('INSERT INTO "SpecialGrant"(user_id,permission,granted_at) VALUES(?,?,?)')
      .run('user-a', 'audit:read', NOW);
    expect(() => db.prepare('INSERT INTO "SpecialGrant"(user_id,permission,granted_at) VALUES(?,?,?)')
      .run('user-a', 'audit:read', NOW)).toThrow();
    expect(() => db.prepare('INSERT INTO "SpecialGrant"(user_id,permission,granted_at) VALUES(?,?,?)')
      .run('user-a', 'logs:write', NOW)).toThrow();
    expect(fkViolations()).toEqual([]);
  });

  test('TC-P4-G1-003: atomic 3-session cap, fourth denied by adapter and raw SQL trigger', () => {
    applyG1Fixture(db);
    seedFixtureUser(db, 'user-a', 'user_a', NOW);
    const candidates = [0,1,2].map(i => issueG1Session(db, 'user-a', NOW + i));
    expect(fixtureCount(db, 'AuthSession')).toBe(3);
    const stored = JSON.stringify(db.prepare('SELECT * FROM "AuthSession"').all());
    expect(stored).not.toContain(candidates[0].rawToken);
    expect(stored).toContain(candidates[0].session.tokenHash);
    expect(candidates[0].session.expiresAt - candidates[0].session.issuedAt).toBe(SESSION_ABSOLUTE_MS);
    expect(() => issueG1Session(db, 'user-a', NOW + 3)).toThrow('G1_SESSION_CAP');
    expect(() => db.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?)')
      .run('direct-4', 'user-a', hash('direct4'), NOW + 3, NOW + 3, NOW + 3 + SESSION_ABSOLUTE_MS)).toThrow('G1_SESSION_CAP');
    expect(fixtureCount(db, 'AuthSession')).toBe(3);
    expect(() => db.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?)')
      .run('old-clock', 'user-a', hash('old-clock'), NOW - 1, NOW - 1, NOW - 1 + SESSION_ABSOLUTE_MS))
      .toThrow('G1_CLOCK_ROLLBACK');
    expect(() => db.prepare('UPDATE "AuthSession" SET last_seen_at=? WHERE id=?')
      .run(NOW + SESSION_IDLE_MS, candidates[0].session.id)).toThrow('G1_SESSION_IMMUTABLE_OR_EXPIRED');
    expect(() => issueG1Session(db, 'user-a', NOW + SESSION_IDLE_MS + 3, true))
      .toThrow('G1_INJECTED_SESSION_FAILURE');
    expect(fixtureCount(db, 'AuthSession')).toBe(3);
    issueG1Session(db, 'user-a', NOW + SESSION_IDLE_MS + 3); // idle sessions no longer count
    expect(fixtureCount(db, 'AuthSession')).toBe(4); // history preserved, only one active
  });

  test('TC-P4-G1-004: competing SQLite writers fail closed while BEGIN IMMEDIATE lock is held', () => {
    applyG1Fixture(db);
    seedFixtureUser(db, 'user-a', 'user_a', NOW);
    const other = openG1Fixture(filename);
    db.exec('BEGIN IMMEDIATE');
    try {
      expect(() => issueG1Session(other, 'user-a', NOW)).toThrow(/locked|busy/i);
    } finally {
      db.exec('ROLLBACK');
      other.close();
    }
    expect(fixtureCount(db, 'AuthSession')).toBe(0);
    issueG1Session(db, 'user-a', NOW);
    expect(fixtureCount(db, 'AuthSession')).toBe(1);
  });

  test('TC-P4-G1-005: site grant + audit all-or-nothing, duplicate and unauthorized denied', () => {
    applyG1Fixture(db);
    seedFixtureUser(db, 'admin-a', 'admin_a', NOW, true);
    seedFixtureUser(db, 'reader-a', 'reader_a', NOW);
    expect(() => changeG1SiteGrant(db, 'reader-a', 'reader-a', 'site-a', true, NOW, 'req-unauthorized'))
      .toThrow('G1_ADMIN_REQUIRED');
    expect(() => changeG1SiteGrant(db, 'admin-a', 'reader-a', 'site-a', true, NOW, 'req-fault', true))
      .toThrow('G1_INJECTED_GRANT_FAILURE');
    expect(fixtureCount(db, 'UserSiteGrant')).toBe(0);
    expect(fixtureCount(db, 'AuditEvent')).toBe(0);
    changeG1SiteGrant(db, 'admin-a', 'reader-a', 'site-a', true, NOW, 'req-1');
    expect(fixtureCount(db, 'UserSiteGrant')).toBe(1);
    expect(fixtureCount(db, 'AuditEvent')).toBe(1);
    expect(() => changeG1SiteGrant(db, 'admin-a', 'reader-a', 'site-a', true, NOW, 'req-duplicate'))
      .toThrow();
    expect(fixtureCount(db, 'AuditEvent')).toBe(1);
    expect(() => changeG1SiteGrant(db, 'admin-a', 'reader-a', 'site-a', false, NOW, 'req-revoke-fault', true))
      .toThrow();
    expect(fixtureCount(db, 'UserSiteGrant')).toBe(1);
    changeG1SiteGrant(db, 'admin-a', 'reader-a', 'site-a', false, NOW, 'req-2');
    expect(fixtureCount(db, 'UserSiteGrant')).toBe(0);
    expect(fixtureCount(db, 'AuditEvent')).toBe(2);
    const firstSiteAudit = db.prepare(
      "SELECT actor_user_id,affected_user_id,site_id,action FROM \"AuditEvent\" WHERE action IN ('SITE_GRANTED','SITE_REVOKED') ORDER BY request_id",
    ).all();
    expect(firstSiteAudit).toEqual([
      { actor_user_id: 'admin-a', affected_user_id: 'reader-a', site_id: 'site-a', action: 'SITE_GRANTED' },
      { actor_user_id: 'admin-a', affected_user_id: 'reader-a', site_id: 'site-a', action: 'SITE_REVOKED' },
    ]);
    // The grant has been deleted; its user/site association must remain in immutable audit rows.
    expect(() => db.prepare(
      'INSERT INTO "AuditEvent"(id,action,affected_user_id,site_id,actor_user_id,target_kind,target_id,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ).run('invalid-site-audit', 'SITE_GRANTED', null, 'site-a', 'admin-a', 'SITE', 'site-a',
      'SUCCESS', new Date(NOW).toISOString(), 'missing-affected-user')).toThrow();
    expect(() => changeG1RoleGrant(db, 'admin-a', 'reader-a', 'Reader', true, NOW, 'req-role-fail', true)).toThrow();
    expect(fixtureCount(db, 'UserRoleGrant')).toBe(1); // seeded Admin only
    changeG1RoleGrant(db, 'admin-a', 'reader-a', 'Reader', true, NOW, 'req-role');
    changeG1SpecialGrant(db, 'admin-a', 'reader-a', 'audit:read', true, NOW, 'req-audit');
    changeG1SpecialGrant(db, 'admin-a', 'reader-a', 'logs:read', true, NOW, 'req-logs');
    expect(fixtureCount(db, 'SpecialGrant')).toBe(2);
    expect(fixtureCount(db, 'AuditEvent')).toBe(5);
    seedFixtureUser(db, 'reader-b', 'reader_b', NOW);
    changeG1SiteGrant(db, 'admin-a', 'reader-b', 'site-a', true, NOW, 'req-b-grant');
    changeG1SiteGrant(db, 'admin-a', 'reader-b', 'site-a', false, NOW, 'req-b-revoke');
    const secondSiteAudit = db.prepare(
      "SELECT actor_user_id,affected_user_id,site_id,action FROM \"AuditEvent\" WHERE request_id LIKE 'req-b-%' ORDER BY request_id",
    ).all();
    expect(secondSiteAudit).toEqual([
      { actor_user_id: 'admin-a', affected_user_id: 'reader-b', site_id: 'site-a', action: 'SITE_GRANTED' },
      { actor_user_id: 'admin-a', affected_user_id: 'reader-b', site_id: 'site-a', action: 'SITE_REVOKED' },
    ]);
    expect(fixtureCount(db, 'AuditEvent')).toBe(7);
    expect(() => db.prepare("UPDATE \"AuditEvent\" SET outcome='FAILED'").run()).toThrow('G1_AUDIT_APPEND_ONLY');
    expect(() => db.prepare('DELETE FROM "AuditEvent"').run()).toThrow('G1_AUDIT_APPEND_ONLY');
  });

  test('TC-P4-G1-006: Version→Floor→Building→Site authoritative FK grant, no global Admin bypass', async () => {
    applyG1Fixture(db);
    seedFixtureUser(db, 'reader-a', 'reader_a', NOW);
    db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)')
      .run('reader-a', 'Reader', NOW);
    db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
      .run('reader-a', 'site-a', NOW);
    const user: UserAccess = {
      id: 'reader-a', status: 'ACTIVE', mustChangePassword: false,
      roles: ['Reader'], siteGrants: db.prepare('SELECT site_id FROM "UserSiteGrant" WHERE user_id=?').all('reader-a')
        .map(row => String(row.site_id)), specialGrants: [],
    };
    const resolve = async (id: string) => resolveG1VersionSite(db, id);
    await expect(requirePermission(user, 'cad:read', {kind:'version',versionId:'version-site-a'}, resolve))
      .resolves.toEqual({siteId:'site-a'});
    for (const id of ['version-site-b','not-found']) {
      await expect(requirePermission(user, 'cad:read', {kind:'version',versionId:id}, resolve))
        .rejects.toMatchObject({code:'ACCESS_DENIED'});
    }
    await expect(requirePermission({...user, roles:['Admin']}, 'cad:read',
      {kind:'version',versionId:'version-site-b'}, resolve)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect(fkViolations()).toEqual([]);
  });

  test('TC-P4-G1-007: disable/revoke is atomic; disabled user cannot issue another session', () => {
    applyG1Fixture(db);
    seedFixtureUser(db, 'admin-a', 'admin_a', NOW, true);
    seedFixtureUser(db, 'reader-a', 'reader_a', NOW);
    issueG1Session(db, 'reader-a', NOW);
    expect(() => disableG1User(db, 'admin-a', 'reader-a', NOW + 100, 'req-fail', true)).toThrow();
    expect(db.prepare('SELECT status FROM "User" WHERE id=?').get('reader-a')?.status).toBe('ACTIVE');
    expect(db.prepare('SELECT revoked_at FROM "AuthSession" WHERE user_id=?').get('reader-a')?.revoked_at).toBeNull();
    disableG1User(db, 'admin-a', 'reader-a', NOW + 100, 'req-ok');
    expect(db.prepare('SELECT status FROM "User" WHERE id=?').get('reader-a')?.status).toBe('DISABLED');
    expect(db.prepare('SELECT revoked_at FROM "AuthSession" WHERE user_id=?').get('reader-a')?.revoked_at).toBe(NOW + 100);
    expect(() => issueG1Session(db, 'reader-a', NOW + 101)).toThrow('G1_ACCOUNT_INELIGIBLE');
    expect(fixtureCount(db, 'AuditEvent')).toBe(1);
    seedFixtureUser(db, 'reader-b', 'reader_b', NOW);
    issueG1Session(db, 'reader-b', NOW);
    expect(() => changeG1Password(db, 'reader-b', 'reader-b', 'scrypt$new', NOW + 100, 'pwd-fault', true))
      .toThrow('G1_INJECTED_PASSWORD_FAILURE');
    expect(db.prepare('SELECT revoked_at FROM "AuthSession" WHERE user_id=?').get('reader-b')?.revoked_at).toBeNull();
    changeG1Password(db, 'reader-b', 'reader-b', 'scrypt$new', NOW + 100, 'pwd-ok');
    expect(db.prepare('SELECT password_hash FROM "User" WHERE id=?').get('reader-b')?.password_hash).toBe('scrypt$new');
    expect(db.prepare('SELECT revoked_at FROM "AuthSession" WHERE user_id=?').get('reader-b')?.revoked_at).toBe(NOW + 100);
    expect(fixtureCount(db, 'AuditEvent')).toBe(2);
  });

  test('TC-P4-G1-008: recovery nonce consumption + password change + revoke + audit rollback/one-use', () => {
    applyG1Fixture(db);
    seedFixtureUser(db, 'admin-a', 'admin_a', NOW, true);
    issueG1Session(db, 'admin-a', NOW);
    const nonce = 'one_time_nonce_12345678';
    const oldHash = db.prepare('SELECT password_hash FROM "User" WHERE id=?').get('admin-a')?.password_hash;
    expect(() => consumeG1Recovery(db, 'admin-a', nonce, 'scrypt$new-hash', NOW + 100, 'req-fault', true))
      .toThrow('G1_INJECTED_RECOVERY_FAILURE');
    expect(fixtureCount(db, 'AdminRecoveryNonce')).toBe(0);
    expect(db.prepare('SELECT password_hash FROM "User" WHERE id=?').get('admin-a')?.password_hash).toBe(oldHash);
    consumeG1Recovery(db, 'admin-a', nonce, 'scrypt$new-hash', NOW + 100, 'req-ok');
    expect(fixtureCount(db, 'AdminRecoveryNonce')).toBe(1);
    expect(db.prepare('SELECT password_hash,must_change_password FROM "User" WHERE id=?').get('admin-a'))
      .toMatchObject({password_hash:'scrypt$new-hash',must_change_password:1});
    expect(db.prepare('SELECT revoked_at FROM "AuthSession" WHERE user_id=?').get('admin-a')?.revoked_at).toBe(NOW + 100);
    expect(() => consumeG1Recovery(db, 'admin-a', nonce, 'scrypt$another', NOW + 200, 'req-replay'))
      .toThrow();
    expect(fixtureCount(db, 'AuditEvent')).toBe(1);
    expect(JSON.stringify(db.prepare('SELECT * FROM "AdminRecoveryNonce"').all())).not.toContain(nonce);
    expect(() => db.prepare('DELETE FROM "AdminRecoveryNonce"').run()).toThrow('G1_NONCE_IMMUTABLE');
  });

  test('TC-P4-G1-009: quiesced DB/CAD/local-S3 fixture backup → dry-run → real restore', async () => {
    const before = cadSnapshot();
    const bytes = Buffer.from(FIXTURE_DXF, 'utf8');
    const local = path.join(directory, 'local-cad.dxf');
    const s3Mirror = path.join(directory, 'mock-s3-object.dxf');
    await writeFile(local, bytes);
    await writeFile(s3Mirror, bytes);
    const expectedSha = hash(bytes.toString('utf8'));
    expect(db.prepare('SELECT COUNT(*) AS n FROM "CadFileVersion" WHERE sha256=? AND file_size=?')
      .get(expectedSha, bytes.byteLength)?.n).toBe(2);
    const backup = path.join(directory, 'backup.sqlite');
    const localBackup = path.join(directory, 'backup-local.dxf');
    const s3Backup = path.join(directory, 'backup-s3.dxf');
    // All fixture writers are quiesced. SQLite online backup gives a consistent DB snapshot.
    await db.backup(backup);
    await copyFile(local, localBackup);
    await copyFile(s3Mirror, s3Backup);
    applyG1Fixture(db);
    expect(cadSnapshot()).toEqual(before);
    expect(fkViolations()).toEqual([]);
    db.prepare("UPDATE \"CadLocation\" SET current_version_id=NULL WHERE id='floor-site-a'").run();
    expect(cadSnapshot()).not.toEqual(before);
    // Mimic a stopped application restoring the same backup set; never production data.
    db.close();
    await copyFile(backup, filename);
    await copyFile(localBackup, local);
    await copyFile(s3Backup, s3Mirror);
    db = openG1Fixture(filename);
    expect(cadSnapshot()).toEqual(before);
    expect(fkViolations()).toEqual([]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='User'").get()).toBeUndefined();
    expect(hash((await readFile(local)).toString('utf8'))).toBe(expectedSha);
    expect(hash((await readFile(s3Mirror)).toString('utf8'))).toBe(expectedSha);
    // Real S3 remote snapshot + actual operational restore remain G6 / NOT RUN.
  });
});
