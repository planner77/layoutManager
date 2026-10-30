import { afterEach, describe, expect, test, vi } from 'vitest';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import packageInfo from '../../package.json' with {type:'json'};
import { initializeGreenfield, seedGreenfieldSites } from '../../server/g7-operational/greenfield-install';
import { issueGreenfieldAuthority } from '../../server/g7-operational/greenfield-authority';
import { G7_GREENFIELD_CAPABILITY,G7_GREENFIELD_SCHEMA_ID } from '../../server/g7-operational/greenfield-schema';
import { createDb, type Database } from '../../server/db';
import { prepareG7CadWrite } from '../../server/g7-operational/cad-guard';
import { csrfProof } from '../../server/auth/login-service';
import { newSessionCandidate, SESSION_IDLE_MS } from '../../server/auth/session';
import { SceneBlobStorage } from '../../server/storage/scene-storage';
import { SceneRepository, cleanupSceneOrphans } from '../../server/scene/scene-repository';
import { CadRepository } from '../../server/repositories/cad';
import { hashDeletePassword } from '../../server/password';
import * as runtimeGate from '../../server/g7-operational/runtime-gate';
import { sceneScope,sceneIdentity,createSceneRef,importedId,type SceneManifest } from '../../domain/cad-scene';
vi.mock('@/server/context',()=>({context:()=>{throw new Error('unexpected legacy context');}}));
import { POST as postScene, GET as getScene } from '../../app/api/cad-files/[versionId]/scene/route';
import { GET as getSceneContent } from '../../app/api/cad-files/[versionId]/scene/content/route';

