/** #109 G7 staging ONLY. Ported G3 transactional adapter; never enabled by operational API. */
import { createHash, randomUUID } from 'node:crypto';
import type { UserAccess, Role, SpecialGrant } from '../../domain/auth';
import { createAuditEvent, type AuditAction, type AuditTarget } from '../auth/audit';
import { failure, type AuthStore, type Credential } from '../auth/login-service';
import { SESSION_IDLE_MS, SESSION_ABSOLUTE_MS, type AuthSession } from '../auth/session';
import type { IsolatedDb, SqlRow } from './g1-store';

type Faults = Readonly<{ audit?: boolean; change?: boolean; revoke?: boolean }>;
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
function atomic<T>(db: IsolatedDb, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function credential(row: SqlRow | undefined): Credential | null {
  if (!row) return null;
  return { id: String(row.id), passwordHash: String(row.password_hash),
    status: row.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED',
    mustChangePassword: row.must_change_password === 1 };
}
function audit(db: IsolatedDb, action: AuditAction, actor: string | null, affected: string | null,
  target: string, now: number, requestId: string, faults: Faults, outcome: 'SUCCESS' | 'DENIED' = 'SUCCESS',
  kind: AuditTarget = 'ACCOUNT') {
  if (faults.audit) throw new Error('G3_INJECTED_AUDIT_FAILURE');
  const event = createAuditEvent({ actorUserId: actor, action, targetKind: kind, targetId: target,
    beforeRevision: null, afterRevision: null, outcome, requestId }, new Date(now));
  db.prepare('INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), event.actorUserId, affected, null, event.action, event.targetKind,
      event.targetId, null, null, event.outcome, event.timestampUtc, event.requestId);
}
function currentActor(db: IsolatedDb, id: string): UserAccess {
  const roles = db.prepare('SELECT role FROM "UserRoleGrant" WHERE user_id=? ORDER BY role').all(id)
    .map(row => row.role as Role);
  const siteGrants = db.prepare('SELECT site_id FROM "UserSiteGrant" WHERE user_id=? ORDER BY site_id').all(id)
    .map(row => String(row.site_id));
  const specialGrants = db.prepare('SELECT permission FROM "SpecialGrant" WHERE user_id=? ORDER BY permission').all(id)
    .map(row => row.permission as SpecialGrant);
  return { id, status: 'ACTIVE', mustChangePassword: false, roles, siteGrants, specialGrants };
}
export type G3RuntimeContext = Readonly<{ assertCurrent(): void; now(): number }>;
export function createG3IsolatedStore(db: IsolatedDb, faults: Faults = {}, runtime?: G3RuntimeContext): AuthStore {
  const select = 'SELECT id,password_hash,status,must_change_password FROM "User"';
  return {
    credential(login) { return credential(db.prepare(select + ' WHERE login_name=?').get(login)); },
    credentialById(id) { return credential(db.prepare(select + ' WHERE id=?').get(id)); },
    issue(userId, expectedHash, candidate: AuthSession, requestId) {
      atomic(db, () => {
        runtime?.assertCurrent();
        const now = runtime?.now() ?? candidate.issuedAt;
        if (runtime) candidate = { ...candidate, issuedAt: now, lastSeenAt: now,
          expiresAt: now + SESSION_ABSOLUTE_MS };
        if (!integer(now) || !/^[0-9a-f]{64}$/.test(candidate.tokenHash)) throw failure('BAD_INPUT', 400);
        const user = credential(db.prepare(select + ' WHERE id=?').get(userId));
        if (!user || user.passwordHash !== expectedHash) throw failure('UNAUTHENTICATED', 401);
        if (user.status !== 'ACTIVE') throw failure('ACCOUNT_DISABLED', 403);
        if (user.mustChangePassword) throw failure('PASSWORD_CHANGE_REQUIRED', 403);
        const latest = db.prepare('SELECT MAX(issued_at) AS issued_at,MAX(last_seen_at) AS last_seen_at FROM "AuthSession" WHERE user_id=?').get(userId);
        if ((latest?.issued_at != null && now < Number(latest.issued_at)) ||
            (latest?.last_seen_at != null && now < Number(latest.last_seen_at))) {
          throw failure('UNAUTHENTICATED', 401);
        }
        const active = db.prepare('SELECT COUNT(*) AS n FROM "AuthSession" WHERE user_id=? AND revoked_at IS NULL AND issued_at<=? AND expires_at>? AND last_seen_at+?>?')
          .get(userId, now, now, SESSION_IDLE_MS, now);
        if (Number(active?.n) >= 3) throw failure('SESSION_LIMIT', 409);
        db.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?)')
          .run(candidate.id, userId, candidate.tokenHash, now, now, candidate.expiresAt);
        audit(db, 'LOGIN_SUCCESS', userId, userId, userId, now, requestId, faults);
      });
    },
    change(userId, expectedHash, requiredMustChange, newHash, now, requestId, tokenHash) {
      atomic(db, () => {
        runtime?.assertCurrent();
        now = runtime?.now() ?? now;
        if (!integer(now) || !newHash.startsWith('scrypt$local-v1$')) throw failure('BAD_INPUT', 400);
        const user = credential(db.prepare(select + ' WHERE id=?').get(userId));
        if (!user || user.passwordHash !== expectedHash) throw failure('UNAUTHENTICATED', 401);
        if (user.status !== 'ACTIVE') throw failure('ACCOUNT_DISABLED', 403);
        if (user.mustChangePassword !== requiredMustChange) {
          throw failure(user.mustChangePassword ? 'PASSWORD_CHANGE_REQUIRED' : 'UNAUTHENTICATED',
            user.mustChangePassword ? 403 : 401);
        }
        if (!requiredMustChange) {
          const session = tokenHash && db.prepare('SELECT user_id,issued_at,last_seen_at,expires_at,revoked_at FROM "AuthSession" WHERE token_hash=?').get(tokenHash);
          if (!session || session.user_id !== userId || session.revoked_at !== null ||
              now < Number(session.issued_at) || now < Number(session.last_seen_at) ||
              now >= Number(session.expires_at) ||
              now - Number(session.last_seen_at) >= SESSION_IDLE_MS) {
            throw failure('UNAUTHENTICATED', 401);
          }
        }
        const future = db.prepare('SELECT 1 FROM "AuthSession" WHERE user_id=? AND (issued_at>? OR last_seen_at>?) LIMIT 1')
          .get(userId, now, now);
        if (future) throw failure('UNAUTHENTICATED', 401);
        const changed = db.prepare('UPDATE "User" SET password_hash=?,must_change_password=0,updated_at=? WHERE id=? AND password_hash=? AND status=? AND must_change_password=?')
          .run(newHash, now, userId, expectedHash, 'ACTIVE', requiredMustChange ? 1 : 0);
        if (changed.changes !== 1) throw failure('UNAUTHENTICATED', 401);
        db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
          .run(now, userId);
        if (faults.change) throw new Error('G3_INJECTED_CHANGE_FAILURE');
        audit(db, 'PASSWORD_RESET', userId, userId, userId, now, requestId, faults);
      });
    },
    authenticate(tokenHash, now) {
      return atomic(db, () => {
        runtime?.assertCurrent();
        now = runtime?.now() ?? now;
        if (!integer(now)) throw failure('UNAUTHENTICATED', 401);
        const row = db.prepare('SELECT s.id,s.user_id,s.issued_at,s.last_seen_at,s.expires_at,s.revoked_at,u.status,u.must_change_password FROM "AuthSession" s JOIN "User" u ON u.id=s.user_id WHERE s.token_hash=?').get(tokenHash);
        if (!row || row.revoked_at !== null || now < Number(row.issued_at) ||
            now < Number(row.last_seen_at) || now >= Number(row.expires_at) ||
            now - Number(row.last_seen_at) >= SESSION_IDLE_MS) throw failure('UNAUTHENTICATED', 401);
        if (row.status !== 'ACTIVE') throw failure('ACCOUNT_DISABLED', 403);
        if (row.must_change_password !== 0) throw failure('PASSWORD_CHANGE_REQUIRED', 403);
        const touched = db.prepare('UPDATE "AuthSession" SET last_seen_at=? WHERE id=? AND revoked_at IS NULL AND last_seen_at<=?')
          .run(now, row.id as string, now);
        if (touched.changes !== 1) throw failure('UNAUTHENTICATED', 401);
        return { sessionId: String(row.id), actor: currentActor(db, String(row.user_id)) };
      });
    },
    revoke(tokenHash, now, requestId) {
      atomic(db, () => {
        runtime?.assertCurrent();
        now = runtime?.now() ?? now;
        const row = db.prepare('SELECT id,user_id,issued_at,revoked_at FROM "AuthSession" WHERE token_hash=?').get(tokenHash);
        if (!row || row.revoked_at !== null) return;
        if (now < Number(row.issued_at)) throw failure('UNAUTHENTICATED', 401);
        db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
          .run(now, row.id as string);
        if (faults.revoke) throw new Error('G3_INJECTED_REVOKE_FAILURE');
        audit(db, 'SESSION_REVOKED', String(row.user_id), String(row.user_id),
          String(row.id), now, requestId, faults, 'SUCCESS', 'SESSION');
      });
    },
    denied(userId, now, requestId) {
      atomic(db, () => { runtime?.assertCurrent(); audit(db, 'LOGIN_DENIED', null, userId,
        userId ?? 'unknown_account', runtime?.now() ?? now, requestId, faults, 'DENIED'); });
    },
  };
}

