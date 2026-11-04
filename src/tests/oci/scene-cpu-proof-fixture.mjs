/**
 * #225 CI-owned G7 0.61 proof. Mount this ONE file read-only into the local
 * cpu-worker OCI at /app/src/scripts/ci-scene-proof-fixture.mjs.
 * Never supply production DB, CAD volume, credentials, or unsigned host paths.
 * No test file is included in a published image or production application.
 */
import Database from 'better-sqlite3';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,cpSync,existsSync} from 'node:fs';
import path from 'node:path';

const dbPath='/data/db/cad.sqlite';
const cadPath='/data/cad';
const statePath='/data/ci-scene-oci-proof.json';
const die=(code)=>{throw new Error(code);};
const assert=(condition,code)=>{if(!condition)die(code);};
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const freshId=()=>randomUUID();
const data=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4',
  '0','ENDSEC','0','SECTION','2','ENTITIES',
  '0','LINE','5','A1','8','0','10','0','20','0','11','10','21','20',
  '0','ENDSEC','0','EOF','',
].join('\n'));
function stored(){
  assert(existsSync(statePath),'OCI_PROOF_FIXTURE_MISSING');
  const value=JSON.parse(readFileSync(statePath,'utf8'));
  assert(value.siteId&&value.actorId&&value.locationId&&value.versions,'OCI_PROOF_STATE_INVALID');
  return value;
}
function save(state){
  writeFileSync(statePath,JSON.stringify(state),{mode:0o600});
}
function rawDb(){
  const db=new Database(dbPath,{fileMustExist:true});
  db.pragma('foreign_keys = ON');
  return db;
}
function putVersion(raw,state,name,index){
  const versionId=freshId(),sha=hash(data);
  const file=path.join(cadPath,state.locationId,versionId,'original.dxf');
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  writeFileSync(file,data,{flag:'wx',mode:0o600});
  raw.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(versionId,state.locationId,index,name+'.dxf','','synthetic-only',
      'DXF',data.length,sha,state.locationId+'/'+versionId+'/original.dxf',
      '2026-11-05T00:00:00Z');
  return {versionId,sha,original:file};
}
async function queue(state,name){
  const raw=rawDb();
  let row;
  try { row=putVersion(raw,state,name,Object.keys(state.versions).length+1); }
  finally {raw.close();}
  const {createDb,writeTransaction}=await import('../server/db.ts');
  const {enqueueCpuSceneBuildTx}=await import('../server/scene/scene-build-job-queue.ts');
  const db=createDb('file:'+dbPath);
  try{
    const job=await writeTransaction(db,tx=>enqueueCpuSceneBuildTx(tx,{
      versionId:row.versionId,sourceSha256:row.sha,
      actorId:state.actorId,siteId:state.siteId,requestId:'ci-proof-'+name,
    }));
    assert(job.status==='QUEUED','OCI_PROOF_ENQUEUE_FAILED');
    state.versions[name]={...row,jobId:job.jobId};
    save(state);
  }finally{await db.$disconnect();}
}
async function setup(){
  assert(!existsSync(statePath),'OCI_PROOF_WOULD_OVERWRITE_FIXTURE');
  const state={actorId:freshId(),siteId:freshId(),locationId:freshId(),versions:{}};
  const business=freshId(),product=freshId(),building=freshId();
  const raw=rawDb();
  try{
    assert(raw.prepare('SELECT count(*) AS n FROM "User"').get().n===0,
      'OCI_PROOF_NONEMPTY_USER_DB');
    raw.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(state.actorId,'ci-oci-synthetic','synthetic-not-a-secret','ACTIVE',0,1,1);
    raw.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)')
      .run(state.actorId,'Admin',1);
    raw.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)')
      .run(business,'CI only');
    raw.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)')
      .run(product,business,'P');
    raw.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
      .run(state.siteId,product,'Site','SITE');
    raw.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
      .run(building,state.siteId,'B');
    raw.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)')
      .run(state.locationId,building,'F');
    raw.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
      .run(state.actorId,state.siteId,1);
  }finally{raw.close();}
  await queue(state,'ready');
}
async function assertReady(state,name,attempt){
  const row=state.versions[name];
  assert(row,'OCI_PROOF_VERSION_MISSING');
  const {createDb}=await import('../server/db.ts');
  const {SceneRepository}=await import('../server/scene/scene-repository.ts');
  const {SceneBlobStorage}=await import('../server/storage/scene-storage.ts');
  const db=createDb('file:'+dbPath);
  const storage=new SceneBlobStorage(cadPath,{CAD_STORAGE_BACKEND:'local'});
  try{
    const job=await db.sceneBuildJob.findUniqueOrThrow({where:{id:row.jobId}});
    assert(job.status==='READY'&&job.attempt===attempt,'OCI_PROOF_JOB_NOT_READY');
    const repo=new SceneRepository(db,storage);
    const status=await repo.status(row.versionId);
    assert(status.status==='READY'&&status.revision===0,'OCI_PROOF_SCENE_NOT_READY');
    const bytes=await repo.content(row.versionId,status.assetId);
    assert(bytes.byteLength>0,'OCI_PROOF_SCENE_EMPTY');
    assert(await db.sceneAsset.count({where:{versionId:row.versionId}})===1,
      'OCI_PROOF_DUPLICATE_SCENE');
    assert(await db.auditEvent.count({where:{action:'SCENE_PUBLISHED',
      targetId:row.versionId}})===1,'OCI_PROOF_AUDIT_MISSING');
    assert(hash(readFileSync(row.original))===row.sha,'OCI_PROOF_SOURCE_CHANGED');
    return status.assetId;
  }finally{storage.close();await db.$disconnect();}
}
async function denied(state,name,code){
  const {createDb}=await import('../server/db.ts');
  const db=createDb('file:'+dbPath),row=state.versions[name];
  try{
    const job=await db.sceneBuildJob.findUniqueOrThrow({where:{id:row.jobId}});
    assert(job.status==='FAILED'&&job.lastCode===code,'OCI_PROOF_DENIAL_NOT_ENFORCED');
    assert(await db.currentScene.count({where:{versionId:row.versionId}})===0,
      'OCI_PROOF_DENIED_POINTER_CREATED');
    assert(await db.sceneAsset.count({where:{versionId:row.versionId}})===0,
      'OCI_PROOF_DENIED_ASSET_CREATED');
    await assertReady(state,'ready',1);
  }finally{await db.$disconnect();}
}
async function revoke(){
  const state=stored(),raw=rawDb();
  try{
    const result=raw.prepare('DELETE FROM "UserSiteGrant" WHERE user_id=? AND site_id=?')
      .run(state.actorId,state.siteId);
    assert(result.changes===1,'OCI_PROOF_GRANT_NOT_FOUND');
  }finally{raw.close();}
  await queue(state,'revoked');
}
async function tamper(){
  const state=stored(),raw=rawDb();
  try {
    raw.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
      .run(state.actorId,state.siteId,2);
  }finally{raw.close();}
  await queue(state,'tampered');
  const row=state.versions.tampered;
  const original=readFileSync(row.original);
  const altered=Buffer.from(original);
  altered[5]^=1;
  assert(altered.length===original.length,'OCI_PROOF_TAMPER_LENGTH_CHANGED');
  writeFileSync(row.original,altered,{mode:0o600});
}
const claimMarker='/data/ci-scene-oci-claimed.marker';
async function verifyClaimMarker(){
  const state=stored(),row=state.versions.crash;
  assert(row,'OCI_PROOF_CRASH_NOT_PREPARED');
  assert(existsSync(claimMarker),'OCI_PROOF_CLAIM_NOT_DURABLE');
  assert(readFileSync(claimMarker,'utf8')==='CLAIMED:'+row.jobId,
    'OCI_PROOF_CLAIM_MARKER_INVALID');
  const db=rawDb();
  try{
    const job=db.prepare('SELECT status,attempt,started_at FROM "SceneBuildJob" WHERE id=?')
      .get(row.jobId);
    assert(job?.status==='RUNNING'&&job.attempt===1&&job.started_at,
      'OCI_PROOF_CLAIM_NOT_RUNNING');
    assert(db.prepare('SELECT count(*) AS n FROM "CurrentScene" WHERE version_id=?')
      .get(row.versionId).n===0,'OCI_PROOF_CLAIM_PREMATURE_POINTER');
  }finally{db.close();}
}
async function claimAndWaitForHostKill(){
  const state=stored(),row=state.versions.crash;
  assert(row,'OCI_PROOF_CRASH_NOT_PREPARED');
  const {createDb}=await import('../server/db.ts');
  const {claimNextCpuSceneJob}=await import('../server/scene/scene-build-job-queue.ts');
  const db=createDb('file:'+dbPath);
  try{
    const claimed=await claimNextCpuSceneJob(db);
    assert(claimed?.id===row.jobId&&claimed.attempt===1,'OCI_PROOF_CLAIM_MISMATCH');
  }finally{await db.$disconnect();}
  // The host may kill ONLY after a separate OCI observes this durable marker
  // and confirms the SQLite RUNNING row. Never self-kill or hide an assertion.
  writeFileSync(claimMarker,'CLAIMED:'+row.jobId,{flag:'wx',mode:0o600});
  process.stdout.write('OCI_CPU_CLAIM_READY\\n');
  await new Promise(()=>{setInterval(()=>{},30_000);});
}
async function changeClock(kind){
  const state=stored(),row=state.versions.crash;
  const {createDb}=await import('../server/db.ts');
  const db=createDb('file:'+dbPath);
  try{
    const job=await db.sceneBuildJob.findUniqueOrThrow({where:{id:row.jobId}});
    if(kind==='stale'){
      assert(job.status==='RUNNING'&&job.attempt===1,'OCI_PROOF_NOT_KILLED');
      await db.sceneBuildJob.update({where:{id:row.jobId},
        data:{startedAt:new Date(Date.now()-210_000)}});
    }else if(kind==='due'){
      assert(job.status==='RETRY_WAIT'&&job.attempt===1&&
        job.lastCode==='SCENE_BUILD_TIMEOUT','OCI_PROOF_STALE_NOT_RECOVERED');
      await db.sceneBuildJob.update({where:{id:row.jobId},
        data:{dueAt:new Date(Date.now()-10_000)}});
    }else die('OCI_PROOF_CLOCK_ACTION');
  }finally{await db.$disconnect();}
}
async function verifyWait(){
  const state=stored(),row=state.versions.crash;
  const {createDb}=await import('../server/db.ts');
  const db=createDb('file:'+dbPath);
  try{
    const job=await db.sceneBuildJob.findUniqueOrThrow({where:{id:row.jobId}});
    assert(job.status==='RETRY_WAIT'&&job.attempt===1&&
      job.lastCode==='SCENE_BUILD_TIMEOUT','OCI_PROOF_RETRY_WAIT_REQUIRED');
    assert(await db.currentScene.count({where:{versionId:row.versionId}})===0,
      'OCI_PROOF_PREMATURE_READY');
    await assertReady(state,'ready',1);
  }finally{await db.$disconnect();}
}
async function restore(){
  const state=stored();
  const dir='/data/ci-scene-isolated-restore';
  assert(!existsSync(dir),'OCI_PROOF_RESTORE_NOT_EMPTY');
  mkdirSync(path.join(dir,'db'),{recursive:true,mode:0o700});
  const original=rawDb();
  try{await original.backup(path.join(dir,'db','cad.sqlite'));}
  finally{original.close();}
  cpSync(cadPath,path.join(dir,'cad'),{recursive:true});
  const {createDb}=await import('../server/db.ts');
  const {SceneRepository}=await import('../server/scene/scene-repository.ts');
  const {SceneBlobStorage}=await import('../server/storage/scene-storage.ts');
  const db=createDb('file:'+path.join(dir,'db','cad.sqlite'));
  const storage=new SceneBlobStorage(path.join(dir,'cad'),{CAD_STORAGE_BACKEND:'local'});
  try{
    for(const name of ['ready','crash']){
      const row=state.versions[name];
      const repo=new SceneRepository(db,storage);
      const scene=await repo.status(row.versionId);
      assert(scene.status==='READY','OCI_PROOF_RESTORED_SCENE_NOT_READY');
      const restored=await repo.content(row.versionId,scene.assetId);
      assert(restored.length>0,'OCI_PROOF_RESTORED_BLOB_EMPTY');
    }
  }finally{storage.close();await db.$disconnect();}
}
async function main(){
  const action=process.argv[2],state=action==='setup'?null:stored();
  if(action==='setup')await setup();
  else if(action==='verify-ready')await assertReady(state,'ready',1);
  else if(action==='revoke')await revoke();
  else if(action==='verify-revoked')await denied(state,'revoked','SCENE_AUTH_REVOKED');
  else if(action==='tamper')await tamper();
  else if(action==='verify-tamper')await denied(state,'tampered','SCENE_SOURCE_DIGEST_MISMATCH');
  else if(action==='prepare-crash')await queue(state,'crash');
  else if(action==='claim-wait')await claimAndWaitForHostKill();
  else if(action==='claim-marker')await verifyClaimMarker();
  else if(action==='stale'||action==='due')await changeClock(action);
  else if(action==='verify-wait')await verifyWait();
  else if(action==='verify-recovered'){
    await assertReady(state,'ready',1);
    await assertReady(state,'crash',2);
  }
  else if(action==='restore')await restore();
  else die('OCI_PROOF_UNKNOWN_ACTION');
  process.stdout.write(JSON.stringify({kind:'OCI_CPU_PROOF',action,status:'PASS'})+'\n');
}
try{await main();}catch(error){
  process.stderr.write('OCI_CPU_PROOF_FAILED '+(error instanceof Error?error.message:'UNKNOWN')+'\n');
  process.exitCode=1;
}
