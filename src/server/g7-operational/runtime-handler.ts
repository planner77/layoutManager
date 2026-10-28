import { randomBytes } from 'node:crypto';
import { AuthFailure, createLoginService } from '../auth/login-service';
import { handleG3Request, type G3Action } from '../auth/g3-request';
import { createG4Service, handleG4Request, G4Failure } from '../auth/g4-service';
import { requireSessionCsrf } from '../auth/guards';
import { csrfProof } from '../auth/login-service';
import { createG3IsolatedStore, createG3LoginLimiter } from '../g7-staging/g3-store';
import { createG4IsolatedStore } from '../g7-staging/g4-store';
import type { IsolatedDb } from '../g7-staging/g1-store';
import { resolveG7RuntimeGate, type G7RuntimeActiveGate } from './runtime-gate';
import { openG7RuntimeDb } from './runtime-db';
import { provisionG7PreviewUser } from './user-provisioning';
import { listRuntimeSites, listRuntimeUsers, revokeRuntimeSessions } from './runtime-user-management';
import { boundedJson } from '../http';
import { CadError } from '../../domain/cad';

export function runtimeReply(status: number, body: object): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Host is checked against configured public authority, not Next's bind URL. */
export function matchesRuntimeAuthority(request: Request, origin: string): boolean {
  try {
    const expected = new URL(origin);
    const authority = request.headers.get('host') ?? new URL(request.url).host;
    return authority === expected.host;
  } catch { return false; }
}

function token(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith('cad_session='));
  if (values.length !== 1) return null;
  const raw = values[0].slice('cad_session='.length);
  return /^[A-Za-z0-9_-]{43}$/.test(raw) && Buffer.from(raw, 'base64url').length === 32 &&
    Buffer.from(raw, 'base64url').toString('base64url') === raw ? raw : null;
}

/** Approval is read anew across asynchronous KDF boundaries; no request claim is an approval. */
export function assertRuntimeApprovalCurrent(gate: G7RuntimeActiveGate): void {
  const current = resolveG7RuntimeGate(process.env, Date.now());
  if (current.state !== 'ACTIVE' || current.approvalId !== gate.approvalId ||
      current.databasePath !== gate.databasePath || current.origin !== gate.origin ||
      current.cadStoragePath !== gate.cadStoragePath ||
      current.cadWriteEnabled !== gate.cadWriteEnabled || current.expiresAt !== gate.expiresAt ||
      JSON.stringify(current.siteIds) !== JSON.stringify(gate.siteIds)) {
    throw new Error('G7_RUNTIME_APPROVAL_CHANGED');
  }
}


async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new G4Failure('BAD_INPUT', 400);
  }
  const value = await request.text();
  if (value.length > 4096) throw new G4Failure('BAD_INPUT', 400);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new G4Failure('BAD_INPUT', 400); }
}

