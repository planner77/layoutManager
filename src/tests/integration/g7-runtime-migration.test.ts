import {afterEach,describe,expect,test} from 'vitest';
import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
import {chmodSync,existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  captureG7DisposableSnapshot,migrateG7DisposableClone,
  restoreG7DisposableSnapshot,verifyG7DisposableRollback,
  migrateG7ApprovedDatabase,
} from '../../server/g7-operational/runtime-migration';
import {G7_S3_SCHEMA_ID} from '../../server/g7-operational/preflight';
import type {IsolatedDb} from '../../server/g7-staging/g1-store';
import {makeG7RuntimeFixture} from '../helpers/g7-runtime';
import {openG7S3PreviewDb} from '../../server/g7-operational/preview-db';

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>IsolatedDb;
const digest=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
const localId='22222222-2222-4222-8222-222222222222';
const s3Id='33333333-3333-4333-8333-333333333333';
const loc='11111111-1111-4111-8111-111111111111';
const objectId='66666666-6666-4666-8666-666666666666';
const localBytes=Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');
const s3Bytes=Buffer.from('SYNTHETIC_VERSIONED_S3_EXPORT_DWG');
const dirs:string[]=[];
afterEach(()=>{for(const root of dirs.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'cad-g7-s3-'));dirs.push(root);
  const file=path.join(root,'fixture.sqlite');
  writeFileSync(file,'',{mode:0o600});
  writeFileSync(path.join(root,'s3-disposable.json'),JSON.stringify({scope:'G7-S3-DISPOSABLE-MIGRATION-TEST',
    schemaId:G7_S3_SCHEMA_ID,databasePath:file,fixtureNonce:randomBytes(16).toString('hex')}),{mode:0o600});
  const env={...process.env,G7_S3_MIGRATION_TEST_ONLY:'true',G7_S3_TEST_ROOT:root,
    G7_S3_TEST_DATABASE_URL:'file:'+file,DATABASE_URL:'file:'+file,
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false'};
  const run=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy',
    '--config','deploy/g7-runtime/rollback-prisma.config.ts'],{cwd:process.cwd(),env,encoding:'utf8',timeout:90000});
  expect(run.status,(run.stderr+run.stdout).slice(-800)).toBe(0);chmodSync(file,0o600);
  const db=new Sqlite(file);
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu','Synthetic');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('p','bu','Product');
  db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)').run('s','p','Site','SITE');
  db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run('b','s','Building');
  db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,?)').run(loc,'b','Floor',3);
  const insert=db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,'+
    'delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const localLocator=loc+'/'+localId+'/original.dxf';
  const s3Locator='s3:fixture-bucket:cad/'+objectId+'/original.dwg';
  insert.run(localId,loc,1,'local.dxf','','scrypt$synthetic','DXF',localBytes.length,digest(localBytes),localLocator,'2026-10-29');
  insert.run(s3Id,loc,2,'export.dwg','','scrypt$synthetic','DWG',s3Bytes.length,digest(s3Bytes),s3Locator,'2026-10-29');
  db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?').run(localId,loc);db.close();
  const local=path.join(root,'cad',localLocator),exported=path.join(root,'s3-export','object.dwg');
  mkdirSync(path.dirname(local),{recursive:true,mode:0o700});mkdirSync(path.dirname(exported),{mode:0o700});
  writeFileSync(local,localBytes,{mode:0o600});writeFileSync(exported,s3Bytes,{mode:0o600});
  writeFileSync(path.join(root,'s3-exports.json'),JSON.stringify([{storagePath:s3Locator,
    storageVersionId:'synthetic-v1',relativePath:'s3-export/object.dwg'}]),{mode:0o600});
  return {root,file,env,local,exported,options:{env}};
}
function readAudit(file:string){const db=new Sqlite(file);try{return db.prepare('SELECT * FROM "AuditEvent" ORDER BY id').all();}finally{db.close();}}
function operatingOptions(f:ReturnType<typeof fixture>,scopes:('AUTH'|'CAD_WRITE'|'MIGRATION')[]=['AUTH','MIGRATION']){
  const auth=makeG7RuntimeFixture();dirs.push(auth.root);
  auth.writeTrust({...auth.trust,databasePath:f.file,cadStoragePath:path.join(f.root,'cad'),siteIds:['s']});
  auth.writeApproval({databasePath:f.file,cadStoragePath:path.join(f.root,'cad'),siteIds:['s'],scopes,snapshotId:'SNAP-operating-path'});
  return {env:{...auth.env,DATABASE_URL:'file:'+f.file,G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_RUNTIME_MIGRATION_ACK:'APPLY_APPROVED_G7_SCHEMA',G7_RUNTIME_MIGRATION_EPOCH:'E-synthetic',CAD_STORAGE_PATH:path.join(f.root,'cad')}};
}

