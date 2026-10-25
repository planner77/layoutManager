import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeAdminSetup } from '../../server/auth/admin-setup';
import { verifyLocalPassword } from '../../server/auth/password';
import { issueG1Session, applyG1Fixture, openG1Fixture, seedFixtureUser,
  fixtureCount, type IsolatedDb } from '../fixtures/auth-g1/store';
import { createG2IsolatedStore } from '../fixtures/auth-g2/store';
import { migrate } from '../helpers/database';

const NOW = 1_793_000_000_000;
const PASSWORD = 'test-only-G2-password-2026';
const NONCE = 'g2_once_nonce_20261026';
let directory: string;
let db: IsolatedDb;

function putSecret(value = PASSWORD, name = 'admin.secret'): string {
  const filename = path.join(directory, name);
  writeFileSync(filename, value, { mode: 0o600 });
  chmodSync(filename, 0o600);
  return filename;
}
function bootstrapEnv(file: string): Record<string, string> {
  return {
    ADMIN_BOOTSTRAP_ENABLED: 'true',
    ADMIN_BOOTSTRAP_USERNAME: 'Initial_Admin',
    ADMIN_BOOTSTRAP_PASSWORD_FILE: file,
  };
}
function recoverEnv(file: string, userId: string, nonce = NONCE): Record<string, string> {
  return {
    ADMIN_RECOVERY_ENABLED: 'true',
    ADMIN_RECOVERY_TARGET_USER_ID: userId,
    ADMIN_RECOVERY_ONCE_ID: nonce,
    ADMIN_RECOVERY_PASSWORD_FILE: file,
  };
}
function count(table: 'User' | 'UserRoleGrant' | 'AuditEvent' | 'AuthSession' |
               'AdminRecoveryNonce') {
  return fixtureCount(db, table);
}
async function firstAdmin(): Promise<string> {
  const result = await executeAdminSetup(bootstrapEnv(putSecret()),
    createG2IsolatedStore(db), 'g2-first', NOW);
  if (result.kind !== 'bootstrap') throw new Error('G2_TEST_NO_BOOTSTRAP');
  return result.userId;
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'cad-auth-g1-'));
  const filename = path.join(directory, 'fixture.sqlite');
  // The G2 adapter exercises G1 over the real existing CAD schema migrations.
  await migrate(filename);
  db = openG1Fixture(filename);
  applyG1Fixture(db);
});
afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

