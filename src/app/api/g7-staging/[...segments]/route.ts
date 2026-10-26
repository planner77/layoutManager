/** #109 G7 S1: private staging preview routes, NEVER the legacy CAD API. */
import { randomBytes } from 'node:crypto';
import { AuthFailure, createLoginService } from '@/server/auth/login-service';
import { handleG3Request, type G3Action } from '@/server/auth/g3-request';
import { createG4Service, G4Failure, handleG4Request } from '@/server/auth/g4-service';
import { csrfProof } from '@/server/auth/login-service';
import { requireSessionCsrf } from '@/server/auth/guards';
import { resolveG7StagingGate, type G7StagingGate } from '@/server/g7-staging/gate';
import { openG7StagingDb } from '@/server/g7-staging/db';
import { createG3IsolatedStore, createG3LoginLimiter } from '@/server/g7-staging/g3-store';
import { createG4IsolatedStore } from '@/server/g7-staging/g4-store';
import { stagedCadCurrent, stagedCadDelete, stagedCadUpload,
  stagedCadList, stagedCadContent } from '@/server/g7-staging/cad-service';
import type { IsolatedDb } from '@/server/g7-staging/g1-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ segments: string[] }> };
const json = (status: number, body: object) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inactive = () => json(404, { error: { code: 'NOT_FOUND' } });
const failure = (error: unknown) => {
  if (error instanceof G4Failure || error instanceof AuthFailure)
    return json(error.status, { error: { code: error.code } });
  return json(503, { error: { code: 'G7_STAGING_UNAVAILABLE' } });
};
// Stage cookies must not replace the operational cad_session cookie at a
// shared HTTP hostname. The existing G3/G4 service keeps its internal token
// name; requests/responses are adapted only at this staging-only boundary.
const STAGE_COOKIE = 'cad_staging_session';
function cookie(req: Request) {
  const prefix = STAGE_COOKIE + '=';
  const matches = (req.headers.get('cookie') ?? '').split(';')
    .map(x => x.trim()).filter(x => x.startsWith(prefix));
  return matches.length === 1 ? matches[0].slice(prefix.length) : null;
}
function normalizedAuthRequest(req: Request): Request {
  const headers = new Headers(req.headers);
  const rawToken = cookie(req);
  headers.delete('cookie');
  if (rawToken) headers.set('cookie', 'cad_session=' + rawToken);
  return new Request(req, { headers });
}
function stagingCookieResponse(response: Response): Response {
  const original = response.headers.get('set-cookie');
  if (!original) return response;
  if (!original.startsWith('cad_session=') || !original.includes('; Path=/;')) {
    throw new G4Failure('G4_UNAVAILABLE', 503);
  }
  const headers = new Headers(response.headers);
  headers.set('set-cookie', original.replace(/^cad_session=/, STAGE_COOKIE + '=')
    .replace('; Path=/;', '; Path=/api/g7-staging;'));
  return new Response(response.body, { status: response.status, headers });
}
async function input(req: Request) {
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new G4Failure('BAD_INPUT', 400);
  const raw = await req.text();
  if (raw.length > 350000) throw new G4Failure('BAD_INPUT', 400);
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new G4Failure('BAD_INPUT', 400); }
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new G4Failure('BAD_INPUT', 400);
  return value as Record<string, unknown>;
}
async function execute(req: Request, args: Params): Promise<Response> {
  const gate = resolveG7StagingGate(process.env);
  if (!gate) return inactive();
  // A private, isolated origin is supplied by the operator; never trust
  // X-Forwarded-* or client-originated identity headers for staging gates.
  if (new URL(req.url).origin !== gate.origin) return inactive();
  let db: IsolatedDb;
  try { db = openG7StagingDb(gate); }
  catch { return json(503, { error: { code: 'G7_STAGING_DATABASE_UNAVAILABLE' } }); }
  try { return await dispatch(req, args, db, gate); }
  catch (error) { return failure(error); }
  finally { db.close(); }
}
async function dispatch(req: Request, args: Params, db: IsolatedDb, gate: G7StagingGate) {
  const segments = (await args.params).segments;
  if (!Array.isArray(segments) || segments.length !== 2 ||
      segments.some(s => !/^[a-z-]{1,28}$/.test(s))) return inactive();
  const action = segments.join('/');
  const requestId = randomBytes(12).toString('base64url');
  const context = { now: Date.now(), requestId };
  if (segments[0] === 'auth' &&
      ['login', 'initial-change', 'session', 'change', 'logout'].includes(segments[1])) {
    const service = createLoginService(createG3IsolatedStore(db));
    const result = await handleG3Request(segments[1] as G3Action, normalizedAuthRequest(req), service, {
      trustedOrigin: gate.origin, peer: 'g7-staging-only', now: context.now,
      requestId, limiter: createG3LoginLimiter(db),
    });
    return stagingCookieResponse(result);
  }
  if (segments[0] === 'access' &&
      ['permit', 'grant', 'disable', 'audit'].includes(segments[1])) {
    const service = createG4Service(createG4IsolatedStore(db));
    return handleG4Request(segments[1] as
      'permit' | 'grant' | 'disable' | 'audit', normalizedAuthRequest(req), service,
      { ...context, trustedOrigin: gate.origin });
  }
  if (segments[0] !== 'cad') return inactive();
  if (action === 'cad/list' && req.method === 'GET') {
    return json(200, { versions: stagedCadList(db) });
  }
  if (action === 'cad/content' && req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('versionId');
    if (!id) throw new G4Failure('BAD_INPUT', 400);
    const buffer = stagedCadContent(db, gate, id);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { 'Content-Type': 'application/dxf',
        'Content-Length': String(buffer.byteLength), 'Cache-Control': 'no-store' },
    });
  }
  if (!gate.writeEnabled) return json(403, { error: { code: 'ACCESS_DENIED' } });
  if (req.headers.get('origin') !== gate.origin)
    return json(403, { error: { code: 'ACCESS_DENIED' } });
  const rawToken = cookie(req);
  // For write endpoints require a valid session-bound CSRF proof.
  if (!rawToken) return json(401, { error: { code: 'UNAUTHENTICATED' } });
  try {
    requireSessionCsrf(req.headers.get('origin'), gate.origin,
      req.headers.get('x-csrf-token'), csrfProof(rawToken));
  } catch { return json(403, { error: { code: 'ACCESS_DENIED' } }); }
  if ((action === 'cad/upload' && req.method === 'POST') ||
      (action === 'cad/current' && req.method === 'PUT') ||
      (action === 'cad/version' && req.method === 'DELETE')) {
    const body = await input(req);
    const result = action === 'cad/upload' ?
      await stagedCadUpload(db, gate, rawToken, body, context) :
      action === 'cad/current' ? stagedCadCurrent(db, gate, rawToken, body, context) :
      await stagedCadDelete(db, gate, rawToken, body, context);
    return json(action === 'cad/upload' ? 201 : 200, result);
  }
  return inactive();
}

export async function GET(req: Request, args: Params) { return execute(req, args); }
export async function POST(req: Request, args: Params) { return execute(req, args); }
export async function PUT(req: Request, args: Params) { return execute(req, args); }
export async function DELETE(req: Request, args: Params) { return execute(req, args); }
