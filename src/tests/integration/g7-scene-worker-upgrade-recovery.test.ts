import packageInfo from '../../package.json';
import {afterEach,describe,expect,test,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chmodSync,existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,
  statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ensureAutomatedGreenfield} from '../../server/g7-operational/greenfield-auto';
import {applyGreenfieldUpgrade,planGreenfieldUpgrade,restoreGreenfieldUpgrade} from '../../server/g7-operational/greenfield-upgrade-engine';
import {verifyRecoverySet} from '../../server/g7-operational/greenfield-upgrade-backup';
import {G7_PREVIOUS_SCENE_JOB_SCHEMA_ID,G7_PREVIOUS_SCENE_JOB_BASELINE,
  G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM} from '../../server/g7-operational/greenfield-schema';
import {SCENE_CPU_MIGRATION_NAME,SCENE_CPU_MIGRATION_CHECKSUM} from '../../server/g7-operational/scene-cpu-ddl';
import {CAD_SCENE_BUILDER,sceneScope,sceneIdentity,createSceneRef,importedId,type SceneManifest} from '../../domain/cad-scene';
import {createDb,writeTransaction} from '../../server/db';
import {enqueueCpuSceneBuildTx} from '../../server/scene/scene-build-job-queue';
import {SceneRepository} from '../../server/scene/scene-repository';
import {SceneBlobStorage} from '../../server/storage/scene-storage';

type SqliteDb={exec:(sql:string)=>void;prepare:(sql:string)=>{
  run:(...args:unknown[])=>unknown;get:(...args:unknown[])=>Record<string,unknown>;
  all:(...args:unknown[])=>Record<string,unknown>[]};close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string,opts?:object)=>SqliteDb;
const roots:string[]=[];
const sha=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const dx=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','LINE','8','0','10','0','20','0','11','10','21','20',
  '0','ENDSEC','0','EOF',''].join('\n'));
afterEach(()=>{vi.unstubAllEnvs();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});