const roots:string[]=[];
let db:Database|undefined;
afterEach(async()=>{await db?.$disconnect();db=undefined;vi.unstubAllEnvs();
  for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
async function setup(){
  const root=mkdtempSync(path.join(tmpdir(),'cad-scene-s3-'));chmodSync(root,0o700);roots.push(root);
  const dbdir=path.join(root,'db'),cad=path.join(root,'cad'),seedDir=path.join(root,'seed');
  for(const dir of [dbdir,cad,seedDir])mkdirSync(dir,{mode:0o700});
  const databasePath=path.join(dbdir,'cad.sqlite');
  const base:Record<string,string>={NODE_ENV:'production',DATABASE_URL:'file:'+databasePath,
    CAD_STORAGE_PATH:cad,CAD_STORAGE_BACKEND:'local',G7_GREENFIELD_MODE:'true',
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_GREENFIELD_INSTALL_ACK:'CREATE_EMPTY_G7_DATABASE'};
  initializeGreenfield(base);
  const seed=path.join(seedDir,'seed.json');
  writeFileSync(seed,JSON.stringify({businessUnit:'BU',product:'Product',
    sites:[{name:'Site',building:'Building',floor:'1F'},
      {name:'Other Site',building:'Other Building',floor:'2F'}]}),{mode:0o600});
  seedGreenfieldSites({...base,G7_GREENFIELD_SEED_ACK:'SEED_EMPTY_GREENFIELD',
    G7_GREENFIELD_SEED_FILE:seed});
  const ownerDir=path.join(root,'owner'),out=path.join(root,'out');
  mkdirSync(ownerDir,{mode:0o700});mkdirSync(out,{mode:0o700});
  const keys=generateKeyPairSync('ed25519'),key=path.join(ownerDir,'key.pem');
  writeFileSync(key,keys.privateKey.export({format:'pem',type:'pkcs8'}).toString(),{mode:0o600});
  const input=path.join(ownerDir,'input.json'),origin='https://cad.example.test';
  const sourceCommit='1'.repeat(40),appDigest='sha256:'+'a'.repeat(64),migratorDigest='sha256:'+'b'.repeat(64);
  writeFileSync(input,JSON.stringify({origin,release:{sourceCommit,version:packageInfo.version,
    appDigest,migratorDigest},scopes:['AUTH','CAD_WRITE'],approvalId:'OWNER-scene-synthetic',
    changeRequestId:'CR-scene-synthetic',validMinutes:60}),{mode:0o600});
  issueGreenfieldAuthority('init',input,out,key,base);
  const env:Record<string,string>={...base,G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
    G7_RUNTIME_TRUST_PATH:path.join(out,'runtime-trust.json'),
    G7_RUNTIME_APPROVAL_PATH:path.join(out,'runtime-approval.json'),
    G7_RELEASE_VERSION:packageInfo.version,G7_RELEASE_CAPABILITY:G7_GREENFIELD_CAPABILITY,
    G7_RELEASE_SCHEMA_ID:G7_GREENFIELD_SCHEMA_ID,G7_RELEASE_SOURCE_COMMIT:sourceCommit,
    G7_RELEASE_APP_DIGEST:appDigest,G7_RELEASE_MIGRATOR_DIGEST:migratorDigest};
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  for(const key of ['G7_GREENFIELD_AUTOMATED','G7_S3_CAD_PREVIEW_ONLY','G7_S3_AUTH_API_PREVIEW_ONLY',
    'G7_S3_GO','G7_OPERATION_MANIFEST_PATH'])vi.stubEnv(key,undefined);
  db=createDb('file:'+databasePath);
  const floor=await db.cadLocation.findFirstOrThrow({where:{name:'1F'},include:{building:true}});
  const siteId=floor.building.siteId;
  const versionId=randomUUID(),sha='c'.repeat(64);
  await db.cadFileVersion.create({data:{id:versionId,locationId:floor.id,version:1,
    originalFilename:'synthetic.dxf',drawingName:null,description:'original sentinel',deletePasswordHash:'test-hash',
    fileFormat:'DXF',fileSize:4,sha256:sha,storagePath:`${floor.id}/${versionId}/original.dxf`,
    registeredAt:'2026-10-30'}});
  const userId=randomUUID(),issuedAt=Date.now(),session=newSessionCandidate(userId,issuedAt);
  await db.user.create({data:{id:userId,loginName:'scene-editor',passwordHash:'test-hash',status:'ACTIVE',
    mustChangePassword:false,createdAt:BigInt(issuedAt),updatedAt:BigInt(issuedAt)}});
  await db.userRoleGrant.create({data:{userId,role:'Editor',grantedAt:BigInt(issuedAt)}});
  await db.userSiteGrant.create({data:{userId,siteId,grantedAt:BigInt(issuedAt)}});
  await db.authSession.create({data:{id:session.session.id,userId,tokenHash:session.session.tokenHash,
    issuedAt:BigInt(issuedAt),lastSeenAt:BigInt(issuedAt),expiresAt:BigInt(session.session.expiresAt)}});
  const request=new Request('https://cad.example.test/api/cad-files/'+versionId+'/scene',{method:'POST',headers:{
    host:'cad.example.test',origin,cookie:'cad_session='+session.rawToken,
    'x-csrf-token':csrfProof(session.rawToken)}});
  const proof=prepareG7CadWrite(request,'scene-s3-test')!;
  const storage=new SceneBlobStorage(cad,env),repo=new SceneRepository(db,storage);
  return {db,root,cad,versionId,sha,siteId,userId,session,request,proof,storage,repo};
}
function payload(versionId:string,sha:string,sourceUnit='UNSPECIFIED'){
  const scope=sceneScope(versionId,sha,sourceUnit),sceneId=sceneIdentity(scope),matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const ref=createSceneRef(scope,'DXF_IMPORTED',importedId(scope,[]),{treePath:[]});
  const asset={scope,sceneId,state:'READY',revision:0,objects:[{ref,treePath:[],kind:'Group',visible:true,transform:matrix,revision:0}]};
  const bytes=Buffer.from(JSON.stringify({schema:1,asset,root:{type:'Group',name:'root',visible:true,matrix,ref,children:[]}}));
  const manifest:SceneManifest={scope,sceneId,format:'CUSTOM_DTO',state:'READY',revision:0,
    byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  return {bytes,manifest};
}

describe('#164 Scene S3 immutable persistence',()=>{
  test('route rejects OFF writes, Reader and missing Site; active read uses session without write CSRF',async()=>{
    const f=await setup(),value=payload(f.versionId,f.sha);
    const url='https://cad.example.test/api/cad-files/'+f.versionId+'/scene';
    const post=()=>postScene(new Request(url,{method:'POST',headers:{...Object.fromEntries(f.request.headers),
      'content-type':'application/json'},body:JSON.stringify({manifest:value.manifest,
      bytesBase64:value.bytes.toString('base64'),expectedRevision:null})}),
      {params:Promise.resolve({versionId:f.versionId})});
    vi.stubEnv('G7_AUTH_ENABLED','false');vi.stubEnv('G7_CAD_WRITE_CUTOVER_ENABLED','false');
    vi.stubEnv('G7_RUNTIME_TRUST_PATH',undefined);vi.stubEnv('G7_RUNTIME_APPROVAL_PATH',undefined);
    expect((await post()).status).toBe(403);
    for(const [key,val] of Object.entries({G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
      G7_RUNTIME_TRUST_PATH:path.join(f.root,'out','runtime-trust.json'),
      G7_RUNTIME_APPROVAL_PATH:path.join(f.root,'out','runtime-approval.json')}))vi.stubEnv(key,val);
    await f.db.userRoleGrant.delete({where:{userId_role:{userId:f.userId,role:'Editor'}}});
    await f.db.userRoleGrant.create({data:{userId:f.userId,role:'Reader',grantedAt:BigInt(Date.now())}});
    expect((await post()).status).toBe(403);
    await f.db.userRoleGrant.delete({where:{userId_role:{userId:f.userId,role:'Reader'}}});
    await f.db.userRoleGrant.create({data:{userId:f.userId,role:'Editor',grantedAt:BigInt(Date.now())}});
    await f.db.userSiteGrant.delete({where:{userId_siteId:{userId:f.userId,siteId:f.siteId}}});
    expect((await post()).status).toBe(403);
    expect(await f.db.sceneAsset.count()).toBe(0);expect(await f.db.sceneOrphanJob.count()).toBe(0);
    await f.db.userSiteGrant.create({data:{userId:f.userId,siteId:f.siteId,grantedAt:BigInt(Date.now())}});
    const read=new Request(url,{headers:{host:'cad.example.test',cookie:'cad_session='+f.session.rawToken}});
    const response=await getScene(read,{params:Promise.resolve({versionId:f.versionId})});
    expect(response.status).toBe(200);expect(await response.json()).toEqual({status:'MISSING'});
    expect((await getScene(new Request(url,{headers:{host:'cad.example.test'}}),
      {params:Promise.resolve({versionId:f.versionId})})).status).toBe(401);
  });
  test('route binds read/write/content to actual Version Site and enforces write Origin and CSRF',async()=>{
    const f=await setup(),value=payload(f.versionId,f.sha);
    const headers={host:'cad.example.test',origin:'https://cad.example.test',
      cookie:'cad_session='+f.session.rawToken,'x-csrf-token':csrfProof(f.session.rawToken),
      'content-type':'application/json'};
    const post=(versionId:string,manifest:SceneManifest,bytes:Uint8Array,overrides:Record<string,string>={})=>
      postScene(new Request('https://cad.example.test/api/cad-files/'+versionId+'/scene',{
        method:'POST',headers:{...headers,...overrides},body:JSON.stringify({manifest,
          bytesBase64:Buffer.from(bytes).toString('base64'),expectedRevision:null})}),
        {params:Promise.resolve({versionId})});
    expect((await post(f.versionId,value.manifest,value.bytes,{'x-csrf-token':'bad'})).status).toBe(403);
    expect((await post(f.versionId,value.manifest,value.bytes,{origin:'https://wrong.example.test'})).status).toBe(403);
    const otherFloor=await f.db.cadLocation.findFirstOrThrow({where:{name:'2F'}}),floor=otherFloor.id,foreign=randomUUID();
    await f.db.cadFileVersion.create({data:{id:foreign,locationId:floor,version:1,
      originalFilename:'foreign.dxf',drawingName:null,description:'',deletePasswordHash:'test-hash',
      fileFormat:'DXF',fileSize:4,sha256:f.sha,storagePath:`${floor}/${foreign}/original.dxf`,registeredAt:'2026-10-30'}});
    const other=payload(foreign,f.sha);
    expect((await post(foreign,other.manifest,other.bytes)).status).toBe(403);
    expect((await getScene(new Request('https://cad.example.test/api/cad-files/'+foreign+'/scene',{
      headers:{host:'cad.example.test',cookie:'cad_session='+f.session.rawToken}}),
      {params:Promise.resolve({versionId:foreign})})).status).toBe(403);
    const ready=await f.repo.publish(f.versionId,value.manifest,value.bytes,null,f.proof);
    const contentUrl=new URL(ready.contentUrl,'https://cad.example.test');
    const callContent=(cookie?:string,assetId=ready.assetId)=>getSceneContent(new Request(
      `https://cad.example.test/api/cad-files/${f.versionId}/scene/content?assetId=${assetId}`,
      {headers:{host:'cad.example.test',...(cookie?{cookie}:{})}}),
      {params:Promise.resolve({versionId:f.versionId})});
    expect(contentUrl.searchParams.get('assetId')).toBe(ready.assetId);
    expect((await callContent()).status).toBe(401);
    const response=await callContent('cad_session='+f.session.rawToken);
    expect(response.status).toBe(200);expect(Buffer.from(await response.arrayBuffer())).toEqual(value.bytes);
    expect((await callContent('cad_session='+f.session.rawToken,randomUUID())).status).toBe(404);
    expect(await f.db.sceneAsset.count()).toBe(1);
  });
  test('authorized status and content GET refresh idle activity; denied, expired and revoked reads never touch',async()=>{
    const f=await setup(),value=payload(f.versionId,f.sha);
    const ready=await f.repo.publish(f.versionId,value.manifest,value.bytes,null,f.proof);
    const url='https://cad.example.test/api/cad-files/'+f.versionId+'/scene';
    const read=()=>getScene(new Request(url,{headers:{host:'cad.example.test',
      cookie:'cad_session='+f.session.rawToken}}),{params:Promise.resolve({versionId:f.versionId})});
    const readContent=()=>getSceneContent(new Request(url+'/content?assetId='+ready.assetId,{
      headers:{host:'cad.example.test',cookie:'cad_session='+f.session.rawToken}}),
      {params:Promise.resolve({versionId:f.versionId})});
    const old=BigInt(Date.now()-SESSION_IDLE_MS+60_000);
    const sessionId=f.session.session.id;
    const record=()=>f.db.authSession.findUniqueOrThrow({where:{id:sessionId}});
    await f.db.authSession.update({where:{id:sessionId},data:{issuedAt:old,lastSeenAt:old}});
    expect((await read()).status).toBe(200);
    expect((await record()).lastSeenAt).toBeGreaterThan(old);

    await f.db.authSession.update({where:{id:sessionId},data:{lastSeenAt:old}});
    expect((await readContent()).status).toBe(200);
    expect((await record()).lastSeenAt).toBeGreaterThan(old);

    await f.db.userSiteGrant.delete({where:{userId_siteId:{userId:f.userId,siteId:f.siteId}}});
    await f.db.authSession.update({where:{id:sessionId},data:{lastSeenAt:old}});
    expect((await read()).status).toBe(403);
    expect((await record()).lastSeenAt).toBe(old);
    await f.db.userSiteGrant.create({data:{userId:f.userId,siteId:f.siteId,grantedAt:BigInt(Date.now())}});

    const idle=BigInt(Date.now()-SESSION_IDLE_MS-1000);
    await f.db.authSession.update({where:{id:sessionId},data:{lastSeenAt:idle}});
    expect((await read()).status).toBe(401);
    expect((await record()).lastSeenAt).toBe(idle);

    await f.db.authSession.update({where:{id:sessionId},data:{
      lastSeenAt:old,revokedAt:BigInt(Date.now())}});
    expect((await read()).status).toBe(401);
    expect((await record()).lastSeenAt).toBe(old);
  });
  test('publish, reopen, idempotent retry, replacement CAS and old immutable content',async()=>{
    const f=await setup(),first=payload(f.versionId,f.sha);
    expect(await f.repo.status(f.versionId)).toEqual({status:'MISSING'});
    const a=await f.repo.publish(f.versionId,first.manifest,first.bytes,null,f.proof);
    expect(a).toMatchObject({status:'READY',revision:0,manifest:first.manifest});
    expect(await f.repo.publish(f.versionId,first.manifest,first.bytes,null,f.proof)).toEqual(a);
    expect(await f.db.sceneAsset.count()).toBe(1);
    expect(await f.repo.status(f.versionId)).toEqual(a);
    const second=payload(f.versionId,f.sha,'UNIT2');
    const b=await f.repo.publish(f.versionId,second.manifest,second.bytes,0,f.proof);
    expect(b.revision).toBe(1);expect(b.assetId).not.toBe(a.assetId);
    expect(await f.repo.content(f.versionId,a.assetId)).toEqual(first.bytes);
    expect(await f.repo.content(f.versionId,b.assetId)).toEqual(second.bytes);
    await expect(f.repo.publish(f.versionId,first.manifest,first.bytes,0,f.proof))
      .rejects.toMatchObject({code:'SCENE_REVISION_CONFLICT'});
    expect(await f.db.auditEvent.count({where:{action:'SCENE_PUBLISHED'}})).toBe(2);
    expect(await f.db.sceneOrphanJob.count()).toBe(0);
    expect((await f.db.cadFileVersion.findUnique({where:{id:f.versionId}}))?.description).toBe('original sentinel');
  });
  test('a fresh server process restores persisted manifest and bytes without the producing process cache',async()=>{
    const f=await setup(),value=payload(f.versionId,f.sha);
    const ready=await f.repo.publish(f.versionId,value.manifest,value.bytes,null,f.proof);
    const databaseUrl='file:'+path.join(f.root,'db','cad.sqlite');
    await f.db.$disconnect();f.storage.close();
    const script=`
      import {createDb} from './server/db.ts';
      import {SceneRepository} from './server/scene/scene-repository.ts';
      import {SceneBlobStorage} from './server/storage/scene-storage.ts';
      const db=createDb(process.env.DATABASE_URL);
      const storage=new SceneBlobStorage(process.env.CAD_STORAGE_PATH,{CAD_STORAGE_BACKEND:'local'});
      try {
        const repo=new SceneRepository(db,storage);
        const ready=await repo.status(process.env.SCENE_TEST_VERSION);
        if(ready.status!=='READY')throw new Error('SCENE_RESTART_NOT_READY');
        const bytes=await repo.content(process.env.SCENE_TEST_VERSION,ready.assetId);
        process.stdout.write(JSON.stringify({assetId:ready.assetId,revision:ready.revision,bytes:bytes.length,sha256:ready.manifest.sha256}));
      }finally{storage.close();await db.$disconnect();}
    `;
    // Only explicitly selected, synthetic test configuration reaches the child.
    const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{
      cwd:process.cwd(),encoding:'utf8',timeout:15_000,env:{NODE_ENV:'test',PATH:process.env.PATH,
        DATABASE_URL:databaseUrl,CAD_STORAGE_PATH:f.cad,SCENE_TEST_VERSION:f.versionId}});
    expect(result.status,result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({assetId:ready.assetId,revision:ready.revision,
      bytes:value.bytes.length,sha256:value.manifest.sha256});
  });
  test('wrong source and absent proof fail before storage or pointer mutation',async()=>{
    const f=await setup(),good=payload(f.versionId,f.sha),wrong=payload(f.versionId,'d'.repeat(64));
    await expect(f.repo.publish(f.versionId,good.manifest,good.bytes,null,undefined))
      .rejects.toMatchObject({code:'G7_AUTH_CONTEXT_REQUIRED'});
    await expect(f.repo.publish(f.versionId,wrong.manifest,wrong.bytes,null,f.proof))
      .rejects.toMatchObject({code:'SCENE_INVALID'});
    expect(await f.db.sceneAsset.count()).toBe(0);
    expect(await f.db.sceneOrphanJob.count()).toBe(0);
    expect(await f.repo.status(f.versionId)).toEqual({status:'MISSING'});
  });
  test('storage or Audit failure keeps previous READY and tracks orphan for retry',async()=>{
    const f=await setup(),first=payload(f.versionId,f.sha),second=payload(f.versionId,f.sha,'UNIT2');
    const ready=await f.repo.publish(f.versionId,first.manifest,first.bytes,null,f.proof);
    const failStorage=vi.spyOn(f.storage,'putVerified').mockRejectedValueOnce(new Error('synthetic PUT timeout'));
    await expect(f.repo.publish(f.versionId,second.manifest,second.bytes,0,f.proof)).rejects.toThrow('synthetic PUT timeout');
    failStorage.mockRestore();
    expect(await f.repo.status(f.versionId)).toEqual(ready);
    expect((await f.db.sceneOrphanJob.findFirst())?.state).toBe('UNCERTAIN');
    // A revoked grant after verified storage is rechecked inside the final
    // pointer+Audit transaction. The verified loser is eligible for cleanup.
    const realPut=f.storage.putVerified.bind(f.storage);
    const revoke=vi.spyOn(f.storage,'putVerified').mockImplementationOnce(async(locator,bytes,digest)=>{
      await realPut(locator,bytes,digest);
      await f.db.userSiteGrant.delete({where:{userId_siteId:{userId:f.userId,siteId:f.siteId}}});
    });
    await expect(f.repo.publish(f.versionId,second.manifest,second.bytes,0,f.proof))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
    revoke.mockRestore();
    expect(await f.db.currentScene.findUnique({where:{versionId:f.versionId}})).toMatchObject({assetId:ready.assetId,revision:0});
    expect(await f.db.sceneOrphanJob.count({where:{state:'CLEANUP'}})).toBe(1);
    const cleaned=await cleanupSceneOrphans(f.db,f.storage,Date.now()+120_000,60_000);
    expect(cleaned).toEqual({removed:1,pending:0});
    expect(await f.repo.status(f.versionId)).toEqual(ready);
  });
  test('actual Audit INSERT trigger failure rolls back pointer and asset atomically',async()=>{
    const f=await setup(),first=payload(f.versionId,f.sha),second=payload(f.versionId,f.sha,'UNIT2');
    const ready=await f.repo.publish(f.versionId,first.manifest,first.bytes,null,f.proof);
    const signed=runtimeGate.resolveG7RuntimeGate(process.env);
    if(signed.state!=='ACTIVE')throw new Error('expected active test gate');
    await f.db.$executeRawUnsafe("CREATE TRIGGER scene_audit_fault BEFORE INSERT ON AuditEvent WHEN NEW.action='SCENE_PUBLISHED' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_AUDIT_FAILURE'); END");
    // The fixture injects a DB fault after the signed gate was established.
    // Keep the gate verdict fixed only for this test to reach the actual INSERT.
    const gateSpy=vi.spyOn(runtimeGate,'resolveG7RuntimeGate').mockReturnValue(signed);
    try{
      await expect(f.repo.publish(f.versionId,second.manifest,second.bytes,0,f.proof)).rejects.toThrow();
    }finally{
      gateSpy.mockRestore();
      await f.db.$executeRawUnsafe('DROP TRIGGER scene_audit_fault');
    }
    expect(await f.repo.status(f.versionId)).toEqual(ready);
    expect(await f.db.sceneAsset.count()).toBe(1);
    expect(await f.db.auditEvent.count({where:{action:'SCENE_PUBLISHED'}})).toBe(1);
    expect(await f.db.sceneOrphanJob.count({where:{state:'CLEANUP'}})).toBe(1);
  });
  test('corrupt stored bytes report rebuild while old pointer remains intact',async()=>{
    const f=await setup(),first=payload(f.versionId,f.sha),ready=await f.repo.publish(f.versionId,first.manifest,first.bytes,null,f.proof);
    const blob=await f.db.sceneAsset.findUniqueOrThrow({where:{id:ready.assetId}});
    writeFileSync(path.join(f.cad,blob.storageLocator),'corrupt');
    expect(await f.repo.status(f.versionId)).toEqual({status:'REBUILD_REQUIRED',revision:0});
    await expect(f.repo.content(f.versionId,ready.assetId)).rejects.toMatchObject({code:'SCENE_REBUILD_REQUIRED'});
    const rebuilt=await f.repo.publish(f.versionId,first.manifest,first.bytes,0,f.proof);
    expect(rebuilt.assetId).not.toBe(ready.assetId);
    expect(rebuilt.revision).toBe(1);
    expect(await f.repo.status(f.versionId)).toEqual(rebuilt);
  });
  test('two concurrent rebuilds have one CAS winner and leave a cleanup candidate',async()=>{
    const f=await setup(),first=payload(f.versionId,f.sha),a=payload(f.versionId,f.sha,'UNIT2'),
      b=payload(f.versionId,f.sha,'UNIT3');
    await f.repo.publish(f.versionId,first.manifest,first.bytes,null,f.proof);
    const results=await Promise.allSettled([
      f.repo.publish(f.versionId,a.manifest,a.bytes,0,f.proof),
      f.repo.publish(f.versionId,b.manifest,b.bytes,0,f.proof)]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect((results.find(x=>x.status==='rejected') as PromiseRejectedResult).reason)
      .toMatchObject({code:'SCENE_REVISION_CONFLICT'});
    expect((await f.db.currentScene.findUnique({where:{versionId:f.versionId}}))?.revision).toBe(1);
    expect(await f.db.sceneOrphanJob.count({where:{state:'CLEANUP'}})).toBeLessThanOrEqual(1);
  });
  test('Version deletion detaches Scene metadata and records delayed blob cleanup',async()=>{
    const f=await setup(),first=payload(f.versionId,f.sha),ready=await f.repo.publish(f.versionId,first.manifest,first.bytes,null,f.proof);
    await f.db.cadFileVersion.update({where:{id:f.versionId},data:{deletePasswordHash:await hashDeletePassword('1234')}});
    await new CadRepository(f.db).deleteVersion(f.versionId,'1234',f.proof);
    expect(await f.db.currentScene.count()).toBe(0);
    expect(await f.db.sceneAsset.count()).toBe(0);
    expect(await f.db.sceneOrphanJob.findFirst({where:{assetId:ready.assetId}}))
      .toMatchObject({state:'CLEANUP'});
    expect(await f.db.cadFileVersion.count()).toBe(0);
    expect(await cleanupSceneOrphans(f.db,f.storage,Date.now()+120_000,60_000))
      .toEqual({removed:1,pending:0});
  });
});
