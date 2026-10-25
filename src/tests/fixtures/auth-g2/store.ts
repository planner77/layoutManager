/**
 * #104 G2 isolated adapter only, backed by the G1 disposable SQLite fixture.
 * The production Prisma schema, App routes and startup process NEVER import it.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createAuditEvent } from '../../../server/auth/audit';
import type {
  AdminSetupStore, AdminBootstrapCommand, AdminRecoveryCommand,
} from '../../../server/auth/admin-setup';
import { consumeG1Recovery, type IsolatedDb } from '../auth-g1/store';

type Faults = Readonly<{
  injectBootstrapFailure?: boolean;
  injectRecoveryFailure?: boolean;
}>;

function count(db: IsolatedDb, table: 'User' | 'AuditEvent' | 'AdminRecoveryNonce' |
               'UserRoleGrant' | 'AuthSession' | 'UserSiteGrant' | 'SpecialGrant'): number {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM "' + table + '"').get()?.n);
}

/** The initial administrator is affected_user_id; no authenticated actor exists yet. */
function insertBootstrapAudit(db: IsolatedDb, userId: string, now: number, requestId: string): void {
  const safe = createAuditEvent({
    actorUserId: null, action: 'ADMIN_BOOTSTRAP', targetKind: 'ACCOUNT',
    targetId: userId, beforeRevision: null, afterRevision: null,
    outcome: 'SUCCESS', requestId,
  }, new Date(now));
  db.prepare(
    'INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(randomUUID(), null, userId, null, safe.action, safe.targetKind, safe.targetId,
    safe.beforeRevision, safe.afterRevision, safe.outcome, safe.timestampUtc, safe.requestId);
}

/**
 * No administrator can be created over an existing or partially initialized
 * identity DB. Read checks outside this BEGIN IMMEDIATE are never sufficient.
 */
function insertFirstAdmin(db: IsolatedDb, command: AdminBootstrapCommand, faults: Faults): string {
  db.exec('BEGIN IMMEDIATE');
  try {
    const tables = ['User', 'UserRoleGrant', 'UserSiteGrant', 'SpecialGrant',
      'AuthSession', 'AuditEvent', 'AdminRecoveryNonce'] as const;
    if (tables.some(table => count(db, table) !== 0)) {
      throw new Error('G2_BOOTSTRAP_ALREADY_INITIALIZED');
    }
    if (!/^[a-z][a-z0-9._-]{2,63}$/.test(command.username) ||
        !command.passwordHash.startsWith('scrypt$local-v1$')) {
      throw new Error('G2_BOOTSTRAP_INPUT_INVALID');
    }
    const userId = randomUUID();
    db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,1,?,?)')
      .run(userId, command.username, command.passwordHash, 'ACTIVE', command.now, command.now);
    db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_by_user_id,granted_at) VALUES(?,?,NULL,?)')
      .run(userId, 'Admin', command.now);
    if (faults.injectBootstrapFailure) throw new Error('G2_INJECTED_BOOTSTRAP_FAILURE');
    insertBootstrapAudit(db, userId, command.now, command.requestId);
    db.exec('COMMIT');
    return userId;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createG2IsolatedStore(db: IsolatedDb, faults: Faults = {}): AdminSetupStore {
  return {
    snapshot(recoveryNonce: string | undefined) {
      const adminIds = db.prepare(
        'SELECT u.id FROM "User" u INNER JOIN "UserRoleGrant" r ON r.user_id=u.id WHERE r.role=? ORDER BY u.id',
      ).all('Admin').map(row => String(row.id));
      const consumed = recoveryNonce && /^[a-zA-Z0-9_-]{16,128}$/.test(recoveryNonce) &&
        db.prepare('SELECT 1 FROM "AdminRecoveryNonce" WHERE nonce_hash=?')
          .get(createHash('sha256').update(recoveryNonce, 'utf8').digest('hex'));
      return {
        initialized: count(db, 'User') !== 0 || count(db, 'AuditEvent') !== 0 ||
          count(db, 'AdminRecoveryNonce') !== 0,
        adminIds,
        usedRecoveryIds: consumed ? [recoveryNonce!] : [],
      };
    },
    bootstrap(command: AdminBootstrapCommand) {
      return insertFirstAdmin(db, command, faults);
    },
    recover(command: AdminRecoveryCommand) {
      // Recover a current ACTIVE Admin only. Do not silently re-enable a
      // DISABLED account or grant Admin to a different user.
      const existing = db.prepare(
        'SELECT u.id FROM "User" u JOIN "UserRoleGrant" r ON r.user_id=u.id WHERE u.id=? AND u.status=? AND r.role=?',
      ).get(command.targetId, 'ACTIVE', 'Admin');
      if (!existing) throw new Error('G2_RECOVERY_TARGET_INELIGIBLE');
      consumeG1Recovery(db, command.targetId, command.nonce, command.passwordHash,
        command.now, command.requestId, faults.injectRecoveryFailure);
    },
  };
}
