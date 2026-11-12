import packageInfo from '../../package.json';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureAutomatedGreenfield, identity,
  validateInstallation } from '../../server/g7-operational/greenfield-auto';
import { applyGreenfieldUpgrade, planGreenfieldUpgrade, restoreGreenfieldUpgrade,
  statusGreenfieldUpgrade } from '../../server/g7-operational/greenfield-upgrade-engine';
import { GREENFIELD_UPGRADE_REGISTRY,resolveUpgradeChain, type UpgradeRegistry } from '../../server/g7-operational/greenfield-upgrade-registry';
import { G7_GREENFIELD_BASELINE,G7_GREENFIELD_BASELINE_CHECKSUM,
  G7_PREVIOUS_ZONES_BASELINE,G7_PREVIOUS_ZONES_BASELINE_CHECKSUM,
  G7_PREVIOUS_ZONES_SCHEMA_ID,
  G7_PREVIOUS_SCENE_JOB_SCHEMA_ID,G7_PREVIOUS_SCENE_JOB_BASELINE,
  G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM,
  G7_GREENFIELD_SCHEMA_ID } from '../../server/g7-operational/greenfield-schema';
import { withReadOnlyInspection } from '../../server/g7-operational/greenfield-readonly-inspection';

type Db={prepare:(sql:string)=>{all:()=>Record<string,unknown>[];get:()=>Record<string,unknown>;
  run:(...args:unknown[])=>unknown};exec:(sql:string)=>void;close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>Db;
const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
const hash=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
function fixture(source:'ZONES'|'JOBS'='ZONES'){
  const root=mkdtempSync(path.join(tmpdir(),'g7-upgrade-'));roots.push(root);chmodSync(root,0o700);
  const dbDir=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(dbDir,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const dbPath=path.join(dbDir,'cad.sqlite'),manifest=path.join(dbDir,'g7-install.json');
  const release='ghcr.io/planner77/layoutmanager:'+packageInfo.version;
  const env={G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,DATABASE_URL:'file:'+dbPath,
    G7_DEPLOY_APP_IMAGE:release,G7_DEPLOY_MIGRATOR_IMAGE:release+'-migrate',
    G7_RELEASE_SOURCE_COMMIT:'1'.repeat(40)};
  ensureAutomatedGreenfield(env);
  const db=new Sqlite(dbPath);
  // Produce an authentic old-zone-schema fixture from an isolated newly
  // installed current-release database. No operational DB is used or modified.
  if(source==='ZONES')db.exec('DROP TABLE "SceneBuildJob"');
  else db.exec('DROP INDEX "ix_scene_build_cpu_due"');
  db.prepare('UPDATE "_prisma_migrations" SET migration_name=?,checksum=?')
    .run(source==='ZONES'?G7_PREVIOUS_ZONES_BASELINE:G7_PREVIOUS_SCENE_JOB_BASELINE,
      source==='ZONES'?G7_PREVIOUS_ZONES_BASELINE_CHECKSUM:G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM);
  const user=randomUUID(),bu=randomUUID(),product=randomUUID(),site=randomUUID(),
    building=randomUUID(),location=randomUUID(),version=randomUUID();
  const content='0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n';
  const locator=`${location}/${version}/original.dxf`;
  mkdirSync(path.join(cad,location,version),{recursive:true,mode:0o700});
  writeFileSync(path.join(cad,locator),content,{mode:0o600});
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(user,'admin','synthetic-scrypt-hash','ACTIVE',0,1,1);
  db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(user,'Admin',1);
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(bu,'Business');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run(product,bu,'Product');
  db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)').run(site,product,'Site','SITE');
  db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run(building,site,'Building');
  db.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)').run(location,building,'Floor');
  db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)').run(user,site,1);
  db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(version,location,1,'synthetic.dxf','','synthetic-delete-hash','DXF',Buffer.byteLength(content),hash(content),locator,'2026-11-02T00:00:00.000Z');
  db.prepare('UPDATE "CadLocation" SET current_version_id=?,next_version=2 WHERE id=?').run(version,location);
  db.close();
  const old=JSON.parse(readFileSync(manifest,'utf8')) as Record<string,string>;
  old.schemaId=source==='ZONES'?G7_PREVIOUS_ZONES_SCHEMA_ID:G7_PREVIOUS_SCENE_JOB_SCHEMA_ID;
  old.version=source==='ZONES'?'0.56.0':'0.60.0';
  old.appImage='ghcr.io/planner77/layoutmanager:'+old.version;
  old.migratorImage=old.appImage+'-migrate';old.sourceCommit='';
  writeFileSync(manifest,JSON.stringify(old),{mode:0o600});
  return {root,dbDir,cad,dbPath,manifest,env,old,ids:{user,site,location,version},content};
}
function maintenance(env:ReturnType<typeof fixture>['env']){
  return {...env,G7_UPGRADE_MAINTENANCE_ACK:'APP_STOPPED_BY_HOST_HELPER',
    G7_UPGRADE_PAIR_VERIFIED:'true'};
}

