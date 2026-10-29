import {afterEach,describe,expect,test} from 'vitest';
import {createRequire} from 'node:module';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {chmodSync,existsSync,linkSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {
  captureG7DisposableSnapshot,migrateG7DisposableClone,
  restoreG7DisposableSnapshot,verifyG7DisposableRollback,
  migrateG7ApprovedDatabase,handoverG7ApprovedMigrationHold,
  inspectG7ApprovedHoldEvidence,g7MigrationHoldHandoverSigningBytes,
} from '../../server/g7-operational/runtime-migration';
import {assertG7RuntimeSchema} from '../../server/g7-operational/runtime-db';
import {verifyDeletePassword} from '../../server/password';
import {G7_S3_SCHEMA_ID} from '../../server/g7-operational/preflight';
import type {IsolatedDb} from '../../server/g7-staging/g1-store';
import {makeG7RuntimeFixture} from '../helpers/g7-runtime';
import {openG7S3PreviewDb} from '../../server/g7-operational/preview-db';
import {DELETE_PASSWORD_TRIGGER_SQL} from '../../server/delete-password-triggers';
import {resolveG7RuntimeGate} from '../../server/g7-operational/runtime-gate';

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
function fixture(withBackfillTriggers=true){
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
  insert.run(localId,loc,1,'local.dxf','',withBackfillTriggers?'scrypt$synthetic':null,'DXF',localBytes.length,digest(localBytes),localLocator,'2026-10-29');
  insert.run(s3Id,loc,2,'export.dwg','',withBackfillTriggers?'scrypt$synthetic':null,'DWG',s3Bytes.length,digest(s3Bytes),s3Locator,'2026-10-29');
  db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?').run(localId,loc);
  if(withBackfillTriggers)for(const statement of DELETE_PASSWORD_TRIGGER_SQL)db.exec(statement);
  db.close();
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
  return {auth,env:{...auth.env,DATABASE_URL:'file:'+f.file,G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_RUNTIME_MIGRATION_ACK:'APPLY_APPROVED_G7_SCHEMA',G7_RUNTIME_MIGRATION_EPOCH:'E-synthetic',CAD_STORAGE_PATH:path.join(f.root,'cad')}};
}
function prepareHandover(f:ReturnType<typeof fixture>,options:ReturnType<typeof operatingOptions>,
  newRelease?:typeof options.auth.trust.release){
  const oldHoldRaw=readFileSync(path.join(f.root,'g7-runtime-hold.json'));
  const oldApprovalRaw=readFileSync(options.auth.approvalPath);
  const historicalApprovalPath=path.join(options.auth.root,'historical-approval.json');
  writeFileSync(historicalApprovalPath,oldApprovalRaw,{mode:0o600});
  const oldApproval=JSON.parse(oldApprovalRaw.toString('utf8'));
  if(newRelease){
    const trust=JSON.parse(readFileSync(options.auth.trustPath,'utf8'));
    options.auth.writeTrust({...trust,release:newRelease});
  }
  const nowMs=Date.now();
  const nextApproval=options.auth.writeApproval({approvalId:'OWNER-handover',snapshotId:'SNAP-handover',
    changeRequestId:'CR-handover',...(newRelease?{release:newRelease}:{}),
    approvedAtUtc:new Date(nowMs-1000).toISOString(),notBeforeUtc:new Date(nowMs-1000).toISOString(),
    expiresAtUtc:new Date(nowMs+3600000).toISOString()});
  const env={...options.env,G7_RUNTIME_MIGRATION_ACK:'HANDOVER_APPROVED_G7_HOLD',
    G7_RUNTIME_MIGRATION_EPOCH:'E-handover',
    G7_RELEASE_SOURCE_COMMIT:nextApproval.release.sourceCommit,
    G7_RELEASE_APP_DIGEST:nextApproval.release.appDigest,
    G7_RELEASE_MIGRATOR_DIGEST:nextApproval.release.migratorDigest};
  const evidence=inspectG7ApprovedHoldEvidence({env});
  const newApprovalRaw=readFileSync(options.auth.approvalPath);
  const now=new Date().toISOString();
  const packet={scope:'G7-MIGRATION-HOLD-HANDOVER-V1',schemaVersion:1,
    oldHoldSha256:digest(oldHoldRaw),oldReason:JSON.parse(oldHoldRaw.toString('utf8')).reason,
    oldApprovalSha256:digest(oldApprovalRaw),
    oldApprovalId:oldApproval.approvalId,oldSnapshotId:oldApproval.snapshotId,
    oldSourceEpoch:options.env.G7_RUNTIME_MIGRATION_EPOCH,oldRelease:oldApproval.release,
    newApprovalSha256:digest(newApprovalRaw),newApprovalId:nextApproval.approvalId,
    newSnapshotId:nextApproval.snapshotId,newSourceEpoch:env.G7_RUNTIME_MIGRATION_EPOCH,
    newRelease:nextApproval.release,databasePath:f.file,cadStoragePath:path.join(f.root,'cad'),
    siteIds:['s'],evidence,writerZero:{app:true,batch:true,prisma:true,local:true,s3:true,observedAtUtc:now},
    approvedAtUtc:now,expiresAtUtc:new Date(Date.now()+120000).toISOString(),signature:''};
  const bytes=g7MigrationHoldHandoverSigningBytes(packet);
  expect(bytes).not.toBeNull();
  packet.signature=sign(null,bytes!,options.auth.keys.privateKey).toString('base64');
  const handoverPath=path.join(options.auth.root,'handover.json');
  writeFileSync(handoverPath,JSON.stringify(packet),{mode:0o600});
  return {env,historicalApprovalPath,handoverPath,packet,oldHoldRaw};
}
async function killWhileHoldingMigrationLock(env:Record<string,string|undefined>,operation:'approved'|'restore'|'handover',
  snapshotId?:string,phase:'fault-read'|'hold-written'|'committed'|'archived'|'handover-written'='fault-read'){
  const marker=path.join(env.G7_S3_TEST_ROOT??path.dirname(env.DATABASE_URL!.slice(5)),'child-lock-ready');
  const script=`import {writeFileSync} from 'node:fs';
    import {migrateG7ApprovedDatabase,restoreG7DisposableSnapshot,handoverG7ApprovedMigrationHold} from './server/g7-operational/runtime-migration.ts';
    const pause=()=>{writeFileSync(process.env.G7_KILL_READY,'ready',{mode:0o600});
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
    const options={env:process.env,get fault(){if(process.env.G7_KILL_PHASE==='fault-read')pause();
      return undefined;},onCheckpoint(point){if(process.env.G7_KILL_PHASE==='hold-written'&&
      point==='approved-hold-written'||process.env.G7_KILL_PHASE==='committed'&&
      point==='approved-committed'||process.env.G7_KILL_PHASE==='archived'&&
      point==='handover-archived'||process.env.G7_KILL_PHASE==='handover-written'&&
      point==='handover-hold-written')pause();}};
    if(process.env.G7_KILL_OPERATION==='approved')migrateG7ApprovedDatabase(options);
    else if(process.env.G7_KILL_OPERATION==='restore')restoreG7DisposableSnapshot(options,process.env.G7_KILL_SNAPSHOT);
    else handoverG7ApprovedMigrationHold(options,process.env.G7_KILL_OLD_APPROVAL,process.env.G7_KILL_HANDOVER);`;
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],
    {cwd:process.cwd(),env:{...process.env,...env,G7_KILL_READY:marker,G7_KILL_OPERATION:operation,
      G7_KILL_SNAPSHOT:snapshotId??'',G7_KILL_PHASE:phase},stdio:'ignore'});
  const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>
    child.once('exit',(code,signal)=>resolve({code,signal})));
  try {
    const deadline=Date.now()+10000;
    while(!existsSync(marker)&&Date.now()<deadline){
      if(child.exitCode!==null)throw new Error('child exited before lock checkpoint');
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    expect(existsSync(marker)).toBe(true);
    return {kill:async()=>{child.kill('SIGKILL');expect((await exited).signal).toBe('SIGKILL');}};
  } catch(error){child.kill('SIGKILL');await exited;throw error;}
}

