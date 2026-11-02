/** #109 first-run HTTP setup. A 256-bit owner code is readable ONLY on the Docker host.
 * GET issues a short SameSite/HttpOnly CSRF proof, not the owner code.
 * POST is one-shot through the G2 BEGIN IMMEDIATE transaction and audit.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { normalizeLogin } from '../auth/login-service';
import { assertLocalPassword, hashLocalPassword } from '../auth/password';
import { createG2IsolatedStore } from '../g7-staging/g2-store';
import { createG3LoginLimiter } from '../g7-staging/g3-store';
import { openG7RuntimeDb } from './runtime-db';
import { resolveG7RuntimeGate, type G7RuntimeActiveGate } from './runtime-gate';
import { matchesRuntimeAuthority, runtimeReply } from './runtime-handler';
import { readAutomatedSetupCode } from './greenfield-auto';

const COOKIE='cad_setup_csrf';
const CSRF_LIFETIME=15*60*1000;
function csrf(code:string,nonce:string,expires:number) {
  return createHmac('sha256',code).update('g7-greenfield-setup-v1:'+
    nonce+':'+expires).digest('base64url');
}
function equal(a:string,b:string) {
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}
function cookieFrom(request:Request) {
  const matching=(request.headers.get('cookie')??'').split(';').map(x=>x.trim())
    .filter(x=>x.startsWith(COOKIE+'='));
  return matching.length===1?matching[0].slice(COOKIE.length+1):'';
}
function current(gate:G7RuntimeActiveGate) {
  const next=resolveG7RuntimeGate();
  if(next.state!=='ACTIVE'||next.operationMode!=='SELF_HOSTED'||
    next.databasePath!==gate.databasePath||next.origin!==gate.origin)
    throw new Error('G7_SETUP_RELEASE_CHANGED');
}
export async function handleGreenfieldFirstSetup(request:Request,gate:G7RuntimeActiveGate):Promise<Response> {
  if(gate.operationMode!=='SELF_HOSTED'||!matchesRuntimeAuthority(request,gate.origin))
    return runtimeReply(404,{error:{code:'NOT_FOUND'}});
  let db:ReturnType<typeof openG7RuntimeDb>|undefined;
  try {
    current(gate);
    db=openG7RuntimeDb(gate);
    if(Number(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n)!==0)
      return runtimeReply(404,{error:{code:'SETUP_CLOSED'}});
    const code=readAutomatedSetupCode(process.env);
    if(request.method==='GET') {
      const nonce=randomBytes(16).toString('base64url'),expires=Date.now()+CSRF_LIFETIME;
      const proof=nonce+'.'+expires+'.'+csrf(code,nonce,expires);
      const response=runtimeReply(200,{state:'SETUP_REQUIRED',csrfToken:proof});
      response.headers.set('Set-Cookie',COOKIE+'='+proof+'; HttpOnly; SameSite=Strict; Path=/api/g7-runtime/setup; Max-Age=900'+
        (gate.origin.startsWith('https:')?'; Secure':''));
      return response;
    }
    if(request.method!=='POST')return runtimeReply(405,{error:{code:'METHOD_NOT_ALLOWED'}});
    if(request.headers.get('origin')!==gate.origin||
      request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
      return runtimeReply(403,{error:{code:'SETUP_DENIED'}});
    const token=request.headers.get('x-setup-csrf')??'',cookie=cookieFrom(request);
    const match=/^([A-Za-z0-9_-]{22})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if(!match||!equal(cookie,token)||!Number.isSafeInteger(Number(match[2]))||
      Date.now()>=Number(match[2])||Number(match[2])-Date.now()>CSRF_LIFETIME||
      !equal(match[3],csrf(code,match[1],Number(match[2]))))
      return runtimeReply(403,{error:{code:'SETUP_CSRF_DENIED'}});
    const text=await request.text();
    if(text.length>4096)return runtimeReply(400,{error:{code:'BAD_INPUT'}});
    const raw:unknown=JSON.parse(text);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))
      return runtimeReply(400,{error:{code:'BAD_INPUT'}});
    const input=raw as Record<string,unknown>;
    if(Object.keys(input).sort().join()!=='code,login,password')
      return runtimeReply(400,{error:{code:'BAD_INPUT'}});
    // Durable, global SQLite limiter; never rely on an untrusted X-Forwarded-For.
    createG3LoginLimiter(db).reserve('g7-first-admin-setup',Date.now());
    if(typeof input.code!=='string'||!equal(input.code,code))
      return runtimeReply(403,{error:{code:'SETUP_DENIED'}});
    const login=normalizeLogin(input.login);
    assertLocalPassword(input.password);
    const passwordHash=await hashLocalPassword(input.password);
    current(gate);
    if(readAutomatedSetupCode(process.env)!==code)throw new Error('G7_SETUP_CODE_CHANGED');
    const admin=createG2IsolatedStore(db,{},{
      assertCurrent:()=>{current(gate);if(readAutomatedSetupCode(process.env)!==code)
        throw new Error('G7_SETUP_CODE_CHANGED');},
      now:Date.now
    });
    admin.bootstrap({username:login,passwordHash,now:Date.now(),
      requestId:'setup_'+randomBytes(12).toString('hex')});
    // User+role+audit are committed before response. Any stale file is harmless:
    // all subsequent setup calls are permanently denied by User/Audit presence.
    return runtimeReply(201,{state:'SETUP_COMPLETE',next:'/g7-runtime'});
  }catch(error) {
    if(error instanceof Error&&error.message==='LOGIN_RATE_LIMITED')
      return runtimeReply(429,{error:{code:'SETUP_RATE_LIMITED'}});
    if(error instanceof SyntaxError)return runtimeReply(400,{error:{code:'BAD_INPUT'}});
    if(error instanceof Error&&(error.message.includes('BAD_INPUT')||
       error.message.includes('비밀번호')||error.message==='G2_BOOTSTRAP_INPUT_INVALID'))
      return runtimeReply(400,{error:{code:'BAD_INPUT'}});
    return runtimeReply(503,{error:{code:'G7_SETUP_UNAVAILABLE'}});
  }finally{db?.close();}
}
