/** #153: default-inert signed operator migration and marked disposable rehearsals.
 * This task executes synthetic clones only. No S3 network operation, writer
 * stop, service deployment or runtime activation is performed by this module.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  chmodSync, closeSync, constants, existsSync, fstatSync, fsyncSync, ftruncateSync,
  lstatSync, mkdirSync, openSync, readFileSync, realpathSync,
  readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { requireG7S3DisposableTarget, type G7S3TestTarget } from './disposable-target';
import { G7_S3_SCHEMA_ID } from './preflight';
import type { IsolatedDb } from '../g7-staging/g1-store';
import { resolveG7RuntimeMigrationAuthority } from './runtime-gate';

type Db = IsolatedDb & { serialize(): Buffer };
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as
  new(filename: string | Buffer, options?: object) => Db;
const APP = fileURLToPath(new URL('../../', import.meta.url));
const CANDIDATE = path.join(APP, 'deploy/g7-s3/prisma/migrations');
const CAD_TABLES = ['BusinessUnit','Product','CadSite','Building','CadLocation','CadFileVersion','CadDeletionJob'];
const CAD_MIGRATIONS = [
  '202609070001_locations','202609090001_description','202609110001_delete_password',
  '202609110002_delete_invariants','202609110003_drawing_name','202610150001_master_hierarchy',
];
const ALL_MIGRATIONS = [...CAD_MIGRATIONS, G7_S3_SCHEMA_ID];
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const HOLD = 'g7-runtime-hold.json';
const MAX_FILE = 128 * 1024 * 1024;
type Asset = {
  versionId: string; storagePath: string; kind: 'local' | 's3';
  relativePath: string; sha256: string; size: number; storageVersionId?: string;
};
type Snapshot = {
  schemaVersion: 1; scope: 'G7-LOCAL-SNAPSHOT'; snapshotId: string;
  sourceEpoch: string; databaseSha256: string; migrationCount: number;
  assets: Asset[]; auditSha256: string | null;
};
type Options = {
  env: Readonly<Record<string, string | undefined>>;
  /** Deliberate interruption of a marked disposable clone, for recovery drills. */
  fault?: 'after-migration' | 'after-assets-restored';
};
export type RehearsalResult = Readonly<{
  state: 'SNAPSHOT_CAPTURED' | 'MIGRATED' | 'RESTORED' | 'ROLLBACK_SCHEMA_COMPATIBLE';
  migrationCount: number; versionsChecked: number; auditPreserved: boolean;
  executionTarget: 'DISPOSABLE_CLONE' | 'APPROVED_DATABASE';
  runtimeActivated: false; ociImagesExecuted: false;
}>;
function fail(): never { throw new Error('G7_DISPOSABLE_REHEARSAL_BLOCKED'); }
function durableWrite(filename:string,value:Buffer|string):void {
  const fd=openSync(filename,'wx',0o600);
  try{writeFileSync(fd,value);fsyncSync(fd);}finally{closeSync(fd);}
}
function durableDirectory(directory:string):void {
  const fd=openSync(directory,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
}
function writePrivateMutable(root:string,relative:string,value:string):void {
  const filename=path.join(root,relative);
  const fd=openSync(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600);
  try{
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||stat.nlink!==1)fail();
    ftruncateSync(fd,0);writeFileSync(fd,value);fsyncSync(fd);
  }finally{closeSync(fd);}
  durableDirectory(root);
}
function privatePath(root: string, relative: string, directory = false): string {
  if (!relative || path.isAbsolute(relative) || relative.split('/').some(v => !v || v === '.' || v === '..')) fail();
  const full = path.join(root, relative);
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    const st = lstatSync(current);
    if (st.isSymbolicLink() || st.uid !== process.getuid?.() ||
        (st.mode & (st.isDirectory()?0o022:0o077)) !== 0 || realpathSync(current) !== current) fail();
  }
  const st = lstatSync(full);
  if (directory ? !st.isDirectory() : !st.isFile() || st.nlink !== 1 || st.size > MAX_FILE) fail();
  return full;
}
function target(options: Options): G7S3TestTarget {
  if(['G7_S3_AUTH_API_PREVIEW_ONLY','G7_S3_CAD_PREVIEW_ONLY','G7_STAGING_ENABLED']
    .some(key=>options.env[key]==='true'))fail();
  return requireG7S3DisposableTarget(options.env);
}
function open(file: string, readonly = false): Db {
  const db = new Sqlite(file, { fileMustExist: true, readonly });
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  return db;
}
function sql(name: string): string {
  const candidate = readFileSync(path.join(CANDIDATE, name, 'migration.sql'), 'utf8');
  if (CAD_MIGRATIONS.includes(name) && candidate !== readFileSync(path.join(APP,'prisma/migrations',name,'migration.sql'),'utf8')) fail();
  return candidate;
}
function schema(db: Db, count?: number): number {
  if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) fail();
  const history = db.prepare('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name').all();
  const n = count ?? history.length;
  if (![6,7].includes(n) || history.length !== n) fail();
  for (const name of ALL_MIGRATIONS.slice(0,n)) {
    const row = history.find(r => r.migration_name === name);
    if (!row || row.finished_at == null || row.rolled_back_at !== null || row.checksum !== sha(sql(name))) fail();
  }
  const reference = new Sqlite(':memory:');
  try {
    for (const name of ALL_MIGRATIONS.slice(0,n)) reference.exec(sql(name));
    const query = 'SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE \'sqlite_%\' AND tbl_name != \'_prisma_migrations\' ORDER BY type,name';
    if (JSON.stringify(db.prepare(query).all()) !== JSON.stringify(reference.prepare(query).all())) fail();
  } finally { reference.close(); }
  return n;
}
function inventory(db: Db): string {
  return JSON.stringify(CAD_TABLES.map(table => [table, db.prepare('SELECT * FROM "'+table+'" ORDER BY id').all()]));
}
function audit(db: Db, count: number): string | null {
  return count === 7 ? sha(JSON.stringify(db.prepare('SELECT * FROM "AuditEvent" ORDER BY id').all())) : null;
}
function assetFile(root:string, asset:Asset, cadRoot=path.join(root,'cad')):string {
  return asset.kind==='local' ? privatePath(cadRoot,asset.relativePath.slice('cad/'.length)) : privatePath(root,asset.relativePath);
}
function inspectAssets(root: string, db: Db, cadRoot=path.join(root,'cad')): Asset[] {
  let exports: { storagePath: string; storageVersionId: string; relativePath: string }[] = [];
  if (existsSync(path.join(root,'s3-exports.json'))) {
    const raw: unknown = JSON.parse(readFileSync(privatePath(root,'s3-exports.json'),'utf8'));
    if (!Array.isArray(raw) || raw.length > 10000) fail();
    exports = raw;
  }
  const seen = new Set<string>();
  const rows = db.prepare('SELECT id,location_id,version,file_size,sha256,storage_path,file_format FROM "CadFileVersion" ORDER BY id').all();
  const assets = rows.map(v => {
    const locator = String(v.storage_path), id = String(v.id);
    const ext = String(v.file_format).toLowerCase();
    let relativePath: string, storageVersionId: string | undefined;
    const kind: Asset['kind'] = locator.startsWith('s3:') ? 's3' : 'local';
    if (kind === 'local') {
      if (locator !== `${String(v.location_id)}/${id}/original.${ext}` || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.(dxf|dwg)$/.test(locator)) fail();
      relativePath = 'cad/'+locator;
    } else {
      if (!/^s3:[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]:cad\/[0-9a-f-]{36}\/original\.(dxf|dwg)$/.test(locator)) fail();
      const found = exports.filter(o => o.storagePath === locator);
      if (found.length !== 1 || typeof found[0].storageVersionId !== 'string' ||
          !found[0].storageVersionId || found[0].storageVersionId === 'null' ||
          Buffer.byteLength(found[0].storageVersionId,'utf8') > 1024 ||
          Buffer.from(found[0].storageVersionId,'utf8').toString('utf8')!==found[0].storageVersionId ||
          typeof found[0].relativePath !== 'string' || !found[0].relativePath.startsWith('s3-export/')) fail();
      relativePath = found[0].relativePath; storageVersionId = found[0].storageVersionId;
    }
    if (seen.has(relativePath)) fail();
    seen.add(relativePath);
    const bytes = readFileSync(kind==='local' ? privatePath(cadRoot,locator) : privatePath(root,relativePath));
    if (!bytes.length || bytes.length !== v.file_size || sha(bytes) !== v.sha256) fail();
    return { versionId:id,storagePath:locator,kind,relativePath,sha256:sha(bytes),size:bytes.length,
      ...(storageVersionId === undefined ? {} : { storageVersionId }) };
  });
  if (exports.length !== assets.filter(a => a.kind === 's3').length) fail();
  for (const loc of db.prepare('SELECT id,current_version_id,next_version FROM "CadLocation"').all()) {
    const versions = rows.filter(v => v.location_id === loc.id);
    if (loc.current_version_id !== null && !versions.some(v => v.id === loc.current_version_id)) fail();
    if (Number(loc.next_version) <= Math.max(0,...versions.map(v => Number(v.version)))) fail();
  }
  return assets;
}
function result(state: RehearsalResult['state'], count: number, versions: number, preserved: boolean,
  executionTarget: RehearsalResult['executionTarget']='DISPOSABLE_CLONE'): RehearsalResult {
  return {state,migrationCount:count,versionsChecked:versions,auditPreserved:preserved,
    executionTarget,runtimeActivated:false,ociImagesExecuted:false};
}
function hold(t: G7S3TestTarget, reason: string) {
  writePrivateMutable(t.root,HOLD,JSON.stringify({scope:'G7-RUNTIME-HOLD',reason}));
}
function withLock<T>(t: G7S3TestTarget, run: () => T): T {
  const file = path.join(t.root,'g7-rehearsal.lock');
  writeFileSync(file,'G7-DISPOSABLE-LOCK',{mode:0o600,flag:'wx'});
  try { return run(); } finally { rmSync(file); }
}
function deploy(options: Options, rollback = false): void {
  const run = spawnSync(process.execPath,[path.join(APP,'node_modules/prisma/build/index.js'),
    'migrate','deploy','--config',rollback?'deploy/g7-runtime/rollback-prisma.config.ts':'deploy/g7-s3/prisma.config.ts'],
  {cwd:APP,env:{...process.env,...options.env},encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
  // Raw engine logs can contain private paths. Return a fixed reason only.
  if (run.status !== 0) fail();
  chmodSync(target(options).databasePath,0o600);
}

/** Capture one clone-only DB/local/exported-S3 epoch while SQLite writers are locked.
 * Exported S3 VersionIds are supplied local inventory, never authenticated S3 proof.
 */
export function captureG7DisposableSnapshot(options: Options, snapshotId: string, sourceEpoch: string): RehearsalResult {
  const t = target(options);
  if (!/^SNAP-[A-Za-z0-9_-]{2,64}$/.test(snapshotId) || !/^E-[A-Za-z0-9_-]{2,64}$/.test(sourceEpoch)) fail();
  return withLock(t,() => {
    if (existsSync(path.join(t.root,HOLD))) fail();
    const db = open(t.databasePath);
    const parent = path.join(t.root,'snapshots');
    if (!existsSync(parent)) mkdirSync(parent,{mode:0o700});
    privatePath(t.root,'snapshots',true);
    const destination = path.join(parent,snapshotId);
    if (existsSync(destination)) fail();
    const pending = path.join(parent,'.pending-'+randomUUID());
    mkdirSync(pending,{mode:0o700});
    try {
      db.exec('BEGIN IMMEDIATE');
      const count = schema(db), before = inventory(db), assets = inspectAssets(t.root,db);
      const bytes = db.serialize();
      durableWrite(path.join(pending,'database.sqlite'),bytes);
      for (let i=0;i<assets.length;i++) {
        const value = readFileSync(privatePath(t.root,assets[i].relativePath));
        if (sha(value) !== assets[i].sha256) fail();
        durableWrite(path.join(pending,String(i)+'.asset'),value);
      }
      if (inventory(db) !== before || JSON.stringify(inspectAssets(t.root,db)) !== JSON.stringify(assets)) fail();
      const manifest: Snapshot = {schemaVersion:1,scope:'G7-LOCAL-SNAPSHOT',snapshotId,sourceEpoch,
        databaseSha256:sha(bytes),migrationCount:count,assets,auditSha256:audit(db,count)};
      durableWrite(path.join(pending,'manifest.json'),JSON.stringify(manifest));
      durableDirectory(pending);
      db.exec('COMMIT');
      renameSync(pending,destination);
      durableDirectory(parent);
      return result('SNAPSHOT_CAPTURED',count,assets.length,true);
    } catch {
      try { db.exec('ROLLBACK'); } catch { /* Commit may already have succeeded. */ }
      rmSync(pending,{recursive:true,force:true});
      fail();
    } finally { db.close(); }
  });
}

export function migrateG7DisposableClone(options: Options): RehearsalResult {
  const t = target(options);
  return withLock(t,() => {
    if (existsSync(path.join(t.root,HOLD))) fail();
    let db = open(t.databasePath);
    let before: string, beforeAudit: string | null, assets: Asset[], count: number;
    try { count=schema(db);before=inventory(db);beforeAudit=audit(db,count);assets=inspectAssets(t.root,db); }
    finally { db.close(); }
    hold(t,'MIGRATION_IN_PROGRESS');
    try {
      deploy(options);
      if(options.fault==='after-migration')fail();
      db=open(t.databasePath);
      try {
        schema(db,7);
        if (inventory(db)!==before || JSON.stringify(inspectAssets(t.root,db))!==JSON.stringify(assets) ||
            (beforeAudit!==null && audit(db,7)!==beforeAudit)) fail();
      } finally { db.close(); }
      rmSync(path.join(t.root,HOLD));
      return result('MIGRATED',7,assets.length,true);
    } catch { hold(t,'MIGRATION_FAILED_RESTORE_REQUIRED'); fail(); }
  });
}

/** Restore DB + all CAD/export bytes from exactly one retained snapshot.
 * On interruption HOLD remains; retry the same restore before any activation.
 */
export function restoreG7DisposableSnapshot(options: Options, snapshotId: string): RehearsalResult {
  const t=target(options);
  if (!/^SNAP-[A-Za-z0-9_-]{2,64}$/.test(snapshotId)) fail();
  return withLock(t,() => {
    const relative='snapshots/'+snapshotId;
    privatePath(t.root,relative,true);
    const raw: unknown=JSON.parse(readFileSync(privatePath(t.root,relative+'/manifest.json'),'utf8'));
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) fail();
    const m=raw as Snapshot;
    if(m.schemaVersion!==1||m.scope!=='G7-LOCAL-SNAPSHOT'||m.snapshotId!==snapshotId||
      !/^E-[A-Za-z0-9_-]{2,64}$/.test(m.sourceEpoch)||![6,7].includes(m.migrationCount)||
      !Array.isArray(m.assets)||m.assets.length>10000) fail();
    const bytes=readFileSync(privatePath(t.root,relative+'/database.sqlite'));
    if(sha(bytes)!==m.databaseSha256)fail();
    const snapshotDb=new Sqlite(bytes);
    try { schema(snapshotDb,m.migrationCount); if(audit(snapshotDb,m.migrationCount)!==m.auditSha256)fail(); }
    finally { snapshotDb.close(); }
    const assets=m.assets.map((a,i)=>{
      if (!a || typeof a.relativePath!=='string' || !/^(?:cad|s3-export)\/[A-Za-z0-9_./-]+$/.test(a.relativePath) ||
          a.relativePath.split('/').some(v=>!v||v==='.'||v==='..')) fail();
      const value=readFileSync(privatePath(t.root,relative+'/'+i+'.asset'));
      if(sha(value)!==a.sha256||value.length!==a.size)fail();
      return {a,value};
    });
    hold(t,'RESTORE_IN_PROGRESS');
    try {
      // Wait for any previously started clone transaction to finish. New app
      // writes must honor HOLD; an offline disposable target is required.
      const locked=open(t.databasePath);
      try{locked.exec('BEGIN EXCLUSIVE');locked.exec('ROLLBACK');}finally{locked.close();}
      // Discard only clone's derived storage trees; retained snapshots are separate.
      for(const name of ['cad','s3-export']) {
        if(existsSync(path.join(t.root,name))) privatePath(t.root,name,true);
        rmSync(path.join(t.root,name),{recursive:true,force:true});
        mkdirSync(path.join(t.root,name),{mode:0o700});
      }
      for(const {a,value} of assets) {
        const destination=path.join(t.root,a.relativePath);
        mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
        durableWrite(destination,value);
      }
      if(options.fault==='after-assets-restored')fail();
      const exports=m.assets.filter(a=>a.kind==='s3').map(a=>({storagePath:a.storagePath,
        storageVersionId:a.storageVersionId,relativePath:a.relativePath}));
      writePrivateMutable(t.root,'s3-exports.json',JSON.stringify(exports));
      // The disposable preview must be offline. Remove stale WAL only after
      // the snapshot is validated and HOLD is durable; never do this live.
      for(const suffix of ['-wal','-shm'])rmSync(t.databasePath+suffix,{force:true});
      const pending=t.databasePath+'.restore';
      if(existsSync(pending)){privatePath(t.root,'fixture.sqlite.restore');rmSync(pending);}
      durableWrite(pending,bytes);
      renameSync(pending,t.databasePath);
      durableDirectory(t.root);
      const db=open(t.databasePath);
      try {
        schema(db,m.migrationCount);
        if(JSON.stringify(inspectAssets(t.root,db))!==JSON.stringify(m.assets)||audit(db,m.migrationCount)!==m.auditSha256)fail();
      }finally{db.close();}
      if(sha(readFileSync(t.databasePath))!==m.databaseSha256)fail();
      rmSync(path.join(t.root,HOLD));
      return result('RESTORED',m.migrationCount,m.assets.length,true);
    }catch{hold(t,'RESTORE_FAILED_RETRY_REQUIRED');fail();}
  });
}

/** Execute the unchanged six-CAD Prisma history against a restored clone.
 * Schema compatibility only: actual prior OCI App/Migrator execution is separate.
 */
export function verifyG7DisposableRollback(options: Options): RehearsalResult {
  const t=target(options);
  return withLock(t,()=>{
    if(existsSync(path.join(t.root,HOLD)))fail();
    let db=open(t.databasePath);
    let before:string,assets:Asset[];
    try{schema(db,6);before=inventory(db);assets=inspectAssets(t.root,db);}finally{db.close();}
    deploy(options,true);
    db=open(t.databasePath);
    try{schema(db,6);if(inventory(db)!==before||JSON.stringify(inspectAssets(t.root,db))!==JSON.stringify(assets))fail();}
    finally{db.close();}
    return result('ROLLBACK_SCHEMA_COMPATIBLE',6,assets.length,true);
  });
}

export function g7DisposableSnapshotNames(options: Options): string[] {
  const t=target(options);
  if(!existsSync(path.join(t.root,'snapshots')))return [];
  return readdirSync(privatePath(t.root,'snapshots',true)).filter(v=>/^SNAP-[A-Za-z0-9_-]{2,64}$/.test(v)).sort();
}

/** Future explicitly authorized operating entrypoint. This is not called by app
 * startup, HTTP or the automatic migrator. Tests exercise this same code only
 * on synthetic clones. A signed MIGRATION scope is distinct from runtime GO.
 * SQLite schema/history changes commit atomically under one exclusive writer
 * transaction; private HOLD is left on every failure for operator recovery.
 */
export function migrateG7ApprovedDatabase(options: Options): RehearsalResult {
  const authority=resolveG7RuntimeMigrationAuthority(options.env);
  const resume=options.env.G7_RUNTIME_MIGRATION_ACK==='RESUME_APPROVED_G7_SCHEMA';
  if(authority.state!=='ACTIVE'||(!resume&&options.env.G7_RUNTIME_MIGRATION_ACK!=='APPLY_APPROVED_G7_SCHEMA'))fail();
  const root=path.dirname(authority.databasePath),base=path.basename(authority.databasePath);
  if([HOLD,'g7-rehearsal.lock','s3-exports.json','snapshots'].includes(base))fail();
  const rootStat=lstatSync(root);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||realpathSync(root)!==root||
    rootStat.uid!==process.getuid?.()||(rootStat.mode&0o022)!==0||
    options.env.CAD_STORAGE_PATH!==authority.cadStoragePath)fail();
  privatePath(root,base);
  const t={root,databasePath:authority.databasePath};
  const epoch=options.env.G7_RUNTIME_MIGRATION_EPOCH;
  if(!epoch||!/^E-[A-Za-z0-9_-]{2,64}$/.test(epoch))fail();
  return withLock(t,()=>{
    if(existsSync(path.join(root,HOLD))&&!resume)fail();
    hold(t,'APPROVED_MIGRATION_IN_PROGRESS');
    const db=open(t.databasePath);
    let transaction=false;
    try{
      db.exec('BEGIN EXCLUSIVE');transaction=true;
      const count=schema(db),before=inventory(db),assets=inspectAssets(root,db,authority.cadStoragePath),beforeAudit=audit(db,count);
      const siteRows=db.prepare('SELECT id FROM "CadSite" ORDER BY id').all();
      if(siteRows.some(row=>!authority.siteIds.includes(String(row.id))))fail();
      const relative='snapshots/'+authority.snapshotId;
      if(!existsSync(path.join(root,'snapshots')))mkdirSync(path.join(root,'snapshots'),{mode:0o700});
      privatePath(root,'snapshots',true);
      if(existsSync(path.join(root,relative))){
        const manifest=JSON.parse(readFileSync(privatePath(root,relative+'/manifest.json'),'utf8')) as Snapshot;
        const bytes=readFileSync(privatePath(root,relative+'/database.sqlite'));
        if(manifest.scope!=='G7-LOCAL-SNAPSHOT'||manifest.schemaVersion!==1||manifest.snapshotId!==authority.snapshotId||
          manifest.sourceEpoch!==epoch||manifest.migrationCount!==6||manifest.databaseSha256!==sha(bytes)||
          JSON.stringify(manifest.assets)!==JSON.stringify(assets))fail();
        const source=new Sqlite(bytes);
        try{schema(source,6);if(inventory(source)!==before)fail();}finally{source.close();}
        if(count===7&&db.prepare('SELECT COUNT(*) AS n FROM "AuditEvent"').get()?.n!==0)fail();
        for(let i=0;i<manifest.assets.length;i++){
          const value=readFileSync(privatePath(root,relative+'/'+i+'.asset'));
          if(sha(value)!==manifest.assets[i].sha256||value.length!==manifest.assets[i].size)fail();
        }
      }else{
        if(resume||count!==6)fail();
        const pending=path.join(root,'snapshots','.pending-'+randomUUID());
        mkdirSync(pending,{mode:0o700});
        try{
        const bytes=db.serialize();
        durableWrite(path.join(pending,'database.sqlite'),bytes);
        for(let i=0;i<assets.length;i++){
          const value=readFileSync(assetFile(root,assets[i],authority.cadStoragePath));
          if(sha(value)!==assets[i].sha256)fail();
          durableWrite(path.join(pending,String(i)+'.asset'),value);
        }
        const manifest:Snapshot={schemaVersion:1,scope:'G7-LOCAL-SNAPSHOT',snapshotId:authority.snapshotId,
          sourceEpoch:epoch,databaseSha256:sha(bytes),migrationCount:count,assets,auditSha256:beforeAudit};
        durableWrite(path.join(pending,'manifest.json'),JSON.stringify(manifest));
        durableDirectory(pending);
        renameSync(pending,path.join(root,relative));
        durableDirectory(path.join(root,'snapshots'));
        }catch{rmSync(pending,{recursive:true,force:true});fail();}
      }
      if(JSON.stringify(inspectAssets(root,db,authority.cadStoragePath))!==JSON.stringify(assets))fail();
      // Execute the exact quarantined SQL and Prisma-compatible successful
      // history row in this SAME transaction. No partial history can activate.
      if(count===6){
        db.exec(sql(G7_S3_SCHEMA_ID));
        const stamp=new Date().toISOString();
        db.prepare('INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count) VALUES(?,?,?,?,NULL,NULL,?,1)')
          .run(randomUUID(),sha(sql(G7_S3_SCHEMA_ID)),stamp,G7_S3_SCHEMA_ID,stamp);
      }
      if(options.fault==='after-migration')fail();
      schema(db,7);
      if(inventory(db)!==before||JSON.stringify(inspectAssets(root,db,authority.cadStoragePath))!==JSON.stringify(assets)||
        (beforeAudit!==null&&audit(db,7)!==beforeAudit))fail();
      const current=resolveG7RuntimeMigrationAuthority(options.env);
      if(current.state!=='ACTIVE'||current.approvalId!==authority.approvalId||
        current.snapshotId!==authority.snapshotId||current.changeRequestId!==authority.changeRequestId||
        current.databasePath!==authority.databasePath||current.cadStoragePath!==authority.cadStoragePath||current.expiresAt!==authority.expiresAt)fail();
      db.exec('COMMIT');transaction=false;
      rmSync(path.join(root,HOLD));
      return result('MIGRATED',7,assets.length,true,'APPROVED_DATABASE');
    }catch{
      if(transaction){try{db.exec('ROLLBACK');}catch{/* HOLD survives an uncertain database failure. */}}
      hold(t,'APPROVED_MIGRATION_FAILED_RECOVERY_REQUIRED');fail();
    }finally{db.close();}
  });
}
