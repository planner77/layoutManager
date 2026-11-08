import packageInfo from '../../package.json';
import {afterEach,describe,expect,test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {chmodSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ensureAutomatedGreenfield} from '../../server/g7-operational/greenfield-auto';
import {createDb,writeTransaction} from '../../server/db';
import {enqueueSceneBuildTx,claimNextSceneJob,recoverStaleSceneJob,
  requeueDueSceneJob,failRunningSceneJob} from '../../server/scene/scene-build-job-queue';

type SqliteDb={exec:(sql:string)=>void;prepare:(sql:string)=>{run:(...args:unknown[])=>unknown};close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>SqliteDb;
const SHA='a'.repeat(64);
const fixtures: Array<{root:string;db:ReturnType<typeof createDb>}>=[];
afterEach(async()=>{
 for(const f of fixtures.splice(0)){
  await f.db.$disconnect();rmSync(f.root,{force:true,recursive:true});
 }
});
function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'scene-b1-g7-'));
 chmodSync(root,0o700);
 const database=path.join(root,'db'),cad=path.join(root,'cad');
 mkdirSync(database,{mode:0o700});mkdirSync(cad,{mode:0o700});
 const dbPath=path.join(database,'cad.sqlite');
 const img='ghcr.io/planner77/layoutmanager:'+packageInfo.version;
 ensureAutomatedGreenfield({G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
  G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
  CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,DATABASE_URL:'file:'+dbPath,
  G7_DEPLOY_APP_IMAGE:img,G7_DEPLOY_MIGRATOR_IMAGE:img+'-migrate',
  G7_RELEASE_SOURCE_COMMIT:'1'.repeat(40)});
 const raw=new Sqlite(dbPath);raw.exec('PRAGMA foreign_keys=ON');
 const id=()=>randomUUID(),u=id(),bu=id(),p=id(),site=id(),building=id(),loc=id(),v=id();
 raw.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .run(u,'admin','synthetic','ACTIVE',0,1,1);
 raw.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(bu,'Business');
 raw.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run(p,bu,'Product');
 raw.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)').run(site,p,'Site','SITE');
 raw.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run(building,site,'Building');
 raw.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)').run(loc,building,'Floor');
 raw.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .run(v,loc,1,'a.dxf','','synthetic-delete-hash','DXF',30,SHA,`${loc}/${v}/original.dxf`,'2026-11-04T00:00:00Z');
 raw.close();
 const db=createDb('file:'+dbPath);fixtures.push({root,db});
 return {db,root,actorId:u,siteId:site,versionId:v,locationId:loc};
}
describe('#225 B1 actual Prisma/SQLite G7 0.61.0 queue integration',()=>{
 test('enqueues durable intent in an actual transaction and rejects duplicate identity',async()=>{
  const f=fixture();
  const input={versionId:f.versionId,sourceSha256:SHA,actorId:f.actorId,
    siteId:f.siteId,requestId:'request-one'};
  const created=await writeTransaction(f.db,tx=>enqueueSceneBuildTx(tx,input));
  expect(created.status).toBe('QUEUED');
  const jobs=await f.db.sceneBuildJob.findMany();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({status:'QUEUED',versionId:f.versionId,
    sourceSha256:SHA,actorId:f.actorId,siteId:f.siteId,attempt:0,payloadSchema:2});
  await expect(writeTransaction(f.db,tx=>enqueueSceneBuildTx(tx,input))).rejects.toThrow();
  expect(await f.db.sceneBuildJob.count()).toBe(1);
 });
 test('same-transaction failure rolls back an extra Version and its new Job',async()=>{
  const f=fixture(),v=randomUUID(),source='b'.repeat(64);
  await expect(writeTransaction(f.db,async tx=>{
    await tx.cadFileVersion.create({data:{id:v,locationId:f.locationId,version:2,
      originalFilename:'b.dxf',description:'',deletePasswordHash:'synthetic',
      fileFormat:'DXF',fileSize:20,sha256:source,
      storagePath:`${f.locationId}/${v}/original.dxf`,registeredAt:'2026-11-04T00:00:00Z'}});
    await enqueueSceneBuildTx(tx,{versionId:v,sourceSha256:source,actorId:f.actorId,
      siteId:f.siteId,requestId:'request-two'});
    throw new Error('SYNTHETIC_TX_ROLLBACK');
  })).rejects.toThrow('SYNTHETIC_TX_ROLLBACK');
  expect(await f.db.cadFileVersion.findUnique({where:{id:v}})).toBeNull();
  expect(await f.db.sceneBuildJob.count()).toBe(0);
 });
 test('one active worker claim, timeout retry and success never invent READY',async()=>{
  const f=fixture();
  const input={versionId:f.versionId,sourceSha256:SHA,actorId:f.actorId,
    siteId:f.siteId,requestId:'r1'};
  await writeTransaction(f.db,tx=>enqueueSceneBuildTx(tx,input));
  const now=new Date(Date.now()+1000);
  const claim=await claimNextSceneJob(f.db,now);
  expect(claim).toMatchObject({status:'RUNNING',attempt:1});
  expect(await claimNextSceneJob(f.db,new Date(now.getTime()+1000))).toBeNull();
  const staleTime=new Date(now.getTime()+181000);
  expect(await recoverStaleSceneJob(f.db,staleTime))
    .toMatchObject({status:'RETRY_WAIT'});
  const waiting=await f.db.sceneBuildJob.findFirstOrThrow();
  expect(waiting.status).toBe('RETRY_WAIT');
  expect(await requeueDueSceneJob(f.db,new Date(staleTime.getTime()+31000)))
    .toMatchObject({status:'QUEUED'});
  const again=await claimNextSceneJob(f.db,new Date(staleTime.getTime()+32000));
  expect(again).toMatchObject({status:'RUNNING',attempt:2});
  expect(await failRunningSceneJob(f.db,again!.id,again!.attempt,
    'SCENE_DXF_PARSE_FAILED',new Date(staleTime.getTime()+33000))).toBe(true);
  const final=await f.db.sceneBuildJob.findUniqueOrThrow({where:{id:again!.id}});
  expect(final).toMatchObject({status:'FAILED',lastCode:'SCENE_DXF_PARSE_FAILED'});
  expect(await f.db.currentScene.count()).toBe(0);
 });
});
