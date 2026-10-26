/** #109 S1 staging adapter boundary. No import of test-only fixture or operating DB. */
import { createHash, randomUUID } from 'node:crypto';
import { createAuditEvent } from '../auth/audit';

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
export function resolveG1VersionSite(db: IsolatedDb, versionId: string): string | null {
  const row = db.prepare('SELECT b.site_id FROM "CadFileVersion" v JOIN "CadLocation" l ON l.id=v.location_id JOIN "Building" b ON b.id=l.building_id JOIN "CadSite" s ON s.id=b.site_id WHERE v.id=?').get(versionId);
  return typeof row?.site_id === 'string' ? row.site_id : null;
}
/** G2 recovery: consumed nonce, password change, session revoke and audit commit together. */
export function consumeG1Recovery(db: IsolatedDb, target: string, nonce: string,
    newHash: string, now: number, requestId: string, injectFailure = false): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !newHash.startsWith('scrypt$local-v1$'))
    throw new Error('G7_RECOVERY_INPUT_INVALID');
  const nonceHash = createHash('sha256').update(nonce).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    const allowed = db.prepare('SELECT 1 FROM "User" u JOIN "UserRoleGrant" r ON r.user_id=u.id WHERE u.id=? AND u.status=\'ACTIVE\' AND r.role=\'Admin\'').get(target);
    if (!allowed) throw new Error('G7_RECOVERY_TARGET_INVALID');
    db.prepare('INSERT INTO "AdminRecoveryNonce"(nonce_hash,user_id,consumed_at) VALUES(?,?,?)')
      .run(nonceHash, target, now);
    const changed = db.prepare('UPDATE "User" SET password_hash=?,must_change_password=1,updated_at=? WHERE id=?')
      .run(newHash, now, target);
    if (changed.changes !== 1) throw new Error('G7_RECOVERY_TARGET_INVALID');
    db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
      .run(now, target);
    if (injectFailure) throw new Error('G7_RECOVERY_INJECTED');
    const audit = createAuditEvent({
      actorUserId: null, action: 'ADMIN_RECOVERY', targetKind: 'ACCOUNT',
      targetId: target, beforeRevision: null, afterRevision: null,
      outcome: 'SUCCESS', requestId,
    }, new Date(now));
    db.prepare('INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), null, target, null, audit.action, audit.targetKind, audit.targetId,
           null, null, audit.outcome, audit.timestampUtc, audit.requestId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
