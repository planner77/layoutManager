import {afterEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {chmodSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
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
  const dbfile=path.join(dbdir,'cad.sqlite'),img='ghcr.io/planner77/layoutmanager:0.61.0';
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

describe('#225 CPU-only detached Worker actual G7 0.61 one-job roundtrip',()=>{
  it('uses fresh G7 Actor/Site rights, persists immutable READY and becomes idle on next tick',async()=>{
    const f=await fixture();
    try{
      const result=await runCpuWorkerTick();
      expect(result).toMatchObject({outcome:'PUBLISHED',jobId:f.job.id});
      expect(await f.db.sceneBuildJob.findUnique({where:{id:f.job.id}}))
        .toMatchObject({status:'READY'});
      expect(await f.db.auditEvent.count({where:{action:'SCENE_PUBLISHED',
        targetId:f.versionId}})).toBe(1);
      const storage=new SceneBlobStorage(f.cad,{CAD_STORAGE_BACKEND:'local'});
      try{
        const repo=new SceneRepository(f.db,storage);
        const status=await repo.status(f.versionId);
        expect(status).toMatchObject({status:'READY',revision:0});
        expect(await repo.content(f.versionId,status.assetId!)).toBeTruthy();
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
