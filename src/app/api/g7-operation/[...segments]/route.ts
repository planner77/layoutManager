/** #109 S2: future S3-only App Router session/admin endpoints. Default 404.
 * No Outline/Memo/Type/Logs persistence or Audit physical purge is exposed.
 */
import { randomBytes } from 'node:crypto';
import { resolveG7OperationGate } from '@/server/g7-operational/gate';
import { openG7OperationalAuthDb } from '@/server/g7-operational/sqlite';
import { createG3IsolatedStore, createG3LoginLimiter } from '@/server/g7-staging/g3-store';
import { createG4IsolatedStore } from '@/server/g7-staging/g4-store';
import { handleG7CreateUser } from '@/server/g7-operational/provision';
import { createLoginService } from '@/server/auth/login-service';
import { handleG3Request, type G3Action } from '@/server/auth/g3-request';
import { createG4Service, handleG4Request } from '@/server/auth/g4-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Args = { params: Promise<{ segments: string[] }> };
const noStore = { 'Cache-Control': 'no-store' };
function reply(status: number, code: string) {
  return Response.json({ error: { code } }, { status, headers: noStore });
}
async function handle(request: Request, args: Args): Promise<Response> {
  const gate = resolveG7OperationGate(process.env);
  if (!gate) return reply(404, 'NOT_FOUND');
  // Next standalone can reconstruct request.url from 0.0.0.0:3000 behind
  // Nginx; the reverse proxy forwards the browser's public Host. Compare
  // that authority to the privately approved origin instead of bind origin.
  // POST remains independently checked against the approved Origin+CSRF
  // by G3/G4; X-Forwarded-User/Role/Site are never identity.
  const publicHost = request.headers.get('host') ?? new URL(request.url).host;
  if (publicHost !== new URL(gate.origin).host) return reply(404, 'NOT_FOUND');
  const parts = (await args.params).segments;
  if (!Array.isArray(parts) || parts.length !== 2 ||
      parts.some(part => !/^[a-z-]{1,28}$/.test(part))) return reply(404, 'NOT_FOUND');
  const [domain, command] = parts;
  const isG3 = domain === 'auth' &&
    ['login','initial-change','session','change','logout'].includes(command);
  const isG4 = domain === 'access' &&
    ['permit','grant','disable','audit'].includes(command);
  const isProvision = domain === 'access' && command === 'create-user';
  if (!isG3 && !isG4 && !isProvision) return reply(404, 'NOT_FOUND');
  let db: ReturnType<typeof openG7OperationalAuthDb>;
  try { db = openG7OperationalAuthDb(gate); }
  catch { return reply(503, 'G7_AUTH_UNAVAILABLE'); }
  try {
    const context = { trustedOrigin: gate.origin, now: Date.now(),
      requestId: randomBytes(12).toString('base64url') };
    if (isProvision) return await handleG7CreateUser(request,db,context);
    if (isG3) return await handleG3Request(command as G3Action, request,
      createLoginService(createG3IsolatedStore(db)), {
        ...context, peer: 'g7-trusted-operator', limiter: createG3LoginLimiter(db),
      });
    return await handleG4Request(
      command as 'permit' | 'grant' | 'disable' | 'audit',
      request, createG4Service(createG4IsolatedStore(db)), context);
  } catch {
    return reply(503, 'G7_AUTH_UNAVAILABLE');
  } finally {
    db.close();
  }
}
export async function GET(req: Request, args: Args) { return handle(req,args); }
export async function POST(req: Request, args: Args) { return handle(req,args); }
