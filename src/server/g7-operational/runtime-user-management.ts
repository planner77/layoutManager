import { randomUUID } from 'node:crypto';
import { createAuditEvent } from '../auth/audit';
import { G4Failure, type G4Context } from '../auth/g4-service';
import { digestSessionToken } from '../auth/session';
import { g7GuardedMutation, requireG4UserScope } from '../g7-staging/g4-store';
import type { IsolatedDb } from '../g7-staging/g1-store';
import type { G7RuntimeActiveGate } from './runtime-gate';

/** Reuse the G4 transaction and Actor resolution for the operating account view. */
export function listRuntimeUsers(db: IsolatedDb, raw: string | null,
  gate: G7RuntimeActiveGate, context: G4Context, check: () => void) {
  return g7GuardedMutation(db, raw ? digestSessionToken(raw) : null,
    'users:manage', { kind: 'global' }, context, () => {
      check();
      return db.prepare('SELECT id,login_name,status,must_change_password FROM "User" ORDER BY login_name')
        .all().filter(user => {
          const sites = db.prepare('SELECT site_id FROM "UserSiteGrant" WHERE user_id=?').all(String(user.id));
          return sites.every(row => gate.siteIds.includes(String(row.site_id)));
        }).map(user => ({
          id: String(user.id), login: String(user.login_name), status: String(user.status),
          mustChangePassword: user.must_change_password === 1,
          roles: db.prepare('SELECT role FROM "UserRoleGrant" WHERE user_id=? ORDER BY role')
            .all(String(user.id)).map(row => String(row.role)),
          siteIds: db.prepare('SELECT site_id FROM "UserSiteGrant" WHERE user_id=? ORDER BY site_id')
            .all(String(user.id)).map(row => String(row.site_id)),
          specialGrants: db.prepare('SELECT permission FROM "SpecialGrant" WHERE user_id=? ORDER BY permission')
            .all(String(user.id)).map(row => String(row.permission)),
        }));
    }, { siteIds: gate.siteIds, assertCurrent: check, now: Date.now });
}

export function listRuntimeSites(db: IsolatedDb, raw: string | null,
  gate: G7RuntimeActiveGate, context: G4Context, check: () => void) {
  return g7GuardedMutation(db, raw ? digestSessionToken(raw) : null,
    'users:manage', { kind: 'global' }, context, () => {
      check();
      return gate.siteIds.flatMap(id => {
        const site = db.prepare('SELECT id,name FROM "CadSite" WHERE id=? AND active=1').get(id);
        return site ? [{ id: String(site.id), name: String(site.name) }] : [];
      });
    }, { siteIds: gate.siteIds, assertCurrent: check, now: Date.now });
}

/** All target sessions and their audit receipts commit or roll back together. */
export function revokeRuntimeSessions(db: IsolatedDb, raw: string | null, userId: unknown,
  gate: G7RuntimeActiveGate, context: G4Context, check: () => void): void {
  if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    throw new G4Failure('BAD_INPUT', 400);
  }
  g7GuardedMutation(db, raw ? digestSessionToken(raw) : null,
    'users:manage', { kind: 'global' }, context, (actor, _siteId, context) => {
      check();
      requireG4UserScope(db, userId, gate.siteIds);
      if (!db.prepare('SELECT 1 FROM "User" WHERE id=?').get(userId)) {
        throw new G4Failure('ACCESS_DENIED', 403);
      }
      const sessions = db.prepare('SELECT id FROM "AuthSession" WHERE user_id=? AND revoked_at IS NULL').all(userId);
      db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
        .run(context.now, userId);
      for (const session of sessions) {
        const event = createAuditEvent({ actorUserId: actor.id, action: 'SESSION_REVOKED',
          targetKind: 'SESSION', targetId: String(session.id), outcome: 'SUCCESS',
          beforeRevision: null, afterRevision: null, requestId: context.requestId }, new Date(context.now));
        db.prepare('INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,' +
          'before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(), actor.id, userId, null, event.action, event.targetKind, event.targetId,
            null, null, event.outcome, event.timestampUtc, event.requestId);
      }
    }, { siteIds: gate.siteIds, assertCurrent: check, now: Date.now });
}