describe('#209 Greenfield release upgrade',()=>{
  test('approved 0.60.0→0.61.0 migration and compatible patch preserve CAD/Job identities',async()=>{
    const f=fixture('JOBS'),before=readFileSync(f.manifest,'utf8');
    const plan=planGreenfieldUpgrade(f.env);
    expect(plan.decision).toBe('UPGRADE_MIGRATION_REQUIRED');
    expect(plan.chain.map(e=>[e.from,e.to,e.kind]))
      .toEqual([['0.60.0','0.61.0','MIGRATION'],['0.61.0','0.61.1','COMPATIBLE'],['0.61.1','0.62.0','COMPATIBLE']]);
    expect(readFileSync(f.manifest,'utf8')).toBe(before);
    await expect(applyGreenfieldUpgrade(maintenance(f.env)))
      .rejects.toThrow('G7_UPGRADE_APPROVAL_REQUIRED');
    const upgraded=await applyGreenfieldUpgrade(maintenance(f.env),plan.planId);
    expect(upgraded.mode).toBe('UPGRADE');
    const db=new Sqlite(f.dbPath);
    try{
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_scene_build_cpu_due'").get())
        .toMatchObject({name:'ix_scene_build_cpu_due'});
      expect(db.prepare('SELECT id,sha256 FROM "CadFileVersion"').get())
        .toMatchObject({id:f.ids.version,sha256:hash(f.content)});
      expect(db.prepare('SELECT COUNT(*) AS n FROM "SceneBuildJob"').get()).toMatchObject({n:0});
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{db.close();}
    expect(readFileSync(path.join(f.cad,f.ids.location,f.ids.version,'original.dxf'),'utf8'))
      .toBe(f.content);
    expect(statusGreenfieldUpgrade(f.env).state).toBe('RESTART_SAME_RELEASE');
  });

  test('0.58.1 to current release needs explicit approved DDL migration, preserving business rows and recovery',async()=>{
    const f=fixture(),prior={...f.old,version:'0.58.1',
      appImage:'ghcr.io/planner77/layoutmanager:0.58.1',
      migratorImage:'ghcr.io/planner77/layoutmanager:0.58.1-migrate'};
    writeFileSync(f.manifest,JSON.stringify(prior),{mode:0o600});
    const oldManifest=readFileSync(f.manifest),dbBefore=new Sqlite(f.dbPath);
    const userBefore=dbBefore.prepare('SELECT id FROM "User"').all();
    const versionBefore=dbBefore.prepare('SELECT id,sha256,storage_path FROM "CadFileVersion"').all();
    dbBefore.close();
    const plan=planGreenfieldUpgrade(f.env);
    expect(plan.decision).toBe('UPGRADE_MIGRATION_REQUIRED');
    expect(plan.requiresApproval).toBe(true);
    expect([plan.from,plan.to]).toEqual(['0.58.1',packageInfo.version]);
    expect(plan.chain.map(e=>[e.from,e.to,e.kind]))
      .toEqual([['0.58.1','0.59.0','COMPATIBLE'],['0.59.0','0.60.0','MIGRATION'],['0.60.0','0.61.0','MIGRATION'],['0.61.0','0.61.1','COMPATIBLE'],['0.61.1','0.62.0','COMPATIBLE']]);
    expect(readFileSync(f.manifest)).toEqual(oldManifest);
    await expect(applyGreenfieldUpgrade(maintenance(f.env))).rejects
      .toThrow('G7_UPGRADE_APPROVAL_REQUIRED');
    const result=await applyGreenfieldUpgrade(maintenance(f.env),plan.planId);
    expect(result.mode).toBe('UPGRADE');
    const migrated=new Sqlite(f.dbPath);
    try {
      expect(migrated.prepare('SELECT id FROM "User"').all()).toEqual(userBefore);
      expect(migrated.prepare('SELECT id,sha256,storage_path FROM "CadFileVersion"').all())
        .toEqual(versionBefore);
      expect(migrated.prepare("SELECT name FROM sqlite_master WHERE name='SceneBuildJob'").get())
        .toMatchObject({name:'SceneBuildJob'});
      expect(migrated.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{migrated.close();}
    expect(JSON.parse(readFileSync(f.manifest,'utf8')).version).toBe(packageInfo.version);
    expect(statusGreenfieldUpgrade(f.env).state).toBe('RESTART_SAME_RELEASE');
  });

  test('tagged/pure digest pairs bind repository, version, role and distinct artifacts',()=>{
    const f=fixture(),repo='ghcr.io/planner77/layoutmanager',
      appDigest='sha256:'+'a'.repeat(64),migratorDigest='sha256:'+'b'.repeat(64);
    const pair=(app:string,migrator:string,source=f.env.G7_RELEASE_SOURCE_COMMIT)=>({
      ...f.env,G7_DEPLOY_APP_IMAGE:app,G7_DEPLOY_MIGRATOR_IMAGE:migrator,
      G7_RELEASE_SOURCE_COMMIT:source});
    const app=`${repo}:${packageInfo.version}@${appDigest}`;
    const migrator=`${repo}:${packageInfo.version}-migrate@${migratorDigest}`;
    expect(identity(pair(app,migrator))).toMatchObject({version:packageInfo.version,appImage:app,
      migratorImage:migrator});
    expect(validateInstallation({...identity(pair(app,migrator)),installId:f.old.installId})
      .installId).toBe(f.old.installId);
    expect(identity(pair(`${repo}@${appDigest}`,migrator)).appImage).toBe(`${repo}@${appDigest}`);
    expect(identity(pair(app,`${repo}@${migratorDigest}`)).migratorImage)
      .toBe(`${repo}@${migratorDigest}`);
    expect(()=>identity(pair(`${repo}:0.57.0@${appDigest}`,migrator))).toThrow();
    expect(()=>identity(pair(app,`${repo}:${packageInfo.version}@${migratorDigest}`))).toThrow();
    expect(()=>identity(pair(app,`ghcr.io/other/layoutmanager:${packageInfo.version}-migrate@${migratorDigest}`)))
      .toThrow();
    expect(()=>identity(pair(app,`${repo}:${packageInfo.version}-migrate@${appDigest}`))).toThrow();
    expect(()=>identity(pair(`${repo}:@${appDigest}`,migrator))).toThrow();
    expect(()=>identity(pair(`${repo}@${appDigest}`,`${repo}@${migratorDigest}`,'')))
      .toThrow('G7_AUTO_IMAGE_PAIR_INVALID');
    expect(()=>validateInstallation({...f.old,appImage:`${repo}@${appDigest}`,
      migratorImage:`${repo}@${migratorDigest}`})).toThrow('G7_AUTO_INSTALL_INVALID');
  });
  test('0.56→current release approved migration retains DB/CAD/IDs and restart is idempotent',async()=>{
    const f=fixture();
    expect(()=>ensureAutomatedGreenfield(f.env)).toThrow('G7_AUTO_RELEASE_MISMATCH');
    const plan=planGreenfieldUpgrade(f.env);
    expect(plan.decision).toBe('UPGRADE_MIGRATION_REQUIRED');
    expect(plan.chain.map(e=>e.to)).toEqual(['0.57.0','0.58.0','0.58.1','0.59.0','0.60.0','0.61.0','0.61.1','0.62.0']);
    expect(plan.requiresApproval).toBe(true);
    await expect(applyGreenfieldUpgrade(f.env)).rejects.toThrow('G7_UPGRADE_MAINTENANCE_REQUIRED');
    const result=await applyGreenfieldUpgrade(maintenance(f.env),plan.planId);
    expect(result.mode).toBe('UPGRADE');
    if(!('backupId' in result)||typeof result.backupId!=='string')
      throw new Error('missing recovery set');
    const installed=JSON.parse(readFileSync(f.manifest,'utf8')) as Record<string,string>;
    expect(installed.installId).toBe(f.old.installId);
    expect(installed.version).toBe(packageInfo.version);
    expect(readFileSync(path.join(f.cad,f.ids.location,f.ids.version,'original.dxf'),'utf8')).toBe(f.content);
    const db=new Sqlite(f.dbPath);
    try{
      expect(db.prepare('SELECT id FROM "User"').all()).toEqual([{id:f.ids.user}]);
      expect(db.prepare('SELECT current_version_id FROM "CadLocation"').get().current_version_id)
        .toBe(f.ids.version);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{db.close();}
    expect(statusGreenfieldUpgrade(f.env).state).toBe('RESTART_SAME_RELEASE');
    expect((await applyGreenfieldUpgrade(f.env)).mode).toBe('RESTART');
    const restoredDb=path.join(f.root,'restored-db'),restoredCad=path.join(f.root,'restored-cad');
    mkdirSync(restoredDb,{mode:0o700});mkdirSync(restoredCad,{mode:0o700});
    const restored=restoreGreenfieldUpgrade(f.env,result.backupId,restoredDb,restoredCad);
    expect(restored.sourceVersion).toBe('0.56.0');
    expect(readFileSync(path.join(restoredDb,'g7-install.json'),'utf8'))
      .toBe(JSON.stringify(f.old));
    expect(readFileSync(path.join(restoredCad,f.ids.location,f.ids.version,'original.dxf'),'utf8'))
      .toBe(f.content);
    const foreign=fixture(),foreignBackups=path.join(foreign.dbDir,'g7-upgrade-backups');
    mkdirSync(foreignBackups,{mode:0o700});
    cpSync(path.join(f.dbDir,'g7-upgrade-backups',result.backupId),
      path.join(foreignBackups,result.backupId),{recursive:true});
    const foreignDb=path.join(foreign.root,'foreign-db'),foreignCad=path.join(foreign.root,'foreign-cad');
    mkdirSync(foreignDb,{mode:0o700});mkdirSync(foreignCad,{mode:0o700});
    expect(()=>restoreGreenfieldUpgrade(foreign.env,result.backupId,foreignDb,foreignCad))
      .toThrow('G7_UPGRADE_BACKUP_INVALID');
    expect(readdirSync(foreignDb)).toHaveLength(0);
    expect(readdirSync(foreignCad)).toHaveLength(0);
  });

  test('unknown/downgrade/same-version source mismatch and drift are blocked',()=>{
    const f=fixture();
    expect(()=>planGreenfieldUpgrade({...f.env,G7_DEPLOY_APP_IMAGE:'ghcr.io/planner77/layoutmanager:0.57.0'})).toThrow();
    const edited={...f.old,version:packageInfo.version,appImage:f.env.G7_DEPLOY_APP_IMAGE,
      migratorImage:f.env.G7_DEPLOY_MIGRATOR_IMAGE};
    writeFileSync(f.manifest,JSON.stringify(edited),{mode:0o600});
    expect(()=>planGreenfieldUpgrade(f.env)).toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
    writeFileSync(f.manifest,JSON.stringify({...f.old,version:'0.55.0',
      appImage:'ghcr.io/planner77/layoutmanager:0.55.0',
      migratorImage:'ghcr.io/planner77/layoutmanager:0.55.0-migrate'}),{mode:0o600});
    expect(()=>planGreenfieldUpgrade(f.env)).toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
    writeFileSync(f.manifest,JSON.stringify(f.old),{mode:0o600});
    const db=new Sqlite(f.dbPath);db.exec('DROP TRIGGER "cad_version_delete_password_insert"');db.close();
    expect(()=>planGreenfieldUpgrade(f.env)).toThrow();
  });

  test('same-release identity ignores JSON key order; lock, incomplete setup and changed CAD fail closed',async()=>{
    const a=fixture();
    const approve=planGreenfieldUpgrade(a.env);
    await applyGreenfieldUpgrade(maintenance(a.env),approve.planId);
    const same={...a.old,version:packageInfo.version,schemaId:G7_GREENFIELD_SCHEMA_ID,
      appImage:a.env.G7_DEPLOY_APP_IMAGE,
      migratorImage:a.env.G7_DEPLOY_MIGRATOR_IMAGE,
      sourceCommit:a.env.G7_RELEASE_SOURCE_COMMIT};
    writeFileSync(a.manifest,JSON.stringify(Object.fromEntries(Object.entries(same).reverse())),{mode:0o600});
    expect(planGreenfieldUpgrade(a.env).decision).toBe('RESTART_SAME_RELEASE');
    const b=fixture();
    writeFileSync(path.join(b.dbDir,'g7-upgrade.lock'),'synthetic interrupted lock',{mode:0o600});
    expect(()=>planGreenfieldUpgrade(b.env)).toThrow('G7_UPGRADE_RESTORE_REQUIRED');
    expect(statusGreenfieldUpgrade(b.env).state).toBe('RESTORE_REQUIRED');
    const c=fixture(),db=new Sqlite(c.dbPath);
    db.prepare('DELETE FROM "UserSiteGrant"').run();
    db.prepare('DELETE FROM "UserRoleGrant"').run();
    db.prepare('DELETE FROM "User"').run();db.close();
    expect(()=>planGreenfieldUpgrade(c.env)).toThrow('G7_UPGRADE_SETUP_INCOMPLETE');
    const d=fixture();
    writeFileSync(path.join(d.cad,d.ids.location,d.ids.version,'original.dxf'),'tampered',{mode:0o600});
    expect(()=>planGreenfieldUpgrade(d.env)).toThrow('G7_UPGRADE_DATA_INTEGRITY');
    expect(()=>planGreenfieldUpgrade({...d.env,G7_RUNTIME_TRUST_PATH:'/private/expert'}))
      .toThrow('G7_UPGRADE_UNSUPPORTED_MODE');
    expect(()=>planGreenfieldUpgrade({...d.env,G7_AUTH_ENABLED:'true'}))
      .toThrow('G7_UPGRADE_UNSUPPORTED_MODE');
  });

  test('registry rejects contract drift on compatible edge and missing bridge',()=>{
    const f=fixture(),base={version:'0.56.0',schemaId:f.old.schemaId,
      baseline:G7_GREENFIELD_BASELINE,checksum:G7_GREENFIELD_BASELINE_CHECKSUM,
      dataContract:'V1',runtimeContract:'V1'};
    const incompatible:UpgradeRegistry={releases:[base,{...base,version:'0.59.0',dataContract:'V2'}],
      edges:[{from:'0.56.0',to:'0.59.0',kind:'COMPATIBLE'}]};
    expect(()=>resolveUpgradeChain(incompatible,'0.56.0','0.59.0'))
      .toThrow('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
    const missing:UpgradeRegistry={releases:[base,{...base,version:'0.57.0'},
      {...base,version:'0.59.0'}],edges:[{from:'0.56.0',to:'0.57.0',kind:'COMPATIBLE'}]};
    expect(()=>resolveUpgradeChain(missing,'0.56.0','0.59.0'))
      .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
    const backward:UpgradeRegistry={releases:[base,{...base,version:'0.57.0'}],
      edges:[{from:'0.57.0',to:'0.56.0',kind:'COMPATIBLE'}]};
    expect(()=>resolveUpgradeChain(backward,'0.57.0','0.56.0'))
      .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
  });

  test('fresh digest pair without bound source is rejected before any install bytes',()=>{
    const f=fixture();
    const emptyDb=path.join(f.root,'empty-db'),emptyCad=path.join(f.root,'empty-cad');
    mkdirSync(emptyDb,{mode:0o700});mkdirSync(emptyCad,{mode:0o700});
    const env={...f.env,DATABASE_URL:'file:'+path.join(emptyDb,'cad.sqlite'),
      CAD_STORAGE_PATH:emptyCad,G7_DEPLOY_APP_IMAGE:'ghcr.io/planner77/layoutmanager@sha256:'+'a'.repeat(64),
      G7_DEPLOY_MIGRATOR_IMAGE:'ghcr.io/planner77/layoutmanager@sha256:'+'b'.repeat(64),
      G7_RELEASE_SOURCE_COMMIT:''};
    expect(()=>ensureAutomatedGreenfield(env)).toThrow('G7_AUTO_IMAGE_PAIR_INVALID');
    expect(readdirSync(emptyDb)).toHaveLength(0);
    expect(readdirSync(emptyCad)).toHaveLength(0);
  });

  test('operator CLI prints bounded plan and safe structured failure',()=>{
    const f=fixture();
    const cli=path.resolve('node_modules/.bin/tsx');
    const childEnv:NodeJS.ProcessEnv={...process.env,...f.env};delete childEnv.VITEST;
    const invoke=(...args:string[])=>spawnSync(cli,['scripts/g7-greenfield.ts',...args],{
      cwd:path.resolve(),encoding:'utf8',env:childEnv});
    const plan=invoke('plan');
    expect(plan.status).toBe(0);
    const view=JSON.parse(plan.stdout) as Record<string,unknown>;
    expect(view.state).toBe('UPGRADE_MIGRATION_REQUIRED');
    expect(String(view.planId)).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.stdout).not.toContain(f.dbPath);
    const blocked=invoke('apply');
    expect(blocked.status).toBe(1);
    const diagnostic=JSON.parse(blocked.stderr) as Record<string,unknown>;
    expect(diagnostic).toMatchObject({state:'BLOCKED',code:'G7_UPGRADE_MAINTENANCE_REQUIRED',
      stage:'apply',retryable:true,nextAction:'STOP_APP_AND_VERIFY_IMAGE_PAIR'});
    expect(blocked.stderr).not.toContain(f.dbPath);
    const bad=invoke('malicious-private-argument');
    expect(bad.status).toBe(1);
    expect(bad.stderr).not.toContain('malicious-private-argument');
  });

  test('same-release auto and apply reject incomplete first-admin code',async()=>{
    const f=fixture(),db=path.join(f.root,'new-db'),cad=path.join(f.root,'new-cad');
    mkdirSync(db,{mode:0o700});mkdirSync(cad,{mode:0o700});
    const env={...f.env,DATABASE_URL:'file:'+path.join(db,'cad.sqlite'),CAD_STORAGE_PATH:cad};
    ensureAutomatedGreenfield(env);
    unlinkSync(path.join(db,'first-admin.code'));
    expect(planGreenfieldUpgrade(env).decision).toBe('RESTART_SAME_RELEASE');
    await expect(applyGreenfieldUpgrade(env)).rejects.toThrow();
    const childEnv:NodeJS.ProcessEnv={...process.env,...env};delete childEnv.VITEST;
    const result=spawnSync(path.resolve('node_modules/.bin/tsx'),
      ['scripts/g7-greenfield.ts','auto'],{cwd:path.resolve(),encoding:'utf8',env:childEnv});
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({state:'BLOCKED',stage:'auto'});
  });

  test('checkpointed WAL header with no sidecars is inspected without writing source',()=>{
    const f=fixture(),db=new Sqlite(f.dbPath);
    db.exec('PRAGMA journal_mode=WAL');db.close();
    const header=readFileSync(f.dbPath);
    expect([header[18],header[19]]).toEqual([2,2]);
    const names=readdirSync(f.dbDir).sort();
    expect(names.some(name=>name.endsWith('-wal')||name.endsWith('-shm'))).toBe(false);
    const before=createHash('sha256').update(header).digest('hex');
    chmodSync(f.dbDir,0o500);
    try{
      expect(planGreenfieldUpgrade(f.env).decision).toBe('UPGRADE_MIGRATION_REQUIRED');
      expect(statusGreenfieldUpgrade(f.env).state).toBe('UPGRADE_MIGRATION_REQUIRED');
      expect(readdirSync(f.dbDir).sort()).toEqual(names);
      expect(createHash('sha256').update(readFileSync(f.dbPath)).digest('hex')).toBe(before);
    }finally{chmodSync(f.dbDir,0o700);}
  });

  test('readonly inspection refuses symlink, source-side temp and sidecar race',()=>{
    const f=fixture(),db=new Sqlite(f.dbPath);
    db.exec('PRAGMA journal_mode=WAL');db.close();
    const link=path.join(f.root,'linked.sqlite');symlinkSync(f.dbPath,link);
    expect(()=>withReadOnlyInspection(link,()=>true)).toThrow('G7_UPGRADE_STORAGE_UNSAFE');
    const nestedTemp=path.join(f.dbDir,'temp');mkdirSync(nestedTemp,{mode:0o700});
    vi.stubEnv('TMPDIR',nestedTemp);
    expect(()=>withReadOnlyInspection(f.dbPath,()=>true)).toThrow('G7_UPGRADE_STORAGE_UNSAFE');
    expect(readdirSync(nestedTemp)).toHaveLength(0);
    vi.unstubAllEnvs();
    const wal=f.dbPath+'-wal';
    expect(()=>withReadOnlyInspection(f.dbPath,()=>{
      writeFileSync(wal,'simulated concurrent writer',{mode:0o600});return true;
    })).toThrow('G7_UPGRADE_DATA_CHANGED');
    unlinkSync(wal);
    let detached='';
    expect(()=>withReadOnlyInspection(f.dbPath,inspectedPath=>{
      detached=inspectedPath;throw new Error('synthetic inspection failure');
    })).toThrow('synthetic inspection failure');
    expect(detached).not.toBe(f.dbPath);
    expect(existsSync(detached)).toBe(false);
  });

  test('0.56.0→0.60.0→0.61.0 broken final postcondition preserves restore hold and prior commit',async()=>{
    const f=fixture(),manifestBefore=readFileSync(f.manifest);
    const plan=planGreenfieldUpgrade(f.env);
    expect(plan.decision).toBe('UPGRADE_MIGRATION_REQUIRED');
    expect(plan.chain.slice(-3).map(edge=>edge.kind)).toEqual(['MIGRATION','COMPATIBLE','COMPATIBLE']);
    await expect(applyGreenfieldUpgrade(maintenance(f.env))).rejects
      .toThrow('G7_UPGRADE_APPROVAL_REQUIRED');
    const broken:UpgradeRegistry={
      ...GREENFIELD_UPGRADE_REGISTRY,
      edges:GREENFIELD_UPGRADE_REGISTRY.edges.map(edge=>edge.to==='0.61.0'
        ? {...edge,postcondition:'SELECT 0 AS ok'}:edge),
    };
    const brokenPlan=planGreenfieldUpgrade(f.env,broken);
    await expect(applyGreenfieldUpgrade(maintenance(f.env),brokenPlan.planId,broken))
      .rejects.toThrow('G7_UPGRADE_MIGRATION_FAILED');
    // 0.60.0 migration committed before the 0.61.0 postcondition failed:
    // do NOT advertise a safe re-apply. Operator must restore an isolated backup.
    const blocked=statusGreenfieldUpgrade(f.env);
    expect(blocked).toMatchObject({state:'RESTORE_REQUIRED',phase:'RESTORE_REQUIRED'});
    if(!('backupId' in blocked)||typeof blocked.backupId!=='string')
      throw new Error('G7_UPGRADE_RECOVERY_SET_REQUIRED');
    expect(existsSync(path.join(f.dbDir,'g7-upgrade.lock'))).toBe(true);
    expect(existsSync(path.join(f.dbDir,'g7-runtime-hold.json'))).toBe(true);
    expect(()=>planGreenfieldUpgrade(f.env)).toThrow('G7_UPGRADE_RESTORE_REQUIRED');
    expect(readFileSync(f.manifest)).toEqual(manifestBefore);
    expect(readFileSync(path.join(f.cad,f.ids.location,f.ids.version,'original.dxf'),'utf8'))
      .toBe(f.content);
    const db=new Sqlite(f.dbPath);
    try {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='SceneBuildJob'").get())
        .toMatchObject({name:'SceneBuildJob'});
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_scene_build_cpu_due'").get())
        .toBeUndefined();
      expect(db.prepare('SELECT migration_name FROM "_prisma_migrations" ORDER BY rowid').all())
        .toEqual([{migration_name:G7_PREVIOUS_ZONES_BASELINE},
          {migration_name:'202611040001_scene_build_job'}]);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{db.close();}
    const restoreDb=path.join(f.root,'failed-upgrade-restore-db');
    const restoreCad=path.join(f.root,'failed-upgrade-restore-cad');
    mkdirSync(restoreDb,{mode:0o700});mkdirSync(restoreCad,{mode:0o700});
    const restored=restoreGreenfieldUpgrade(f.env,blocked.backupId,restoreDb,restoreCad);
    expect(restored).toMatchObject({state:'RESTORED_ISOLATED',sourceVersion:'0.56.0'});
    expect(readFileSync(path.join(restoreDb,'g7-install.json'))).toEqual(manifestBefore);
    expect(readFileSync(path.join(restoreCad,f.ids.location,f.ids.version,'original.dxf'),'utf8'))
      .toBe(f.content);
    // Recovery is isolated: source remains held rather than auto-restarted.
    expect(statusGreenfieldUpgrade(f.env).state).toBe('RESTORE_REQUIRED');
  });
});
