import packageInfo from '../../package.json';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {sceneSha256} from '../../domain/scene-digest';
import {ensureAutomatedGreenfield} from '../../server/g7-operational/greenfield-auto';
import {createDb,writeTransaction} from '../../server/db';
import {enqueueCpuSceneBuildTx} from '../../server/scene/scene-build-job-queue';
import {runCpuWorkerTick} from '../../scripts/scene-cpu-worker';
import {SceneRepository} from '../../server/scene/scene-repository';
import {SceneBlobStorage} from '../../server/storage/scene-storage';

type SqliteDb={exec:(sql:string)=>void;prepare:(sql:string)=>{
  run:(...args:unknown[])=>unknown};close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(filename:string)=>SqliteDb;
const dx=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4',
  '0','ENDSEC','0','SECTION','2','ENTITIES','0','LINE','8','0',
  '10','0','20','0','11','10','21','20','0','ENDSEC','0','EOF',''].join('\n'));
const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
async function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'cpu-worker-g7-real-'));roots.push(root);chmodSync(root,0o700);
  const dbdir=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(dbdir,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const dbfile=path.join(dbdir,'cad.sqlite'),img='ghcr.io/planner77/layoutmanager:'+packageInfo.version;
  const env={
    G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
    DATABASE_URL:'file:'+dbfile,CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,
    G7_DEPLOY_APP_IMAGE:img,G7_DEPLOY_MIGRATOR_IMAGE:img+'-migrate',
    G7_RELEASE_SOURCE_COMMIT:'a'.repeat(40),
    G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
    G7_RUNTIME_ORIGIN:'http://localhost:3000',G7_RUNTIME_ALLOW_HTTP:'true',
    SCENE_AUTO_BUILD_ENABLED:'true',SCENE_CPU_WORKER_ENABLED:'true',
  };
  ensureAutomatedGreenfield({...env,G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false'});
  const id=()=>randomUUID(),actor=id(),bu=id(),prod=id(),site=id(),building=id(),
    loc=id(),versionId=id(),sha=sceneSha256(dx);
  const db0=new Sqlite(dbfile);
  try{
    db0.exec('PRAGMA foreign_keys=ON');
    db0.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(actor,'cpu-owner','synthetic-hash','ACTIVE',0,1,1);
    db0.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)')
      .run(actor,'Admin',1);
    db0.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(bu,'BU');
    db0.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run(prod,bu,'P');
    db0.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)').run(site,prod,'Site','SITE');
    db0.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run(building,site,'B');
    db0.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)').run(loc,building,'F');
    db0.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
      .run(actor,site,1);
    db0.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(versionId,loc,1,'tiny.dxf','','synthetic-hash','DXF',dx.length,sha,
        loc+'/'+versionId+'/original.dxf','2026-11-04T00:00:00Z');
    mkdirSync(path.join(cad,loc,versionId),{recursive:true,mode:0o700});
    writeFileSync(path.join(cad,loc,versionId,'original.dxf'),dx,{mode:0o600});
  }finally{db0.close();}
  for(const [key,val] of Object.entries(env))vi.stubEnv(key,val);
  const db=createDb('file:'+dbfile);
  const job=await writeTransaction(db,tx=>enqueueCpuSceneBuildTx(tx,{
    versionId,sourceSha256:sha,actorId:actor,siteId:site,requestId:'cpu-owner-request',
  }));
  return {db,root,cad,versionId,actor,site,job,env};
}


/** A new Node process reopens the owned G7 SQLite and local CAD storage.
 * This is a process boundary test, NOT a Docker/cgroup isolation proof. */
function childTick():{kind:string;outcome:string;jobId?:string;code?:string}{
  const result=spawnSync(process.execPath,
    ['--import','tsx','scripts/scene-cpu-worker.ts','--once'],{
      cwd:path.resolve(import.meta.dirname,'../..'),
      env:{...process.env},encoding:'utf8',timeout:90_000,maxBuffer:1024*1024,
    });
  if(result.error)throw result.error;
  expect(result.status,result.stderr).toBe(0);
  const output=(result.stdout??'').split(/\r?\n/).find(line=>line.includes('"kind":"CPU_SCENE_TICK"'));
  expect(output,result.stdout).toBeDefined();
  return JSON.parse(output!) as {kind:string;outcome:string;jobId?:string;code?:string};
}