function snapshot(file:string){
  const db=new Sqlite(file,{readonly:true});
  try{
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_prisma_migrations' ORDER BY name").all();
    return JSON.stringify(tables.map(({name})=>[name,db.prepare(`SELECT * FROM "${name}"`).all()
      .map(row=>Object.entries(row).sort(([a],[b])=>a.localeCompare(b)))
      .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
  }finally{db.close();}
}

function browserRows(file:string,versions:readonly [string,string]){
  const db=new Sqlite(file,{readonly:true});
  try{return JSON.stringify([
    db.prepare('SELECT * FROM "SceneBuildJob" WHERE version_id IN (?,?) ORDER BY id').all(...versions),
    db.prepare('SELECT * FROM "SceneAsset" WHERE version_id IN (?,?) ORDER BY id').all(...versions),
    db.prepare('SELECT * FROM "CurrentScene" WHERE version_id IN (?,?) ORDER BY version_id').all(...versions),
    db.prepare('SELECT * FROM "AuditEvent" WHERE target_id IN (?,?) ORDER BY id').all(...versions),
  ]);}finally{db.close();}
}

function fileDigests(root:string){
  const entries:[string,string][]=[];
  function visit(dir:string){
    for(const item of readdirSync(dir).sort()){
      const full=path.join(dir,item),relative=path.relative(root,full);
      if(statSync(full).isDirectory())visit(full);
      else entries.push([relative,sha(readFileSync(full))]);
    }
  }
  visit(root);return entries;
}
function migrationHistory(file:string){
  const db=new Sqlite(file,{readonly:true});
  try{return db.prepare('SELECT migration_name,checksum FROM "_prisma_migrations" ORDER BY rowid').all();}
  finally{db.close();}
}

async function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'g7-populated-upgrade-'));roots.push(root);chmodSync(root,0o700);
  const dbDir=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(dbDir,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const dbPath=path.join(dbDir,'cad.sqlite'),manifestPath=path.join(dbDir,'g7-install.json');
  const image='ghcr.io/planner77/layoutmanager:'+packageInfo.version;
  const env={G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
    DATABASE_URL:'file:'+dbPath,CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,
    G7_DEPLOY_APP_IMAGE:image,G7_DEPLOY_MIGRATOR_IMAGE:image+'-migrate',
    G7_RELEASE_SOURCE_COMMIT:'a'.repeat(40),G7_AUTH_ENABLED:'false',
    G7_CAD_WRITE_CUTOVER_ENABLED:'false',G7_RUNTIME_ORIGIN:'http://localhost:3000',
    G7_RUNTIME_ALLOW_HTTP:'true',SCENE_AUTO_BUILD_ENABLED:'true',SCENE_CPU_WORKER_ENABLED:'true'};
  ensureAutomatedGreenfield({...env,G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false'});
  const ids={actor:randomUUID(),bu:randomUUID(),prod:randomUUID(),site:randomUUID(),
    building:randomUUID(),loc:randomUUID(),queued:randomUUID(),ready:randomUUID(),
    readyAsset:randomUUID()};
  const now='2026-11-02T00:00:00.000Z',original=(v:string)=>`${ids.loc}/${v}/original.dxf`;
  const db=new Sqlite(dbPath);
  try{
    // This is a current-install-derived disposable 0.60 fixture, not a historical OCI image.
    db.exec('DROP INDEX "ix_scene_build_cpu_due"; PRAGMA foreign_keys=ON');
    db.prepare('UPDATE "_prisma_migrations" SET migration_name=?,checksum=?')
      .run(G7_PREVIOUS_SCENE_JOB_BASELINE,G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM);
    db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(ids.actor,'upgrade-owner','synthetic-hash','ACTIVE',0,1,1);
    db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(ids.actor,'Admin',1);
    db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(ids.bu,'BU');
    db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run(ids.prod,ids.bu,'Product');
    db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)').run(ids.site,ids.prod,'Site','SITE');
    db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run(ids.building,ids.site,'Building');
    db.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)').run(ids.loc,ids.building,'Floor');
    db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)').run(ids.actor,ids.site,1);
    for(const [n,version] of [ids.queued,ids.ready].entries()){
      mkdirSync(path.join(cad,ids.loc,version),{recursive:true,mode:0o700});
      writeFileSync(path.join(cad,original(version)),dx,{mode:0o600});
      db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(version,ids.loc,n+1,'line.dxf','preserve','synthetic-delete-hash','DXF',dx.length,sha(dx),original(version),now);
    }
    db.prepare('UPDATE "CadLocation" SET current_version_id=?,next_version=3 WHERE id=?').run(ids.ready,ids.loc);
    db.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
      .run(randomUUID(),ids.actor,sha('synthetic-session'),1,1,28800001);
    db.prepare('INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(),ids.actor,null,ids.site,'CAD_UPLOADED','VERSION',ids.ready,null,1,'SUCCESS',now,randomUUID());
    for(const [version,status,attempt,stage] of [[ids.queued,'QUEUED',0,'JOB_ENQUEUED'],
      [ids.ready,'READY',1,'PUBLISHED']] as const){
      db.prepare('INSERT INTO "SceneBuildJob"(id,version_id,source_sha256,builder,payload_schema,actor_id,site_id,request_id,status,stage,attempt,due_at,started_at,finished_at,last_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(randomUUID(),version,sha(dx),CAD_SCENE_BUILDER,2,ids.actor,ids.site,randomUUID(),
          status,stage,attempt,1,status==='READY'?2:null,status==='READY'?3:null,null,1,3);
    }
    db.prepare('INSERT INTO "CadMemo"(id,version_id,source_sha256,title,content,anchor_x,anchor_y,offset_x,offset_y,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(),ids.ready,sha(dx),'memo','keep',1,2,0,0,ids.actor,ids.actor,now,now);
    db.prepare('INSERT INTO "CadZone"(id,location_id,site_id,name,name_key,description,code,tags_json,sort_order,references_json,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(),ids.loc,ids.site,'zone','zone','','','[]',1,'[]',ids.actor,ids.actor,now,now);
  }finally{db.close();}
  const install=JSON.parse(readFileSync(manifestPath,'utf8')) as Record<string,string>;
  install.schemaId=G7_PREVIOUS_SCENE_JOB_SCHEMA_ID;install.version='0.60.0';
  install.appImage='ghcr.io/planner77/layoutmanager:0.60.0';
  install.migratorImage=install.appImage+'-migrate';install.sourceCommit='';
  writeFileSync(manifestPath,JSON.stringify(install),{mode:0o600});
  const scope=sceneScope(ids.ready,sha(dx),'UNSPECIFIED'),sceneId=sceneIdentity(scope);
  const ref=createSceneRef(scope,'DXF_IMPORTED',importedId(scope,[]),{treePath:[]});
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const bytes=Buffer.from(JSON.stringify({schema:1,asset:{scope,sceneId,state:'READY',revision:0,
    objects:[{ref,treePath:[],kind:'Group',visible:true,transform:matrix,revision:0}]},
    root:{type:'Group',name:'root',visible:true,matrix,ref,children:[]}}));
  const sceneManifest:SceneManifest={scope,sceneId,format:'CUSTOM_DTO',state:'READY',revision:0,
    byteLength:bytes.length,sha256:sha(bytes)};
  const storage=new SceneBlobStorage(cad,{CAD_STORAGE_BACKEND:'local'});
  try{await storage.putVerified(storage.locator(ids.readyAsset),bytes,sha(bytes));}finally{storage.close();}
  const sceneDb=new Sqlite(dbPath);
  try{
    sceneDb.exec('PRAGMA foreign_keys=ON');
    sceneDb.prepare('INSERT INTO "SceneAsset"(id,version_id,source_sha256,manifest_json,digest,byte_length,format,storage_locator) VALUES(?,?,?,?,?,?,?,?)')
      .run(ids.readyAsset,ids.ready,sha(dx),JSON.stringify(sceneManifest),sha(bytes),bytes.length,
        'CUSTOM_DTO',`scenes/${ids.readyAsset}.json`);
    sceneDb.prepare('INSERT INTO "CurrentScene"(version_id,asset_id,revision) VALUES(?,?,?)')
      .run(ids.ready,ids.readyAsset,0);
  }finally{sceneDb.close();}
  return {root,dbDir,dbPath,cad,manifestPath,env,ids,bytes,original};
}

async function readReady(dbPath:string,cad:string,versionId:string,assetId:string,bytes:Buffer){
  const db=createDb('file:'+dbPath),storage=new SceneBlobStorage(cad,{CAD_STORAGE_BACKEND:'local'});
  try{
    const repo=new SceneRepository(db,storage),status=await repo.status(versionId);
    expect(status).toMatchObject({status:'READY',assetId,revision:0});
    expect(Buffer.from(await repo.content(versionId,assetId))).toEqual(bytes);
  }finally{storage.close();await db.$disconnect();}
}

describe('#225 populated Browser 0.60 to CPU 0.61 upgrade and isolated recovery',()=>{
  test('keeps historical jobs and READY bytes through approved migration, detached CPU job, and same-backup restore',async()=>{
    const f=await fixture(),before=snapshot(f.dbPath),
      legacy=browserRows(f.dbPath,[f.ids.queued,f.ids.ready]),
      manifest=readFileSync(f.manifestPath),
      originals=[f.ids.queued,f.ids.ready].map(id=>readFileSync(path.join(f.cad,f.original(id))));
    await readReady(f.dbPath,f.cad,f.ids.ready,f.ids.readyAsset,f.bytes);
    const plan=planGreenfieldUpgrade(f.env);
    expect(plan).toMatchObject({decision:'UPGRADE_MIGRATION_REQUIRED',from:'0.60.0',to:packageInfo.version,requiresApproval:true});
    expect(plan.chain.map(x=>[x.from,x.to,x.kind])).toEqual([['0.60.0','0.61.0','MIGRATION'],['0.61.0','0.61.1','COMPATIBLE']]);
    const approved={...f.env,G7_UPGRADE_MAINTENANCE_ACK:'APP_STOPPED_BY_HOST_HELPER',
      G7_UPGRADE_PAIR_VERIFIED:'true'};
    await expect(applyGreenfieldUpgrade(approved)).rejects.toThrow('G7_UPGRADE_APPROVAL_REQUIRED');
    await expect(applyGreenfieldUpgrade(approved,randomUUID())).rejects.toThrow('G7_UPGRADE_APPROVAL_REQUIRED');
    expect(snapshot(f.dbPath)).toBe(before);expect(readFileSync(f.manifestPath)).toEqual(manifest);
    expect(readFileSync(path.join(f.cad,`scenes/${f.ids.readyAsset}.json`))).toEqual(f.bytes);
    const result=await applyGreenfieldUpgrade(approved,plan.planId);
    if(!('backupId' in result)||!result.backupId)throw Error('upgrade omitted recovery set');
    expect(result.mode).toBe('UPGRADE');
    expect(verifyRecoverySet(f.dbDir,result.backupId).sourceVersion).toBe('0.60.0');
    expect(snapshot(f.dbPath)).toBe(before);
    const migrated=new Sqlite(f.dbPath,{readonly:true});
    try{
      expect(migrated.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_scene_build_cpu_due'").get()).toMatchObject({name:'ix_scene_build_cpu_due'});
      expect(migrationHistory(f.dbPath)).toEqual([
        {migration_name:G7_PREVIOUS_SCENE_JOB_BASELINE,
          checksum:G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM},
        {migration_name:SCENE_CPU_MIGRATION_NAME,checksum:SCENE_CPU_MIGRATION_CHECKSUM},
      ]);
      expect(migrated.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{migrated.close();}
    await readReady(f.dbPath,f.cad,f.ids.ready,f.ids.readyAsset,f.bytes);
    const workerEnv={...f.env,G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true'};
    for(const [key,val] of Object.entries(workerEnv))vi.stubEnv(key,val);
    const cpuVersion=randomUUID(),cpuPath=f.original(cpuVersion);
    mkdirSync(path.join(f.cad,f.ids.loc,cpuVersion),{recursive:true,mode:0o700});
    writeFileSync(path.join(f.cad,cpuPath),dx,{mode:0o600});
    const cpuDb=createDb('file:'+f.dbPath);
    let jobId:string;
    try{
      await cpuDb.cadFileVersion.create({data:{id:cpuVersion,locationId:f.ids.loc,version:3,
        originalFilename:'cpu.dxf',description:'after upgrade',deletePasswordHash:'synthetic-hash',
        fileFormat:'DXF',fileSize:dx.length,sha256:sha(dx),storagePath:cpuPath,registeredAt:'2026-11-05'}});
      const job=await writeTransaction(cpuDb,tx=>enqueueCpuSceneBuildTx(tx,{versionId:cpuVersion,
        sourceSha256:sha(dx),actorId:f.ids.actor,siteId:f.ids.site,requestId:'post-upgrade-cpu'}));
      jobId=job.jobId;
    }finally{await cpuDb.$disconnect();}
    const run=()=>{
      const child=spawnSync(process.execPath,['--import','tsx','scripts/scene-cpu-worker.ts','--once'],{
        cwd:path.resolve(import.meta.dirname,'../..'),env:{...process.env,...workerEnv},
        encoding:'utf8',timeout:90_000,maxBuffer:1024*1024});
      if(child.error)throw child.error;
      expect(child.status,child.stderr).toBe(0);
      const line=child.stdout.split(/\r?\n/).find(x=>x.includes('"kind":"CPU_SCENE_TICK"'));
      expect(line,child.stdout).toBeDefined();
      return JSON.parse(line!) as {outcome:string;jobId?:string};
    };
    expect(run()).toMatchObject({outcome:'PUBLISHED',jobId});
    const verified=createDb('file:'+f.dbPath),storage=new SceneBlobStorage(f.cad,{CAD_STORAGE_BACKEND:'local'});
    let cpuAssetId:string;
    try{
      const status=await new SceneRepository(verified,storage).status(cpuVersion);
      expect(status.status).toBe('READY');
      if(status.status!=='READY')throw Error('CPU Scene not READY');
      cpuAssetId=status.assetId;
      expect((await new SceneRepository(verified,storage).content(cpuVersion,status.assetId)).length).toBeGreaterThan(0);
      expect(await verified.sceneBuildJob.findUnique({where:{id:jobId}})).toMatchObject({status:'READY'});
      expect(await verified.auditEvent.count({where:{action:'SCENE_PUBLISHED',targetId:cpuVersion}})).toBe(1);
    }finally{storage.close();await verified.$disconnect();}
    expect(run()).toMatchObject({outcome:'IDLE'});
    await readReady(f.dbPath,f.cad,f.ids.ready,f.ids.readyAsset,f.bytes);
    expect(browserRows(f.dbPath,[f.ids.queued,f.ids.ready])).toBe(legacy);
    expect(readFileSync(path.join(f.cad,`scenes/${f.ids.readyAsset}.json`))).toEqual(f.bytes);
    for(const [i,id] of [f.ids.queued,f.ids.ready].entries())
      expect(readFileSync(path.join(f.cad,f.original(id)))).toEqual(originals[i]);
    const afterCpu=snapshot(f.dbPath),liveManifest=readFileSync(f.manifestPath),
      liveFiles=fileDigests(f.cad);
    expect(liveFiles.map(([name])=>name)).toContain(cpuPath);
    expect(liveFiles.map(([name])=>name)).toContain(`scenes/${cpuAssetId}.json`);
    const restoredDb=path.join(f.root,'restore-db'),restoredCad=path.join(f.root,'restore-cad');
    mkdirSync(restoredDb,{mode:0o700});mkdirSync(restoredCad,{mode:0o700});
    expect(restoreGreenfieldUpgrade(f.env,result.backupId,restoredDb,restoredCad).state).toBe('RESTORED_ISOLATED');
    const restoredPath=path.join(restoredDb,'cad.sqlite');
    expect(snapshot(restoredPath)).toBe(before);
    expect(browserRows(restoredPath,[f.ids.queued,f.ids.ready])).toBe(legacy);
    expect(readFileSync(path.join(restoredDb,'g7-install.json'))).toEqual(manifest);
    const oldDb=new Sqlite(restoredPath,{readonly:true});
    try{
      expect(oldDb.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_scene_build_cpu_due'").get()).toBeUndefined();
      expect(oldDb.prepare('SELECT COUNT(*) AS n FROM "SceneBuildJob"').get().n).toBe(2);
      expect(migrationHistory(restoredPath)).toEqual([
        {migration_name:G7_PREVIOUS_SCENE_JOB_BASELINE,
          checksum:G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM},
      ]);
      expect(oldDb.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{oldDb.close();}
    await readReady(restoredPath,restoredCad,f.ids.ready,f.ids.readyAsset,f.bytes);
    expect(existsSync(path.join(restoredCad,cpuPath))).toBe(false);
    expect(readFileSync(path.join(restoredCad,`scenes/${f.ids.readyAsset}.json`))).toEqual(f.bytes);
    for(const [i,id] of [f.ids.queued,f.ids.ready].entries())
      expect(readFileSync(path.join(restoredCad,f.original(id)))).toEqual(originals[i]);
    expect(snapshot(f.dbPath)).toBe(afterCpu);
    expect(readFileSync(f.manifestPath)).toEqual(liveManifest);
    expect(fileDigests(f.cad)).toEqual(liveFiles);
  });

  test('rejects occupied targets and corrupt recovery set without touching live data',async()=>{
    const f=await fixture(),plan=planGreenfieldUpgrade(f.env),result=await applyGreenfieldUpgrade({
      ...f.env,G7_UPGRADE_MAINTENANCE_ACK:'APP_STOPPED_BY_HOST_HELPER',G7_UPGRADE_PAIR_VERIFIED:'true'},plan.planId);
    if(!('backupId' in result)||!result.backupId)throw Error('missing backup');
    const live=snapshot(f.dbPath),liveManifest=readFileSync(f.manifestPath),
      liveOriginal=readFileSync(path.join(f.cad,f.original(f.ids.ready)));
    const dbTarget=path.join(f.root,'deny-db'),cadTarget=path.join(f.root,'deny-cad');
    mkdirSync(dbTarget,{mode:0o700});mkdirSync(cadTarget,{mode:0o700});
    const marker=path.join(dbTarget,'sentinel');writeFileSync(marker,'untouched',{mode:0o600});
    expect(()=>restoreGreenfieldUpgrade(f.env,result.backupId!,dbTarget,cadTarget))
      .toThrow('G7_UPGRADE_RESTORE_TARGET_INVALID');
    expect(readFileSync(marker,'utf8')).toBe('untouched');
    const backupDb=path.join(f.dbDir,'g7-upgrade-backups',result.backupId,'cad.sqlite');
    writeFileSync(backupDb,'corrupt',{mode:0o600});
    expect(()=>verifyRecoverySet(f.dbDir,result.backupId!)).toThrow('G7_UPGRADE_BACKUP_INVALID');
    const emptyDb=path.join(f.root,'empty-db'),emptyCad=path.join(f.root,'empty-cad');
    mkdirSync(emptyDb,{mode:0o700});mkdirSync(emptyCad,{mode:0o700});
    expect(()=>restoreGreenfieldUpgrade(f.env,result.backupId!,emptyDb,emptyCad))
      .toThrow('G7_UPGRADE_BACKUP_INVALID');
    expect(snapshot(f.dbPath)).toBe(live);expect(readFileSync(f.manifestPath)).toEqual(liveManifest);
    expect(readFileSync(path.join(f.cad,f.original(f.ids.ready)))).toEqual(liveOriginal);
  });
});
