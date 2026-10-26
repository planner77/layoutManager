/** #109 G7 operational CAD gate. Authorize + business change + Audit in ONE Prisma transaction.
 * Do not activate without S3 release-specific GO and formal auth schema applied.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { CadError } from '@/domain/cad';
import {
  AuthorizationError, requireResolvedPermission,
  type Action, type Resource, type Role, type SpecialGrant, type UserAccess,
} from '@/domain/auth';
import { digestSessionToken, SESSION_IDLE_MS } from '@/server/auth/session';
import { csrfProof } from '@/server/auth/login-service';
import { requireSessionCsrf } from '@/server/auth/guards';
import { g7OperationalWriteMode, resolveG7OperationGate } from './gate';

type Tx = Prisma.TransactionClient;
const TOKEN = /^[a-zA-Z0-9_-]{43}$/;
const fail = (code: string, status: number) => new CadError(code, '인증 또는 작업 승인이 필요합니다.', status);
export type G7CadWrite = Readonly<{ tokenHash: string; requestId: string; now: number }>;

function cookieToken(request: Request): string | null {
  const parts = (request.headers.get('cookie') ?? '').split(';')
    .map(v => v.trim()).filter(v => v.startsWith('cad_session='));
  return parts.length === 1 ? parts[0].slice('cad_session='.length) : null;
}
/** Read only trusted private approval; never accept X-Role/X-User/X-Site. */
export function prepareG7CadWrite(request: Request, requestId: string): G7CadWrite | undefined {
  const mode = g7OperationalWriteMode(process.env);
  if (mode === 'legacy') return undefined;
  if (mode !== 'protected') throw fail('G7_WRITE_CUTOVER_NOT_READY', 503);
  const gate = resolveG7OperationGate(process.env);
  if (!gate || !gate.writeEnabled) throw fail('G7_WRITE_CUTOVER_NOT_READY', 503);
  const raw = cookieToken(request);
  if (!raw || !TOKEN.test(raw) ||
      Buffer.from(raw, 'base64url').length !== 32 ||
      Buffer.from(raw, 'base64url').toString('base64url') !== raw) {
    throw fail('UNAUTHENTICATED', 401);
  }
  try {
    requireSessionCsrf(request.headers.get('origin'), gate.origin,
      request.headers.get('x-csrf-token'), csrfProof(raw));
  } catch { throw fail('ACCESS_DENIED', 403); }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw fail('BAD_REQUEST', 400);
  return { tokenHash: digestSessionToken(raw), requestId, now: Date.now() };
}
/** No role check may be cached across writes or done only before Prisma.$transaction. */
export async function requireG7CadPermission(
  tx: Tx, proof: G7CadWrite | undefined, action: Action,
  resource: Resource, resolvedSiteId?: string | null,
): Promise<{ actorId: string; siteId: string }> {
  if (!proof) throw fail('G7_AUTH_CONTEXT_REQUIRED', 503);
  const now = BigInt(proof.now);
  // Schema absence or Audit unavailability must fail the transaction, never
  // fall back to ordinary legacy write.
  const session = await tx.authSession.findUnique({
    where: { tokenHash: proof.tokenHash },
    include: { user: { include: { roles: true, sites: true, specials: true } } },
  });
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
    const result = requireResolvedPermission(user, action, resource, siteId);
    if (!result.siteId) throw new AuthorizationError();
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
  action: 'CAD_UPLOADED' | 'CAD_CURRENT_CHANGED' | 'CAD_VERSION_DELETED',
  versionId: string): Promise<void> {
  // If INSERT is rejected (Append-only/FK/DB busy), the CAD mutation MUST roll back.
  await tx.auditEvent.create({ data: {
    id: randomUUID(), actorUserId: actorId, affectedUserId: actorId, siteId,
    action, targetKind: 'VERSION', targetId: versionId, outcome: 'SUCCESS',
    beforeRevision: null, afterRevision: null,
    timestampUtc: new Date(proof.now).toISOString(), requestId: proof.requestId,
  } });
}
