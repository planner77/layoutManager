/** #225 disposable actual HTTP-multipart service -> signed G7 enqueue -> separate
 * Node CPU worker -> verified immutable Scene. Never touches a real volume.
 * This is not a Docker/OCI or full browser authenticated application test. */
import {afterEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chmodSync,mkdirSync,mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {sceneSha256} from '../../domain/scene-digest';
import {newSessionCandidate} from '../../server/auth/session';
import {csrfProof} from '../../server/auth/login-service';
import {ensureAutomatedGreenfield} from '../../server/g7-operational/greenfield-auto';
import {prepareG7CadWrite} from '../../server/g7-operational/cad-guard';
import {createDb} from '../../server/db';
import {CadRepository} from '../../server/repositories/cad';
import {CadStorage} from '../../server/storage/cad-storage';
import {SceneBlobStorage} from '../../server/storage/scene-storage';
import {SceneRepository} from '../../server/scene/scene-repository';
import {manualRetryCpuSceneJob} from '../../server/scene/scene-build-retry-service';
import {uploadCad} from '../../server/services/upload';

type SqliteDb={exec:(sql:string)=>void;prepare:(sql:string)=>{run:(...args:unknown[])=>unknown};close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>SqliteDb;
const dx=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4',
  '0','ENDSEC','0','SECTION','2','ENTITIES','0','LINE','5','AA','8','0',
  '10','0','20','0','11','10','21','20','0','ENDSEC','0','EOF',''].join('\n'));
const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const root of roots.splice(0))
  rmSync(root,{recursive:true,force:true});});

async function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'cpu-upload-g7-pilot-'));
  roots.push(root);chmodSync(root,0o700);
  const directory=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(directory,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const dbPath=path.join(directory,'cad.sqlite');
  const img='ghcr.io/planner77/layoutmanager:0.61.0';
  const env={
    G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
    DATABASE_URL:'file:'+dbPath,CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,
    G7_DEPLOY_APP_IMAGE:img,G7_DEPLOY_MIGRATOR_IMAGE:img+'-migrate',
    G7_RELEASE_SOURCE_COMMIT:'a'.repeat(40),
    G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
    G7_RUNTIME_ORIGIN:'http://localhost:3000',G7_RUNTIME_ALLOW_HTTP:'true',
    SCENE_AUTO_BUILD_ENABLED:'true',SCENE_CPU_WORKER_ENABLED:'true',
  };
  ensureAutomatedGreenfield({...env,G7_AUTH_ENABLED:'false',
    G7_CAD_WRITE_CUTOVER_ENABLED:'false'});
  const id=()=>randomUUID(),actor=id(),bu=id(),prod=id(),site=id(),
    building=id(),floor=id();
  const raw=new Sqlite(dbPath);
  try{
    raw.exec('PRAGMA foreign_keys=ON');
    raw.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(actor,'pilot-editor','synthetic-only','ACTIVE',0,1,1);
    raw.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)')
      .run(actor,'Editor',1);
    raw.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(bu,'BU');
    raw.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run(prod,bu,'P');
    raw.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
      .run(site,prod,'Site','SITE');
    raw.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
      .run(building,site,'B');
    raw.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)')
      .run(floor,building,'F');
    raw.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
      .run(actor,site,1);
  }finally{raw.close();}
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  const db=createDb('file:'+dbPath);
  const now=Date.now(),session=newSessionCandidate(actor,now);
  await db.authSession.create({data:{id:session.session.id,userId:actor,
    tokenHash:session.session.tokenHash,issuedAt:BigInt(now),lastSeenAt:BigInt(now),
    expiresAt:BigInt(session.session.expiresAt)}});
  const form=new FormData();
  form.set('file',new File([dx],'pilot.dxf',{type:'application/dxf'}));
  for(const [key,value] of Object.entries({
    businessUnitId:bu,productId:prod,siteId:site,buildingId:building,floorId:floor,
    registeredAt:'2026-11-05',makeCurrent:'true',deletePassword:'1234',
  }))form.set(key,value);
  const request=new Request('http://0.0.0.0:3000/api/cad-files',{method:'POST',
    headers:{host:'localhost:3000',origin:'http://localhost:3000',
      cookie:'cad_session='+session.rawToken,'x-csrf-token':csrfProof(session.rawToken)},
    body:form});
  return {db,dbPath,root,cad,actor,site,request,env};
}
function tick(){
  const result=spawnSync(process.execPath,
    ['--import','tsx','scripts/scene-cpu-worker.ts','--once'],{
      cwd:path.resolve(import.meta.dirname,'../..'),env:{...process.env},
      encoding:'utf8',timeout:90_000,maxBuffer:1024*1024,
    });
  if(result.error)throw result.error;
  expect(result.status,result.stderr).toBe(0);
  const line=(result.stdout??'').split(/\r?\n/).find(x=>x.includes('"kind":"CPU_SCENE_TICK"'));
  expect(line,result.stdout).toBeDefined();
  return JSON.parse(line!) as {outcome:string;jobId?:string;code?:string};
}

