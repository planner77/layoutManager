/**
 * #103 G1 disposable SQLite fixture ONLY. Not imported by app/server/db or routes.
 * All mutating operations hold BEGIN IMMEDIATE; the SQL trigger independently
 * guards the three-session maximum against bypass and concurrent writers.
 */
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { newSessionCandidate, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '../../../server/auth/session';
import { createAuditEvent, type AuditAction, type AuditTarget } from '../../../server/auth/audit';

type Value = string | number | null;
export type SqlRow = Record<string, unknown>;
export type IsolatedDb = {
  exec(sql: string): void;
  close(): void;
  backup(filename: string): Promise<unknown>;
  prepare(sql: string): {
    run(...values: Value[]): { changes: number };
    get(...values: Value[]): SqlRow | undefined;
    all(...values: Value[]): SqlRow[];
  };
};
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as new(filename: string) => IsolatedDb;
const migration = readFileSync(new URL('./migration.sql', import.meta.url), 'utf8');
const prefix = path.join(realpathSync(tmpdir()), 'cad-auth-g1-');

export function openG1Fixture(filename: string): IsolatedDb {
  // Refuse arbitrary source DB, symlinks and production/working-tree paths.
  if (path.basename(filename) !== 'fixture.sqlite' ||
      !realpathSync(path.dirname(filename)).startsWith(prefix) ||
      lstatSync(filename).isSymbolicLink()) throw new Error('G1_FIXTURE_PATH_REQUIRED');
  const db = new Sqlite(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=0;');
  return db;
}
function atomic<T>(db: IsolatedDb, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
const count = (db: IsolatedDb, table: string): number => {
  if (!['User','AuthSession','AuditEvent','UserRoleGrant','UserSiteGrant','SpecialGrant','AdminRecoveryNonce'].includes(table)) throw new Error('UNKNOWN_TABLE');
  return Number(db.prepare('SELECT COUNT(*) AS n FROM "' + table + '"').get()?.n);
};
export function fixtureCount(db: IsolatedDb, table: string): number { return count(db, table); }

export function applyG1Fixture(db: IsolatedDb, injectFailure = false): void {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='CadSite'").get()) {
    throw new Error('G1_CAD_BASELINE_REQUIRED');
  }
  atomic(db, () => {
    db.exec(migration);
    if (injectFailure) throw new Error('G1_INJECTED_MIGRATION_FAILURE');
    if (db.prepare('PRAGMA foreign_key_check').all().length > 0) throw new Error('G1_FK_FAILURE');
  });
}
/** Test seed only: G2 must implement approved one-time bootstrap separately. */
export function seedFixtureUser(db: IsolatedDb, id: string, login: string, now: number, isAdmin = false): void {
  db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?, ?,0,?,?)')
    .run(id, login, 'scrypt$fixture_hash_' + id, 'ACTIVE', now, now);
  if (isAdmin) db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_by_user_id,granted_at) VALUES(?,?,NULL,?)')
    .run(id, 'Admin', now);
}

