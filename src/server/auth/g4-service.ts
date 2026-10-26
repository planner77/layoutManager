/**
 * #106 G4: non-routed, storage-neutral authorization service.
 * Never import this in App Router, Prisma production or startup before G7.
 * Session identity comes only from the G3 HttpOnly cookie; scopes are
 * reloaded by the store inside the SAME write transaction as mutations/Audit.
 */
import { digestSessionToken } from './session';
import { csrfProof } from './login-service';
import { requireSessionCsrf } from './guards';
import type { Action, Resource } from '../../domain/auth';

export type G4Context = Readonly<{ now: number; requestId: string }>;
export type G4Grant = Readonly<{
  kind: 'role' | 'site' | 'special';
  operation: 'grant' | 'revoke';
  affectedUserId: string;
  value: string;
}>;
export type G4OutlineChange = Readonly<{
  operation: 'create' | 'edit' | 'delete';
  versionId: string;
  outlineId?: string;
  expectedRevision?: number;
}>;
export type G4AuditRecord = Readonly<{
  actor_user_id: string | null; affected_user_id: string | null;
  site_id: string | null; action: string; target_kind: string;
  target_id: string; before_revision: number | null;
  after_revision: number | null; outcome: string; timestamp_utc: string;
  request_id: string;
}>;

/** A DB adapter MUST serialize authorization, grant/mutation and Audit. */
export type G4Store = Readonly<{
  permit(tokenHash: string | null, action: Action, resource: Resource,
    context: G4Context): { siteId: string | null };
  grant(tokenHash: string | null, change: G4Grant, context: G4Context): void;
  disable(tokenHash: string | null, affectedUserId: string, context: G4Context): void;
  outline(tokenHash: string | null, change: G4OutlineChange,
    context: G4Context): { id: string; revision: number; deleted: boolean };
  audit(tokenHash: string | null, limit: number, context: G4Context): G4AuditRecord[];
}>;

export type G4Code = 'UNAUTHENTICATED' | 'ACCESS_DENIED' | 'CONFLICT' |
  'BAD_INPUT' | 'G4_UNAVAILABLE';
export class G4Failure extends Error {
  constructor(readonly code: G4Code, readonly status: number) { super(code); }
}
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ACTIONS: readonly string[] = [
  'cad:read', 'cad:upload', 'cad:current', 'cad:delete',
  'outline:read', 'outline:write', 'outlineType:read', 'outlineType:manage',
  'users:manage', 'grants:manage', 'audit:read', 'logs:read',
];
function contextValid(context: G4Context) {
  if (!context || !Number.isSafeInteger(context.now) || context.now < 0 ||
      typeof context.requestId !== 'string' || !ID.test(context.requestId)) {
    throw new G4Failure('BAD_INPUT', 400);
  }
}
function sessionHash(value: unknown): string | null {
  if (typeof value !== 'string' || !TOKEN.test(value) ||
      Buffer.from(value, 'base64url').length !== 32 ||
      Buffer.from(value, 'base64url').toString('base64url') !== value) return null;
  return digestSessionToken(value);
}
function resourceValid(value: unknown): value is Resource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return obj.kind === 'global' ||
    (obj.kind === 'site' && typeof obj.siteId === 'string' && ID.test(obj.siteId)) ||
    (obj.kind === 'version' && typeof obj.versionId === 'string' && ID.test(obj.versionId));
}
function grantValid(value: G4Grant) {
  return value && ['role', 'site', 'special'].includes(value.kind) &&
    ['grant', 'revoke'].includes(value.operation) &&
    typeof value.affectedUserId === 'string' && ID.test(value.affectedUserId) &&
    typeof value.value === 'string' &&
    (value.kind === 'role' ? ['Reader', 'Editor', 'Admin'].includes(value.value) :
      value.kind === 'special' ? ['audit:read', 'logs:read'].includes(value.value) : ID.test(value.value));
}
function outlineValid(value: G4OutlineChange) {
  return value && ['create', 'edit', 'delete'].includes(value.operation) &&
    typeof value.versionId === 'string' && ID.test(value.versionId) &&
    (value.operation === 'create' ?
      value.outlineId === undefined && value.expectedRevision === undefined :
      typeof value.outlineId === 'string' && ID.test(value.outlineId) &&
      Number.isSafeInteger(value.expectedRevision) && (value.expectedRevision ?? 0) > 0);
}

