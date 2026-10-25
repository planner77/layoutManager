import { describe, expect, test } from 'vitest';
import { requirePermission, type UserAccess, type Action } from '../../domain/auth';
import { decideAdminSetup } from '../../server/auth/bootstrap';
import {
  SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, newSessionCandidate, isSessionActive,
  hasSessionSlot, verifySessionToken, touchSession, revokeSession,
  sessionCookie, expiredSessionCookie,
} from '../../server/auth/session';
import { createAuditEvent, auditRetentionCutoff } from '../../server/auth/audit';
import { LoginAttemptLimiter, requireSessionCsrf } from '../../server/auth/guards';

const actor: UserAccess = {
  id: 'user-one', status: 'ACTIVE', mustChangePassword: false,
  roles: ['Editor'], siteGrants: ['site-a'], specialGrants: [],
};
const versionSite = async (id: string) => id === 'v-a' ? 'site-a' : id === 'v-b' ? 'site-b' : null;

describe('Issue #96: permission is deny-first and version-site authoritative', () => {
  test('TC-P4-D1-003: Reader/Editor/Admin require an actual site grant', async () => {
    await expect(requirePermission(actor, 'outline:write', { kind: 'version', versionId: 'v-a' }, versionSite))
      .resolves.toEqual({ siteId: 'site-a' });
    await expect(requirePermission(actor, 'outline:write', { kind: 'version', versionId: 'v-b' }, versionSite))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED', status: 403 });
    await expect(requirePermission({ ...actor, roles: ['Admin'] }, 'outline:write', { kind: 'version', versionId: 'v-b' }, versionSite))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(requirePermission({ ...actor, roles: ['Reader'] }, 'outline:write', { kind: 'version', versionId: 'v-a' }, versionSite))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    await expect(requirePermission(actor, 'cad:read', { kind: 'version', versionId: 'missing' }, versionSite))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  test('TC-P4-D1-004: global roles and explicitly granted audit/log access are separate', async () => {
    const admin = { ...actor, roles: ['Admin'] as const, specialGrants: ['audit:read'] as const };
    await expect(requirePermission(admin, 'users:manage', { kind: 'global' }, versionSite)).resolves.toEqual({ siteId: null });
    await expect(requirePermission(admin, 'audit:read', { kind: 'global' }, versionSite)).resolves.toEqual({ siteId: null });
    await expect(requirePermission(admin, 'logs:read', { kind: 'global' }, versionSite)).rejects.toBeDefined();
    await expect(requirePermission(admin, 'outlineType:manage', { kind: 'global' }, versionSite)).resolves.toEqual({ siteId: null });
    await expect(requirePermission(actor, 'grants:manage', { kind: 'global' }, versionSite)).rejects.toBeDefined();
    const unknownAction = 'memo:write' as Action;
    await expect(requirePermission(admin, unknownAction, { kind: 'global' }, versionSite)).rejects.toBeDefined();
    await expect(requirePermission({ ...actor, mustChangePassword: true }, 'cad:read', { kind: 'site', siteId: 'site-a' }, versionSite))
      .rejects.toBeDefined();
    await expect(requirePermission({ ...actor, status: 'DISABLED' }, 'cad:read', { kind: 'site', siteId: 'site-a' }, versionSite))
      .rejects.toBeDefined();
  });
});

describe('Issue #96: one-time .env plans without automatic write side effects', () => {
  const state = { initialized: false, adminIds: [] as string[], usedRecoveryIds: [] as string[] };
  test('TC-P4-D1-005: startup with bootstrap disabled is inert', () => {
    expect(decideAdminSetup({}, state)).toEqual({ kind: 'disabled' });
    expect(decideAdminSetup({ ADMIN_BOOTSTRAP_ENABLED: 'false' }, state)).toEqual({ kind: 'disabled' });
  });
  test('TC-P4-D1-006: bootstrap is first-run only and secret-file based', () => {
    const env = {
      ADMIN_BOOTSTRAP_ENABLED: 'true', ADMIN_BOOTSTRAP_USERNAME: 'admin',
      ADMIN_BOOTSTRAP_PASSWORD_FILE: '/run/secrets/admin_password',
    };
    expect(decideAdminSetup(env, state)).toEqual({ kind: 'bootstrap', username: 'admin', secretFile: env.ADMIN_BOOTSTRAP_PASSWORD_FILE });
    expect(decideAdminSetup(env, { ...state, initialized: true, adminIds: ['admin-uuid'] })).toEqual({ kind: 'disabled' });
    expect(() => decideAdminSetup({ ...env, ADMIN_BOOTSTRAP_PASSWORD_FILE: 'plain-value' }, state)).toThrow();
    expect(() => decideAdminSetup({ ...env, ADMIN_RECOVERY_ENABLED: 'true' }, state)).toThrow();
  });
  test('TC-P4-D1-007: recovery is explicit, one-use and never creates a second admin', () => {
    const env = {
      ADMIN_RECOVERY_ENABLED: 'true', ADMIN_RECOVERY_TARGET_USER_ID: 'admin-uuid',
      ADMIN_RECOVERY_ONCE_ID: 'nonce_recovery_12345678',
      ADMIN_RECOVERY_PASSWORD_FILE: '/run/secrets/recovery',
    };
    const active = { initialized: true, adminIds: ['admin-uuid'], usedRecoveryIds: [] as string[] };
    expect(decideAdminSetup(env, active)).toMatchObject({ kind: 'recover', targetId: 'admin-uuid' });
    expect(() => decideAdminSetup(env, { ...active, usedRecoveryIds: [env.ADMIN_RECOVERY_ONCE_ID] })).toThrow();
    expect(() => decideAdminSetup(env, { ...active, adminIds: ['another-admin'] })).toThrow();
  });
});

describe('Issue #96: session policy and request guard', () => {
  test('TC-P4-D1-008: absolute 8h / idle 30m / max three / revocation', () => {
    const { rawToken, session } = newSessionCandidate('user-one', 1_000_000);
    expect(session.expiresAt - session.issuedAt).toBe(SESSION_ABSOLUTE_MS);
    expect(verifySessionToken(rawToken, session)).toBe(true);
    expect(verifySessionToken('A'.repeat(43), session)).toBe(false);
    expect(isSessionActive(session, session.issuedAt + SESSION_IDLE_MS - 1, true)).toBe(true);
    expect(isSessionActive(session, session.issuedAt + SESSION_IDLE_MS, true)).toBe(false);
    const nearEnd = { ...session, lastSeenAt: session.expiresAt - 5 };
    expect(isSessionActive(nearEnd, nearEnd.expiresAt, true)).toBe(false);
    expect(hasSessionSlot([session, session, session], 'user-one', session.issuedAt + 1)).toBe(false);
    expect(hasSessionSlot([session, session, session], 'user-two', session.issuedAt + 1)).toBe(true);
    expect(touchSession(session, session.issuedAt + 30, true)?.lastSeenAt).toBe(session.issuedAt + 30);
    expect(isSessionActive(revokeSession(session, session.issuedAt + 1), session.issuedAt + 2, true)).toBe(false);
    expect(isSessionActive(session, session.issuedAt + 1, false)).toBe(false);
    expect(sessionCookie(rawToken)).toContain('HttpOnly; SameSite=Strict; Max-Age=28800');
    expect(sessionCookie(rawToken)).not.toContain('Secure');
    expect(expiredSessionCookie()).toContain('Max-Age=0');
  });
  test('TC-P4-D1-009: CSRF requires exact server-configured origin and session-bound token', () => {
    const token = 'x'.repeat(43);
    expect(() => requireSessionCsrf('http://10.0.0.5:3000', 'http://10.0.0.5:3000', token, token)).not.toThrow();
    expect(() => requireSessionCsrf(null, 'http://10.0.0.5:3000', token, token)).toThrow();
    expect(() => requireSessionCsrf('http://other:3000', 'http://10.0.0.5:3000', token, token)).toThrow();
    expect(() => requireSessionCsrf('http://10.0.0.5:3000', 'http://10.0.0.5:3000', 'z'.repeat(43), token)).toThrow();
  });
  test('TC-P4-D1-010: login attempt budget denies sixth within minute', () => {
    const attempts = new LoginAttemptLimiter();
    for (let i = 0; i < 5; i++) attempts.reserve('peer:account', 100);
    expect(() => attempts.reserve('peer:account', 100)).toThrow('LOGIN_RATE_LIMITED');
    expect(() => attempts.reserve('peer:account', 60_100)).not.toThrow();
  });
});

test('TC-P4-D1-011: audit is narrow, immutable and retention is 365 days, not auto-purged', () => {
  const event = createAuditEvent({
    actorUserId: 'user-one', action: 'SITE_GRANTED', targetKind: 'SITE',
    targetId: 'site-a', beforeRevision: 1, afterRevision: 2,
    outcome: 'SUCCESS', requestId: 'req-123',
    password: 'secret-canary',
  } as Parameters<typeof createAuditEvent>[0], new Date('2026-10-25T01:00:00Z'));
  expect(Object.isFrozen(event)).toBe(true);
  expect(JSON.stringify(event)).not.toContain('secret-canary');
  expect(event.timestampUtc).toBe('2026-10-25T01:00:00.000Z');
  expect(auditRetentionCutoff(new Date('2026-10-25T00:00:00Z')).toISOString()).toBe('2025-10-25T00:00:00.000Z');
  expect(() => createAuditEvent({
    actorUserId: null, action: 'SITE_GRANTED', targetKind: 'SITE',
    targetId: 'bad\nsecret', beforeRevision: null, afterRevision: null, outcome: 'DENIED', requestId: 'req-1',
  }, new Date())).toThrow();
});