/** Additional fixture-only table: never imported into operating Prisma/migrations. */
export function applyG3Fixture(db: IsolatedDb) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='AuthSession'").get()) {
    throw new Error('G3_G1_FIXTURE_REQUIRED');
  }
  db.exec('CREATE TABLE IF NOT EXISTS "G3LoginAttempt" (key_hash TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 5), until_at INTEGER NOT NULL CHECK(until_at>=0))');
}
/** 5 attempts/60 seconds, persisted and serialized across SQLite connections. */
export function createG3LoginLimiter(db: IsolatedDb) {
  return {
    reserve(key: string, now: number) {
      if (!key || key.length > 256 || !integer(now)) throw new Error('LOGIN_DENIED');
      const keyHash = createHash('sha256').update(key).digest('hex');
      atomic(db, () => {
        const row = db.prepare('SELECT count,until_at FROM "G3LoginAttempt" WHERE key_hash=?').get(keyHash);
        if (row && Number(row.until_at) > now) {
          if (Number(row.count) >= 5) throw new Error('LOGIN_RATE_LIMITED');
          db.prepare('UPDATE "G3LoginAttempt" SET count=count+1 WHERE key_hash=?').run(keyHash);
        } else {
          db.prepare('INSERT INTO "G3LoginAttempt"(key_hash,count,until_at) VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET count=1,until_at=excluded.until_at')
            .run(keyHash, now + 60_000);
        }
      });
    },
    reset(key: string) {
      if (!key || key.length > 256) throw new Error('LOGIN_DENIED');
      const keyHash = createHash('sha256').update(key).digest('hex');
      atomic(db, () => db.prepare('DELETE FROM "G3LoginAttempt" WHERE key_hash=?').run(keyHash));
    },
  };
}
