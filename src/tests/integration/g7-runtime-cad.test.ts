import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { makeG7RuntimeFixture } from '../helpers/g7-runtime';
import { createDb, type Database } from '../../server/db';
import { CadRepository } from '../../server/repositories/cad';
import { MasterRepository } from '../../server/repositories/master';
import { prepareG7CadWrite, recordG7WriteFailure, type G7CadWrite } from '../../server/g7-operational/cad-guard';
import { csrfProof } from '../../server/auth/login-service';
import { newSessionCandidate } from '../../server/auth/session';
import { executeAdminSetup } from '../../server/auth/admin-setup';
import { createG3IsolatedStore } from '../../server/g7-staging/g3-store';
import { digestSessionToken } from '../../server/auth/session';
import { createG2IsolatedStore } from '../../server/g7-staging/g2-store';
import { CadError } from '../../domain/cad';
import { resolveG7RuntimeGate } from '../../server/g7-operational/runtime-gate';
import type { Registration } from '../../domain/cad';
vi.mock('@/server/context',()=>({context:()=>{throw new Error('unexpected legacy context');}}));
vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
import { PATCH as patchMaster } from '../../app/api/masters/[type]/[id]/route';

let f:ReturnType<typeof makeG7RuntimeFixture>,db:Database,repo:CadRepository,masters:MasterRepository;
beforeEach(()=>{
  f=makeG7RuntimeFixture();
  for(const [key,value] of Object.entries(f.env))vi.stubEnv(key,value);
  for(const key of ['G7_S3_CAD_PREVIEW_ONLY','G7_S3_AUTH_API_PREVIEW_ONLY','G7_S3_GO','G7_OPERATION_MANIFEST_PATH'])vi.stubEnv(key,undefined);
  db=createDb('file:'+f.databasePath);repo=new CadRepository(db);masters=new MasterRepository(db);
});
afterEach(async()=>{await db.$disconnect();vi.unstubAllEnvs();f.cleanup();});
async function actor(role='Editor',sites=['site-a'],issuedAt=Date.now(),lastSeenAt=issuedAt) {
  const id=randomUUID(),candidate=newSessionCandidate(id,issuedAt);
  await db.user.create({data:{id,loginName:'u'+id.replaceAll('-','').slice(0,24),
    passwordHash:'scrypt$isolated_test_only',status:'ACTIVE',mustChangePassword:false,
    createdAt:BigInt(issuedAt),updatedAt:BigInt(issuedAt)}});
  await db.userRoleGrant.create({data:{userId:id,role,grantedAt:BigInt(issuedAt)}});
  for(const siteId of sites)await db.userSiteGrant.create({data:{userId:id,siteId,grantedAt:BigInt(issuedAt)}});
  await db.authSession.create({data:{id:candidate.session.id,userId:id,tokenHash:candidate.session.tokenHash,
    issuedAt:BigInt(issuedAt),lastSeenAt:BigInt(lastSeenAt),expiresAt:BigInt(candidate.session.expiresAt)}});
  return {id,sessionId:candidate.session.id,token:candidate.rawToken};
}
function request(token:string,headers:Record<string,string>={}){
  return new Request('http://0.0.0.0:3000/api/cad-files',{method:'POST',headers:{
    host:'cad.example.test',origin:f.trust.origin,cookie:'cad_session='+token,'x-csrf-token':csrfProof(token),...headers}});
}
function proof(token:string):G7CadWrite {
  const result=prepareG7CadWrite(request(token),'runtime-cad-test');
  expect(result?.runtime).toBeTruthy();return result!;
}
async function floor(siteId='site-a'):Promise<Registration>{
 const building=await db.building.create({data:{id:randomUUID(),siteId,name:randomUUID()}});
 const level=await db.cadLocation.create({data:{id:randomUUID(),buildingId:building.id,name:'1F'}});
 return {businessUnitId:'bu',productId:'product',siteId,buildingId:building.id,floorId:level.id,
   registeredAt:'2026-10-29',makeCurrent:true,description:'',drawingName:null,deletePassword:'1234'};
}
const file=(name='sample.dxf')=>({originalFilename:name,fileFormat:'DXF' as const,fileSize:4,
 sha256:'a'.repeat(64),storagePath:'/synthetic/'+name});

