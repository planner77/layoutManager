/** Transactional CAD authorization shared by isolated preview and signed runtime. */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { CadError } from '@/domain/cad';
import {
  AuthorizationError, requireResolvedPermission,
  type Action, type Resource, type Role, type SpecialGrant, type UserAccess,
} from '@/domain/auth';
import { digestSessionToken, SESSION_IDLE_MS } from '@/server/auth/session';
import { AuthFailure, csrfProof } from '@/server/auth/login-service';
import { requireSessionCsrf } from '@/server/auth/guards';
import { resolveG7S3PreviewGate } from './preview-gate';
import { resolveG7RuntimeGate, type G7RuntimeActiveGate } from './runtime-gate';
import { createG3IsolatedStore } from '../g7-staging/g3-store';
import { openG7RuntimeDb } from './runtime-db';
import { createAuditEvent } from '../auth/audit';
import path from 'node:path';

type Tx = Prisma.TransactionClient;
const TOKEN = /^[a-zA-Z0-9_-]{43}$/;
const fail = (code: string, status: number) => new CadError(code, '인증 또는 작업 승인이 필요합니다.', status);
export type G7CadWrite = Readonly<{
  tokenHash: string; requestId: string; now: number;
  runtime?: Pick<G7RuntimeActiveGate, 'databasePath' | 'cadStoragePath' | 'approvalId' | 'siteIds' | 'expiresAt'>;
}>;

function cookieToken(request: Request, name: string): string | null {
  const parts = (request.headers.get('cookie') ?? '').split(';')
    .map(v => v.trim()).filter(v => v.startsWith(name + '='));
  return parts.length === 1 ? parts[0].slice(name.length + 1) : null;
}
/** Compare the approved public authority, never Next's internal bind hostname.
 * Forwarded identity/role/authority headers are intentionally ignored.
 */
export function requireG7PublicAuthority(request: Request, trustedOrigin: string): void {
  const authority = request.headers.get('host') ?? new URL(request.url).host;
  if (authority !== new URL(trustedOrigin).host) throw fail('ACCESS_DENIED', 403);
}