describe('Issue #104 G2 explicit one-shot Admin service (isolated database only)', () => {
  test('TC-P4-G2-001: unset flags are disabled; no implicit Admin creation', async () => {
    await expect(executeAdminSetup({}, createG2IsolatedStore(db), 'g2-off', NOW))
      .resolves.toEqual({ kind: 'disabled' });
    expect(count('User')).toBe(0);
    expect(count('AuditEvent')).toBe(0);
  });

  test('TC-P4-G2-002: incomplete, conflicting, and invalid settings fail closed', async () => {
    const store = createG2IsolatedStore(db);
    const env = bootstrapEnv(putSecret());
    await expect(executeAdminSetup({
      ...env, ADMIN_RECOVERY_ENABLED: 'true',
    }, store, 'g2-flags', NOW)).rejects.toThrow();
    await expect(executeAdminSetup({
      ...env, ADMIN_BOOTSTRAP_USERNAME: '',
    }, store, 'g2-name', NOW)).rejects.toThrow();
    await expect(executeAdminSetup({
      ...env, ADMIN_BOOTSTRAP_PASSWORD_FILE: 'relative/secret',
    }, store, 'g2-path', NOW)).rejects.toThrow();
    await expect(executeAdminSetup(env, store, 'not valid request id', NOW))
      .rejects.toThrow('G2_EXECUTION_CONTEXT_INVALID');
    expect(count('User')).toBe(0);
  });

  test('TC-P4-G2-003: secret missing, 0644, symlink, newline, short all rejected', async () => {
    const store = createG2IsolatedStore(db);
    const good = putSecret();
    const weak = putSecret('short', 'short.secret');
    const eol = putSecret(PASSWORD + '\n', 'eol.secret');
    const linked = path.join(directory, 'linked.secret');
    symlinkSync(good, linked);
    chmodSync(good, 0o644);
    for (const candidate of [good, weak, eol, linked, path.join(directory, 'missing.secret')]) {
      await expect(executeAdminSetup(bootstrapEnv(candidate), store, 'g2-secret', NOW))
        .rejects.toThrow('G2_SECRET_INVALID');
    }
    expect(count('User')).toBe(0);
    expect(count('AuditEvent')).toBe(0);
  });

  test('TC-P4-G2-004: first bootstrap, audit, must-change, hash and restart invariants', async () => {
    const secret = putSecret();
    const env = bootstrapEnv(secret);
    const store = createG2IsolatedStore(db);
    const result = await executeAdminSetup(env, store, 'g2-first', NOW);
    expect(result.kind).toBe('bootstrap');
    if (result.kind !== 'bootstrap') return;
    const before = db.prepare('SELECT * FROM "User" WHERE id=?').get(result.userId);
    expect(before).toMatchObject({
      login_name: 'initial_admin', status: 'ACTIVE', must_change_password: 1,
    });
    expect(await verifyLocalPassword(PASSWORD, String(before?.password_hash))).toBe(true);
    expect(db.prepare('SELECT role FROM "UserRoleGrant" WHERE user_id=?').get(result.userId))
      .toMatchObject({ role: 'Admin' });
    expect(db.prepare('SELECT actor_user_id,affected_user_id,action,request_id FROM "AuditEvent"').get())
      .toMatchObject({ actor_user_id: null, affected_user_id: result.userId,
        action: 'ADMIN_BOOTSTRAP', request_id: 'g2-first' });
    expect(count('User')).toBe(1);
    // Simulate removal of the file before restart; no further secret access or overwrite.
    await rm(secret);
    await expect(executeAdminSetup(env, store, 'g2-restart', NOW + 1))
      .resolves.toEqual({ kind: 'disabled' });
    expect(db.prepare('SELECT * FROM "User" WHERE id=?').get(result.userId)).toEqual(before);
    expect(count('User')).toBe(1);
    expect(count('AuditEvent')).toBe(1);
    const leakCheck = JSON.stringify([
      ...db.prepare('SELECT * FROM "User"').all(),
      ...db.prepare('SELECT * FROM "AuditEvent"').all(),
    ]);
    expect(leakCheck).not.toContain(PASSWORD);
    expect(leakCheck).not.toContain(secret);
  });

  test('TC-P4-G2-005: simultaneous bootstrap attempts commit exactly once', async () => {
    const env = bootstrapEnv(putSecret());
    const store = createG2IsolatedStore(db);
    const results = await Promise.allSettled([
      executeAdminSetup(env, store, 'g2-race-a', NOW),
      executeAdminSetup(env, store, 'g2-race-b', NOW),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(count('User')).toBe(1);
    expect(count('UserRoleGrant')).toBe(1);
    expect(count('AuditEvent')).toBe(1);
  });

  test('TC-P4-G2-006: partial bootstrap fault rolls back User, Grant and Audit', async () => {
    const env = bootstrapEnv(putSecret());
    await expect(executeAdminSetup(env, createG2IsolatedStore(db, {
      injectBootstrapFailure: true,
    }), 'g2-fault', NOW)).rejects.toThrow('G2_INJECTED_BOOTSTRAP_FAILURE');
    expect(count('User')).toBe(0);
    expect(count('UserRoleGrant')).toBe(0);
    expect(count('AuditEvent')).toBe(0);
    await executeAdminSetup(env, createG2IsolatedStore(db), 'g2-retry', NOW + 1);
    expect(count('User')).toBe(1);
  });

  test('TC-P4-G2-007: recovery nonce once, session revoke and safe audit', async () => {
    const adminId = await firstAdmin();
    db.prepare('UPDATE "User" SET must_change_password=0 WHERE id=?').run(adminId);
    issueG1Session(db, adminId, NOW + 10);
    const secret = putSecret('new-test-only-G2-password', 'recovery.secret');
    const env = recoverEnv(secret, adminId);
    const store = createG2IsolatedStore(db);
    const before = db.prepare('SELECT password_hash FROM "User" WHERE id=?').get(adminId);
    await expect(executeAdminSetup(env, store, 'g2-recover', NOW + 20))
      .resolves.toEqual({ kind: 'recover', targetId: adminId });
    const after = db.prepare('SELECT password_hash,must_change_password,status FROM "User" WHERE id=?').get(adminId);
    expect(after?.password_hash).not.toBe(before?.password_hash);
    expect(after).toMatchObject({ must_change_password: 1, status: 'ACTIVE' });
    expect(await verifyLocalPassword('new-test-only-G2-password', String(after?.password_hash)))
      .toBe(true);
    expect(db.prepare('SELECT revoked_at FROM "AuthSession" WHERE user_id=?').get(adminId))
      .toMatchObject({ revoked_at: NOW + 20 });
    expect(db.prepare('SELECT role FROM "UserRoleGrant" WHERE user_id=?').get(adminId))
      .toMatchObject({ role: 'Admin' });
    expect(count('AdminRecoveryNonce')).toBe(1);
    expect(db.prepare('SELECT action,affected_user_id FROM "AuditEvent" WHERE action=?')
      .get('ADMIN_RECOVERY')).toMatchObject({ action: 'ADMIN_RECOVERY', affected_user_id: adminId });
    const snapshot = JSON.stringify([
      ...db.prepare('SELECT * FROM "AdminRecoveryNonce"').all(),
      ...db.prepare('SELECT * FROM "AuditEvent"').all(),
    ]);
    expect(snapshot).not.toContain(NONCE);
    expect(snapshot).not.toContain('new-test-only-G2-password');
    await expect(executeAdminSetup(env, store, 'g2-replay', NOW + 30)).rejects.toThrow();
    expect(count('AdminRecoveryNonce')).toBe(1);
    expect(db.prepare('SELECT password_hash FROM "User" WHERE id=?').get(adminId))
      ?.password_hash).toEqual(after?.password_hash);
  });

  test('TC-P4-G2-008: interrupted recovery rolls back nonce, hash, revoke and audit', async () => {
    const adminId = await firstAdmin();
    db.prepare('UPDATE "User" SET must_change_password=0 WHERE id=?').run(adminId);
    issueG1Session(db, adminId, NOW + 10);
    const env = recoverEnv(putSecret('new-test-only-G2-password', 'recovery.secret'), adminId);
    const beforeUser = db.prepare('SELECT * FROM "User" WHERE id=?').get(adminId);
    const beforeAudit = count('AuditEvent');
    await expect(executeAdminSetup(env, createG2IsolatedStore(db, {
      injectRecoveryFailure: true,
    }), 'g2-recovery-fault', NOW + 20)).rejects.toThrow('G1_INJECTED_RECOVERY_FAILURE');
    expect(db.prepare('SELECT * FROM "User" WHERE id=?').get(adminId)).toEqual(beforeUser);
    expect(db.prepare('SELECT revoked_at FROM "AuthSession" WHERE user_id=?').get(adminId)
      ?.revoked_at).toBeNull();
    expect(count('AdminRecoveryNonce')).toBe(0);
    expect(count('AuditEvent')).toBe(beforeAudit);
    await executeAdminSetup(env, createG2IsolatedStore(db), 'g2-recovery-retry', NOW + 30);
    expect(count('AdminRecoveryNonce')).toBe(1);
  });

  test('TC-P4-G2-009: preexisting ordinary User disallows Admin elevation; CAD schema unchanged', async () => {
    seedFixtureUser(db, 'ordinary-user', 'ordinary_user', NOW);
    await expect(executeAdminSetup(bootstrapEnv(putSecret()),
      createG2IsolatedStore(db), 'g2-existing', NOW)).resolves.toEqual({ kind: 'disabled' });
    expect(count('User')).toBe(1);
    expect(count('UserRoleGrant')).toBe(0);
    expect(db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?')
      .get('table', 'CadFileVersion')).toBeDefined();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const shippedPrisma = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    expect(shippedPrisma).not.toContain('model AuthSession {');
  });
});