function event(db: IsolatedDb, actor: string, action: AuditAction, kind: AuditTarget,
               target: string, now: number, requestId: string): void {
  const safe = createAuditEvent({
    actorUserId: actor, action, targetKind: kind, targetId: target,
    beforeRevision: null, afterRevision: null, outcome: 'SUCCESS', requestId,
  }, new Date(now));
  db.prepare('INSERT INTO "AuditEvent"(id,actor_user_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), safe.actorUserId, safe.action, safe.targetKind, safe.targetId,
      safe.beforeRevision, safe.afterRevision, safe.outcome, safe.timestampUtc, safe.requestId);
}
function requireAdmin(db: IsolatedDb, actor: string): void {
  if (!db.prepare("SELECT 1 FROM \"User\" u JOIN \"UserRoleGrant\" r ON r.user_id=u.id AND r.role='Admin' WHERE u.id=? AND u.status='ACTIVE' AND u.must_change_password=0").get(actor)) {
    throw new Error('G1_ADMIN_REQUIRED');
  }
}
export function issueG1Session(db: IsolatedDb, userId: string, now: number, injectFailure = false) {
  const candidate = newSessionCandidate(userId, now);
  atomic(db, () => {
    const user = db.prepare('SELECT status,must_change_password FROM "User" WHERE id=?').get(userId);
    if (!user || user.status !== 'ACTIVE' || user.must_change_password !== 0) throw new Error('G1_ACCOUNT_INELIGIBLE');
    const active = db.prepare('SELECT COUNT(*) AS n FROM "AuthSession" WHERE user_id=? AND revoked_at IS NULL AND issued_at<=? AND expires_at>? AND last_seen_at+?>?')
      .get(userId, now, now, SESSION_IDLE_MS, now);
    if (Number(active?.n) >= 3) throw new Error('G1_SESSION_CAP');
    db.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
      .run(candidate.session.id, userId, candidate.session.tokenHash, now, now, now + SESSION_ABSOLUTE_MS);
    if (injectFailure) throw new Error('G1_INJECTED_SESSION_FAILURE');
  });
  return candidate;
}
export function changeG1SiteGrant(db: IsolatedDb, actor: string, target: string, site: string,
                                  enabled: boolean, now: number, requestId: string, injectFailure = false): void {
  atomic(db, () => {
    requireAdmin(db, actor);
    if (enabled) {
      db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_by_user_id,granted_at) VALUES(?,?,?,?)')
        .run(target, site, actor, now);
    } else {
      const removed = db.prepare('DELETE FROM "UserSiteGrant" WHERE user_id=? AND site_id=?').run(target, site);
      if (removed.changes !== 1) throw new Error('G1_GRANT_NOT_FOUND');
    }
    if (injectFailure) throw new Error('G1_INJECTED_GRANT_FAILURE');
    event(db, actor, enabled ? 'SITE_GRANTED' : 'SITE_REVOKED', 'SITE', site, now, requestId);
  });
}
export function disableG1User(db: IsolatedDb, actor: string, target: string, now: number,
                              requestId: string, injectFailure = false): void {
  atomic(db, () => {
    requireAdmin(db, actor);
    const row = db.prepare("UPDATE \"User\" SET status='DISABLED',updated_at=? WHERE id=? AND status='ACTIVE'")
      .run(now, target);
    if (row.changes !== 1) throw new Error('G1_ACCOUNT_NOT_ACTIVE');
    db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
      .run(now, target);
    if (injectFailure) throw new Error('G1_INJECTED_DISABLE_FAILURE');
    event(db, actor, 'ACCOUNT_DISABLED', 'ACCOUNT', target, now, requestId);
  });
}
export function consumeG1Recovery(db: IsolatedDb, target: string, nonce: string, newHash: string,
                                  now: number, requestId: string, injectFailure = false): void {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(nonce) || !newHash.startsWith('scrypt$')) {
    throw new Error('G1_RECOVERY_INPUT_INVALID');
  }
  const nonceHash = createHash('sha256').update(nonce, 'utf8').digest('hex');
  atomic(db, () => {
    const admin = db.prepare("SELECT 1 FROM \"UserRoleGrant\" WHERE user_id=? AND role='Admin'").get(target);
    if (!admin) throw new Error('G1_RECOVERY_TARGET_NOT_ADMIN');
    db.prepare('INSERT INTO "AdminRecoveryNonce"(nonce_hash,user_id,consumed_at) VALUES(?,?,?)')
      .run(nonceHash, target, now);
    db.prepare('UPDATE "User" SET password_hash=?,must_change_password=1,updated_at=? WHERE id=?')
      .run(newHash, now, target);
    db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
      .run(now, target);
    if (injectFailure) throw new Error('G1_INJECTED_RECOVERY_FAILURE');
    event(db, target, 'ADMIN_RECOVERY', 'ACCOUNT', target, now, requestId);
  });
}
/** All three grant kinds require the same Admin+Audit transaction boundary. */
export function changeG1RoleGrant(db: IsolatedDb, actor: string, target: string, role: string,
                                 enabled: boolean, now: number, requestId: string, injectFailure = false): void {
  if (!['Reader','Editor','Admin'].includes(role)) throw new Error('G1_ROLE_INVALID');
  atomic(db, () => {
    requireAdmin(db, actor);
    if (enabled) {
      db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_by_user_id,granted_at) VALUES(?,?,?,?)')
        .run(target, role, actor, now);
    } else {
      const removed = db.prepare('DELETE FROM "UserRoleGrant" WHERE user_id=? AND role=?').run(target, role);
      if (removed.changes !== 1) throw new Error('G1_GRANT_NOT_FOUND');
    }
    if (injectFailure) throw new Error('G1_INJECTED_GRANT_FAILURE');
    event(db, actor, enabled ? 'ROLE_GRANTED' : 'ROLE_REVOKED', 'ROLE', target + '_' + role, now, requestId);
  });
}
export function changeG1SpecialGrant(db: IsolatedDb, actor: string, target: string, permission: string,
                                    enabled: boolean, now: number, requestId: string, injectFailure = false): void {
  if (!['audit:read','logs:read'].includes(permission)) throw new Error('G1_PERMISSION_INVALID');
  atomic(db, () => {
    requireAdmin(db, actor);
    if (enabled) {
      db.prepare('INSERT INTO "SpecialGrant"(user_id,permission,granted_by_user_id,granted_at) VALUES(?,?,?,?)')
        .run(target, permission, actor, now);
    } else {
      const removed = db.prepare('DELETE FROM "SpecialGrant" WHERE user_id=? AND permission=?').run(target, permission);
      if (removed.changes !== 1) throw new Error('G1_GRANT_NOT_FOUND');
    }
    if (injectFailure) throw new Error('G1_INJECTED_GRANT_FAILURE');
    event(db, actor, enabled ? 'ROLE_GRANTED' : 'ROLE_REVOKED', 'ROLE',
      target + '_' + permission.replace(':', '_'), now, requestId);
  });
}

/** Version scope comes exclusively from persisted Version→Floor→Building→Site. */
export function resolveG1VersionSite(db: IsolatedDb, versionId: string): string | null {
  const row = db.prepare('SELECT b.site_id AS site_id FROM "CadFileVersion" v JOIN "CadLocation" l ON l.id=v.location_id JOIN "Building" b ON b.id=l.building_id JOIN "CadSite" s ON s.id=b.site_id WHERE v.id=?')
    .get(versionId);
  return typeof row?.site_id === 'string' ? row.site_id : null;
}