describe('#225 CPU-only detached Worker actual G7 0.61 one-job roundtrip',()=>{
  it('uses fresh G7 Actor/Site rights, persists immutable READY and becomes idle on next tick',async()=>{
    const f=await fixture();
    try{
      const result=await runCpuWorkerTick();
      expect(result).toMatchObject({outcome:'PUBLISHED',jobId:f.job.jobId});
      expect(await f.db.sceneBuildJob.findUnique({where:{id:f.job.jobId}}))
        .toMatchObject({status:'READY'});
      expect(await f.db.auditEvent.count({where:{action:'SCENE_PUBLISHED',
        targetId:f.versionId}})).toBe(1);
      const storage=new SceneBlobStorage(f.cad,{CAD_STORAGE_BACKEND:'local'});
      try{
        const repo=new SceneRepository(f.db,storage);
        const status=await repo.status(f.versionId);
        expect(status).toMatchObject({status:'READY',revision:0});
        if(status.status!=='READY')throw new Error('SCENE_CPU_INTEGRATION_NOT_READY');
        expect(await repo.content(f.versionId,status.assetId)).toBeTruthy();
      }finally{storage.close();}
      expect(await runCpuWorkerTick()).toEqual({outcome:'IDLE'});
    }finally{await f.db.$disconnect();}
  });
  it('does not publish when the original Actor grant is revoked after enqueue',async()=>{
    const f=await fixture();
    try{
      await f.db.userSiteGrant.deleteMany({where:{userId:f.actor,siteId:f.site}});
      const result=await runCpuWorkerTick();
      expect(result.outcome).not.toBe('PUBLISHED');
      expect(await f.db.currentScene.count({where:{versionId:f.versionId}})).toBe(0);
      expect(await f.db.sceneAsset.count({where:{versionId:f.versionId}})).toBe(0);
    }finally{await f.db.$disconnect();}
  });
});

