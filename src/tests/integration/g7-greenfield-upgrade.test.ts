import { afterEach, describe, expect, test } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureAutomatedGreenfield, identity,
  validateInstallation } from '../../server/g7-operational/greenfield-auto';
import { applyGreenfieldUpgrade, planGreenfieldUpgrade, restoreGreenfieldUpgrade,
  statusGreenfieldUpgrade } from '../../server/g7-operational/greenfield-upgrade-engine';
import { ddlSha256, resolveUpgradeChain, type UpgradeRegistry } from '../../server/g7-operational/greenfield-upgrade-registry';
import { G7_GREENFIELD_BASELINE,G7_GREENFIELD_BASELINE_CHECKSUM } from '../../server/g7-operational/greenfield-schema';

type Db={prepare:(sql:string)=>{all:()=>Record<string,unknown>[];get:()=>Record<string,unknown>;
  run:(...args:unknown[])=>unknown};exec:(sql:string)=>void;close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>Db;
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
const hash=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'g7-upgrade-'));roots.push(root);chmodSync(root,0o700);
  const dbDir=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(dbDir,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const dbPath=path.join(dbDir,'cad.sqlite'),manifest=path.join(dbDir,'g7-install.json');
  const release='ghcr.io/planner77/layoutmanager:0.58.0';
  const env={G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,DATABASE_URL:'file:'+dbPath,
    G7_DEPLOY_APP_IMAGE:release,G7_DEPLOY_MIGRATOR_IMAGE:release+'-migrate',
    G7_RELEASE_SOURCE_COMMIT:'1'.repeat(40)};
  ensureAutomatedGreenfield(env);
  const db=new Sqlite(dbPath);
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
  old.version='0.56.0';old.appImage='ghcr.io/planner77/layoutmanager:0.56.0';
  old.migratorImage=old.appImage+'-migrate';old.sourceCommit='';
  writeFileSync(manifest,JSON.stringify(old),{mode:0o600});
  return {root,dbDir,cad,dbPath,manifest,env,old,ids:{user,site,location,version},content};
}
function maintenance(env:ReturnType<typeof fixture>['env']){
  return {...env,G7_UPGRADE_MAINTENANCE_ACK:'APP_STOPPED_BY_HOST_HELPER',
    G7_UPGRADE_PAIR_VERIFIED:'true'};
}

