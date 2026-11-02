/** #109 G7 staging ONLY. Ported G4 transactional adapter; never enabled by operational API. */
import { randomUUID } from 'node:crypto';
import type { Action, Resource, Role, SpecialGrant, UserAccess } from '../../domain/auth';
import { requireResolvedPermission, AuthorizationError } from '../../domain/auth';
import { createAuditEvent, type AuditAction, type AuditTarget } from '../auth/audit';
import { SESSION_IDLE_MS } from '../auth/session';
import { G4Failure, type G4Context, type G4Grant, type G4OutlineChange,
  type G4Store, type G4AuditRecord } from '../auth/g4-service';
import { resolveG1VersionSite, type IsolatedDb } from './g1-store';

type Faults = Readonly<{ audit?: boolean }>;
type Decision =
  | { ok: false; status: 401 | 403 }
  | { ok: true; actor: UserAccess; siteId: string | null };
function atomic<T>(db: IsolatedDb, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = work();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function actorFromSession(db: IsolatedDb, tokenHash: string | null, now: number): UserAccess | null {
  if (tokenHash === null) return null;
  const session = db.prepare(
    'SELECT s.user_id,s.issued_at,s.last_seen_at,s.expires_at,s.revoked_at,u.status,u.must_change_password ' +
    'FROM "AuthSession" s JOIN "User" u ON u.id=s.user_id WHERE s.token_hash=?',
  ).get(tokenHash);
  if (!session || session.revoked_at !== null || session.status !== 'ACTIVE' ||
      session.must_change_password !== 0 || now < Number(session.issued_at) ||
      now < Number(session.last_seen_at) || now >= Number(session.expires_at) ||
      now - Number(session.last_seen_at) >= SESSION_IDLE_MS) return null;
  const touched = db.prepare('UPDATE "AuthSession" SET last_seen_at=? WHERE token_hash=? AND revoked_at IS NULL AND last_seen_at<=?')
    .run(now, tokenHash, now);
  if (touched.changes !== 1) return null;
  const id = String(session.user_id);
  const roles = db.prepare('SELECT role FROM "UserRoleGrant" WHERE user_id=? ORDER BY role')
    .all(id).map(row => row.role as Role);
  const sites = db.prepare('SELECT site_id FROM "UserSiteGrant" WHERE user_id=? ORDER BY site_id')
    .all(id).map(row => String(row.site_id));
  const special = db.prepare('SELECT permission FROM "SpecialGrant" WHERE user_id=? ORDER BY permission')
    .all(id).map(row => row.permission as SpecialGrant);
  return { id, roles, siteGrants: sites, specialGrants: special,
    status: 'ACTIVE', mustChangePassword: false };
}
function append(db: IsolatedDb, faults: Faults, action: AuditAction,
  actor: string | null, affected: string | null,
  kind: AuditTarget, id: string, context: G4Context,
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED' = 'SUCCESS',
  site: string | null = null, before: number | null = null, after: number | null = null): void {
  if (faults.audit) throw new Error('G4_INJECTED_AUDIT_FAILURE');
  const event = createAuditEvent({
    actorUserId: actor, action, targetKind: kind, targetId: id,
    beforeRevision: before, afterRevision: after, outcome, requestId: context.requestId,
  }, new Date(context.now));
  db.prepare(
    'INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,' +
    'before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(randomUUID(), event.actorUserId, affected, site, event.action,
    event.targetKind, event.targetId, event.beforeRevision, event.afterRevision,
    event.outcome, event.timestampUtc, event.requestId);
}
function scopeId(db: IsolatedDb, resource: Resource): string | null {
  if (resource.kind === 'site') return resource.siteId;
  if (resource.kind === 'version') return resolveG1VersionSite(db, resource.versionId);
  return null;
}
function target(resource: Resource, action?: Action): { kind: AuditTarget; id: string } {
  if (action === 'logs:read' && resource.kind === 'global') return { kind: 'ROLE', id: 'logs_read' };
  if (resource.kind === 'site') return { kind: 'SITE', id: resource.siteId };
  if (resource.kind === 'version') return { kind: 'VERSION', id: resource.versionId };
  return { kind: 'ROLE', id: 'global' };
}
function decide(db: IsolatedDb, faults: Faults, tokenHash: string | null,
  action: Action, resource: Resource, context: G4Context): Decision {
  const actor = actorFromSession(db, tokenHash, context.now);
  const ref = target(resource, action);
  if (!actor) {
    append(db, faults, 'AUTHORIZATION_DENIED', null, null,
      action === 'logs:read' ? ref.kind : 'SESSION',
      action === 'logs:read' ? ref.id : 'unauthenticated', context, 'DENIED');
    return { ok: false, status: 401 };
  }
  const resolvedSiteId = scopeId(db, resource);
  try {
    const { siteId } = requireResolvedPermission(actor, action, resource, resolvedSiteId);
    return { ok: true, actor, siteId };
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    append(db, faults, 'AUTHORIZATION_DENIED', actor.id, actor.id,
      ref.kind, ref.id, context, 'DENIED', resolvedSiteId);
    return { ok: false, status: 403 };
  }
}
/** Decide, modify and append Audit under one BEGIN IMMEDIATE transaction. */
function guarded<T>(db: IsolatedDb, faults: Faults, token: string | null,
  action: Action, resource: Resource, context: G4Context,
  work: (actor: UserAccess, siteId: string | null, context: G4Context) => T, auditForbidden = false, runtime?: G4StoreScope): T {
  let result: { ok: false; status: 401 | 403 } | { ok: true; value: T };
  try {
    result = atomic(db, () => {
      runtime?.assertCurrent?.();
      if (runtime?.now) context = { ...context, now: runtime.now() };
      const decision = decide(db, faults, token, action, resource, context);
      if (!decision.ok) return { ok: false as const, status: decision.status };
      if (auditForbidden) db.exec('SAVEPOINT g4_runtime_work');
      try {
        const value = work(decision.actor, decision.siteId, context);
        if (auditForbidden) db.exec('RELEASE g4_runtime_work');
        return { ok: true as const, value };
      } catch (error) {
        if (!auditForbidden || !(error instanceof G4Failure) || error.status !== 403) throw error;
        db.exec('ROLLBACK TO g4_runtime_work; RELEASE g4_runtime_work;');
        const ref = target(resource, action);
        append(db, faults, 'AUTHORIZATION_DENIED', decision.actor.id, decision.actor.id,
          ref.kind, ref.id, context, 'DENIED', decision.siteId);
        return { ok: false as const, status: 403 as const };
      }
    });
  } catch (error) {
    if (error instanceof G4Failure) throw error;
    // Audit outage/DB busy is fail closed: no grant/business commit, no sensitive SQL in response.
    throw new G4Failure('G4_UNAVAILABLE', 503);
  }
  if (!result.ok) {
    throw new G4Failure(result.status === 401 ? 'UNAUTHENTICATED' : 'ACCESS_DENIED', result.status);
  }
  return result.value;
}
function targetExists(db: IsolatedDb, id: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM "User" WHERE id=?').get(id));
}
export function applyG4Fixture(db: IsolatedDb): void {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='AuditEvent'").get()) {
    throw new Error('G4_G1_FIXTURE_REQUIRED');
  }
  // Synthetic outline state for transactional permission/Audit testing only.
  // Actual CadOutline is owned by #98; operational CAD schema remains untouched.
  db.exec('CREATE TABLE IF NOT EXISTS "G4ShadowOutline" (' +
    'id TEXT PRIMARY KEY, version_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),' +
    'state TEXT NOT NULL CHECK(state IN (\'ACTIVE\',\'DELETED\')),' +
    'created_by TEXT NOT NULL, updated_by TEXT NOT NULL,' +
    'FOREIGN KEY(version_id) REFERENCES "CadFileVersion"(id) ON DELETE NO ACTION,' +
    'FOREIGN KEY(created_by) REFERENCES "User"(id) ON DELETE NO ACTION,' +
    'FOREIGN KEY(updated_by) REFERENCES "User"(id) ON DELETE NO ACTION)');
}
export type G4StoreScope = Readonly<{
  siteIds: readonly string[];
  assertCurrent?: () => void;
  now?: () => number;
  requireActiveCadSite?: boolean;
}>;
/** Global account changes cannot affect an account assigned outside this release scope. */
export function requireG4UserScope(db: IsolatedDb, userId: string, siteIds: readonly string[]): void {
  const grants = db.prepare('SELECT site_id FROM "UserSiteGrant" WHERE user_id=?').all(userId);
  if (grants.some(row => !siteIds.includes(String(row.site_id)))) {
    throw new G4Failure('ACCESS_DENIED', 403);
  }
}
export function createG4IsolatedStore(db: IsolatedDb, faults: Faults = {}, scope?: G4StoreScope): G4Store {
  function scoped<T>(token: string | null, action: Action, resource: Resource,
    context: G4Context, work: (actor: UserAccess, siteId: string | null, context: G4Context) => T): T {
    return guarded(db, faults, token, action, resource, context, (actor, siteId, current) => {
      if (scope && siteId !== null && (!scope.siteIds.includes(siteId) ||
          (scope.requireActiveCadSite && action.startsWith('cad:') &&
           !db.prepare('SELECT 1 FROM "CadSite" WHERE id=? AND active=1').get(siteId)))) {
        throw new G4Failure('ACCESS_DENIED', 403);
      }
      return work(actor, siteId, current);
    }, scope !== undefined, scope);
  }
  return {
    permit(token, action, resource, context) {
      return scoped(token, action, resource, context, (actor, siteId, context) => {
        const ref = target(resource, action);
        append(db, faults, 'AUTHORIZATION_GRANTED', actor.id, actor.id,
          ref.kind, ref.id, context, 'SUCCESS', siteId);
        return { siteId };
      });
    },
    grant(token, change: G4Grant, context) {
      scoped(token, 'grants:manage', { kind: 'global' }, context, (actor, _siteId, context) => {
        if (!targetExists(db, change.affectedUserId)) throw new G4Failure('ACCESS_DENIED', 403);
        if (scope) {
          requireG4UserScope(db, change.affectedUserId, scope.siteIds);
          if (change.kind === 'site' && !scope.siteIds.includes(change.value)) {
            throw new G4Failure('ACCESS_DENIED', 403);
          }
        }
        const columns = change.kind === 'role' ?
          { table: 'UserRoleGrant', key: 'role' } :
          change.kind === 'site' ? { table: 'UserSiteGrant', key: 'site_id' } :
            { table: 'SpecialGrant', key: 'permission' };
        // The table and column names are selected only from this fixed allow-list.
        const where = ' WHERE user_id=? AND "' + columns.key + '"=?';
        const exists = Boolean(db.prepare('SELECT 1 FROM "' + columns.table + '"' + where)
          .get(change.affectedUserId, change.value));
        if (change.operation === 'grant' && exists ||
            change.operation === 'revoke' && !exists) throw new G4Failure('CONFLICT', 409);
        if (change.kind === 'role' && change.operation === 'revoke' && change.value === 'Admin') {
          const remaining = db.prepare(
            "SELECT 1 FROM \"User\" u JOIN \"UserRoleGrant\" r ON r.user_id=u.id AND r.role='Admin' " +
            "WHERE u.id<>? AND u.status='ACTIVE' AND u.must_change_password=0 LIMIT 1",
          ).get(change.affectedUserId);
          if (!remaining) throw new G4Failure('CONFLICT', 409);
        }
        if (change.kind === 'site' &&
            !db.prepare('SELECT 1 FROM "CadSite" WHERE id=?').get(change.value)) {
          throw new G4Failure('ACCESS_DENIED', 403);
        }
        if (change.operation === 'grant') {
          db.prepare('INSERT INTO "' + columns.table +
            '"(user_id,"' + columns.key + '",granted_by_user_id,granted_at) VALUES(?,?,?,?)')
            .run(change.affectedUserId, change.value, actor.id, context.now);
        } else {
          db.prepare('DELETE FROM "' + columns.table + '"' + where)
            .run(change.affectedUserId, change.value);
        }
        append(db, faults, change.kind === 'site'
          ? (change.operation === 'grant' ? 'SITE_GRANTED' : 'SITE_REVOKED')
          : (change.operation === 'grant' ? 'ROLE_GRANTED' : 'ROLE_REVOKED'),
        actor.id, change.affectedUserId,
        change.kind === 'site' ? 'SITE' : 'ROLE', change.value.replace(':', '_'),
        context, 'SUCCESS', change.kind === 'site' ? change.value : null);
      });
    },
    disable(token, affectedUserId, context) {
      scoped(token, 'users:manage', { kind: 'global' }, context, (actor, _siteId, context) => {
        if (scope) requireG4UserScope(db, affectedUserId, scope.siteIds);
        const user = db.prepare('SELECT status FROM "User" WHERE id=?').get(affectedUserId);
        if (!user || user.status !== 'ACTIVE') throw new G4Failure('CONFLICT', 409);
        const admin = db.prepare("SELECT 1 FROM \"UserRoleGrant\" WHERE user_id=? AND role='Admin'")
          .get(affectedUserId);
        if (admin) {
          const other = db.prepare(
            "SELECT 1 FROM \"User\" u JOIN \"UserRoleGrant\" r ON r.user_id=u.id AND r.role='Admin' " +
            "WHERE u.id<>? AND u.status='ACTIVE' AND u.must_change_password=0 LIMIT 1",
          ).get(affectedUserId);
          if (!other) throw new G4Failure('CONFLICT', 409);
        }
        db.prepare('UPDATE "User" SET status=\'DISABLED\',updated_at=? WHERE id=?')
          .run(context.now, affectedUserId);
        db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
          .run(context.now, affectedUserId);
        append(db, faults, 'ACCOUNT_DISABLED', actor.id, affectedUserId,
          'ACCOUNT', affectedUserId, context);
      });
    },
    outline(token, change: G4OutlineChange, context) {
      return scoped(token, 'outline:write',
        { kind: 'version', versionId: change.versionId }, context, (actor, siteId, context) => {
          if (change.operation === 'create') {
            const id = randomUUID();
            db.prepare('INSERT INTO "G4ShadowOutline"(id,version_id,revision,state,created_by,updated_by) VALUES(?,?,1,\'ACTIVE\',?,?)')
              .run(id, change.versionId, actor.id, actor.id);
            append(db, faults, 'OUTLINE_CREATED', actor.id, actor.id, 'OUTLINE', id, context,
              'SUCCESS', siteId, null, 1);
            return { id, revision: 1, deleted: false };
          }
          const row = db.prepare(
            'SELECT revision,state,created_by FROM "G4ShadowOutline" WHERE id=? AND version_id=?',
          ).get(change.outlineId!, change.versionId);
          if (!row || row.state !== 'ACTIVE' || row.revision !== change.expectedRevision) {
            throw new G4Failure('CONFLICT', 409);
          }
          const next = Number(row.revision) + 1;
          const deleted = change.operation === 'delete';
          const updated = db.prepare(
            'UPDATE "G4ShadowOutline" SET revision=?,state=?,updated_by=? WHERE id=? AND revision=? AND state=\'ACTIVE\'',
          ).run(next, deleted ? 'DELETED' : 'ACTIVE', actor.id, change.outlineId!, change.expectedRevision!);
          if (updated.changes !== 1) throw new G4Failure('CONFLICT', 409);
          append(db, faults, deleted ? 'OUTLINE_DELETED' : 'OUTLINE_EDITED',
            actor.id, actor.id, 'OUTLINE', change.outlineId!, context, 'SUCCESS',
            siteId, Number(row.revision), next);
          return { id: change.outlineId!, revision: next, deleted };
        });
    },
    audit(token, limit, context): G4AuditRecord[] {
      return scoped(token, 'audit:read', { kind: 'global' }, context, (actor, _siteId, context) => {
        append(db, faults, 'AUTHORIZATION_GRANTED', actor.id, actor.id,
          'ROLE', 'audit_read', context);
        // Explicit projection: never fetch raw secrets or arbitrary business data.
        return db.prepare(
          'SELECT actor_user_id,affected_user_id,site_id,action,target_kind,target_id,' +
          'before_revision,after_revision,outcome,timestamp_utc,request_id ' +
           'FROM "AuditEvent" e ' + (scope ?
            'WHERE (e.site_id IS NULL OR e.site_id IN (' + scope.siteIds.map(() => '?').join(',') + ')) ' +
            'AND NOT EXISTS (SELECT 1 FROM "UserSiteGrant" g WHERE g.user_id=e.affected_user_id AND g.site_id NOT IN (' +
              scope.siteIds.map(() => '?').join(',') + ')) ' : '') +
          'ORDER BY timestamp_utc DESC,id DESC LIMIT ?',
        ).all(...(scope ? [...scope.siteIds, ...scope.siteIds] : []), limit).map(row => ({
          actor_user_id: row.actor_user_id as string | null,
          affected_user_id: row.affected_user_id as string | null,
          site_id: row.site_id as string | null,
          action: String(row.action), target_kind: String(row.target_kind),
          target_id: String(row.target_id),
          before_revision: row.before_revision as number | null,
          after_revision: row.after_revision as number | null,
          outcome: String(row.outcome), timestamp_utc: String(row.timestamp_utc),
          request_id: String(row.request_id),
        }));
      });
    },
  };
}

/** G7 staging-only: keeps Role/Site/Version decision, business mutation and Audit
 * inside the SAME BEGIN IMMEDIATE transaction; never called by normal CAD routes.
 */
export function g7GuardedMutation<T>(
  db: IsolatedDb, tokenHash: string | null, action: Action,
  resource: Resource, context: G4Context,
  work: (actor: UserAccess, siteId: string | null, context: G4Context) => T,
  runtime?: G4StoreScope,
): T {
  return guarded(db, {}, tokenHash, action, resource, context, work, runtime !== undefined, runtime);
}
