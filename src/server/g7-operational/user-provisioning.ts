/** #109 S3-2: Admin-only local account provisioning on a verified SQLite DB.
 * Not reachable in production until a separate release/operation binding.
 * Token/role are server-resolved inside the SAME transaction as User+Audit.
 */
import { randomUUID } from 'node:crypto';
import { normalizeLogin } from '../auth/login-service';
import { hashLocalPassword } from '../auth/password';
import { csrfProof } from '../auth/login-service';
import { digestSessionToken, SESSION_IDLE_MS } from '../auth/session';
import { requireSessionCsrf } from '../auth/guards';
import { G4Failure } from '../auth/g4-service';
import { createAuditEvent } from '../auth/audit';
import type { IsolatedDb } from '../g7-staging/g1-store';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const requestIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
function token(raw: string | null): string {
  if (!raw || !tokenPattern.test(raw) ||
      Buffer.from(raw, 'base64url').length !== 32 ||
      Buffer.from(raw, 'base64url').toString('base64url') !== raw) {
    throw new G4Failure('UNAUTHENTICATED', 401);
  }
  return raw;
}

export async function provisionG7PreviewUser(
  db: IsolatedDb, req: Request, rawToken: string | null,
  trustedOrigin: string, now: number, requestId: string,
): Promise<{id: string}> {
  if (req.method !== 'POST' || req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
      !Number.isSafeInteger(now) || now < 0 || !requestIdPattern.test(requestId)) {
    throw new G4Failure('BAD_INPUT', 400);
  }
  const raw = token(rawToken);
  try {
    requireSessionCsrf(req.headers.get('origin'), trustedOrigin,
      req.headers.get('x-csrf-token'), csrfProof(raw));
  } catch { throw new G4Failure('ACCESS_DENIED', 403); }
  const text = await req.text();
  if (text.length > 4096) throw new G4Failure('BAD_INPUT', 400);
  let body: unknown;
  try { body = JSON.parse(text); }
  catch { throw new G4Failure('BAD_INPUT', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new G4Failure('BAD_INPUT', 400);
  const entry = body as Record<string, unknown>;
  if (Object.keys(entry).some(key=>key!=='login'&&key!=='initialPassword') ||
      Object.keys(entry).length!==2) throw new G4Failure('BAD_INPUT', 400);
  let login: string;
  try { login = normalizeLogin(entry.login); }
  catch { throw new G4Failure('BAD_INPUT', 400); }
  if (typeof entry.initialPassword !== 'string' ||
      entry.initialPassword.toLowerCase() === login) throw new G4Failure('BAD_INPUT', 400);
  let passwordHash: string;
  try { passwordHash = await hashLocalPassword(entry.initialPassword); }
  catch { throw new G4Failure('BAD_INPUT', 400); }

  let decision: {id:string} | {denied:401|403};
  db.exec('BEGIN IMMEDIATE');
  try {
    const session = db.prepare(
      'SELECT s.id,s.user_id,s.issued_at,s.last_seen_at,s.expires_at,s.revoked_at,'+
      'u.status,u.must_change_password FROM "AuthSession" s '+
      'JOIN "User" u ON u.id=s.user_id WHERE s.token_hash=?',
    ).get(digestSessionToken(raw));
    if (!session || session.revoked_at != null || now < Number(session.issued_at) ||
        now < Number(session.last_seen_at) || now >= Number(session.expires_at) ||
        now-Number(session.last_seen_at)>=SESSION_IDLE_MS ||
        session.status!=='ACTIVE' || session.must_change_password!==0) {
      decision = {denied:401};
    } else {
      const admin = db.prepare(
        'SELECT 1 FROM "UserRoleGrant" WHERE user_id=? AND role=?',
      ).get(String(session.user_id),'Admin');
      if (!admin) {
        const event = createAuditEvent({
          actorUserId:String(session.user_id),action:'AUTHORIZATION_DENIED',
          targetKind:'ROLE',targetId:'users_manage',outcome:'DENIED',
          beforeRevision:null,afterRevision:null,requestId,
        },new Date(now));
        db.prepare(
          'INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,'+
          'before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        ).run(randomUUID(),String(session.user_id),String(session.user_id),null,
          event.action,event.targetKind,event.targetId,null,null,event.outcome,event.timestampUtc,event.requestId);
        decision = {denied:403};
      } else {
        const id=randomUUID();
        db.prepare(
          'INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) '+
          'VALUES(?,?,?,\'ACTIVE\',1,?,?)',
        ).run(id,login,passwordHash,now,now);
        const event=createAuditEvent({
          actorUserId:String(session.user_id),action:'ACCOUNT_CREATED',
          targetKind:'ACCOUNT',targetId:id,outcome:'SUCCESS',
          beforeRevision:null,afterRevision:null,requestId,
        },new Date(now));
        db.prepare(
          'INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,'+
          'before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        ).run(randomUUID(),String(session.user_id),id,null,event.action,event.targetKind,
          event.targetId,null,null,event.outcome,event.timestampUtc,event.requestId);
        const changed = db.prepare(
          'UPDATE "AuthSession" SET last_seen_at=? WHERE id=? AND revoked_at IS NULL AND last_seen_at<=?',
        ).run(now,String(session.id),now);
        if(changed.changes!==1) throw new Error('SESSION_CONFLICT');
        decision={id};
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (error instanceof Error && /UNIQUE constraint failed.*login_name/i.test(error.message))
      throw new G4Failure('CONFLICT', 409);
    throw new G4Failure('G4_UNAVAILABLE', 503);
  }
  if ('denied' in decision) throw new G4Failure(
    decision.denied===401?'UNAUTHENTICATED':'ACCESS_DENIED',decision.denied);
  return decision;
}
