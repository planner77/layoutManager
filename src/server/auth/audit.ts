/**
 * Explicit, non-sensitive append-only event payload for a future durable audit
 * adapter. Never forward arbitrary request bodies, secrets, CAD or geometry.
 */
export const AUDIT_RETENTION_DAYS = 365;
export type AuditAction =
  | 'LOGIN_SUCCESS' | 'LOGIN_DENIED' | 'SESSION_REVOKED' | 'ACCOUNT_CREATED'
  | 'ACCOUNT_DISABLED' | 'PASSWORD_RESET' | 'ADMIN_BOOTSTRAP' | 'ADMIN_RECOVERY'
  | 'ROLE_GRANTED' | 'ROLE_REVOKED' | 'SITE_GRANTED' | 'SITE_REVOKED'
  | 'OUTLINE_CREATED' | 'OUTLINE_EDITED' | 'OUTLINE_DELETED'
  | 'AUTHORIZATION_DENIED' | 'AUTHORIZATION_GRANTED';
export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILED';
export type AuditTarget = 'ACCOUNT' | 'SESSION' | 'SITE' | 'VERSION' | 'OUTLINE' | 'ROLE';

export type AuditEvent = Readonly<{
  actorUserId: string | null;
  action: AuditAction;
  targetKind: AuditTarget;
  targetId: string;
  beforeRevision: number | null;
  afterRevision: number | null;
  outcome: AuditOutcome;
  timestampUtc: string;
  requestId: string;
}>;

const ACTIONS: readonly string[] = [
  'LOGIN_SUCCESS', 'LOGIN_DENIED', 'SESSION_REVOKED', 'ACCOUNT_CREATED',
  'ACCOUNT_DISABLED', 'PASSWORD_RESET', 'ADMIN_BOOTSTRAP', 'ADMIN_RECOVERY',
  'ROLE_GRANTED', 'ROLE_REVOKED', 'SITE_GRANTED', 'SITE_REVOKED',
  'OUTLINE_CREATED', 'OUTLINE_EDITED', 'OUTLINE_DELETED', 'AUTHORIZATION_DENIED',
  'AUTHORIZATION_GRANTED',
];
const TARGETS: readonly string[] = ['ACCOUNT', 'SESSION', 'SITE', 'VERSION', 'OUTLINE', 'ROLE'];
const OUTCOMES: readonly string[] = ['SUCCESS', 'DENIED', 'FAILED'];
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const REQUEST_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function createAuditEvent(
  fields: Omit<AuditEvent, 'timestampUtc'>, timestamp: Date,
): AuditEvent {
  if (!ACTIONS.includes(fields.action) || !TARGETS.includes(fields.targetKind) ||
      !OUTCOMES.includes(fields.outcome) || !ID.test(fields.targetId) ||
      !REQUEST_ID.test(fields.requestId) ||
      (fields.actorUserId !== null && !ID.test(fields.actorUserId)) ||
      ![fields.beforeRevision, fields.afterRevision].every(value =>
        value === null || (Number.isSafeInteger(value) && value >= 0)) ||
      !Number.isFinite(timestamp.getTime())) {
    throw new Error('Invalid safe audit event');
  }
  // Explicit fields only; unexpected input properties are not serialized.
  return Object.freeze({
    actorUserId: fields.actorUserId,
    action: fields.action,
    targetKind: fields.targetKind,
    targetId: fields.targetId,
    beforeRevision: fields.beforeRevision,
    afterRevision: fields.afterRevision,
    outcome: fields.outcome,
    requestId: fields.requestId,
    timestampUtc: timestamp.toISOString(),
  });
}
/** This is a retention boundary, NOT a deletion or backup-purge operation. */
export function auditRetentionCutoff(now: Date): Date {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid time');
  return new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