/** OFF preserves legacy writes; any incomplete/expired/revoked activation blocks writes. */
export function prepareG7CadWrite(request: Request, requestId: string): G7CadWrite | undefined {
  const env = process.env;
  const runtime = resolveG7RuntimeGate(env);
  if (runtime.state === 'BLOCKED') throw fail('G7_RUNTIME_BLOCKED', 503);
  let origin: string;
  let cookieName: string;
  let approvedRuntime: G7CadWrite['runtime'];
  if (runtime.state === 'ACTIVE') {
    if (!runtime.cadWriteEnabled) throw fail('G7_CAD_WRITE_DISABLED', 503);
    if (env.G7_S3_CAD_PREVIEW_ONLY === 'true' || env.G7_S3_AUTH_API_PREVIEW_ONLY === 'true')
      throw fail('G7_S3_CAD_PREVIEW_DENIED', 404);
    requireG7PublicAuthority(request, runtime.origin);
    const initialization = openG7RuntimeDb(runtime,true);
    try {
      if (Number(initialization.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n) === 0)
        throw fail('BOOTSTRAP_REQUIRED',503);
    } finally { initialization.close(); }
    origin = runtime.origin;
    cookieName = 'cad_session';
    approvedRuntime = runtime;
  } else {
    const attempted = env.G7_S3_CAD_PREVIEW_ONLY === 'true';
    if (!attempted) {
      if (env.G7_S3_CAD_PREVIEW_ONLY && env.G7_S3_CAD_PREVIEW_ONLY !== 'false')
        throw fail('G7_S3_CAD_PREVIEW_DENIED', 404);
      if (env.G7_S3_GO === 'true' || env.G7_OPERATION_MANIFEST_PATH)
        throw fail('G7_WRITE_CUTOVER_NOT_READY', 503);
      return undefined;
    }
    const gate = resolveG7S3PreviewGate(env);
    if (!gate || env.NODE_ENV === 'production' || new URL(request.url).origin !== gate.origin)
      throw fail('G7_S3_CAD_PREVIEW_DENIED', 404);
    const expected = path.join(gate.root, 'cad');
    if (env.CAD_STORAGE_PATH !== expected ||
        (env.CAD_STORAGE_BACKEND && env.CAD_STORAGE_BACKEND !== 'local') ||
        Object.entries(env).some(([key, value]) => key.startsWith('CAD_S3_') && !!value))
      throw fail('G7_S3_CAD_STORAGE_ALIGNMENT_DENIED', 503);
    origin = gate.origin;
    cookieName = 'cad_g7_s3_session';
  }
  const raw = cookieToken(request, cookieName);
  if (!raw || !TOKEN.test(raw) || Buffer.from(raw, 'base64url').length !== 32 ||
      Buffer.from(raw, 'base64url').toString('base64url') !== raw)
    throw fail('UNAUTHENTICATED', 401);
  try {
    requireSessionCsrf(request.headers.get('origin'), origin,
      request.headers.get('x-csrf-token'), csrfProof(raw));
  } catch { throw fail('ACCESS_DENIED', 403); }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw fail('BAD_REQUEST', 400);
  const proof: G7CadWrite = {tokenHash:digestSessionToken(raw),requestId,now:Date.now(),
    ...(approvedRuntime ? {runtime:approvedRuntime} : {})};
  if (approvedRuntime) {
    const db = openG7RuntimeDb(approvedRuntime);
    try {
      // Reuse G3 for early rejection before multipart reception. The business
      // transaction still reloads session, role, Site and gate independently.
      createG3IsolatedStore(db,{}, {assertCurrent:()=>{requireG7RuntimeWrite(proof);},now:()=>Date.now()})
        .authenticate(proof.tokenHash,Date.now());
    } catch (error) {
      if (error instanceof AuthFailure) throw fail(error.code,error.status);
      throw error;
    } finally { db.close(); }
  }
  return proof;
}