describe('#153 executable disposable migration and same-snapshot restore',()=>{
  test('populated six-history clone -> real seventh Prisma deployment -> idempotent rerun -> exact restore -> old six-history deploy',()=>{
    const f=fixture();
    expect(captureG7DisposableSnapshot(f.options,'SNAP-before','E-synthetic')).toMatchObject({state:'SNAPSHOT_CAPTURED',migrationCount:6,versionsChecked:2});
    const before=readFileSync(path.join(f.root,'snapshots/SNAP-before/database.sqlite'));
    expect(migrateG7DisposableClone(f.options)).toMatchObject({state:'MIGRATED',migrationCount:7,versionsChecked:2});
    expect(migrateG7DisposableClone(f.options).state).toBe('MIGRATED');
    writeFileSync(f.local,'damaged');writeFileSync(f.exported,'damaged');
    expect(restoreG7DisposableSnapshot(f.options,'SNAP-before')).toMatchObject({state:'RESTORED',migrationCount:6});
    expect(readFileSync(f.file)).toEqual(before);
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
    expect(verifyG7DisposableRollback(f.options)).toMatchObject({state:'ROLLBACK_SCHEMA_COMPATIBLE',ociImagesExecuted:false,executionTarget:'DISPOSABLE_CLONE'});
    const db=new Sqlite(f.file);try{
      expect(db.prepare('SELECT current_version_id,next_version FROM "CadLocation" WHERE id=?').get(loc))
        .toMatchObject({current_version_id:localId,next_version:3});
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='User'").get()).toBeUndefined();
    }finally{db.close();}
  },100000);
  test('post-migration interruption remains HOLD and requires same snapshot restoration',()=>{
    const f=fixture();captureG7DisposableSnapshot(f.options,'SNAP-recovery','E-synthetic');
    expect(()=>migrateG7DisposableClone({...f.options,fault:'after-migration'})).toThrow('G7_DISPOSABLE_REHEARSAL_BLOCKED');
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(true);
    expect(()=>migrateG7DisposableClone(f.options)).toThrow();
    expect(restoreG7DisposableSnapshot(f.options,'SNAP-recovery').state).toBe('RESTORED');
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(false);
    expect(migrateG7DisposableClone(f.options).state).toBe('MIGRATED');
  },100000);
  test('interrupted restore keeps HOLD and deterministic retry restores database/CAD/export together',()=>{
    const f=fixture();captureG7DisposableSnapshot(f.options,'SNAP-retry','E-synthetic');migrateG7DisposableClone(f.options);
    expect(()=>restoreG7DisposableSnapshot({...f.options,fault:'after-assets-restored'},'SNAP-retry')).toThrow();
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(true);
    expect(restoreG7DisposableSnapshot(f.options,'SNAP-retry').state).toBe('RESTORED');
    expect(verifyG7DisposableRollback(f.options).state).toBe('ROLLBACK_SCHEMA_COMPATIBLE');
  },100000);
  test('G7 snapshot restores every audit row and retained session/recovery schema without deleting history',()=>{
    const f=fixture();migrateG7DisposableClone(f.options);
    const db=new Sqlite(f.file);try{
      db.prepare('INSERT INTO "AuditEvent"(id,action,target_kind,target_id,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?)')
        .run('synthetic-retained','LOGIN_DENIED','ACCOUNT','synthetic','DENIED','2025-10-01T00:00:00Z','synthetic-retention');
    }finally{db.close();}
    const retained=readAudit(f.file);
    captureG7DisposableSnapshot(f.options,'SNAP-audit','E-synthetic');
    const altered=new Sqlite(f.file);try{
      altered.prepare('INSERT INTO "AuditEvent"(id,action,target_kind,target_id,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?)')
        .run('synthetic-later','LOGIN_DENIED','ACCOUNT','synthetic','DENIED','2026-10-29T00:00:00Z','synthetic-later');
    }finally{altered.close();}
    expect(restoreG7DisposableSnapshot(f.options,'SNAP-audit')).toMatchObject({migrationCount:7,auditPreserved:true});
    expect(readAudit(f.file)).toEqual(retained);
  },100000);
  test('checksum/schema/history drift, missing versioned export, symlink and wrong environment fail before migration',()=>{
    const f=fixture();
    const db=new Sqlite(f.file);try{db.prepare('UPDATE "_prisma_migrations" SET checksum=? WHERE migration_name=?').run('0'.repeat(64),'202609070001_locations');}finally{db.close();}
    expect(()=>migrateG7DisposableClone(f.options)).toThrow();
    const fix=new Sqlite(f.file);try{const body=readFileSync('deploy/g7-s3/prisma/migrations/202609070001_locations/migration.sql');
      fix.prepare('UPDATE "_prisma_migrations" SET checksum=? WHERE migration_name=?').run(digest(body),'202609070001_locations');}finally{fix.close();}
    const original=readFileSync(path.join(f.root,'s3-exports.json'));
    writeFileSync(path.join(f.root,'s3-exports.json'),'[]');expect(()=>migrateG7DisposableClone(f.options)).toThrow();
    writeFileSync(path.join(f.root,'s3-exports.json'),original);
    rmSync(f.exported);symlinkSync(f.local,f.exported);expect(()=>captureG7DisposableSnapshot(f.options,'SNAP-link','E-synthetic')).toThrow();
    expect(()=>migrateG7DisposableClone({env:{...f.env,G7_AUTH_ENABLED:'true'}})).toThrow();
    expect(()=>migrateG7DisposableClone({env:{...f.env,G7_S3_AUTH_API_PREVIEW_ONLY:'true'}})).toThrow();
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(false);
  },100000);
  test('corrupt or mixed snapshot export refuses restore without changing current DB',()=>{
    const f=fixture();captureG7DisposableSnapshot(f.options,'SNAP-corrupt','E-synthetic');
    const before=readFileSync(f.file);
    writeFileSync(path.join(f.root,'snapshots/SNAP-corrupt/1.asset'),'wrong-epoch');
    expect(()=>restoreG7DisposableSnapshot(f.options,'SNAP-corrupt')).toThrow();
    expect(readFileSync(f.file)).toEqual(before);
    expect(readFileSync(f.local)).toEqual(localBytes);
  },100000);
  test('future operating entrypoint executes exact approved six->seven atomic SQL/history on a synthetic clone',()=>{
    const f=fixture(),options=operatingOptions(f);
    expect(migrateG7ApprovedDatabase(options)).toMatchObject({state:'MIGRATED',migrationCount:7,
      executionTarget:'APPROVED_DATABASE',runtimeActivated:false,ociImagesExecuted:false});
    expect(migrateG7ApprovedDatabase(options).state).toBe('MIGRATED');
    const engine=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy',
      '--config','deploy/g7-s3/prisma.config.ts'],{cwd:process.cwd(),env:f.env,encoding:'utf8',timeout:90000});
    expect(engine.status,(engine.stderr+engine.stdout).slice(-800)).toBe(0);
    const legacyMigrator=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy',
      '--config','prisma.config.ts'],{cwd:process.cwd(),env:f.env,encoding:'utf8',timeout:90000});
    expect(legacyMigrator.status,(legacyMigrator.stderr+legacyMigrator.stdout).slice(-800)).toBe(0);
    const db=new Sqlite(f.file);try{
      expect(db.prepare('SELECT migration_name FROM "_prisma_migrations"').all()).toHaveLength(7);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM "CadFileVersion"').get()?.n).toBe(2);
    }finally{db.close();}
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
  },100000);
  test('approved migration SQL fault rolls schema/history back, persists HOLD and safe resume revalidates snapshot',()=>{
    const f=fixture(),options=operatingOptions(f);
    expect(()=>migrateG7ApprovedDatabase({...options,fault:'after-migration'})).toThrow();
    const db=new Sqlite(f.file);try{
      expect(db.prepare('SELECT migration_name FROM "_prisma_migrations"').all()).toHaveLength(6);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='User'").get()).toBeUndefined();
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{db.close();}
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(true);
    expect(()=>migrateG7ApprovedDatabase(options)).toThrow();
    const resume={env:{...options.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
    expect(migrateG7ApprovedDatabase(resume).state).toBe('MIGRATED');
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(false);
  },100000);
  test('operating migration requires signed MIGRATION, explicit ACK, exact data/site scope and runtime OFF',()=>{
    const f=fixture(),unsigned=operatingOptions(f,['AUTH']);
    expect(()=>migrateG7ApprovedDatabase(unsigned)).toThrow();
    const valid=operatingOptions(f);
    expect(()=>migrateG7ApprovedDatabase({env:{...valid.env,G7_RUNTIME_MIGRATION_ACK:''}})).toThrow();
    expect(()=>migrateG7ApprovedDatabase({env:{...valid.env,G7_AUTH_ENABLED:'true'}})).toThrow();
    expect(()=>migrateG7ApprovedDatabase({env:{...valid.env,CAD_STORAGE_PATH:'/tmp/unapproved'}})).toThrow();
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(false);
  },100000);
  test('approved migration preserves existing separate db/cad.sqlite and sibling cad storage paths',()=>{
    const f=fixture(),dbRoot=path.join(f.root,'db');mkdirSync(dbRoot,{mode:0o700});
    // Existing CadStorage creates descendant directories with umask022/0755.
    chmodSync(dbRoot,0o755);chmodSync(path.join(f.root,'cad'),0o755);
    chmodSync(path.dirname(f.local),0o755);chmodSync(path.dirname(path.dirname(f.local)),0o755);
    const file=path.join(dbRoot,'cad.sqlite');renameSync(f.file,file);
    renameSync(path.join(f.root,'s3-export'),path.join(dbRoot,'s3-export'));
    renameSync(path.join(f.root,'s3-exports.json'),path.join(dbRoot,'s3-exports.json'));
    const options=operatingOptions({...f,file});
    expect(migrateG7ApprovedDatabase(options)).toMatchObject({state:'MIGRATED',versionsChecked:2});
    expect(readFileSync(f.local)).toEqual(localBytes);
    expect(existsSync(path.join(dbRoot,'cad'))).toBe(false);
    expect(existsSync(path.join(dbRoot,'snapshots/SNAP-operating-path/database.sqlite'))).toBe(true);
  },100000);
  test('preview database cannot bypass a migration/restore HOLD on an otherwise valid seven-schema clone',()=>{
    const f=fixture();migrateG7DisposableClone(f.options);
    const t={root:f.root,databasePath:f.file};
    openG7S3PreviewDb(t).close();
    const hold=path.join(f.root,'g7-runtime-hold.json');
    writeFileSync(hold,JSON.stringify({scope:'G7-RUNTIME-HOLD'}),{mode:0o600});
    expect(()=>openG7S3PreviewDb(t)).toThrow('G7_S3_PREVIEW_DATABASE_UNAVAILABLE');
    rmSync(hold);symlinkSync(path.join(f.root,'absent-target'),hold);
    expect(()=>openG7S3PreviewDb(t)).toThrow('G7_S3_PREVIEW_DATABASE_UNAVAILABLE');
    rmSync(hold);openG7S3PreviewDb(t).close();
  },100000);
  test('dangling HOLD and export-manifest symlinks never create files outside the approved root',()=>{
    const f=fixture(),options=operatingOptions(f);
    const outside=f.root+'-outside';dirs.push(outside);
    const hold=path.join(f.root,'g7-runtime-hold.json');
    symlinkSync(outside,hold);
    expect(()=>migrateG7ApprovedDatabase(options)).toThrow();
    expect(existsSync(outside)).toBe(false);rmSync(hold);
    captureG7DisposableSnapshot(f.options,'SNAP-links','E-synthetic');
    const manifest=path.join(f.root,'s3-exports.json');rmSync(manifest);symlinkSync(outside,manifest);
    expect(()=>restoreG7DisposableSnapshot(f.options,'SNAP-links')).toThrow();
    expect(existsSync(outside)).toBe(false);
  },100000);
});