/** No public read adapter here: legacy CAD GET remains anonymous and unchanged. */
export function createG4Service(store: G4Store) {
  return {
    permit(token: unknown, action: Action, resource: Resource, context: G4Context) {
      contextValid(context);
      if (!ACTIONS.includes(action) || !resourceValid(resource)) throw new G4Failure('BAD_INPUT', 400);
      return store.permit(sessionHash(token), action, resource, context);
    },
    grant(token: unknown, change: G4Grant, context: G4Context) {
      contextValid(context);
      if (!grantValid(change)) throw new G4Failure('BAD_INPUT', 400);
      store.grant(sessionHash(token), change, context);
    },
    disable(token: unknown, userId: string, context: G4Context) {
      contextValid(context);
      if (typeof userId !== 'string' || !ID.test(userId)) throw new G4Failure('BAD_INPUT', 400);
      store.disable(sessionHash(token), userId, context);
    },
    outline(token: unknown, change: G4OutlineChange, context: G4Context) {
      contextValid(context);
      if (!outlineValid(change)) throw new G4Failure('BAD_INPUT', 400);
      return store.outline(sessionHash(token), change, context);
    },
    audit(token: unknown, limit: number, context: G4Context) {
      contextValid(context);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new G4Failure('BAD_INPUT', 400);
      }
      return store.audit(sessionHash(token), limit, context);
    },
  };
}

type G4RequestAction = 'permit' | 'grant' | 'disable' | 'outline' | 'audit';
function cookieToken(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith('cad_session='));
  return values.length === 1 ? values[0].slice('cad_session='.length) : null;
}
function response(status: number, payload: object) {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
/**
 * Request/Response fixture, NOT a Next.js route. The server supplies
 * trustedOrigin and now; request role/user/site/header claims are ignored.
 */
export async function handleG4Request(
  action: G4RequestAction, request: Request, service: ReturnType<typeof createG4Service>,
  context: G4Context & { trustedOrigin: string },
): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new G4Failure('BAD_INPUT', 400);
    const token = cookieToken(request);
    if (sessionHash(token) === null) {
      // Persist an anonymous denial without manufacturing a Reader actor.
      service.permit(null, 'grants:manage', { kind: 'global' }, context);
      throw new G4Failure('UNAUTHENTICATED', 401);
    }
    requireSessionCsrf(request.headers.get('origin'), context.trustedOrigin,
      request.headers.get('x-csrf-token'), csrfProof(token!));
    const raw = await request.text();
    if (raw.length > 4096) throw new G4Failure('BAD_INPUT', 400);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { throw new G4Failure('BAD_INPUT', 400); }
    if (action === 'permit') {
      const permission = body.action;
      if (typeof permission !== 'string' || !ACTIONS.includes(permission) ||
          !resourceValid(body.resource)) throw new G4Failure('BAD_INPUT', 400);
      return response(200, { ok: true,
        ...service.permit(token, permission as Action, body.resource, context) });
    }
    if (action === 'grant') {
      service.grant(token, body as unknown as G4Grant, context);
      return response(200, { ok: true });
    }
    if (action === 'disable') {
      service.disable(token, body.userId as string, context);
      return response(200, { ok: true });
    }
    if (action === 'outline') {
      const result = service.outline(token, body as unknown as G4OutlineChange, context);
      return response(200, { ok: true, ...result });
    }
    if (action === 'audit') {
      return response(200, { events: service.audit(token, body.limit as number, context) });
    }
    throw new G4Failure('BAD_INPUT', 400);
  } catch (error) {
    if (error instanceof G4Failure) return response(error.status, { error: { code: error.code } });
    if (error instanceof Error && error.message.startsWith('CSRF_')) {
      return response(403, { error: { code: 'ACCESS_DENIED' } });
    }
    return response(503, { error: { code: 'G4_UNAVAILABLE' } });
  }
}