describe('#153 signed runtime CAD writes',()=>{
 test('rejected CAD before first Admin preserves pristine Audit and real G2 bootstrap remains possible',async()=>{
  const req=request(newSessionCandidate(randomUUID(),Date.now()).rawToken);
  expect(()=>prepareG7CadWrite(req,'first-denied')).toThrow(expect.objectContaining({code:'BOOTSTRAP_REQUIRED'}));
  await recordG7WriteFailure(req,'first-denied','VERSION','CAD_UPLOAD',new Error('rejected'));
  expect(await db.auditEvent.count()).toBe(0);expect(await db.user.count()).toBe(0);
  const secret=path.join(f.root,'bootstrap-password');writeFileSync(secret,'Synthetic-admin-password-153',{mode:0o600});
  const raw=f.openDb();
  try {
   const result=await executeAdminSetup({ADMIN_BOOTSTRAP_ENABLED:'true',ADMIN_BOOTSTRAP_USERNAME:'owner153',
     ADMIN_BOOTSTRAP_PASSWORD_FILE:secret},createG2IsolatedStore(raw),'bootstrap-after-denial');
   expect(result.kind).toBe('bootstrap');
  } finally {raw.close();}
  expect(await db.user.count()).toBe(1);expect(await db.auditEvent.count({where:{action:'ADMIN_BOOTSTRAP'}})).toBe(1);
 });
 test('public Host and signed origin work behind internal HTTP bind; forged identity, preview and duplicate cookies fail',async()=>{
  const a=await actor();expect(proof(a.token).runtime?.siteIds).toEqual(['site-a']);
  const deniedHeaders:Record<string,string>[]=[{host:'attacker.test'},{origin:'https://attacker.test'},
    {'x-csrf-token':'bad'},{cookie:'cad_g7_s3_session='+a.token},
    {cookie:'cad_session='+a.token+'; cad_session='+a.token},
    {cookie:'','x-user-id':a.id,'x-role':'Admin'}];
  for(const headers of deniedHeaders)
    expect(()=>prepareG7CadWrite(request(a.token,headers),'runtime-cad-test')).toThrow();
 });
 test('Editor and explicit Site can register/change Current/delete with old password and success Audit',async()=>{
  const a=await actor(),input=await floor(),p=proof(a.token);
  const first=await repo.register(input,file(),undefined,p);
  const second=await repo.register({...input,makeCurrent:false},file('next.dxf'),undefined,p);
  await repo.setCurrent(input.floorId,second.id,p);
  await expect(repo.deleteVersion(second.id,'wrong',p)).rejects.toMatchObject({code:'INVALID_DELETE_PASSWORD'});
  expect(await db.cadFileVersion.count()).toBe(2);
  const deleted=await repo.deleteVersion(second.id,'1234',p);
  expect(deleted.wasCurrent).toBe(true);expect(await db.cadFileVersion.count()).toBe(1);
  const audit=await db.auditEvent.findMany({orderBy:{timestampUtc:'asc'}});
  expect(audit.map(row=>row.action)).toEqual(['CAD_UPLOADED','CAD_UPLOADED','CAD_CURRENT_CHANGED','CAD_VERSION_DELETED']);
  expect(audit.every(row=>row.actorUserId===a.id&&row.siteId==='site-a'&&row.requestId===p.requestId&&row.timestampUtc.endsWith('Z'))).toBe(true);
  expect((await db.cadFileVersion.findUnique({where:{id:first.id}}))?.sha256).toBe('a'.repeat(64));
 });
 test('Reader denied; Admin without Site denied; grants outside signed scope denied',async()=>{
  const input=await floor(),reader=await actor('Reader'),admin=await actor('Admin',[]);
  for(const a of [reader,admin])await expect(repo.register(input,file(),undefined,proof(a.token))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const external=await floor('site-b'),wide=await actor('Admin',['site-a','site-b']);
  await expect(repo.register(external,file(),undefined,proof(wide.token))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(await db.cadFileVersion.count()).toBe(0);
 });
 test('Version authoritative Site overrides forged body/headers and cross-Location Current fails',async()=>{
  const a=await actor(),input=await floor(),other=await floor('site-b');
  const foreign=await repo.register(other,file('foreign.dxf'));
  await expect(repo.setCurrent(other.floorId,foreign.id,proof(a.token))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(repo.setCurrent(input.floorId,foreign.id,proof(a.token))).rejects.toMatchObject({code:'LOCATION_MISMATCH'});
  await expect(repo.deleteVersion(foreign.id,'1234',proof(a.token))).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 test('same prepared proof rechecks grant/role removal, disabled account and revoked session',async()=>{
  const input=await floor();
  for(const change of ['site','role','disabled','revoked']) {
   const a=await actor(),p=proof(a.token);
   if(change==='site')await db.userSiteGrant.delete({where:{userId_siteId:{userId:a.id,siteId:'site-a'}}});
   if(change==='role')await db.userRoleGrant.delete({where:{userId_role:{userId:a.id,role:'Editor'}}});
   if(change==='disabled')await db.user.update({where:{id:a.id},data:{status:'DISABLED',updatedAt:BigInt(Date.now())}});
   if(change==='revoked')await db.authSession.update({where:{id:a.sessionId},data:{revokedAt:BigInt(Date.now())}});
   await expect(repo.register(input,file(change+'.dxf'),undefined,p)).rejects.toMatchObject({code:change==='site'||change==='role'?'ACCESS_DENIED':'UNAUTHENTICATED'});
  }
  expect(await db.cadFileVersion.count()).toBe(0);
 });
 test('session touched while async CAD auth query is queued remains valid for DELETE',async()=>{
  const a=await actor(),input=await floor(),version=await repo.register(input,file(),undefined,proof(a.token));
  const p=proof(a.token);let interleaved=false;
  const delayed=db.$extends({query:{authSession:{async findUnique({args,query}){
    if(!interleaved){
      interleaved=true;
      // A real second connection performs the same session refresh as the UI.
      // Delay ensures this is later than an incorrectly pre-query sampled clock.
      await new Promise(resolve=>setTimeout(resolve,10));
      const raw=f.openDb();
      try {createG3IsolatedStore(raw).authenticate(digestSessionToken(a.token),Date.now());}
      finally {raw.close();}
    }
    return query(args);
  }}}});
  const delayedRepo=new CadRepository(delayed as unknown as Database);
  await expect(delayedRepo.deleteVersion(version.id,'1234',p)).resolves.toMatchObject({id:version.id});
  expect(interleaved).toBe(true);expect(await db.cadFileVersion.count()).toBe(0);
  expect(await db.auditEvent.count({where:{action:'CAD_VERSION_DELETED'}})).toBe(1);
 });
 test('expired and idle sessions are rejected before multipart body reception',async()=>{
  const expired=await actor('Editor',['site-a'],Date.now()-8*3600000);
  expect(()=>proof(expired.token)).toThrow(expect.objectContaining({code:'UNAUTHENTICATED'}));
  const idle=await actor('Editor',['site-a'],Date.now()-31*60000);
  expect(()=>proof(idle.token)).toThrow(expect.objectContaining({code:'UNAUTHENTICATED'}));
  expect(await db.cadFileVersion.count()).toBe(0);
 });
 test('approval expiry/change, recovery and migration HOLD block previously prepared transactions',async()=>{
  const a=await actor(),input=await floor(),p=proof(a.token);
  f.writeApproval({decision:'NO_GO'});
  await expect(repo.register(input,file(),undefined,p)).rejects.toMatchObject({code:'G7_RUNTIME_BLOCKED'});
  f.writeApproval({decision:'GO'});vi.stubEnv('G7_RUNTIME_RECOVERY_MODE','true');
  await expect(repo.register(input,file(),undefined,p)).rejects.toMatchObject({code:'G7_RUNTIME_BLOCKED'});
  vi.stubEnv('G7_RUNTIME_RECOVERY_MODE',undefined);
  writeFileSync(path.join(f.root,'g7-runtime-hold.json'),'{}',{mode:0o600});
  await expect(repo.register(input,file(),undefined,p)).rejects.toMatchObject({code:'G7_RUNTIME_BLOCKED'});
  expect(await db.cadFileVersion.count()).toBe(0);
 });
 test('storage publication failure rolls back Version, Current, nextVersion and Audit',async()=>{
  const a=await actor(),input=await floor(),p=proof(a.token);
  await expect(repo.register(input,file(),async()=>{throw new Error('synthetic storage unavailable');},p)).rejects.toThrow('synthetic storage unavailable');
  expect(await db.cadFileVersion.count()).toBe(0);expect(await db.auditEvent.count()).toBe(0);
  expect((await db.cadLocation.findUnique({where:{id:input.floorId}}))?.nextVersion).toBe(1);
 });
 test('safe failed/denied audit resolves Version Site, preserves UTC/request/actor and contains no secrets',async()=>{
  const a=await actor(),input=await floor(),version=await repo.register(input,file());
  const req=request(a.token),error=new CadError('ACCESS_DENIED','secret-password-and-token',403);
  await recordG7WriteFailure(req,'denial-001','VERSION',version.id,error);
  const audit=await db.auditEvent.findFirst({where:{requestId:'denial-001'}});
  expect(audit).toMatchObject({actorUserId:a.id,siteId:'site-a',targetId:version.id,outcome:'DENIED',action:'AUTHORIZATION_DENIED'});
  const serialized=JSON.stringify(audit);expect(serialized).not.toContain(a.token);expect(serialized).not.toContain('secret-password');
  expect(await db.cadFileVersion.count()).toBe(1);
 });
 test('session or approval expiring during storage publication rolls back the whole transaction',async()=>{
  const now=Date.now(),a=await actor('Editor',['site-a'],now-8*3600000+60000,now),input=await floor(),p=proof(a.token);
  // Advance the authorization clock after I/O without expiring Prisma's own
  // transaction-manager timers (those have a separate real 10-second deadline).
  const realNow=Date.now.bind(Date);
  let published=false;
  const clock=vi.spyOn(Date,'now').mockImplementation(()=>{
    const stack=new Error().stack??'';
    return published && /cad-guard|runtime-gate/.test(stack) ? now+120000 : realNow();
  });
  try {
    await expect(repo.register(input,file(),async()=>{published=true;return '/synthetic/published.dxf';},p))
      .rejects.toMatchObject({code:'UNAUTHENTICATED'});
  } finally {clock.mockRestore();}
  expect(published).toBe(true);
  expect(await db.cadFileVersion.count()).toBe(0);expect(await db.auditEvent.count()).toBe(0);
  expect((await db.cadLocation.findUnique({where:{id:input.floorId}}))?.nextVersion).toBe(1);
 });
 test('Audit trigger/schema fault closes runtime before a stale prepared write can mutate CAD',async()=>{
  const a=await actor(),input=await floor(),p=proof(a.token),raw=f.openDb();
  try {raw.exec("CREATE TRIGGER injected_audit_fault BEFORE INSERT ON AuditEvent BEGIN SELECT RAISE(ABORT,'SYNTHETIC_FAILURE'); END");}
  finally {raw.close();}
  await expect(repo.register(input,file(),undefined,p)).rejects.toMatchObject({code:'G7_RUNTIME_BLOCKED'});
  expect(await db.cadFileVersion.count()).toBe(0);expect(await db.auditEvent.count()).toBe(0);
 });
 test('Auth-only window refuses all CAD writes; preview flag cannot bypass signed runtime',async()=>{
  const a=await actor();f.writeApproval({scopes:['AUTH']});vi.stubEnv('G7_CAD_WRITE_CUTOVER_ENABLED','false');
  expect(()=>proof(a.token)).toThrow();
  f.writeApproval({scopes:['AUTH','CAD_WRITE']});vi.stubEnv('G7_CAD_WRITE_CUTOVER_ENABLED','true');vi.stubEnv('G7_S3_CAD_PREVIEW_ONLY','true');
  expect(()=>proof(a.token)).toThrow();
 });
});

describe('#153 canonical hierarchy mutations cannot bypass CAD Site authorization',()=>{
 test('signed Admin PATCH sites API can disable and reactivate one Site without blocking another',async()=>{
  const siteId=randomUUID();
  await db.cadSite.create({data:{id:siteId,productId:'product',name:'Second approved Site'}});
  const siteIds=[siteId,'site-a'].sort();
  f.writeTrust({...f.trust,siteIds});f.writeApproval({siteIds});
  const admin=await actor('Admin',[siteId]);
  const editor=await actor('Editor',['site-a']);
  const input=await floor('site-a');
  const patch=(active:boolean)=>patchMaster(new Request('http://0.0.0.0:3000/api/masters/sites/'+siteId,{
    method:'PATCH',headers:{host:'cad.example.test',origin:f.trust.origin,cookie:'cad_session='+admin.token,
      'x-csrf-token':csrfProof(admin.token),'content-type':'application/json'},body:JSON.stringify({active})}),
    {params:Promise.resolve({type:'sites',id:siteId})});
  expect((await patch(false)).status).toBe(200);
  expect((await db.cadSite.findUnique({where:{id:siteId}}))?.active).toBe(false);
  await expect(repo.register(input,file('unaffected.dxf'),undefined,proof(editor.token)))
    .resolves.toMatchObject({id:expect.any(String)});
  expect((await patch(true)).status).toBe(200);
  expect((await db.cadSite.findUnique({where:{id:siteId}}))?.active).toBe(true);
 });
 test('Admin can deactivate and reactivate an approved Site while other Site CAD writes continue',async()=>{
  f.writeTrust({...f.trust,siteIds:['site-a','site-b']});
  f.writeApproval({siteIds:['site-a','site-b']});
  const admin=await actor('Admin',['site-a','site-b']);
  const inactiveEditor=await actor('Editor',['site-a']);
  const activeEditor=await actor('Editor',['site-b']);
  const inactiveFloor=await floor('site-a'),activeFloor=await floor('site-b');
  const first=await repo.register(inactiveFloor,file('before.dxf'),undefined,proof(inactiveEditor.token));
  await masters.update('sites','site-a',{active:false},proof(admin.token));
  expect(resolveG7RuntimeGate(process.env).state).toBe('ACTIVE');
  expect(proof(admin.token).runtime?.siteIds).toEqual(['site-a','site-b']);
  await expect(repo.register(inactiveFloor,file('denied.dxf'),undefined,proof(inactiveEditor.token)))
    .rejects.toMatchObject({code:'INACTIVE_LOCATION_CHAIN'});
  await expect(repo.setCurrent(inactiveFloor.floorId,first.id,proof(inactiveEditor.token)))
    .rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(repo.deleteVersion(first.id,'1234',proof(inactiveEditor.token)))
    .rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(repo.register(activeFloor,file('other.dxf'),undefined,proof(activeEditor.token)))
    .resolves.toMatchObject({id:expect.any(String)});
  await masters.update('sites','site-a',{active:true},proof(admin.token));
  await expect(repo.register(inactiveFloor,file('reactivated.dxf'),undefined,proof(inactiveEditor.token)))
    .resolves.toMatchObject({id:expect.any(String)});
  expect(await db.cadFileVersion.count()).toBe(3);
 });
 test('Editor denied; scoped Admin manages local floors/buildings with atomic Audit and cannot extend Site scope',async()=>{
  const input=await floor(),editor=await actor(),admin=await actor('Admin');
  await expect(masters.update('floors',input.floorId,{name:'Denied'},proof(editor.token))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await masters.update('floors',input.floorId,{name:'Renamed'},proof(admin.token));
  expect((await db.cadLocation.findUnique({where:{id:input.floorId}}))?.name).toBe('Renamed');
  expect(await db.auditEvent.count({where:{action:'AUTHORIZATION_GRANTED',siteId:'site-a'}})).toBe(1);
  await expect(masters.update('products','product',{active:false},proof(admin.token))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await expect(masters.create('sites',{name:'Expanded',parentId:'product',kind:'SITE'},proof(admin.token))).rejects.toMatchObject({code:'G7_SCOPE_EXTENSION_REQUIRED'});
  expect((await db.product.findUnique({where:{id:'product'}}))?.active).toBe(true);
 });
 test('reclassification requires both source and destination explicit Site grants/scopes',async()=>{
  const source=await floor(),target=await floor('site-b'),admin=await actor('Admin',['site-a','site-b']);
  await db.product.update({where:{id:'product'},data:{isUnclassified:true}});
  const targetProduct=await db.product.create({data:{id:randomUUID(),businessUnitId:'bu',name:'Real'}});
  await db.cadSite.update({where:{id:'site-b'},data:{productId:targetProduct.id}});
  await expect(masters.reclassifyFloor(source.floorId,target.buildingId,proof(admin.token))).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect((await db.cadLocation.findUnique({where:{id:source.floorId}}))?.buildingId).toBe(source.buildingId);
 });
});