describe('#225 signed disposable DXF upload -> detached Worker -> persisted READY',()=>{
  it('performs real multipart receive, G7-authored atomic enqueue, one-process publish/readback',async()=>{
    const f=await fixture();
    try{
      const proof=prepareG7CadWrite(f.request,'pilot-upload-proof');
      expect(proof?.runtime).toBeTruthy();
      const registered=await uploadCad(f.request,new CadRepository(f.db),
        new CadStorage(f.cad,16*1024*1024),undefined,proof);
      expect(registered.sceneBuild).toMatchObject({status:'QUEUED'});
      const version=await f.db.cadFileVersion.findUniqueOrThrow({where:{id:registered.id}});
      expect(version.sha256).toBe(sceneSha256(dx));
      expect(readFileSync(path.join(f.cad,version.storagePath))).toEqual(dx);
      expect(await f.db.sceneBuildJob.count({where:{versionId:registered.id,
        status:'QUEUED'}})).toBe(1);
      const output=tick();
      expect(output).toMatchObject({outcome:'PUBLISHED',
        jobId:registered.sceneBuild?.jobId});
      const storage=new SceneBlobStorage(f.cad,{CAD_STORAGE_BACKEND:'local'});
      try{
        const repo=new SceneRepository(f.db,storage);
        const status=await repo.status(registered.id);
        expect(status).toMatchObject({status:'READY',revision:0});
        if(status.status!=='READY')throw new Error('PILOT_SCENE_NOT_READY');
        expect((await repo.content(registered.id,status.assetId)).length).toBeGreaterThan(0);
      }finally{storage.close();}
      expect(await f.db.auditEvent.count({where:{targetId:registered.id,
        action:'CAD_UPLOADED'}})).toBe(1);
      expect(await f.db.auditEvent.count({where:{targetId:registered.id,
        action:'SCENE_PUBLISHED'}})).toBe(1);
      await expect(manualRetryCpuSceneJob(f.db,registered.id,proof!))
        .rejects.toMatchObject({code:'SCENE_ALREADY_PUBLISHED'});
      expect(tick().outcome).toBe('IDLE');
      expect(await f.db.sceneAsset.count({where:{versionId:registered.id}})).toBe(1);
    }finally{await f.db.$disconnect();}
  });
  it('revocation after genuine G7 upload cannot grant a later Worker publish',async()=>{
    const f=await fixture();
    try{
      const proof=prepareG7CadWrite(f.request,'pilot-upload-revoked');
      const saved=await uploadCad(f.request,new CadRepository(f.db),
        new CadStorage(f.cad,16*1024*1024),undefined,proof);
      await f.db.userSiteGrant.deleteMany({where:{userId:f.actor,siteId:f.site}});
      expect(tick()).toMatchObject({outcome:'FAILED',code:'SCENE_AUTH_REVOKED'});
      expect(await f.db.currentScene.count({where:{versionId:saved.id}})).toBe(0);
      expect(await f.db.sceneAsset.count({where:{versionId:saved.id}})).toBe(0);
      const version=await f.db.cadFileVersion.findUniqueOrThrow({where:{id:saved.id}});
      expect(readFileSync(path.join(f.cad,version.storagePath))).toEqual(dx);
    }finally{await f.db.$disconnect();}
  });
});