export function requireG7RuntimeWrite(proof: G7CadWrite): G7RuntimeActiveGate | null {
  if (!proof.runtime) return null;
  const gate = resolveG7RuntimeGate(process.env);
  if (gate.state !== 'ACTIVE' || !gate.cadWriteEnabled ||
      gate.databasePath !== proof.runtime.databasePath ||
      gate.cadStoragePath !== proof.runtime.cadStoragePath ||
      gate.approvalId !== proof.runtime.approvalId ||
      gate.expiresAt !== proof.runtime.expiresAt ||
      gate.siteIds.length !== proof.runtime.siteIds.length ||
      gate.siteIds.some(id => !proof.runtime!.siteIds.includes(id)))
    throw fail('G7_RUNTIME_BLOCKED', 503);
  return gate;
}
async function resolveG7WriteActor(tx: Tx, proof: G7CadWrite) {
  // Upload parse/storage preparation and serialized writes can delay this
  // transaction. Never reuse request-start time: role/session validity and
  // lastSeenAt must be checked at the moment of the business transaction.
  requireG7RuntimeWrite(proof);
  // Schema absence or Audit failure MUST fail the transaction, never fallback.
  const session = await tx.authSession.findUnique({
    where: { tokenHash: proof.tokenHash },
    include: { user: { include: { roles: true, sites: true, specials: true } } },
  });
  // A native G3 session refresh can commit while this asynchronous Prisma query
  // is queued. Compare its returned lastSeenAt with time sampled AFTER the read;
  // pre-query time rejects a current session as if its timestamp were future.
  const gate = requireG7RuntimeWrite(proof);
  const now = BigInt(Date.now());
  if (!session || session.revokedAt !== null || session.user.status !== 'ACTIVE' ||
      session.user.mustChangePassword || session.issuedAt > now ||
      session.lastSeenAt > now || session.expiresAt <= now ||
      now - session.lastSeenAt >= BigInt(SESSION_IDLE_MS)) {
    throw fail('UNAUTHENTICATED', 401);
  }
  const user: UserAccess = {
    id: session.user.id, status: 'ACTIVE', mustChangePassword: false,
    roles: session.user.roles.map(r => r.role as Role),
    siteGrants: session.user.sites.map(r => r.siteId),
    specialGrants: session.user.specials.map(r => r.permission as SpecialGrant),
  };
  return {gate, now, session, user};
}
/** No role check may be cached across writes or done only before Prisma.$transaction. */
export async function requireG7CadPermission(
  tx: Tx, proof: G7CadWrite | undefined, action: Action,
  resource: Resource, resolvedSiteId?: string | null,
): Promise<{ actorId: string; siteId: string }> {
  if (!proof) throw fail('G7_AUTH_CONTEXT_REQUIRED', 503);
  const {gate, now, session, user} = await resolveG7WriteActor(tx,proof);
  let siteId: string | null = resolvedSiteId ?? null;
  let approvedSiteId: string;
  if (resource.kind === 'version') {
    const version = await tx.cadFileVersion.findUnique({
      where: { id: resource.versionId },
      select: { location: { select: { building: { select: { siteId: true } } } } },
    });
    siteId = version?.location.building.siteId ?? null;
  } else if (resource.kind === 'site') {
    // A trusted registered location or version chain determines the real Site.
    siteId = resolvedSiteId ?? resource.siteId;
    if (resource.siteId !== siteId) throw fail('ACCESS_DENIED', 403);
  }
  try {
    if (gate && (!siteId || !gate.siteIds.includes(siteId))) throw new AuthorizationError();
    const result = requireResolvedPermission(user, action, resource, siteId);
    if (!result.siteId) throw new AuthorizationError();
    // Signed Site membership is release authority; business active is checked
    // at each CAD transaction and again before its final Audit insert.
    if (gate && !(await tx.cadSite.findFirst({where:{id:result.siteId,active:true},select:{id:true}})))
      throw new AuthorizationError();
    approvedSiteId = result.siteId;
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    throw fail('ACCESS_DENIED', 403);
  }
  const touched = await tx.authSession.updateMany({
    where: { id: session.id, revokedAt: null, lastSeenAt: { lte: now } },
    data: { lastSeenAt: now },
  });
  if (touched.count !== 1) throw fail('UNAUTHENTICATED', 401);
  return { actorId: user.id, siteId: approvedSiteId };
}
export async function appendG7CadAudit(tx: Tx, proof: G7CadWrite,
  actorId: string, siteId: string,
  action: 'CAD_UPLOADED' | 'CAD_CURRENT_CHANGED' | 'CAD_VERSION_DELETED' | 'SCENE_PUBLISHED',
  versionId: string, beforeRevision: number | null,
  afterRevision: number | null): Promise<void> {
  // Storage publication may await I/O inside this transaction. Recheck the
  // gate/session clock before the final atomic business+Audit commit.
  const authorized = await requireG7CadPermission(tx,proof,
    action === 'CAD_UPLOADED' || action === 'SCENE_PUBLISHED' ? 'cad:upload' : action === 'CAD_CURRENT_CHANGED' ? 'cad:current' : 'cad:delete',
    {kind:'site',siteId},siteId);
  if (authorized.actorId !== actorId) throw fail('UNAUTHENTICATED',401);
  // If INSERT is rejected (Append-only/FK/DB busy), the CAD mutation MUST roll back.
  await tx.auditEvent.create({ data: {
    id: randomUUID(), actorUserId: actorId, affectedUserId: actorId, siteId,
    action, targetKind: 'VERSION', targetId: versionId, outcome: 'SUCCESS',
    beforeRevision, afterRevision,
    timestampUtc: new Date().toISOString(), requestId: proof.requestId,
  } });
}

/** Master mutations require current Admin plus every authoritative affected Site.
 * Global Admin never implies a grant to another Site.
 */