describe('#209 Greenfield release upgrade',()=>{
  test('tagged/pure digest pairs bind repository, version, role and distinct artifacts',()=>{
    const f=fixture(),repo='ghcr.io/planner77/layoutmanager',
      appDigest='sha256:'+'a'.repeat(64),migratorDigest='sha256:'+'b'.repeat(64);
    const pair=(app:string,migrator:string,source=f.env.G7_RELEASE_SOURCE_COMMIT)=>({
      ...f.env,G7_DEPLOY_APP_IMAGE:app,G7_DEPLOY_MIGRATOR_IMAGE:migrator,
      G7_RELEASE_SOURCE_COMMIT:source});
    const app=`${repo}:0.58.0@${appDigest}`;
    const migrator=`${repo}:0.58.0-migrate@${migratorDigest}`;
    expect(identity(pair(app,migrator))).toMatchObject({version:'0.58.0',appImage:app,
      migratorImage:migrator});
    expect(validateInstallation({...identity(pair(app,migrator)),installId:f.old.installId})
      .installId).toBe(f.old.installId);
    expect(identity(pair(`${repo}@${appDigest}`,migrator)).appImage).toBe(`${repo}@${appDigest}`);
    expect(identity(pair(app,`${repo}@${migratorDigest}`)).migratorImage)
      .toBe(`${repo}@${migratorDigest}`);
    expect(()=>identity(pair(`${repo}:0.57.0@${appDigest}`,migrator))).toThrow();
    expect(()=>identity(pair(app,`${repo}:0.58.0@${migratorDigest}`))).toThrow();
    expect(()=>identity(pair(app,`ghcr.io/other/layoutmanager:0.58.0-migrate@${migratorDigest}`)))
      .toThrow();
    expect(()=>identity(pair(app,`${repo}:0.58.0-migrate@${appDigest}`))).toThrow();
    expect(()=>identity(pair(`${repo}:@${appDigest}`,migrator))).toThrow();
    expect(()=>identity(pair(`${repo}@${appDigest}`,`${repo}@${migratorDigest}`,'')))
      .toThrow('G7_AUTO_IMAGE_PAIR_INVALID');
    expect(()=>validateInstallation({...f.old,appImage:`${repo}@${appDigest}`,
      migratorImage:`${repo}@${migratorDigest}`})).toThrow('G7_AUTO_INSTALL_INVALID');
  });
  test('0.56→0.58 approved chain retains DB/CAD/IDs and restart is idempotent',async()=>{
    const f=fixture(),before=readFileSync(f.dbPath);
    expect(()=>ensureAutomatedGreenfield(f.env)).toThrow('G7_AUTO_RELEASE_MISMATCH');
    const plan=planGreenfieldUpgrade(f.env);
    expect(plan.decision).toBe('UPGRADE_COMPATIBLE');
    expect(plan.chain.map(e=>e.to)).toEqual(['0.57.0','0.58.0']);
    expect(plan.requiresApproval).toBe(false);
    await expect(applyGreenfieldUpgrade(f.env)).rejects.toThrow('G7_UPGRADE_MAINTENANCE_REQUIRED');
    const result=await applyGreenfieldUpgrade(maintenance(f.env));
    expect(result.mode).toBe('UPGRADE');
    if(!('backupId' in result)||typeof result.backupId!=='string')
      throw new Error('missing recovery set');
    const installed=JSON.parse(readFileSync(f.manifest,'utf8')) as Record<string,string>;
    expect(installed.installId).toBe(f.old.installId);
    expect(installed.version).toBe('0.58.0');
    expect(readFileSync(path.join(f.cad,f.ids.location,f.ids.version,'original.dxf'),'utf8')).toBe(f.content);
    const db=new Sqlite(f.dbPath);
    try{
      expect(db.prepare('SELECT id FROM "User"').all()).toEqual([{id:f.ids.user}]);
      expect(db.prepare('SELECT current_version_id FROM "CadLocation"').get().current_version_id)
        .toBe(f.ids.version);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{db.close();}
    expect(readFileSync(f.dbPath)).toEqual(before);
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
    const edited={...f.old,version:'0.58.0',appImage:f.env.G7_DEPLOY_APP_IMAGE,
      migratorImage:f.env.G7_DEPLOY_MIGRATOR_IMAGE};
    writeFileSync(f.manifest,JSON.stringify(edited),{mode:0o600});
    expect(()=>planGreenfieldUpgrade(f.env)).toThrow('G7_UPGRADE_PAIR_MISMATCH');
    writeFileSync(f.manifest,JSON.stringify({...f.old,version:'0.55.0',
      appImage:'ghcr.io/planner77/layoutmanager:0.55.0',
      migratorImage:'ghcr.io/planner77/layoutmanager:0.55.0-migrate'}),{mode:0o600});
    expect(()=>planGreenfieldUpgrade(f.env)).toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
    writeFileSync(f.manifest,JSON.stringify(f.old),{mode:0o600});
    const db=new Sqlite(f.dbPath);db.exec('DROP TRIGGER "cad_version_delete_password_insert"');db.close();
    expect(()=>planGreenfieldUpgrade(f.env)).toThrow();
  });

  test('same-release identity ignores JSON key order; lock, incomplete setup and changed CAD fail closed',()=>{
    const a=fixture();
    const same={...a.old,version:'0.58.0',appImage:a.env.G7_DEPLOY_APP_IMAGE,
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
    const incompatible:UpgradeRegistry={releases:[base,{...base,version:'0.58.0',dataContract:'V2'}],
      edges:[{from:'0.56.0',to:'0.58.0',kind:'COMPATIBLE'}]};
    expect(()=>resolveUpgradeChain(incompatible,'0.56.0','0.58.0'))
      .toThrow('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
    const missing:UpgradeRegistry={releases:[base,{...base,version:'0.57.0'},
      {...base,version:'0.58.0'}],edges:[{from:'0.56.0',to:'0.57.0',kind:'COMPATIBLE'}]};
    expect(()=>resolveUpgradeChain(missing,'0.56.0','0.58.0'))
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
    expect(view.state).toBe('UPGRADE_COMPATIBLE');
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

  test('generic migration edge requires exact plan approval and verified postcondition',async()=>{
    const f=fixture();
    const sql='CREATE TABLE "UpgradeProbe"("id" TEXT NOT NULL PRIMARY KEY)';
    const db=new Sqlite(f.dbPath);db.exec(sql);const ddl=ddlSha256(db as never);db.exec('DROP TABLE "UpgradeProbe"');db.close();
    const registry:UpgradeRegistry={releases:[
      {version:'0.56.0',schemaId:f.old.schemaId,baseline:G7_GREENFIELD_BASELINE,
        checksum:G7_GREENFIELD_BASELINE_CHECKSUM,dataContract:'V1',runtimeContract:'V1'},
      {version:'0.58.0',schemaId:f.old.schemaId,baseline:G7_GREENFIELD_BASELINE,
        checksum:G7_GREENFIELD_BASELINE_CHECKSUM,dataContract:'V2',runtimeContract:'V2',ddlSha256:ddl,
        history:[{name:G7_GREENFIELD_BASELINE,checksum:G7_GREENFIELD_BASELINE_CHECKSUM},
          {name:'synthetic_upgrade_probe',checksum:hash('probe')}]}],edges:[
      {from:'0.56.0',to:'0.58.0',kind:'MIGRATION',sql,sqlSha256:hash(sql),
        migrationName:'synthetic_upgrade_probe',migrationChecksum:hash('probe'),
        precondition:'SELECT 1 AS ok',postcondition:'SELECT 1 AS ok'}]};
    expect(()=>resolveUpgradeChain(registry,'0.56.0','0.58.0')).not.toThrow();
    const plan=planGreenfieldUpgrade(f.env,registry);
    expect(plan.decision).toBe('UPGRADE_MIGRATION_REQUIRED');
    await expect(applyGreenfieldUpgrade(maintenance(f.env),undefined,registry))
      .rejects.toThrow('G7_UPGRADE_APPROVAL_REQUIRED');
    expect(statusGreenfieldUpgrade(f.env).state).toBe('UPGRADE_COMPATIBLE');
    const result=await applyGreenfieldUpgrade(maintenance(f.env),plan.planId,registry);
    expect(result.mode).toBe('UPGRADE');
    const migrated=new Sqlite(f.dbPath);
    try{
      expect(migrated.prepare('SELECT name FROM sqlite_master WHERE name=\'UpgradeProbe\'').get()?.name)
        .toBe('UpgradeProbe');
      expect(migrated.prepare('SELECT migration_name FROM "_prisma_migrations" ORDER BY rowid').all())
        .toEqual([{migration_name:G7_GREENFIELD_BASELINE},{migration_name:'synthetic_upgrade_probe'}]);
    }finally{migrated.close();}
    const b=fixture();
    const broken:UpgradeRegistry={...registry,edges:[{...registry.edges[0],
      postcondition:'SELECT 0 AS ok'}]};
    const brokenPlan=planGreenfieldUpgrade(b.env,broken);
    await expect(applyGreenfieldUpgrade(maintenance(b.env),brokenPlan.planId,broken))
      .rejects.toThrow('G7_UPGRADE_MIGRATION_FAILED');
    expect(statusGreenfieldUpgrade(b.env).state).toBe('UPGRADE_COMPATIBLE');
    expect(JSON.parse(readFileSync(path.join(b.dbDir,'g7-upgrade-journal.json'),'utf8')).phase)
      .toBe('FAILED_PREWRITE');
    const db2=new Sqlite(b.dbPath);
    try{expect(db2.prepare('SELECT name FROM sqlite_master WHERE name=\'UpgradeProbe\'').get())
      .toBeUndefined();}finally{db2.close();}
  });
});
