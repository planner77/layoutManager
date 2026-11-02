import { afterEach, describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  statfsSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureAutomatedGreenfield } from '../../server/g7-operational/greenfield-auto';
import { applyGreenfieldUpgrade, planGreenfieldUpgrade, restoreGreenfieldUpgrade,
  statusGreenfieldUpgrade } from '../../server/g7-operational/greenfield-upgrade-engine';
import { assertSpace, verifyRecoverySet } from '../../server/g7-operational/greenfield-upgrade-backup';
import { ddlSha256, GREENFIELD_UPGRADE_REGISTRY,
  type UpgradeRegistry } from '../../server/g7-operational/greenfield-upgrade-registry';
import { G7_GREENFIELD_BASELINE, G7_GREENFIELD_BASELINE_CHECKSUM,
  G7_GREENFIELD_SCHEMA_ID } from '../../server/g7-operational/greenfield-schema';

type Db={prepare:(sql:string)=>{all:(...args:unknown[])=>Record<string,unknown>[];get:(...args:unknown[])=>Record<string,unknown>;
  run:(...args:unknown[])=>unknown};exec:(sql:string)=>void;close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string,options?:object)=>Db;
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'g7-upgrade-qa-'));roots.push(root);chmodSync(root,0o700);
  const dbDir=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(dbDir,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const dbPath=path.join(dbDir,'cad.sqlite');
  const release='ghcr.io/planner77/layoutmanager:0.58.1';
  const env={G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',G7_AUTH_ENABLED:'false',
    G7_CAD_WRITE_CUTOVER_ENABLED:'false',CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,
    DATABASE_URL:'file:'+dbPath,G7_DEPLOY_APP_IMAGE:release,G7_DEPLOY_MIGRATOR_IMAGE:release+'-migrate',
    G7_RELEASE_SOURCE_COMMIT:'1'.repeat(40)};
  ensureAutomatedGreenfield(env);
  const db=new Sqlite(dbPath),user=randomUUID();
  db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(user,'qa-admin','synthetic-hash','ACTIVE',0,1,1);
  db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(user,'Admin',1);
  db.close();
  const manifest=path.join(dbDir,'g7-install.json');
  const old=JSON.parse(readFileSync(manifest,'utf8')) as Record<string,string>;
  old.version='0.56.0';old.appImage='ghcr.io/planner77/layoutmanager:0.56.0';
  old.migratorImage=old.appImage+'-migrate';old.sourceCommit='';
  writeFileSync(manifest,JSON.stringify(old),{mode:0o600});
  return {root,dbDir,cad,dbPath,manifest,env,user};
}
const maintenance=(env:ReturnType<typeof fixture>['env'])=>({...env,
  G7_UPGRADE_MAINTENANCE_ACK:'APP_STOPPED_BY_HOST_HELPER',G7_UPGRADE_PAIR_VERIFIED:'true'});
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
function seedBusinessData(f:ReturnType<typeof fixture>){
  const db=new Sqlite(f.dbPath),id=()=>randomUUID();
  const bu=id(),product=id(),site=id(),building=id(),location=id(),version=id(),scene=id();
  const dxf='0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n',cadPath=`${location}/${version}/original.dxf`;
  const sceneBytes='synthetic-scene-json';
  mkdirSync(path.join(f.cad,location,version),{recursive:true,mode:0o700});
  writeFileSync(path.join(f.cad,cadPath),dxf,{mode:0o600});
  mkdirSync(path.join(f.cad,'scenes'),{mode:0o700});
  writeFileSync(path.join(f.cad,`scenes/${scene}.json`),sceneBytes,{mode:0o600});
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare('INSERT INTO BusinessUnit(id,name) VALUES(?,?)').run(bu,'QA business');
  db.prepare('INSERT INTO Product(id,business_unit_id,name) VALUES(?,?,?)').run(product,bu,'QA product');
  db.prepare('INSERT INTO CadSite(id,product_id,name,kind) VALUES(?,?,?,?)').run(site,product,'QA site','SITE');
  db.prepare('INSERT INTO Building(id,site_id,name) VALUES(?,?,?)').run(building,site,'QA building');
  db.prepare('INSERT INTO CadLocation(id,building_id,name) VALUES(?,?,?)').run(location,building,'QA floor');
  db.prepare('INSERT INTO UserSiteGrant(user_id,site_id,granted_at) VALUES(?,?,?)').run(f.user,site,1);
  const dxfHash=sha(dxf),now='2026-11-02T00:00:00.000Z';
  db.prepare('INSERT INTO CadFileVersion(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(version,location,1,'qa.dxf','','synthetic-delete-hash','DXF',Buffer.byteLength(dxf),dxfHash,cadPath,now);
  db.prepare('UPDATE CadLocation SET current_version_id=?,next_version=2 WHERE id=?').run(version,location);
  db.prepare('INSERT INTO AuthSession(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
    .run(id(),f.user,sha('token'),1,1,28800001);
  db.prepare('INSERT INTO AuditEvent(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id(),f.user,null,site,'CAD_UPLOADED','VERSION',version,null,1,'SUCCESS',now,id());
  db.prepare('INSERT INTO SceneAsset(id,version_id,source_sha256,manifest_json,digest,byte_length,format,storage_locator) VALUES(?,?,?,?,?,?,?,?)')
    .run(scene,version,dxfHash,'{}',sha(sceneBytes),Buffer.byteLength(sceneBytes),'CUSTOM_DTO',`scenes/${scene}.json`);
  db.prepare('INSERT INTO CadMemo(id,version_id,source_sha256,title,content,anchor_x,anchor_y,offset_x,offset_y,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id(),version,dxfHash,'QA memo','preserve me',1,2,0,0,f.user,f.user,now,now);
  db.prepare('INSERT INTO CadOutline(id,version_id,source_sha256,scene_revision,origin,validation_mode,kind,name,base_geometry_json,geometry_json,source_refs_json,derived_from_json,transform_json,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id(),version,dxfHash,1,'APP_CREATED','APP_CREATED','CONVEX','QA outline','{}','{}','[]','[]','{}',1,f.user,f.user,now,now);
  db.prepare('INSERT INTO CadZone(id,location_id,site_id,name,name_key,description,code,tags_json,sort_order,references_json,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id(),location,site,'QA zone','qa zone','','','[]',1,'[]',f.user,f.user,now,now);
  db.close();
  return {dxf,cadPath,dxfHash,scenePath:`scenes/${scene}.json`,sceneBytes};
}
function logicalSnapshot(dbPath:string):string{
  const db=new Sqlite(dbPath,{readonly:true});
  try{
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return JSON.stringify(tables.map(row=>{const table=String(row.name);return [table,
      db.prepare(`SELECT * FROM "${table}"`).all().map(r=>Object.entries(r).sort(([a],[b])=>a.localeCompare(b))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];}));
  }finally{db.close();}
}
function migrationRegistry(dbPath:string):UpgradeRegistry{
  const db=new Sqlite(dbPath),sql='CREATE TABLE "UpgradeProbe"("id" TEXT NOT NULL PRIMARY KEY)';
  db.exec(sql);const targetDdl=ddlSha256(db as never);db.exec('DROP TABLE "UpgradeProbe"');db.close();
  const checksum=sha('qa-migration-checksum');
  const common={schemaId:G7_GREENFIELD_SCHEMA_ID,baseline:G7_GREENFIELD_BASELINE,
    checksum:G7_GREENFIELD_BASELINE_CHECKSUM};
  return {releases:[
    {...common,version:'0.56.0',dataContract:'G7-ZONES-DATA-V1',runtimeContract:'G7-ZONES-RUNTIME-V1'},
    {...common,version:'0.58.1',dataContract:'G7-ZONES-DATA-V2',runtimeContract:'G7-ZONES-RUNTIME-V2',
      ddlSha256:targetDdl,history:[{name:G7_GREENFIELD_BASELINE,checksum:G7_GREENFIELD_BASELINE_CHECKSUM},
        {name:'qa_upgrade_probe',checksum}]}],
    edges:[{from:'0.56.0',to:'0.58.1',kind:'MIGRATION',sql,
      sqlSha256:sha(sql),migrationName:'qa_upgrade_probe',migrationChecksum:checksum,
      precondition:'SELECT 1 AS ok',postcondition:'SELECT 1 AS ok'}]};
}
async function killChildAt(f:ReturnType<typeof fixture>,
  phase:'BACKED_UP'|'MIGRATION_COMMITTED'|'MANIFEST_COMMITTED',
  registry:UpgradeRegistry=GREENFIELD_UPGRADE_REGISTRY){
  const marker=path.join(f.root,'checkpoint.marker');
  const moduleUrl='file://'+path.resolve('server/g7-operational/greenfield-upgrade-engine.ts');
  const script=path.join(f.root,'upgrade-child.mjs');
  writeFileSync(script,`import {writeFileSync} from 'node:fs';\n`+
    `import {planGreenfieldUpgrade,applyGreenfieldUpgrade} from ${JSON.stringify(moduleUrl)};\n`+
    `const env=${JSON.stringify(maintenance(f.env))};const registry=${JSON.stringify(registry)};\n`+
    `const plan=planGreenfieldUpgrade(env,registry);\n`+
    `await applyGreenfieldUpgrade(env,plan.planId,registry,{checkpoint:(p)=>{if(p===${JSON.stringify(phase)}){`+
    `writeFileSync(${JSON.stringify(marker)},p);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}}});\n`,{mode:0o600});
  const child=spawn(process.execPath,['--import','tsx',script],{cwd:path.resolve('.'),stdio:'ignore'});
  const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
  try{
    for(let i=0;i<500&&!existsSync(marker);i++){
      if(child.exitCode!==null||child.signalCode!==null)throw new Error(`child exited before ${phase}`);
      await delay(20);
    }
    expect(existsSync(marker),`child reached ${phase}`).toBe(true);
    child.kill('SIGKILL');await exited;
  }finally{
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    await exited;
  }
  return JSON.parse(readFileSync(path.join(f.dbDir,'g7-upgrade-journal.json'),'utf8')) as {backupId?:string};
}

describe('#209 independent failure and recovery QA',()=>{
  test('actual apply ENOSPC preflight leaves no lock, hold, journal, or source mutation and is retryable',async()=>{
    const f=fixture(),dbBefore=readFileSync(f.dbPath),manifestBefore=readFileSync(f.manifest);
    let calls=0;
    await expect(applyGreenfieldUpgrade(maintenance(f.env),undefined,undefined,{spaceCheck:()=>{
      calls++;throw new Error('G7_UPGRADE_BACKUP_REQUIRED');
    }})).rejects.toThrow('G7_UPGRADE_BACKUP_REQUIRED');
    expect(calls).toBe(1);
    expect(readFileSync(f.dbPath)).toEqual(dbBefore);
    expect(readFileSync(f.manifest)).toEqual(manifestBefore);
    for(const name of ['g7-upgrade.lock','g7-runtime-hold.json','g7-upgrade-journal.json'])
      expect(existsSync(path.join(f.dbDir,name))).toBe(false);
    expect((await applyGreenfieldUpgrade(maintenance(f.env))).mode).toBe('UPGRADE');
  });

  test.each(['MIGRATION_COMMITTED','MANIFEST_COMMITTED'] as const)(
    'SIGKILL at %s leaves original recovery set usable without changing the installed state further',async(phase)=>{
      const f=fixture(),before=logicalSnapshot(f.dbPath),registry=migrationRegistry(f.dbPath);
      const journal=await killChildAt(f,phase,registry);
      expect(journal.backupId).toMatch(/^[0-9a-f-]{36}$/);
      expect(statusGreenfieldUpgrade(f.env).state).toBe('RESTORE_REQUIRED');
      const liveManifest=JSON.parse(readFileSync(f.manifest,'utf8')) as Record<string,string>;
      expect(liveManifest.version).toBe(phase==='MANIFEST_COMMITTED'?'0.58.1':'0.56.0');
      const live=new Sqlite(f.dbPath,{readonly:true});
      try{expect(live.prepare('SELECT name FROM sqlite_master WHERE name=\'UpgradeProbe\'').get()?.name)
        .toBe('UpgradeProbe');}finally{live.close();}
      const dbTarget=path.join(f.root,`${phase}-restore-db`),cadTarget=path.join(f.root,`${phase}-restore-cad`);
      mkdirSync(dbTarget,{mode:0o700});mkdirSync(cadTarget,{mode:0o700});
      expect(restoreGreenfieldUpgrade(f.env,journal.backupId!,dbTarget,cadTarget).sourceVersion).toBe('0.56.0');
      expect(logicalSnapshot(path.join(dbTarget,'cad.sqlite'))).toBe(before);
      const restoredManifest=JSON.parse(readFileSync(path.join(dbTarget,'g7-install.json'),'utf8')) as Record<string,string>;
      expect(restoredManifest.version).toBe('0.56.0');
    });
  test('compatible upgrade and isolated recovery preserve auth, audit, scene, memo, outline, zone, Current, and DXF',async()=>{
    const f=fixture(),files=seedBusinessData(f),before=logicalSnapshot(f.dbPath);
    const result=await applyGreenfieldUpgrade(maintenance(f.env));
    if(!('backupId' in result))throw new Error('expected durable backup id');
    expect(logicalSnapshot(f.dbPath)).toBe(before);
    expect(readFileSync(path.join(f.cad,files.cadPath),'utf8')).toBe(files.dxf);
    expect(sha(readFileSync(path.join(f.cad,files.cadPath)).toString())).toBe(files.dxfHash);
    const dbTarget=path.join(f.root,'all-data-restore-db'),cadTarget=path.join(f.root,'all-data-restore-cad');
    mkdirSync(dbTarget,{mode:0o700});mkdirSync(cadTarget,{mode:0o700});
    restoreGreenfieldUpgrade(f.env,result.backupId!,dbTarget,cadTarget);
    expect(logicalSnapshot(path.join(dbTarget,'cad.sqlite'))).toBe(before);
    expect(readFileSync(path.join(cadTarget,files.cadPath),'utf8')).toBe(files.dxf);
    expect(readFileSync(path.join(cadTarget,files.scenePath),'utf8')).toBe(files.sceneBytes);
  });
  test('WAL with an open writer is backed up consistently and restored into isolated empty targets',async()=>{
    const f=fixture(),writer=new Sqlite(f.dbPath);
    writer.exec('PRAGMA journal_mode=WAL');
    writer.prepare('UPDATE "User" SET login_name=? WHERE id=?').run('wal-committed',f.user);
    // Keep a real connection open while the upgrade uses SQLite's online backup API.
    const first=applyGreenfieldUpgrade(maintenance(f.env));
    await expect(applyGreenfieldUpgrade(maintenance(f.env))).rejects
      .toThrow('G7_UPGRADE_RESTORE_REQUIRED');
    const result=await first;
    if(!('backupId' in result))throw new Error('expected durable backup id');
    const dbTarget=path.join(f.root,'restore-db'),cadTarget=path.join(f.root,'restore-cad');
    mkdirSync(dbTarget,{mode:0o700});mkdirSync(cadTarget,{mode:0o700});
    restoreGreenfieldUpgrade(f.env,result.backupId!,dbTarget,cadTarget);
    const restored=new Sqlite(path.join(dbTarget,'cad.sqlite'),{readonly:true});
    try{expect(restored.prepare('SELECT login_name FROM "User" WHERE id=?').get(f.user).login_name)
      .toBe('wal-committed');}finally{restored.close();writer.close();}
  });

  test('closed WAL with no sidecars stays source-read-only through plan, backup verify, and isolated restore',async()=>{
    const f=fixture(),walDb=new Sqlite(f.dbPath);
    expect(walDb.prepare('PRAGMA journal_mode=WAL').get().journal_mode).toBe('wal');
    walDb.close();
    expect(existsSync(f.dbPath+'-wal')).toBe(false);
    expect(existsSync(f.dbPath+'-shm')).toBe(false);
    const dbBefore=readFileSync(f.dbPath),manifestBefore=readFileSync(f.manifest);
    expect(planGreenfieldUpgrade(f.env).decision).toBe('UPGRADE_COMPATIBLE');
    expect(statusGreenfieldUpgrade(f.env).state).toBe('UPGRADE_COMPATIBLE');
    expect(readFileSync(f.dbPath)).toEqual(dbBefore);
    expect(readFileSync(f.manifest)).toEqual(manifestBefore);
    expect(existsSync(f.dbPath+'-wal')).toBe(false);
    expect(existsSync(f.dbPath+'-shm')).toBe(false);
    const result=await applyGreenfieldUpgrade(maintenance(f.env));
    if(!('backupId' in result))throw new Error('expected WAL recovery set');
    expect(verifyRecoverySet(f.dbDir,result.backupId!).sourceVersion).toBe('0.56.0');
    const dbTarget=path.join(f.root,'stopped-wal-restore-db'),cadTarget=path.join(f.root,'stopped-wal-restore-cad');
    mkdirSync(dbTarget,{mode:0o700});mkdirSync(cadTarget,{mode:0o700});
    expect(restoreGreenfieldUpgrade(f.env,result.backupId!,dbTarget,cadTarget).state)
      .toBe('RESTORED_ISOLATED');
    const restored=new Sqlite(path.join(dbTarget,'cad.sqlite'),{readonly:true});
    try{expect(restored.prepare('SELECT COUNT(*) AS n FROM "User"').get().n).toBe(1);}
    finally{restored.close();}
  });

  test('active WAL committed rows change the plan snapshot while writer remains open',()=>{
    const f=fixture(),writer=new Sqlite(f.dbPath);
    try{
      writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0');
      writer.prepare('UPDATE "User" SET login_name=? WHERE id=?').run('wal-committed-one',f.user);
      expect(existsSync(f.dbPath+'-wal')).toBe(true);
      expect(existsSync(f.dbPath+'-shm')).toBe(true);
      const first=planGreenfieldUpgrade(f.env);
      writer.prepare('UPDATE "User" SET login_name=? WHERE id=?').run('wal-committed-two',f.user);
      const second=planGreenfieldUpgrade(f.env);
      expect(second.dataSha256).not.toBe(first.dataSha256);
      expect(second.planId).not.toBe(first.planId);
    }finally{writer.close();}
  });

  test('space preflight failure and recovery-set tampering do not mutate source DB or manifest',async()=>{
    const f=fixture(),dbBefore=readFileSync(f.dbPath),manifestBefore=readFileSync(f.manifest);
    const fs=statfsSync(f.dbDir,{bigint:true});
    expect(()=>assertSpace(f.dbDir,Number(fs.bavail*fs.bsize)+1)).toThrow('G7_UPGRADE_BACKUP_REQUIRED');
    // The engine's conservative minimum-space gate is exercised through statfs when available.
    // On a roomy filesystem this remains a direct predicate test; source identity stays unchanged.
    expect(readFileSync(f.dbPath)).toEqual(dbBefore);
    expect(readFileSync(f.manifest)).toEqual(manifestBefore);
    const result=await applyGreenfieldUpgrade(maintenance(f.env));
    if(!('backupId' in result))throw new Error('expected durable backup id');
    const nonempty=path.join(f.root,'restore-nonempty'),emptyCad=path.join(f.root,'restore-empty-cad');
    mkdirSync(nonempty,{mode:0o700});mkdirSync(emptyCad,{mode:0o700});
    writeFileSync(path.join(nonempty,'marker'),'occupied',{mode:0o600});
    expect(()=>restoreGreenfieldUpgrade(f.env,result.backupId!,nonempty,emptyCad))
      .toThrow('G7_UPGRADE_RESTORE_TARGET_INVALID');
    const symlink=path.join(f.root,'restore-symlink');
    const real=path.join(f.root,'restore-real');mkdirSync(real,{mode:0o700});
    symlinkSync(real,symlink);
    expect(()=>restoreGreenfieldUpgrade(f.env,result.backupId!,symlink,emptyCad))
      .toThrow('G7_UPGRADE_RESTORE_TARGET_INVALID');
    const backup=path.join(f.dbDir,'g7-upgrade-backups',result.backupId!,'cad.sqlite');
    writeFileSync(backup,'tampered',{mode:0o600});
    expect(()=>verifyRecoverySet(f.dbDir,result.backupId!)).toThrow('G7_UPGRADE_BACKUP_INVALID');
    expect(readFileSync(f.manifest).toString()).toContain('0.58.1');
  });

  test('existing lock blocks planning and a SIGKILL at durable BACKED_UP leaves restore gate and permits isolated recovery',async()=>{
    const f=fixture();
    writeFileSync(path.join(f.dbDir,'g7-upgrade.lock'),'held',{mode:0o600});
    expect(()=>planGreenfieldUpgrade(f.env)).toThrow('G7_UPGRADE_RESTORE_REQUIRED');
    rmSync(path.join(f.dbDir,'g7-upgrade.lock'));
    const before=JSON.parse(readFileSync(f.manifest,'utf8')) as Record<string,string>;
    const journal=path.join(f.dbDir,'g7-upgrade-journal.json');
    const state=await killChildAt(f,'BACKED_UP');
    expect(statusGreenfieldUpgrade(f.env).state).toBe('RESTORE_REQUIRED');
    expect((JSON.parse(readFileSync(f.manifest,'utf8')) as Record<string,string>).version).toBe(before.version);
    expect((JSON.parse(readFileSync(journal,'utf8')) as {phase?:string}).phase).toBe('BACKED_UP');
    expect(state.backupId).toMatch(/^[0-9a-f-]{36}$/);
    const dbTarget=path.join(f.root,'crash-restore-db'),cadTarget=path.join(f.root,'crash-restore-cad');
    mkdirSync(dbTarget,{mode:0o700});mkdirSync(cadTarget,{mode:0o700});
    expect(restoreGreenfieldUpgrade(f.env,state.backupId!,dbTarget,cadTarget).state)
      .toBe('RESTORED_ISOLATED');
  });
});
