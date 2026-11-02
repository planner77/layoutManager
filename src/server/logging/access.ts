import { randomUUID } from 'node:crypto';
import { digestSessionToken } from '@/server/auth/session';
import { createG4IsolatedStore } from '@/server/g7-staging/g4-store';
import { resolveG7RuntimeGate, type G7RuntimeActiveGate } from '@/server/g7-operational/runtime-gate';
import { openG7RuntimeDb } from '@/server/g7-operational/runtime-db';

export class OperationLogsAccessError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
const deny = (code: string, status: number): never => { throw new OperationLogsAccessError(code, status); };
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export class OperationLogRateLimiter {
  private readonly attempts=new Map<string,{count:number;until:number}>();
  private global={count:0,until:0};
  constructor(private readonly perIdentity=240,private readonly total=600,private readonly maxEntries=10000) {}
  reserve(key:string,now=Date.now()):void {
    if(!key||!Number.isFinite(now)) deny('LOG_RATE_LIMITED',429);
    if(now>=this.global.until) this.global={count:0,until:now+60000};
    // A rotating sequence of forged syntactically valid cookies cannot bypass
    // the process-wide admission cap and flood the durable Audit table.
    if(this.global.count>=this.total) deny('LOG_RATE_LIMITED',429);
    for(const [item,value] of this.attempts) if(value.until<=now) this.attempts.delete(item);
    const current=this.attempts.get(key);
    if(current && current.count>=this.perIdentity || !current && this.attempts.size>=this.maxEntries)
      deny('LOG_RATE_LIMITED',429);
    this.global.count++;
    this.attempts.set(key,{count:(current?.count??0)+1,until:current?.until??now+60000});
  }
}
const limiter=new OperationLogRateLimiter();
function cookie(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim())
    .filter(v => v.startsWith('cad_session='));
  if (values.length !== 1) return null;
  const value = values[0].slice(12);
  return TOKEN.test(value) && Buffer.from(value, 'base64url').length === 32 &&
    Buffer.from(value, 'base64url').toString('base64url') === value ? value : null;
}
function gateFor(request: Request): G7RuntimeActiveGate {
  const gate = resolveG7RuntimeGate(process.env, Date.now());
  if (gate.state !== 'ACTIVE') return deny('G7_RUNTIME_UNAVAILABLE', 503);
  try {
    const host = request.headers.get('host') ?? new URL(request.url).host;
    if (host !== new URL(gate.origin).host) return deny('ACCESS_DENIED', 403);
  } catch { return deny('ACCESS_DENIED', 403); }
  return gate;
}
/** Every call reloads G7 authority, G4 grants and the cookie-backed session and writes G4 Audit. */
export async function authorizeOperationLogsActor(request: Request, requestId = randomUUID()): Promise<string> {
  const gate = gateFor(request);
  const raw = cookie(request);
  const hash = raw ? digestSessionToken(raw) : null;
  limiter.reserve(hash??'anonymous');
  let db: ReturnType<typeof openG7RuntimeDb> | undefined;
  try {
    db = openG7RuntimeDb(gate);
    // G2 bootstrap requires a pristine identity store. An anonymous navigation
    // probe must not write a DENIED Audit before the first Admin is provisioned.
    if (Number(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n) === 0)
      throw new OperationLogsAccessError('BOOTSTRAP_REQUIRED',503);
    const check = () => {
      const current = gateFor(request);
      if (current.approvalId !== gate.approvalId || current.databasePath !== gate.databasePath ||
          current.origin !== gate.origin || current.expiresAt !== gate.expiresAt)
        deny('G7_RUNTIME_UNAVAILABLE', 503);
    };
    createG4IsolatedStore(db, {}, { siteIds: gate.siteIds, assertCurrent: check, now: Date.now })
      .permit(hash, 'logs:read', {kind:'global'}, {now:Date.now(),requestId});
    // The G4 permit above is authoritative and audited. Return only its DB-owned actor.
    const row = db.prepare('SELECT user_id FROM "AuthSession" WHERE token_hash=? AND revoked_at IS NULL').get(hash);
    if (!row || typeof row.user_id !== 'string') throw new OperationLogsAccessError('UNAUTHENTICATED', 401);
    check();
    return row.user_id as string;
  } catch (error) {
    if (error instanceof OperationLogsAccessError) throw error;
    if (error && typeof error === 'object' && 'status' in error && 'code' in error) {
      const value = error as {status: number;code:string};
      if (value.status === 401 || value.status === 403 || value.status === 429)
        throw new OperationLogsAccessError(value.code, value.status);
    }
    throw new OperationLogsAccessError('G7_RUNTIME_UNAVAILABLE', 503);
  } finally { db?.close(); }
}
export async function authorizeOperationLogs(request: Request): Promise<void> {
  await authorizeOperationLogsActor(request);
}
