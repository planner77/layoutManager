import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {chmodSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {sceneSha256} from '../../domain/scene-digest';
import {CAD_SCENE_CPU_BUILDER} from '../../domain/cad-scene';
import {ensureAutomatedGreenfield} from '../../server/g7-operational/greenfield-auto';
import {createDb} from '../../server/db';
import {CadStorage} from '../../server/storage/cad-storage';
import {SceneBlobStorage} from '../../server/storage/scene-storage';
import {SceneRepository} from '../../server/scene/scene-repository';
import {buildCpuLineCandidate} from '../../server/scene/cpu-line-candidate';
import {authorizeG7CpuWorkerJobTx} from '../../server/scene/scene-worker-g7-authorization';
import {publishVerifiedCpuSceneJob} from '../../server/scene/scene-worker-publish';

vi.mock('../../server/scene/scene-worker-g7-authorization',()=>({
  authorizeG7CpuWorkerJobTx:vi.fn(),
}));
const mockAuth=vi.mocked(authorizeG7CpuWorkerJobTx);
type SqliteDb={exec:(sql:string)=>void;prepare:(sql:string)=>{run:(...args:unknown[])=>unknown};close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(path:string)=>SqliteDb;
const rawBytes=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4',
  '0','ENDSEC','0','SECTION','2','ENTITIES','0','LINE','8','0',
  '10','0','20','0','11','10','21','20',
  '0','ENDSEC','0','EOF',''].join('\n'));
const sha=sceneSha256(rawBytes);
type Owned={root:string;db:ReturnType<typeof createDb>};
const owned:Owned[]=[];
afterEach(async()=>{
  for(const f of owned.splice(0)){await f.db.$disconnect();rmSync(f.root,{recursive:true,force:true});}
});
beforeEach(()=>mockAuth.mockReset());
async function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'scene-cpu-pub-g7-'));
  chmodSync(root,0o700);
  const database=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(database,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const dbPath=path.join(database,'cad.sqlite');
  const img='ghcr.io/planner77/layoutmanager:0.60.0';
  ensureAutomatedGreenfield({G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,DATABASE_URL:'file:'+dbPath,
    G7_DEPLOY_APP_IMAGE:img,G7_DEPLOY_MIGRATOR_IMAGE:img+'-migrate',
    G7_RELEASE_SOURCE_COMMIT:'1'.repeat(40)});
  const u=randomUUID(),bu=randomUUID(),p=randomUUID(),site=randomUUID(),
    building=randomUUID(),loc=randomUUID(),versionId=randomUUID();
  const raw=new Sqlite(dbPath);
  try{
    raw.exec('PRAGMA foreign_keys=ON');
    raw.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(u,'admin','synthetic','ACTIVE',0,1,1);
    raw.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(bu,'B');
    raw.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run(p,bu,'P');
    raw.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)').run(site,p,'S','SITE');
    raw.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run(building,site,'B');
    raw.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)').run(loc,building,'Floor');
    const key=loc+'/'+versionId+'/original.dxf';
    raw.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(versionId,loc,1,'x.dxf','','synthetic-delete-hash','DXF',
        rawBytes.length,sha,key,'2026-11-04T00:00:00Z');
    mkdirSync(path.join(cad,loc,versionId),{recursive:true,mode:0o700});
    writeFileSync(path.join(cad,key),rawBytes,{mode:0o600});
  }finally{raw.close();}
  const db=createDb('file:'+dbPath);owned.push({root,db});
  const jobId=randomUUID();
  await db.sceneBuildJob.create({data:{id:jobId,versionId,sourceSha256:sha,
    builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2,
    actorId:u,siteId:site,requestId:'request-cpu-test',
    status:'RUNNING',stage:'SOURCE_READ',attempt:1,
    startedAt:new Date(),dueAt:new Date()}});
  mockAuth.mockResolvedValue({jobId,attempt:1,versionId,
    sourceSha256:sha,actorId:u,siteId:site,requestId:'request-cpu-test'});
  const sceneStorage=new SceneBlobStorage(cad,{CAD_STORAGE_BACKEND:'local'});
  const originalStorage=new CadStorage(cad,16*1024*1024);
  const candidate=await buildCpuLineCandidate({source:rawBytes,versionId,sourceSha256:sha});
  const publish=()=>publishVerifiedCpuSceneJob({db,originalStorage,sceneStorage,
    jobId,attempt:1,candidate});
  return {root,db,dbPath,cad,sceneStorage,originalStorage,candidate,
    publish,jobId,versionId,sourceFile:path.join(cad,loc,versionId,'original.dxf')};
}
describe('#225 B2-B actual disposable G7 SQLite CPU Scene commit (mocked Worker grant)',()=>{
  it('atomically creates verified CPU Scene, Current0, READY, Audit and no pending Orphan',async()=>{
    const f=await fixture();
    const result=await f.publish();
    expect(result).toMatchObject({versionId:f.versionId,revision:0,
      payloadSha256:sceneSha256(f.candidate.bytes),immutableStorageVerified:true});
    const pointer=await f.db.currentScene.findUnique({where:{versionId:f.versionId}});
    expect(pointer).toMatchObject({assetId:result.assetId,revision:0});
    expect(await f.db.sceneBuildJob.findUnique({where:{id:f.jobId}}))
      .toMatchObject({status:'READY',stage:'READY'});
    expect(await f.db.auditEvent.count({where:{targetId:f.versionId,
      action:'SCENE_PUBLISHED'}})).toBe(1);
    expect(await f.db.sceneOrphanJob.count()).toBe(0);
    const reader=new SceneRepository(f.db,f.sceneStorage);
    await expect(reader.status(f.versionId)).resolves.toMatchObject({
      status:'READY',assetId:result.assetId,revision:0,
    });
    const read=await reader.content(f.versionId,result.assetId);
    expect(sceneSha256(read)).toBe(f.candidate.manifest.sha256);
  });
  it('never replaces an existing CurrentScene or creates a second asset',async()=>{
    const f=await fixture();
    const first=await f.publish();
    await expect(f.publish()).rejects.toMatchObject({code:'SCENE_WORKER_POINTER_EXISTS'});
    expect(await f.db.currentScene.findUnique({where:{versionId:f.versionId}}))
      .toMatchObject({assetId:first.assetId,revision:0});
    expect(await f.db.sceneAsset.count({where:{versionId:f.versionId}})).toBe(1);
    expect(await f.db.sceneOrphanJob.count()).toBe(0);
  });
  it('rolls back Asset, CurrentScene and Job READY if Audit insertion fails',async()=>{
    const f=await fixture();
    const raw=new Sqlite(f.dbPath);
    try{raw.exec('CREATE TRIGGER synthetic_cpu_audit_reject BEFORE INSERT ON "AuditEvent"'+
      ' WHEN NEW.action=\'SCENE_PUBLISHED\''+
      ' BEGIN SELECT RAISE(ABORT,\'SYNTHETIC_AUDIT_REJECT\'); END;');}
    finally{raw.close();}
    await expect(f.publish()).rejects.toThrow();
    expect(await f.db.sceneAsset.count()).toBe(0);
    expect(await f.db.currentScene.count()).toBe(0);
    expect(await f.db.sceneBuildJob.findUnique({where:{id:f.jobId}}))
      .toMatchObject({status:'RUNNING',attempt:1});
    expect(await f.db.sceneOrphanJob.findFirst())
      .toMatchObject({state:'CLEANUP'});
  });
});