describe('#225 pilot disposable detached-process regressions',()=>{
  it('detached Node worker reopens synthetic G7 DB, publishes verified READY, and never republishes',async()=>{
    const f=await fixture();
    try{
      const first=childTick();
      expect(first).toMatchObject({kind:'CPU_SCENE_TICK',outcome:'PUBLISHED',
        jobId:f.job.jobId});
      const pointer=await f.db.currentScene.findUnique({where:{versionId:f.versionId}});
      expect(pointer).toMatchObject({revision:0});
      const fresh=createDb('file:'+path.join(f.root,'db','cad.sqlite'));
      const storage=new SceneBlobStorage(f.cad,{CAD_STORAGE_BACKEND:'local'});
      try{
        const reader=new SceneRepository(fresh,storage);
        const status=await reader.status(f.versionId);
        expect(status).toMatchObject({status:'READY',assetId:pointer?.assetId});
        if(status.status!=='READY')throw Error('SCENE_PILOT_READBACK_MISSING');
        expect((await reader.content(f.versionId,status.assetId)).length).toBeGreaterThan(0);
      }finally{storage.close();await fresh.$disconnect();}
      expect(childTick()).toMatchObject({outcome:'IDLE'});
      expect(await f.db.sceneAsset.count({where:{versionId:f.versionId}})).toBe(1);
      expect(await f.db.auditEvent.count({where:{action:'SCENE_PUBLISHED',
        targetId:f.versionId}})).toBe(1);
    }finally{await f.db.$disconnect();}
  });

  it('separate worker invocation recovers a stale claimed attempt after a simulated stop',async()=>{
    const f=await fixture();
    try{
      // Kill a *real separate* process after its durable claim commits.
      // Do not kill a Vitest/GitHub runner process or change production code.
      const script=[
        "import {createDb} from './server/db.ts';",
        "import {claimNextCpuSceneJob} from './server/scene/scene-build-job-queue.ts';",
        "const db=createDb(process.env.DATABASE_URL);",
        "const claimed=await claimNextCpuSceneJob(db);",
        "await db.$disconnect();",
        "if(!claimed)process.exit(5);",
        "process.kill(process.pid,'SIGKILL');",
      ].join('\n');
      const killed=spawnSync(process.execPath,
        ['--import','tsx','--input-type=module','--eval',script],{
          cwd:path.resolve(import.meta.dirname,'../..'),
          env:{...process.env},encoding:'utf8',timeout:45_000,
        });
      expect(killed.signal,killed.stderr).toBe('SIGKILL');
      expect(await f.db.sceneBuildJob.findUniqueOrThrow({where:{id:f.job.jobId}}))
        .toMatchObject({status:'RUNNING',attempt:1});
      // Accelerate only the disposable SQLite row clock, not real system time.
      // The real next worker invocation must recover the SIGKILL orphan.
      await f.db.sceneBuildJob.update({where:{id:f.job.jobId},data:{
        startedAt:new Date(Date.now()-210_000),
      }});
      expect(childTick()).toMatchObject({outcome:'IDLE'});
      const waiting=await f.db.sceneBuildJob.findUniqueOrThrow({where:{id:f.job.jobId}});
      expect(waiting).toMatchObject({status:'RETRY_WAIT',attempt:1,
        lastCode:'SCENE_BUILD_TIMEOUT'});
      expect(await f.db.currentScene.count({where:{versionId:f.versionId}})).toBe(0);
      await f.db.sceneBuildJob.update({where:{id:f.job.jobId},data:{
        dueAt:new Date(Date.now()-1000),
      }});
      expect(childTick()).toMatchObject({outcome:'PUBLISHED',jobId:f.job.jobId});
      expect(await f.db.sceneBuildJob.findUniqueOrThrow({where:{id:f.job.jobId}}))
        .toMatchObject({status:'READY',attempt:2});
      expect(await f.db.sceneAsset.count({where:{versionId:f.versionId}})).toBe(1);
    }finally{await f.db.$disconnect();}
  });

  it('a same-length tampered DXF fails SourceSHA without READY or an asset',async()=>{
    const f=await fixture();
    try{
      const version=await f.db.cadFileVersion.findUniqueOrThrow({where:{id:f.versionId}});
      const original=path.join(f.cad,version.storagePath);
      const before=readFileSync(original);
      const tampered=Buffer.from(before);
      tampered[5]^=1;
      writeFileSync(original,tampered,{mode:0o600});
      expect(childTick()).toMatchObject({outcome:'FAILED',jobId:f.job.jobId,
        code:'SCENE_SOURCE_DIGEST_MISMATCH'});
      expect(await f.db.sceneBuildJob.findUniqueOrThrow({where:{id:f.job.jobId}}))
        .toMatchObject({status:'FAILED',lastCode:'SCENE_SOURCE_DIGEST_MISMATCH'});
      expect(await f.db.currentScene.count({where:{versionId:f.versionId}})).toBe(0);
      expect(await f.db.sceneAsset.count({where:{versionId:f.versionId}})).toBe(0);
      expect(version.sha256).toBe(sceneSha256(before));
    }finally{await f.db.$disconnect();}
  });

  it('revoked signed Site grant is denied in a newly launched worker process',async()=>{
    const f=await fixture();
    try{
      await f.db.userSiteGrant.deleteMany({where:{userId:f.actor,siteId:f.site}});
      expect(childTick()).toMatchObject({outcome:'FAILED',jobId:f.job.jobId,
        code:'SCENE_AUTH_REVOKED'});
      expect(await f.db.currentScene.count({where:{versionId:f.versionId}})).toBe(0);
      expect(await f.db.sceneAsset.count({where:{versionId:f.versionId}})).toBe(0);
    }finally{await f.db.$disconnect();}
  });
});
