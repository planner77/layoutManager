import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeG7RuntimeFixture } from '../helpers/g7-runtime';
import { installMonotonicTestClock } from '../helpers/monotonic-clock';
import { newSessionCandidate } from '../../server/auth/session';
import { GET as query } from '../../app/api/operations/logs/route';
import { GET as access } from '../../app/api/operations/logs/access/route';
import * as logQuery from '../../server/logging/query';
import * as g4Store from '../../server/g7-staging/g4-store';

let fixture:ReturnType<typeof makeG7RuntimeFixture>|undefined;
let saved:Record<string,string|undefined>={};
beforeEach(installMonotonicTestClock);
function setup(){
  fixture=makeG7RuntimeFixture();
  const keys=[...new Set([...Object.keys(fixture.env),'LOG_STORE_ENABLED',
    ...Object.keys(process.env).filter(key=>key.startsWith('G7_'))])];
  saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  for(const key of keys) if(key.startsWith('G7_')) delete process.env[key];
  Object.assign(process.env,fixture.env,{LOG_STORE_ENABLED:'false'});
  const db=fixture.openDb();
  db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',0,?,?)')
    .run('admin','admin','synthetic-hash',Date.now(),Date.now());
  db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run('admin','Admin',Date.now());
  const candidate=newSessionCandidate('admin',Date.now());
  db.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
    .run(candidate.session.id,'admin',candidate.session.tokenHash,candidate.session.issuedAt,
      candidate.session.lastSeenAt,candidate.session.expiresAt);
  db.close();return candidate.rawToken;
}
afterEach(()=>{for(const [key,value] of Object.entries(saved)) if(value===undefined) delete process.env[key];
  else process.env[key]=value;fixture?.cleanup();fixture=undefined;saved={};vi.restoreAllMocks();});
function request(cookie?:string,headers:Record<string,string>={}){
  return new Request('http://0.0.0.0/api/operations/logs',{
    headers:{host:'cad.example.test',...(cookie?{cookie:'cad_session='+cookie}:{}),...headers}});
}
test('TC-R1-001/002: active G4 Admin still needs logs:read, and allow/deny are audited',async()=>{
  const token=setup();
  expect((await query(request())).status).toBe(401);
  expect((await query(request(token))).status).toBe(403);
  const db=fixture!.openDb();
  db.prepare('INSERT INTO "SpecialGrant"(user_id,permission,granted_at) VALUES(?,?,?)')
    .run('admin','logs:read',Date.now());db.close();
  const allowed=await query(request(token));
  expect(allowed.status).toBe(200);
  expect(await allowed.json()).toMatchObject({status:'disabled',sourceCoverage:'app-structured-only'});
  expect((await access(request(token))).status).toBe(200);
  const check=fixture!.openDb();
  const audit=check.prepare('SELECT action,outcome,actor_user_id,request_id,target_kind,target_id FROM "AuditEvent" ORDER BY rowid').all();
  expect(audit.some(row=>row.action==='AUTHORIZATION_DENIED'&&row.outcome==='DENIED'&&
    row.target_kind==='ROLE'&&row.target_id==='logs_read')).toBe(true);
  expect(audit.some(row=>row.action==='AUTHORIZATION_GRANTED'&&row.actor_user_id==='admin'&&
    row.target_kind==='ROLE'&&row.target_id==='logs_read')).toBe(true);
  check.prepare('DELETE FROM "SpecialGrant" WHERE user_id=? AND permission=?').run('admin','logs:read');
  check.close();
  expect((await query(request(token))).status).toBe(403);
});
test('TC-R1-001: G7 OFF and forged host fail before store access',async()=>{
  const token=setup();
  expect((await query(request(token,{host:'other.example.test'}))).status).toBe(403);
  process.env.G7_AUTH_ENABLED='false';process.env.G7_CAD_WRITE_CUTOVER_ENABLED='false';
  delete process.env.G7_RUNTIME_TRUST_PATH;delete process.env.G7_RUNTIME_APPROVAL_PATH;
  expect((await query(request(token))).status).toBe(503);
});
test('TC-R1-001: first Admin bootstrap remains pristine after anonymous log probe',async()=>{
  fixture=makeG7RuntimeFixture();
  const keys=[...new Set([...Object.keys(fixture.env),...Object.keys(process.env).filter(key=>key.startsWith('G7_'))])];
  saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  for(const key of keys) if(key.startsWith('G7_')) delete process.env[key];
  Object.assign(process.env,fixture.env);
  const response=await access(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({error:{code:'BOOTSTRAP_REQUIRED'}});
  const db=fixture.openDb();
  expect(db.prepare('SELECT COUNT(*) AS n FROM "AuditEvent"').get()?.n).toBe(0);
  expect(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n).toBe(0);
  db.close();
});
test('TC-R1-002: Audit failure stops read, and session revocation during async read stops response',async()=>{
  const token=setup();const db=fixture!.openDb();
  db.prepare('INSERT INTO "SpecialGrant"(user_id,permission,granted_at) VALUES(?,?,?)')
    .run('admin','logs:read',Date.now());
  db.close();
  const read=vi.spyOn(logQuery,'queryOperationLogs');
  const original=g4Store.createG4IsolatedStore;
  vi.spyOn(g4Store,'createG4IsolatedStore').mockImplementation((...args)=>{
    const store=original(...args);return {...store,permit:()=>{throw new Error('synthetic audit failure');}};
  });
  expect((await query(request(token))).status).toBe(503);
  expect(read).not.toHaveBeenCalled();
  vi.mocked(g4Store.createG4IsolatedStore).mockRestore();
  read.mockImplementation(async()=>{
    const active=fixture!.openDb();
    active.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=?').run(Date.now(),'admin');
    active.close();
    return {items:[],nextCursor:null,sourceCoverage:'app-structured-only',status:'ok',skippedLines:0,scanTruncated:false};
  });
  expect((await query(request(token))).status).toBe(401);
  expect(read).toHaveBeenCalledTimes(1);
});