export async function requireG7MasterPermission(tx: Tx, proof: G7CadWrite,
  siteIds: readonly string[]): Promise<string> {
  const gate = requireG7RuntimeWrite(proof);
  if (!gate) throw fail('G7_MASTER_PREVIEW_DENIED', 403);
  const {session, user, now} = await resolveG7WriteActor(tx,proof);
  try {
    requireResolvedPermission(user, 'users:manage',{kind:'global'},null);
    for (const siteId of siteIds) {
      if (!gate.siteIds.includes(siteId)) throw new AuthorizationError();
      requireResolvedPermission(user, 'cad:current', {kind:'site',siteId}, siteId);
    }
  } catch { throw fail('ACCESS_DENIED', 403); }
  await tx.authSession.update({where:{id:session.id},data:{lastSeenAt:now}});
  return session.user.id;
}

export async function appendG7MasterAudit(tx: Tx, proof: G7CadWrite,
  actorId: string, targetId: string, siteId: string | null = null): Promise<void> {
  const event = createAuditEvent({actorUserId:actorId,action:'AUTHORIZATION_GRANTED',
    targetKind:siteId ? 'SITE' : 'ROLE',targetId,beforeRevision:null,afterRevision:null,
    outcome:'SUCCESS',requestId:proof.requestId},new Date());
  await tx.auditEvent.create({data:{id:randomUUID(),...event,siteId}});
}

/** A rejected request has no business commit. Persist a separate safe denial/failure
 * event after rollback, without request bodies, passwords, cookies or error text.
 * If the audit store also fails, report unavailability; never retry the mutation.
 */
export async function recordG7WriteFailure(request: Request, requestId: string,
  targetKind: 'VERSION' | 'ROLE', targetId: string, error: unknown): Promise<void> {
  const gate = resolveG7RuntimeGate(process.env);
  if (gate.state !== 'ACTIVE') return;
  let db: ReturnType<typeof openG7RuntimeDb> | undefined;
  try {
    db = openG7RuntimeDb(gate);
    db.exec('BEGIN IMMEDIATE');
    // G2 requires a pristine identity/Audit store for first-admin creation.
    // Denials cannot make an uninitialized installation impossible to bootstrap.
    if (Number(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n) === 0) {
      db.exec('COMMIT');
      return;
    }
    const raw = cookieToken(request,'cad_session');
    const actor = raw && TOKEN.test(raw) ? db.prepare(
      'SELECT u.id FROM "AuthSession" s JOIN "User" u ON u.id=s.user_id WHERE s.token_hash=?',
    ).get(digestSessionToken(raw)) : undefined;
    const versionSite = targetKind === 'VERSION' ? db.prepare(
      'SELECT b.site_id FROM "CadFileVersion" v JOIN "CadLocation" l ON l.id=v.location_id JOIN "Building" b ON b.id=l.building_id WHERE v.id=?',
    ).get(targetId) : undefined;
    const siteId = typeof versionSite?.site_id === 'string' ? versionSite.site_id : null;
    const event = createAuditEvent({actorUserId:typeof actor?.id === 'string' ? actor.id : null,
      action:'AUTHORIZATION_DENIED',targetKind,
      targetId:/^[a-zA-Z0-9_-]{1,128}$/.test(targetId) ? targetId : 'INVALID_TARGET',
      beforeRevision:null,afterRevision:null,
      outcome:error instanceof CadError && [401,403].includes(error.status) ? 'DENIED' : 'FAILED',
      requestId},new Date());
    db.prepare('INSERT INTO "AuditEvent"(id,actor_user_id,site_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(),event.actorUserId,siteId,event.action,event.targetKind,event.targetId,
        null,null,event.outcome,event.timestampUtc,event.requestId);
    db.exec('COMMIT');
  } catch {
    try { db?.exec('ROLLBACK'); } catch { /* no active transaction */ }
    throw fail('G7_AUDIT_UNAVAILABLE',503);
  }
  finally { db?.close(); }
}
