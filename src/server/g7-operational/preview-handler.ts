/** #109 S3-2 reserved Auth/Account/Grant API adapter; isolated test DB only.
 * The runtime route permits only an explicit nonproduction loopback fixture.
 * No legacy CAD route, S3 production data or operating Prisma mutation.
 */
import { randomBytes } from 'node:crypto';
import { AuthFailure, createLoginService } from '../auth/login-service';
import { handleG3Request, type G3Action } from '../auth/g3-request';
import { createG4Service, handleG4Request, G4Failure } from '../auth/g4-service';
import { createG3IsolatedStore, createG3LoginLimiter } from '../g7-staging/g3-store';
import { createG4IsolatedStore } from '../g7-staging/g4-store';
import type { G7S3PreviewGate } from './preview-gate';
import { openG7S3PreviewDb } from './preview-db';
import { provisionG7PreviewUser } from './user-provisioning';

const COOKIE = 'cad_g7_s3_session';
const notFound = () => Response.json(
  {error:{code:'NOT_FOUND'}},{status:404,headers:{'Cache-Control':'no-store'}},
);
function cookieToken(req: Request): string | null {
  const a=(req.headers.get('cookie')??'').split(';')
    .map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
  return a.length===1?a[0].slice(COOKIE.length+1):null;
}
function internalRequest(req: Request): Request {
  const headers = new Headers(req.headers);
  const raw=cookieToken(req);
  // Never treat an existing production cad_session as an S3 preview session.
  headers.delete('cookie');
  if(raw) headers.set('cookie','cad_session='+raw);
  return new Request(req,{headers});
}
function previewCookie(response: Response): Response {
  const value=response.headers.get('set-cookie');
  if(!value) return response;
  if(!value.startsWith('cad_session=') || !value.includes('; Path=/;'))
    throw new Error('G7_S3_COOKIE_INVALID');
  const headers=new Headers(response.headers);
  headers.set('set-cookie',value.replace(/^cad_session=/,COOKIE+'=')
    .replace('; Path=/;','; Path=/api/g7-operational;'));
  return new Response(response.body,{status:response.status,headers});
}
const authActions=['login','initial-change','session','change','logout'];
const accessActions=['permit','grant','disable','audit'];
type Segments = readonly string[];
export async function handleG7S3PreviewApi(
  req: Request, segments: Segments, gate: G7S3PreviewGate,
): Promise<Response> {
  if (!Array.isArray(segments) || segments.length!==2 ||
      segments.some(s=>typeof s!=='string'||!/^[a-z-]{1,28}$/.test(s)) ||
      new URL(req.url).origin!==gate.origin) return notFound();
  const [kind,action]=segments;
  if (!(kind==='auth'&&authActions.includes(action)) &&
      !(kind==='access'&&accessActions.includes(action)) &&
      !(kind==='users'&&action==='create')) return notFound();
  let db: ReturnType<typeof openG7S3PreviewDb>;
  try { db=openG7S3PreviewDb(gate); }
  catch { return Response.json({error:{code:'G7_S3_PREVIEW_DATABASE_UNAVAILABLE'}},
    {status:503,headers:{'Cache-Control':'no-store'}}); }
  try {
    const context={now:Date.now(),requestId:randomBytes(12).toString('base64url')};
    if(kind==='auth') {
      const service=createLoginService(createG3IsolatedStore(db));
      const result=await handleG3Request(action as G3Action,internalRequest(req),service,{
        trustedOrigin:gate.origin,peer:'g7-s3-loopback-only',
        now:context.now,requestId:context.requestId,
        limiter:createG3LoginLimiter(db),
      });
      return previewCookie(result);
    }
    if(kind==='access') {
      const service=createG4Service(createG4IsolatedStore(db));
      return await handleG4Request(action as 'permit'|'grant'|'disable'|'audit',
        internalRequest(req),service,{...context,trustedOrigin:gate.origin});
    }
    const result=await provisionG7PreviewUser(db,req,cookieToken(req),
      gate.origin,context.now,context.requestId);
    return Response.json({id:result.id},{status:201,headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if(error instanceof AuthFailure || error instanceof G4Failure)
      return Response.json({error:{code:error.code}},
        {status:error.status,headers:{'Cache-Control':'no-store'}});
    return Response.json({error:{code:'G7_S3_AUTH_UNAVAILABLE'}},
      {status:503,headers:{'Cache-Control':'no-store'}});
  } finally { db.close(); }
}
