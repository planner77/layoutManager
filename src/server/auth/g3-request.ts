/** #105 in-memory Request/Response contract. It is not an App Router handler. */
import { AuthFailure, createLoginService, normalizeLogin } from './login-service';
import { expiredSessionCookie, sessionCookie } from './session';
import { requireSessionCsrf } from './guards';

type Service = ReturnType<typeof createLoginService>;
export type G3Action = 'login' | 'initial-change' | 'session' | 'change' | 'logout';
export type AttemptLimiter = Readonly<{ reserve(key: string, now: number): void; reset(key: string): void }>;
export type G3RequestContext = Readonly<{
  trustedOrigin: string; peer: string; now: number; requestId: string;
  limiter: AttemptLimiter;
}>;
function reply(status: number, body: object, cookie?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
function sameOrigin(request: Request, trusted: string) {
  const supplied = request.headers.get('origin');
  try {
    const expected = new URL(trusted);
    if (!supplied || new URL(supplied).origin !== supplied ||
        expected.origin !== trusted || supplied !== trusted ||
        !['http:', 'https:'].includes(expected.protocol)) throw new Error();
  } catch { throw new AuthFailure('CSRF_DENIED', 403); }
}
function cookieToken(request: Request): string | null {
  const matches = (request.headers.get('cookie') ?? '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith('cad_session='));
  return matches.length === 1 ? matches[0].slice('cad_session='.length) : null;
}
function resetAfterCommit(limiter: AttemptLimiter, key: string) {
  // The session/password transaction has committed. A limiter cleanup failure
  // must not hide a valid cookie or force an unnecessary password recovery.
  try { limiter.reset(key); } catch { /* the next window can expire normally */ }
}
async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new Error();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new AuthFailure('BAD_INPUT', 400); }
}

/** Trusted origin and peer are supplied by server configuration, never request Host/X-Role. */
export async function handleG3Request(action: G3Action, request: Request,
  service: Service, context: G3RequestContext): Promise<Response> {
  try {
    if (action === 'session') {
      if (request.method !== 'GET') throw new AuthFailure('BAD_INPUT', 400);
      const { actor, csrfToken } = service.authenticate(cookieToken(request), context.now);
      return reply(200, { actor, csrfToken });
    }
    if (request.method !== 'POST') throw new AuthFailure('BAD_INPUT', 400);
    sameOrigin(request, context.trustedOrigin);
    const token = cookieToken(request);
    if (action === 'logout') {
      // A stale cookie can always be cleared; only an active session needs CSRF proof.
      try {
        const active = service.authenticate(token, context.now);
        requireSessionCsrf(request.headers.get('origin'), context.trustedOrigin,
          request.headers.get('x-csrf-token'), active.csrfToken);
      } catch (error) {
        if (!(error instanceof AuthFailure) || error.code !== 'UNAUTHENTICATED') throw error;
      }
      service.logout(token, context.now, context.requestId);
      return reply(200, { ok: true }, expiredSessionCookie());
    }
    const input = await body(request);
    if (action === 'login' || action === 'initial-change') {
      const name = normalizeLogin(input.login);
      context.limiter.reserve(context.peer + ':' + name, context.now);
      if (action === 'login') {
        const result = await service.login(name, input.password, context.now, context.requestId);
        resetAfterCommit(context.limiter, context.peer + ':' + name);
        return reply(200, { csrfToken: result.csrfToken }, sessionCookie(result.rawToken));
      }
      await service.initialChange(name, input.password, input.newPassword,
        context.now, context.requestId);
      resetAfterCommit(context.limiter, context.peer + ':' + name);
      return reply(200, { ok: true }, expiredSessionCookie());
    }
    if (action === 'change') {
      const active = service.authenticate(token, context.now);
      requireSessionCsrf(request.headers.get('origin'), context.trustedOrigin,
        request.headers.get('x-csrf-token'), active.csrfToken);
      await service.changePassword(token, input.password, input.newPassword,
        context.now, context.requestId);
      return reply(200, { ok: true }, expiredSessionCookie());
    }
    throw new AuthFailure('BAD_INPUT', 400);
  } catch (error) {
    if (error instanceof AuthFailure) return reply(error.status, { error: { code: error.code } });
    if (error instanceof Error && error.message === 'LOGIN_RATE_LIMITED') {
      return reply(429, { error: { code: 'LOGIN_RATE_LIMITED' } });
    }
    if (error instanceof Error && error.message.startsWith('CSRF_')) {
      return reply(403, { error: { code: 'CSRF_DENIED' } });
    }
    return reply(503, { error: { code: 'AUTH_UNAVAILABLE' } });
  }
}