/** Existing G2/G3/G4 stores are injected only after the operating trust boundary succeeds. */
export async function handleG7RuntimeApi(request: Request, segments: readonly string[],
  gate: G7RuntimeActiveGate): Promise<Response> {
  const requestId = randomBytes(12).toString('base64url');
  if (segments.length !== 2 || segments.some(value => !/^[a-z-]{1,28}$/.test(value)) ||
      !matchesRuntimeAuthority(request, gate.origin)) {
    return runtimeReply(404, { error: { code: 'NOT_FOUND' } });
  }
  const [kind, action] = segments;
  const auth = ['login', 'initial-change', 'session', 'change', 'logout'];
  const access = ['permit', 'grant', 'disable', 'audit', 'sites'];
  const users = ['create', 'list', 'revoke'];
  if (!(kind === 'auth' && auth.includes(action)) &&
      !(kind === 'access' && access.includes(action)) &&
      !(kind === 'users' && users.includes(action))) {
    return runtimeReply(404, { error: { code: 'NOT_FOUND' } });
  }
  let db: IsolatedDb | undefined;
  try {
    if (request.method === 'POST' && !(kind === 'auth' && action === 'logout')) {
      const input = await boundedJson(request);
      request = new Request(request.url, { method: request.method,
        headers: request.headers, body: JSON.stringify(input) });
    }
    const check = () => assertRuntimeApprovalCurrent(gate);
    check();
    db = openG7RuntimeDb(gate);
    // G2 deliberately requires a pristine identity store. Anonymous probes
    // before explicit operator bootstrap must not create Audit/limiter rows.
    if (Number(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n) === 0) {
      return runtimeReply(503, { error: { code: 'BOOTSTRAP_REQUIRED' } });
    }
    const context = { now: Date.now(), requestId };
    let response: Response;
    if (kind === 'auth') {
      response = await handleG3Request(action as G3Action, request,
        createLoginService(createG3IsolatedStore(db, {}, { assertCurrent: check, now: Date.now })), {
          ...context, trustedOrigin: gate.origin,
          // Account limiter is durable and cannot be bypassed by spoofing proxy headers.
          peer: 'g7-runtime-account', limiter: createG3LoginLimiter(db),
        });
      if (action === 'session' && response.ok) {
        const body = await response.json();
        response = runtimeReply(200, { ...body, runtime: {
          cadWriteEnabled: gate.cadWriteEnabled, siteIds: gate.siteIds,
        } });
      }
      const cookie = response.headers.get('set-cookie');
      if (cookie && new URL(gate.origin).protocol === 'https:') {
        response.headers.set('set-cookie', cookie + '; Secure');
      }
    } else if (kind === 'access' && action !== 'sites') {
      const service = createG4Service(createG4IsolatedStore(db, {}, {
        siteIds: gate.siteIds, assertCurrent: check, now: Date.now,
      }));
      response = await handleG4Request(action as 'permit' | 'grant' | 'disable' | 'audit',
        request, service, { ...context, trustedOrigin: gate.origin });
    } else if (kind === 'users' && action === 'create') {
      const result = await provisionG7PreviewUser(db, request, token(request), gate.origin,
        context.now, requestId, { assertCurrent: check, now: Date.now });
      response = runtimeReply(201, result);
    } else if ((kind === 'users' && action === 'list') || action === 'sites') {
      if (request.method !== 'GET') throw new G4Failure('BAD_INPUT', 400);
      response = action === 'list'
        ? runtimeReply(200, { users: listRuntimeUsers(db, token(request), gate, context, check) })
        : runtimeReply(200, { sites: listRuntimeSites(db, token(request), gate, context, check) });
    } else {
      if (request.method !== 'POST') throw new G4Failure('BAD_INPUT', 400);
      const raw = token(request);
      if (!raw) throw new G4Failure('UNAUTHENTICATED', 401);
      requireSessionCsrf(request.headers.get('origin'), gate.origin,
        request.headers.get('x-csrf-token'), csrfProof(raw));
      const input = await readBody(request);
      if (Object.keys(input).length !== 1) throw new G4Failure('BAD_INPUT', 400);
      revokeRuntimeSessions(db, raw, input.userId, gate, { now: Date.now(), requestId }, check);
      response = runtimeReply(200, { ok: true });
    }
    response.headers.set('X-Request-Id', requestId);
    return response;
  } catch (error) {
    if (error instanceof CadError) {
      return runtimeReply(error.status, { error: { code: error.code } });
    }
    if (error instanceof AuthFailure || error instanceof G4Failure) {
      return runtimeReply(error.status, { error: { code: error.code } });
    }
    if (error instanceof Error && error.message.startsWith('CSRF_')) {
      return runtimeReply(403, { error: { code: 'ACCESS_DENIED' } });
    }
    return runtimeReply(503, { error: { code: 'G7_RUNTIME_UNAVAILABLE' } });
  } finally { db?.close(); }
}