describe('#153 executable disposable migration and same-snapshot restore',()=>{
  test('normal six-CAD migrator plus real delete-password backfill passes approved-seven preflight',async()=>{
    const f=fixture(false);
    const backfill=spawnSync(path.join(process.cwd(),'node_modules/.bin/tsx'),
      ['scripts/backfill-delete-passwords.ts'],{cwd:process.cwd(),env:{...process.env,...f.env},encoding:'utf8',timeout:30000});
    expect(backfill.status,backfill.stderr.slice(-500)).toBe(0);
    const db=new Sqlite(f.file);
    const names=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'cad_version_delete_password_%' ORDER BY name")
      .all().map(row=>row.name);
    const hashes=db.prepare('SELECT delete_password_hash FROM "CadFileVersion" ORDER BY id').all()
      .map(row=>String(row.delete_password_hash));
    db.close();
    expect(names).toEqual(['cad_version_delete_password_insert','cad_version_delete_password_update']);
    expect(await Promise.all(hashes.map(hash=>verifyDeletePassword('1234',hash)))).toEqual([true,true]);
    const options=operatingOptions(f);
    expect(migrateG7ApprovedDatabase(options)).toMatchObject({state:'MIGRATED',migrationCount:7});
    const migrated=new Sqlite(f.file);
    try{
      assertG7RuntimeSchema(migrated);
      expect(migrated.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(migrated.prepare('SELECT current_version_id,next_version FROM "CadLocation" WHERE id=?').get(loc))
        .toMatchObject({current_version_id:localId,next_version:3});
      expect(migrated.prepare('SELECT id,version,sha256,storage_path FROM "CadFileVersion" ORDER BY id').all())
        .toEqual([{id:localId,version:1,sha256:digest(localBytes),storage_path:loc+'/'+localId+'/original.dxf'},
          {id:s3Id,version:2,sha256:digest(s3Bytes),storage_path:'s3:fixture-bucket:cad/'+objectId+'/original.dwg'}]);
    }finally{migrated.close();}
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
  },100000);
  test('six-CAD reference rejects missing, modified and extra tables, indexes and triggers',()=>{
    for(const sql of [
      'DROP TRIGGER cad_version_delete_password_insert',
      'DROP TRIGGER cad_version_delete_password_update; CREATE TRIGGER cad_version_delete_password_update BEFORE UPDATE OF delete_password_hash ON CadFileVersion BEGIN SELECT 1; END',
      'CREATE TABLE unexpected_schema(id TEXT)',
      'CREATE INDEX unexpected_history_index ON _prisma_migrations(checksum)',
      'CREATE TRIGGER unexpected_history_trigger BEFORE UPDATE ON _prisma_migrations BEGIN SELECT 1; END',
    ]){
      const f=fixture(),db=new Sqlite(f.file);db.exec(sql);db.close();
      expect(()=>captureG7DisposableSnapshot(f.options,'SNAP-drift','E-synthetic')).toThrow();
      expect(existsSync(path.join(f.root,'snapshots/SNAP-drift'))).toBe(false);
    }
  },100000);
  test('unsafe lock symlink, hardlink, mode and legacy wx marker fail closed',()=>{
    const f=fixture(),lock=path.join(f.root,'g7-rehearsal.lock');
    symlinkSync(f.file,lock);expect(()=>captureG7DisposableSnapshot(f.options,'SNAP-lock','E-synthetic')).toThrow();rmSync(lock);
    linkSync(f.file,lock);expect(()=>captureG7DisposableSnapshot(f.options,'SNAP-lock','E-synthetic')).toThrow();rmSync(lock);
    writeFileSync(lock,'G7-DISPOSABLE-LOCK',{mode:0o600});
    expect(()=>captureG7DisposableSnapshot(f.options,'SNAP-lock','E-synthetic')).toThrow();rmSync(lock);
    writeFileSync(lock,'',{mode:0o644});
    expect(()=>captureG7DisposableSnapshot(f.options,'SNAP-lock','E-synthetic')).toThrow();
  },100000);
  test('SIGKILL during approved migration releases exclusive lock for explicit same-snapshot resume',async()=>{
    const f=fixture(),options=operatingOptions(f);
    const child=await killWhileHoldingMigrationLock(options.env,'approved');
    try{expect(()=>migrateG7ApprovedDatabase(options)).toThrow();}finally{await child.kill();}
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(true);
    const resume={env:{...options.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
    expect(migrateG7ApprovedDatabase(resume)).toMatchObject({state:'MIGRATED',migrationCount:7});
    expect(JSON.parse(readFileSync(path.join(f.root,'g7-runtime-hold.json'),'utf8')).reason)
      .toBe('RECOVERED_MIGRATION_COMPLETE');
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
  },100000);
  test('SIGKILL after approved commit but before HOLD removal resumes verified seven-schema state',async()=>{
    const f=fixture(),options=operatingOptions(f);
    const child=await killWhileHoldingMigrationLock(options.env,'approved',undefined,'committed');
    const resume={env:{...options.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
    try{expect(()=>migrateG7ApprovedDatabase(resume)).toThrow();}finally{await child.kill();}
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(true);
    expect(migrateG7ApprovedDatabase(resume)).toMatchObject({state:'MIGRATED',migrationCount:7});
    expect(JSON.parse(readFileSync(path.join(f.root,'g7-runtime-hold.json'),'utf8')).reason)
      .toBe('RECOVERED_MIGRATION_COMPLETE');
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
  },100000);
  test('SIGKILL during restore keeps HOLD and a fresh call restores the same snapshot',async()=>{
    const f=fixture();captureG7DisposableSnapshot(f.options,'SNAP-killed','E-synthetic');migrateG7DisposableClone(f.options);
    const child=await killWhileHoldingMigrationLock(f.env,'restore','SNAP-killed');
    try{expect(()=>restoreG7DisposableSnapshot(f.options,'SNAP-killed')).toThrow();}finally{await child.kill();}
    expect(existsSync(path.join(f.root,'g7-runtime-hold.json'))).toBe(true);
    expect(restoreG7DisposableSnapshot(f.options,'SNAP-killed')).toMatchObject({state:'RESTORED',migrationCount:6});
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
  },100000);
  test('SIGKILL before snapshot requires fresh signed Owner handover before RESUME',async()=>{
    const f=fixture(),options=operatingOptions(f);
    const child=await killWhileHoldingMigrationLock(options.env,'approved',undefined,'hold-written');
    const resume={env:{...options.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
    try{
      expect(existsSync(path.join(f.root,'snapshots/SNAP-operating-path'))).toBe(false);
      expect(()=>migrateG7ApprovedDatabase(resume)).toThrow();
    }finally{await child.kill();}
    const holdFile=path.join(f.root,'g7-runtime-hold.json');
    const original=readFileSync(holdFile);
    expect(()=>migrateG7ApprovedDatabase(resume)).toThrow();
    expect(readFileSync(holdFile)).toEqual(original);
    expect(existsSync(path.join(f.root,'snapshots/SNAP-operating-path'))).toBe(false);
    const transfer=prepareHandover(f,options);
    expect(handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,transfer.handoverPath))
      .toMatchObject({state:'HOLD_HANDOVER_READY',migrationCount:6});
    const recovered={env:{...transfer.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
    expect(migrateG7ApprovedDatabase(recovered)).toMatchObject({state:'MIGRATED',migrationCount:7});
    expect(existsSync(path.join(f.root,'snapshots/SNAP-handover/manifest.json'))).toBe(true);
    expect(JSON.parse(readFileSync(holdFile,'utf8')).reason).toBe('RECOVERED_MIGRATION_COMPLETE');
    const db=new Sqlite(f.file);
    try{assertG7RuntimeSchema(db);expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('SELECT current_version_id FROM "CadLocation" WHERE id=?').get(loc)?.current_version_id).toBe(localId);
    }finally{db.close();}
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
  },100000);
  test('handover archive interruption preserves old HOLD, exact retry succeeds, consumed packet replay is denied',()=>{
    const f=fixture(),options=operatingOptions(f);
    expect(()=>migrateG7ApprovedDatabase({...options,onCheckpoint(point){
      if(point==='approved-hold-written')throw new Error('synthetic stop before snapshot');
    }})).toThrow('synthetic stop before snapshot');
    const transfer=prepareHandover(f,options),holdFile=path.join(f.root,'g7-runtime-hold.json');
    const oldHold=readFileSync(holdFile),packetBytes=readFileSync(transfer.handoverPath);
    expect(()=>handoverG7ApprovedMigrationHold({env:transfer.env,onCheckpoint(point){
      if(point==='handover-archived')writeFileSync(transfer.handoverPath,Buffer.concat([packetBytes,Buffer.from('\n')]));
    }},transfer.historicalApprovalPath,transfer.handoverPath)).toThrow();
    expect(readFileSync(holdFile)).toEqual(oldHold);
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
    writeFileSync(transfer.handoverPath,packetBytes);
    expect(handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,transfer.handoverPath))
      .toMatchObject({state:'HOLD_HANDOVER_READY',versionsChecked:2});
    expect(JSON.parse(readFileSync(holdFile,'utf8')).recovery.archive).toMatch(/^g7-handover-/);
    writeFileSync(holdFile,oldHold);
    expect(()=>handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,transfer.handoverPath)).toThrow();
    expect(readFileSync(holdFile)).toEqual(oldHold);
  },100000);
  test('SIGKILL at archive and replacement checkpoints releases lock with durable recovery evidence',async()=>{
    for(const phase of ['archived','handover-written'] as const){
      const f=fixture(),options=operatingOptions(f);
      expect(()=>migrateG7ApprovedDatabase({...options,onCheckpoint(point){
        if(point==='approved-hold-written')throw new Error('synthetic stop before snapshot');
      }})).toThrow();
      const transfer=prepareHandover(f,options),holdFile=path.join(f.root,'g7-runtime-hold.json');
      const oldHold=readFileSync(holdFile);
      const child=await killWhileHoldingMigrationLock({...
        transfer.env,G7_KILL_OLD_APPROVAL:transfer.historicalApprovalPath,
        G7_KILL_HANDOVER:transfer.handoverPath},'handover',undefined,phase);
      try{
        expect(()=>handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,
          transfer.handoverPath)).toThrow();
      }finally{await child.kill();}
      if(phase==='archived'){
        expect(readFileSync(holdFile)).toEqual(oldHold);
        expect(handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,
          transfer.handoverPath)).toMatchObject({state:'HOLD_HANDOVER_READY'});
      }else expect(JSON.parse(readFileSync(holdFile,'utf8')).reason).toBe('APPROVED_MIGRATION_HANDOVER_READY');
      const resume={env:{...transfer.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
      expect(migrateG7ApprovedDatabase(resume)).toMatchObject({state:'MIGRATED',migrationCount:7});
      expect(JSON.parse(readFileSync(holdFile,'utf8')).reason).toBe('RECOVERED_MIGRATION_COMPLETE');
    }
  },100000);
  test('handover rejects unsigned and signed mismatches without changing old HOLD or protected rows',()=>{
    const f=fixture(),options=operatingOptions(f);
    expect(()=>migrateG7ApprovedDatabase({...options,onCheckpoint(point){
      if(point==='approved-hold-written')throw new Error('synthetic stop before snapshot');
    }})).toThrow();
    const transfer=prepareHandover(f,options),holdFile=path.join(f.root,'g7-runtime-hold.json');
    const oldHold=readFileSync(holdFile);
    const baselineDb=new Sqlite(f.file);
    const baseline=baselineDb.prepare('SELECT id,version,sha256,storage_path FROM "CadFileVersion" ORDER BY id').all();
    baselineDb.close();
    const wrongKey=generateKeyPairSync('ed25519').privateKey;
    const mutations:[string,(packet:typeof transfer.packet)=>void,boolean?][]=[
      ['unsigned',p=>{p.oldApprovalId='OWNER-other';},false],
      ['foreign key',()=>{},true],
      ['old approval ID',p=>{p.oldApprovalId='OWNER-other';}],
      ['old snapshot',p=>{p.oldSnapshotId='SNAP-other';}],
      ['old epoch',p=>{p.oldSourceEpoch='E-other';}],
      ['old release',p=>{p.oldRelease={...p.oldRelease,appDigest:'sha256:'+'e'.repeat(64)};}],
      ['new approval ID',p=>{p.newApprovalId='OWNER-other';}],
      ['new snapshot',p=>{p.newSnapshotId='SNAP-other';}],
      ['new epoch',p=>{p.newSourceEpoch='E-other';}],
      ['new release',p=>{p.newRelease={...p.newRelease,migratorDigest:'sha256:'+'f'.repeat(64)};}],
      ['database target',p=>{p.databasePath='/tmp/unapproved.sqlite';}],
      ['CAD target',p=>{p.cadStoragePath='/tmp/unapproved-cad';}],
      ['site scope',p=>{p.siteIds=['other-site'];}],
      ['schema evidence',p=>{p.evidence={...p.evidence,schemaSha256:'0'.repeat(64)};}],
      ['asset evidence',p=>{p.evidence={...p.evidence,assetsSha256:'0'.repeat(64)};}],
      ['writer stopped',p=>{p.writerZero={...p.writerZero,app:false};}],
      ['stale handover window',p=>{p.expiresAtUtc=new Date(Date.now()+3600000).toISOString();}],
    ];
    for(const [label,mutate,foreign] of mutations){
      const packet=structuredClone(transfer.packet);mutate(packet);
      const bytes=g7MigrationHoldHandoverSigningBytes(packet);
      packet.signature=bytes?sign(null,bytes,foreign?wrongKey:options.auth.keys.privateKey).toString('base64'):'invalid';
      if(label==='unsigned')packet.signature=transfer.packet.signature;
      writeFileSync(transfer.handoverPath,JSON.stringify(packet));
      expect(()=>handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,
        transfer.handoverPath),label).toThrow();
      expect(readFileSync(holdFile),label).toEqual(oldHold);
    }
    const malformedHold=Buffer.from(JSON.stringify({...JSON.parse(oldHold.toString('utf8')),sourceEpoch:'bad'}));
    writeFileSync(holdFile,malformedHold);
    const malformedPacket=structuredClone(transfer.packet);
    malformedPacket.oldHoldSha256=digest(malformedHold);malformedPacket.oldSourceEpoch='bad';
    malformedPacket.signature=sign(null,g7MigrationHoldHandoverSigningBytes(malformedPacket)!,
      options.auth.keys.privateKey).toString('base64');
    writeFileSync(transfer.handoverPath,JSON.stringify(malformedPacket));
    expect(()=>handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,
      transfer.handoverPath)).toThrow();
    expect(readFileSync(holdFile)).toEqual(malformedHold);
    const db=new Sqlite(f.file);try{
      expect(db.prepare('SELECT id,version,sha256,storage_path FROM "CadFileVersion" ORDER BY id').all()).toEqual(baseline);
    }finally{db.close();}
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
  },100000);
  test('completed old/new snapshot and six-schema drift deny handover with original HOLD intact',()=>{
    const f=fixture(),options=operatingOptions(f);
    expect(()=>migrateG7ApprovedDatabase({...options,onCheckpoint(point){
      if(point==='approved-hold-written')throw new Error('synthetic stop before snapshot');
    }})).toThrow();
    const transfer=prepareHandover(f,options),holdFile=path.join(f.root,'g7-runtime-hold.json');
    const oldHold=readFileSync(holdFile),snapRoot=path.join(f.root,'snapshots');
    mkdirSync(snapRoot,{mode:0o700});
    for(const name of ['SNAP-operating-path','SNAP-handover']){
      const target=path.join(snapRoot,name);mkdirSync(target,{mode:0o700});
      expect(()=>handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,
        transfer.handoverPath)).toThrow();
      expect(readFileSync(holdFile)).toEqual(oldHold);rmSync(target,{recursive:true});
    }
    const db=new Sqlite(f.file);db.exec('CREATE INDEX unexpected_history_index ON _prisma_migrations(checksum)');db.close();
    expect(()=>handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,
      transfer.handoverPath)).toThrow();
    expect(readFileSync(holdFile)).toEqual(oldHold);
  },100000);
  test('recovered RESUME rejects changed six-CAD inventory and retains linked HOLD for verified retry',()=>{
    const f=fixture(),options=operatingOptions(f);
    expect(()=>migrateG7ApprovedDatabase({...options,onCheckpoint(point){
      if(point==='approved-hold-written')throw new Error('synthetic stop before snapshot');
    }})).toThrow();
    const transfer=prepareHandover(f,options);
    handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,transfer.handoverPath);
    const holdFile=path.join(f.root,'g7-runtime-hold.json');
    const db=new Sqlite(f.file);
    db.prepare('UPDATE "CadFileVersion" SET description=? WHERE id=?').run('changed-after-handover',localId);db.close();
    const resume={env:{...transfer.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
    expect(()=>migrateG7ApprovedDatabase(resume)).toThrow();
    const after=JSON.parse(readFileSync(holdFile,'utf8'));
    expect(after.reason).toBe('APPROVED_MIGRATION_FAILED_RECOVERY_REQUIRED');
    expect(after.recovery.archive).toMatch(/^g7-handover-/);
    const repair=new Sqlite(f.file);
    repair.prepare('UPDATE "CadFileVersion" SET description=? WHERE id=?').run('',localId);repair.close();
    expect(migrateG7ApprovedDatabase(resume)).toMatchObject({state:'MIGRATED',migrationCount:7});
    expect(JSON.parse(readFileSync(holdFile,'utf8')).reason).toBe('RECOVERED_MIGRATION_COMPLETE');
    expect(()=>migrateG7ApprovedDatabase(resume)).toThrow();
  },100000);
  test('recovered postcommit RESUME rejects matching live7 and snapshot6 tamper against signed handover evidence',()=>{
    const f=fixture(),options=operatingOptions(f);
    expect(()=>migrateG7ApprovedDatabase({...options,onCheckpoint(point){
      if(point==='approved-hold-written')throw new Error('synthetic stop before snapshot');
    }})).toThrow();
    const transfer=prepareHandover(f,options);
    handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,transfer.handoverPath);
    const resume={env:{...transfer.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
    expect(()=>migrateG7ApprovedDatabase({...resume,onCheckpoint(point){
      if(point==='approved-committed')throw new Error('synthetic stop after commit');
    }})).toThrow();
    const snapshotRoot=path.join(f.root,'snapshots/SNAP-handover');
    const snapshotFile=path.join(snapshotRoot,'database.sqlite');
    const live=new Sqlite(f.file);live.prepare('UPDATE "CadFileVersion" SET description=? WHERE id=?')
      .run('consistent-tamper',localId);live.close();
    const source=new Sqlite(snapshotFile);source.prepare('UPDATE "CadFileVersion" SET description=? WHERE id=?')
      .run('consistent-tamper',localId);source.close();
    const manifestPath=path.join(snapshotRoot,'manifest.json');
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    manifest.databaseSha256=digest(readFileSync(snapshotFile));
    writeFileSync(manifestPath,JSON.stringify(manifest));
    const holdFile=path.join(f.root,'g7-runtime-hold.json');
    const before=JSON.parse(readFileSync(holdFile,'utf8'));
    expect(before.recovery.archive).toMatch(/^g7-handover-/);
    expect(()=>migrateG7ApprovedDatabase(resume)).toThrow();
    const after=JSON.parse(readFileSync(holdFile,'utf8'));
    expect(after.recovery).toEqual(before.recovery);
    expect(after.reason).toBe('APPROVED_MIGRATION_FAILED_RECOVERY_REQUIRED');
    expect(readFileSync(f.local)).toEqual(localBytes);expect(readFileSync(f.exported)).toEqual(s3Bytes);
  },100000);
  test('failed six-schema precheck recovers under expired old 0.44.0 approval and fresh 0.44.1 release',()=>{
    const f=fixture(),options=operatingOptions(f);
    const db=new Sqlite(f.file);db.exec('DROP TRIGGER cad_version_delete_password_update');db.close();
    expect(()=>migrateG7ApprovedDatabase(options)).toThrow('G7_DISPOSABLE_REHEARSAL_BLOCKED');
    const holdFile=path.join(f.root,'g7-runtime-hold.json');
    expect(JSON.parse(readFileSync(holdFile,'utf8')).reason).toBe('APPROVED_MIGRATION_FAILED_RECOVERY_REQUIRED');
    expect(existsSync(path.join(f.root,'snapshots/SNAP-operating-path'))).toBe(false);
    const repaired=new Sqlite(f.file);repaired.exec(DELETE_PASSWORD_TRIGGER_SQL[1]);repaired.close();
    const currentRelease=options.auth.trust.release;
    const historicalRelease={...currentRelease,version:'0.44.0',sourceCommit:'3'.repeat(40),
      appDigest:'sha256:'+'e'.repeat(64),migratorDigest:'sha256:'+'f'.repeat(64)};
    const oldTime=Date.now()-2*3600000;
    options.auth.writeApproval({release:historicalRelease,
      approvedAtUtc:new Date(oldTime).toISOString(),notBeforeUtc:new Date(oldTime).toISOString(),
      expiresAtUtc:new Date(oldTime+3600000).toISOString()});
    const transfer=prepareHandover(f,options,currentRelease);
    expect(handoverG7ApprovedMigrationHold({env:transfer.env},transfer.historicalApprovalPath,transfer.handoverPath))
      .toMatchObject({state:'HOLD_HANDOVER_READY',versionsChecked:2});
    const linked=JSON.parse(readFileSync(holdFile,'utf8'));
    const archive=JSON.parse(readFileSync(path.join(f.root,linked.recovery.archive),'utf8'));
    expect(JSON.parse(archive.oldHoldRaw).reason).toBe('APPROVED_MIGRATION_FAILED_RECOVERY_REQUIRED');
    expect(JSON.parse(archive.oldApprovalRaw).release.version).toBe('0.44.0');
    expect(JSON.parse(archive.newApprovalRaw).release.version).toBe('0.44.1');
    const resume={env:{...transfer.env,G7_RUNTIME_MIGRATION_ACK:'RESUME_APPROVED_G7_SCHEMA'}};
    expect(migrateG7ApprovedDatabase(resume)).toMatchObject({state:'MIGRATED',migrationCount:7});
    expect(existsSync(path.join(f.root,'snapshots/SNAP-handover/manifest.json'))).toBe(true);
    expect(existsSync(path.join(f.root,'snapshots/SNAP-operating-path'))).toBe(false);
    expect(JSON.parse(readFileSync(holdFile,'utf8')).reason).toBe('RECOVERED_MIGRATION_COMPLETE');
    expect(resolveG7RuntimeGate({...transfer.env,G7_AUTH_ENABLED:'true'})).toMatchObject({state:'BLOCKED'});
  },100000);
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
    expect(JSON.parse(readFileSync(path.join(f.root,'g7-runtime-hold.json'),'utf8')).reason)
      .toBe('RECOVERED_MIGRATION_COMPLETE');
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
