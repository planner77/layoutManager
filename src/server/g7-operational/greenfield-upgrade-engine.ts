/** Offline, one-shot Greenfield release upgrade. Never invoked by HTTP. */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { constants, closeSync, existsSync, fsyncSync, lstatSync,
  openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureAutomatedGreenfield, identity, target, readInstallation,
  type Installation } from './greenfield-auto';
import { assertDeclaredSchema, GREENFIELD_UPGRADE_REGISTRY, resolveUpgradeChain,
  type MigrationEdge, type ReleaseDeclaration, type UpgradeRegistry } from './greenfield-upgrade-registry';
import { withReadOnlyInspection } from './greenfield-readonly-inspection';
import { assertCadSnapshot, assertSpace, cadSnapshot, createRecoverySet,
  fileSha256, privateAtomicWrite, restoreRecoverySet, verifyRecoverySet,
  type FileHash } from './greenfield-upgrade-backup';

type Db={prepare:(sql:string)=>{all:(...args:unknown[])=>Record<string,unknown>[];
  get:(...args:unknown[])=>Record<string,unknown>|undefined;run:(...args:unknown[])=>unknown};
  exec:(sql:string)=>void;close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(filename:string,
  options:{fileMustExist:boolean;readonly?:boolean})=>Db;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
export type UpgradeDecision='FRESH_INSTALL'|'RESTART_SAME_RELEASE'|'UPGRADE_COMPATIBLE'|
  'UPGRADE_MIGRATION_REQUIRED'|'BLOCKED';
export type UpgradePlan={decision:UpgradeDecision;planId:string;from:string;to:string;
  installId:string;chain:readonly MigrationEdge[];
  declarations:readonly ReleaseDeclaration[];
  sourceManifestSha256:string;targetIdentity:ReturnType<typeof identity>;
  dataSha256:string;cad:FileHash[];volume:string;requiresApproval:boolean};
type Journal={planId:string;installId:string;source:Installation;target:ReturnType<typeof identity>;
  volume:string;chain:readonly {from:string;to:string;kind:string}[];cadSha256:string;
  phase:'LOCKED'|'BACKED_UP'|'MIGRATED'|'POSTCHECKED'|'COMPLETE'|
    'RESTORE_REQUIRED'|'FAILED_PREWRITE';
  backupId?:string;beforeDataSha256:string;afterDataSha256?:string;
  backupDbSha256?:string;createdAt:string};
type Paths=ReturnType<typeof target>;
export type UpgradeCheckpoint='BACKED_UP'|'MIGRATION_COMMITTED'|'MANIFEST_COMMITTED';
export type UpgradeTestHooks={checkpoint?:(phase:UpgradeCheckpoint)=>void;
  spaceCheck?:(directory:string,minimumBytes:number)=>void};
const journalPath=(t:Paths)=>path.join(t.dbDir,'g7-upgrade-journal.json');
const historyPath=(t:Paths)=>path.join(t.dbDir,'g7-upgrade-history.json');
const lockPath=(t:Paths)=>path.join(t.dbDir,'g7-upgrade.lock');
const holdPath=(t:Paths)=>path.join(t.dbDir,'g7-runtime-hold.json');
function safeJson(file:string):unknown {
  const s=lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid?.()||s.nlink!==1||
    (s.mode&0o077)!==0||s.size<2||s.size>65536)throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
  return JSON.parse(readFileSync(file,'utf8'));
}
function journal(t:Paths):Journal|undefined {
  return existsSync(journalPath(t))?safeJson(journalPath(t)) as Journal:undefined;
}
function assertUnblocked(t:Paths):void {
  if(existsSync(lockPath(t))||existsSync(holdPath(t)))
    throw new Error('G7_UPGRADE_RESTORE_REQUIRED');
  const j=journal(t);
  if(j&&j.phase!=='COMPLETE'&&j.phase!=='FAILED_PREWRITE')
    throw new Error('G7_UPGRADE_RESTORE_REQUIRED');
}
function volume(t:Paths):string {
  const db=lstatSync(t.dbDir),cad=lstatSync(t.cad);
  return `${db.dev}:${db.ino}:${cad.dev}:${cad.ino}`;
}
function encode(value:unknown):unknown {
  if(Buffer.isBuffer(value))return {blob:value.toString('hex')};
  if(typeof value==='bigint')return value.toString();
  return value;
}
/** A logical snapshot hashes every table row; it is stable across WAL checkpoints. */
function dataDigest(db:Db):string {
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(r=>String(r.name));
  const digest=createHash('sha256');
  for(const table of tables){
    if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(table))throw new Error('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
    digest.update(table+'\0');
    const rows=db.prepare(`SELECT * FROM "${table}"`).all();
    const encoded=rows.map(row=>JSON.stringify(Object.entries(row).map(([k,v])=>[k,encode(v)]))).sort();
    for(const item of encoded)digest.update(item+'\n');
  }
  return digest.digest('hex');
}
function verifyCadRefs(db:Db,cadDir:string,cad:readonly FileHash[]):void {
  const found=new Map(cad.map(x=>[x.path,x]));
  const versions=db.prepare('SELECT id,location_id,file_format,file_size,sha256,storage_path FROM "CadFileVersion"').all();
  for(const row of versions){
    const locator=String(row.storage_path),id=String(row.id),location=String(row.location_id);
    const ext=String(row.file_format).toLowerCase();
    if(!/^[0-9a-f-]{36}$/.test(id)||!/^[0-9a-f-]{36}$/.test(location)||
      !['dxf','dwg'].includes(ext)||locator!==`${location}/${id}/original.${ext}`)
      throw new Error('G7_UPGRADE_DATA_INTEGRITY');
    const file=found.get(locator);
    if(!file||file.size!==Number(row.file_size)||file.sha256!==row.sha256)
      throw new Error('G7_UPGRADE_DATA_INTEGRITY');
  }
  const assets=db.prepare('SELECT id,digest,byte_length,storage_locator FROM "SceneAsset"').all();
  for(const row of assets){
    const locator=String(row.storage_locator),id=String(row.id);
    if(!/^[0-9a-f-]{36}$/.test(id)||locator!==`scenes/${id}.json`)
      throw new Error('G7_UPGRADE_DATA_INTEGRITY');
    const file=found.get(locator);
    if(!file||file.size!==Number(row.byte_length)||file.sha256!==row.digest)
      throw new Error('G7_UPGRADE_DATA_INTEGRITY');
  }
  // The caller separately validates all CAD bytes and database FKs/triggers.
  void cadDir;
}
function currentData(t:Paths,release:ReleaseDeclaration):{hash:string;cad:FileHash[];users:number}{
  const stat=lstatSync(t.dbPath);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
    stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||
    realpathSync(t.dbPath)!==t.dbPath)
    throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
  return withReadOnlyInspection(t.dbPath,inspectedPath=>{
    const db=new Sqlite(inspectedPath,{fileMustExist:true,readonly:true});
    try{
      db.exec('BEGIN');
      assertDeclaredSchema(db as never,release);
      const cad=cadSnapshot(t.cad);
      verifyCadRefs(db,t.cad,cad);
      const result={hash:dataDigest(db),cad,
        users:Number(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n)};
      db.exec('COMMIT');
      return result;
    }finally{db.close();}
  });
}
function declared(registry:UpgradeRegistry,found:Installation,want:ReturnType<typeof identity>):readonly MigrationEdge[]{
  const old=registry.releases.find(r=>r.version===found.version);
  const next=registry.releases.find(r=>r.version===want.version);
  if(!old||!next||old.schemaId!==found.schemaId||next.schemaId!==want.schemaId)
    throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
  return resolveUpgradeChain(registry,found.version,want.version);
}
function assertOperationalMode(env:Readonly<Record<string,string|undefined>>):void {
  if(env.G7_AUTH_ENABLED!=='false'||env.G7_CAD_WRITE_CUTOVER_ENABLED!=='false'||
    env.G7_RUNTIME_RECOVERY_MODE==='true'||
    ['G7_RUNTIME_TRUST_PATH','G7_RUNTIME_APPROVAL_PATH',
      'G7_S3_AUTH_API_PREVIEW_ONLY','G7_S3_CAD_PREVIEW_ONLY',
      'G7_STAGING_ENABLED','G7_STAGING_ONLY'].some(key=>
      Boolean(env[key])&&env[key]!=='false'))
    throw new Error('G7_UPGRADE_UNSUPPORTED_MODE');
}
export function planGreenfieldUpgrade(env:Readonly<Record<string,string|undefined>>,
  registry:UpgradeRegistry=GREENFIELD_UPGRADE_REGISTRY,
  hooks?:UpgradeTestHooks):UpgradePlan {
  assertOperationalMode(env);
  const want=identity(env),t=target(env);
  const targetDeclaration=registry.releases.find(r=>r.version===want.version);
  if(!targetDeclaration||targetDeclaration.schemaId!==want.schemaId)
    throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
  assertUnblocked(t);
  if(existsSync(path.join(t.dbDir,'g7-rehearsal.lock')))
    throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
  if(!existsSync(t.manifest)){
    if(existsSync(t.dbPath)||readdirSync(t.dbDir).length||readdirSync(t.cad).length)
      throw new Error('G7_UPGRADE_INSTALL_UNKNOWN');
    return {decision:'FRESH_INSTALL',planId:'',from:'',to:want.version,
      installId:'',chain:[],declarations:[],sourceManifestSha256:'',targetIdentity:want,
      dataSha256:'',cad:[],volume:volume(t),requiresApproval:false};
  }
  const found=readInstallation(t);
  const chain=declared(registry,found,want);
  if(chain.length===0 && Object.entries(want).some(([key,value])=>
    found[key as keyof ReturnType<typeof identity>]!==value))
    throw new Error('G7_UPGRADE_PAIR_MISMATCH');
  const source=registry.releases.find(r=>r.version===found.version)!;
  const {hash,cad,users}=currentData(t,source);
  if(chain.length&&users===0)throw new Error('G7_UPGRADE_SETUP_INCOMPLETE');
  if(chain.length){
    const dbBytes=lstatSync(t.dbPath).size;
    const cadBytes=cad.reduce((n,f)=>n+f.size,0);
    (hooks?.spaceCheck??assertSpace)(t.dbDir,Math.max(64*1024*1024,dbBytes*3+cadBytes*2));
    (hooks?.spaceCheck??assertSpace)(t.cad,Math.max(64*1024*1024,cadBytes));
  }
  const sourceManifestSha256=fileSha256(t.manifest);
  const declarations=[source,...chain.map(edge=>registry.releases.find(r=>r.version===edge.to)!)];
  const base={decision:chain.length===0?'RESTART_SAME_RELEASE' as const:
      chain.some(e=>e.kind==='MIGRATION')?'UPGRADE_MIGRATION_REQUIRED' as const:
      'UPGRADE_COMPATIBLE' as const,
    from:found.version,to:want.version,installId:found.installId,
    chain,declarations,sourceManifestSha256,
    targetIdentity:want,dataSha256:hash,cad,volume:volume(t),
    requiresApproval:chain.some(e=>e.kind==='MIGRATION')};
  return {...base,planId:sha(JSON.stringify(base))};
}
function durableExclusive(file:string,value:string):void {
  const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,value);fsyncSync(fd);}finally{closeSync(fd);}
  const dirFd=openSync(path.dirname(file),constants.O_RDONLY|constants.O_DIRECTORY);
  try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
}
function saveJournal(t:Paths,j:Journal):void{privateAtomicWrite(journalPath(t),j);}
function assertMaintenance(env:Readonly<Record<string,string|undefined>>):void {
  if(env.G7_UPGRADE_MAINTENANCE_ACK!=='APP_STOPPED_BY_HOST_HELPER'||
    env.G7_UPGRADE_PAIR_VERIFIED!=='true'||
    !/^[a-f0-9]{40}$/.test(env.G7_RELEASE_SOURCE_COMMIT??''))
    throw new Error('G7_UPGRADE_MAINTENANCE_REQUIRED');
}
export async function applyGreenfieldUpgrade(env:Readonly<Record<string,string|undefined>>,
  approvePlan?:string,registry:UpgradeRegistry=GREENFIELD_UPGRADE_REGISTRY,
  hooks?:UpgradeTestHooks){
  const plan=planGreenfieldUpgrade(env,registry,hooks);
  if(plan.decision==='FRESH_INSTALL')throw new Error('G7_UPGRADE_INSTALL_UNKNOWN');
  if(plan.decision==='RESTART_SAME_RELEASE')return ensureAutomatedGreenfield(env);
  assertMaintenance(env);
  if(plan.requiresApproval && approvePlan!==plan.planId)
    throw new Error('G7_UPGRADE_APPROVAL_REQUIRED');
  const t=target(env),found=readInstallation(t);
  // This persistent lock is deliberately not stale-timeout based. A crashed
  // process can have committed DDL; only isolated restore can clear uncertainty.
  durableExclusive(holdPath(t),JSON.stringify({reason:'G7_UPGRADE_IN_PROGRESS',planId:plan.planId}));
  durableExclusive(lockPath(t),plan.planId);
  let j:Journal={planId:plan.planId,installId:plan.installId,source:found,
    target:plan.targetIdentity,phase:'LOCKED',beforeDataSha256:plan.dataSha256,
    volume:plan.volume,chain:plan.chain.map(e=>({from:e.from,to:e.to,kind:e.kind})),
    cadSha256:sha(JSON.stringify(plan.cad)),createdAt:new Date().toISOString()};
  try{
    saveJournal(t,j);
    const dbBytes=lstatSync(t.dbPath).size;
    const cadBytes=plan.cad.reduce((n,f)=>n+f.size,0);
    (hooks?.spaceCheck??assertSpace)(t.dbDir,Math.max(64*1024*1024,dbBytes*3+cadBytes*2));
    (hooks?.spaceCheck??assertSpace)(t.cad,Math.max(64*1024*1024,cadBytes));
    const sourceRelease=registry.releases.find(r=>r.version===found.version)!;
    const backup=await createRecoverySet({dbPath:t.dbPath,dbDir:t.dbDir,cadDir:t.cad,
      manifest:t.manifest,installId:found.installId,sourceVersion:found.version,
      sourceRelease,registry,cad:plan.cad});
    verifyRecoverySet(t.dbDir,backup.id,registry);
    j={...j,phase:'BACKED_UP',backupId:backup.id,backupDbSha256:backup.dbSha256};saveJournal(t,j);
    hooks?.checkpoint?.('BACKED_UP');
    if(planGreenfieldUpgradeAfterLock(env,t,found,plan,registry)!==plan.planId)
      throw new Error('G7_UPGRADE_DATA_CHANGED');
    const chain=declared(registry,found,plan.targetIdentity);
    for(const edge of chain){
      if(edge.kind!=='MIGRATION')continue;
      if(!edge.sql||sha(edge.sql)!==edge.sqlSha256)throw new Error('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
      const db=new Sqlite(t.dbPath,{fileMustExist:true});
      try{
        db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
        try{
          const sourceRelease=registry.releases.find(r=>r.version===edge.from);
          if(!sourceRelease)throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
          assertDeclaredSchema(db as never,sourceRelease);
          if(!edge.precondition?.startsWith('SELECT ')||
            db.prepare(edge.precondition).get()?.ok!==1)
            throw new Error('G7_UPGRADE_MIGRATION_PRECHECK_FAILED');
          db.exec(edge.sql);
          const now=new Date().toISOString();
          db.prepare('INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count) VALUES(?,?,?,?,NULL,NULL,?,1)')
            .run(randomUUID(),edge.migrationChecksum,now,edge.migrationName,now);
          if(!edge.postcondition?.startsWith('SELECT ')||
            db.prepare(edge.postcondition).get()?.ok!==1)
            throw new Error('G7_UPGRADE_MIGRATION_POSTCHECK_FAILED');
          const targetRelease=registry.releases.find(r=>r.version===edge.to);
          if(!targetRelease)throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
          assertDeclaredSchema(db as never,targetRelease);
          db.exec('COMMIT');
        }
        catch{db.exec('ROLLBACK');throw new Error('G7_UPGRADE_MIGRATION_FAILED');}
      }finally{db.close();}
      hooks?.checkpoint?.('MIGRATION_COMMITTED');
    }
    j={...j,phase:'MIGRATED'};saveJournal(t,j);
    const targetRelease=registry.releases.find(r=>r.version===plan.to)!;
    const after=currentData(t,targetRelease);
    assertCadSnapshot(t.cad,plan.cad);
    if(chain.every(e=>e.kind==='COMPATIBLE')&&after.hash!==plan.dataSha256)
      throw new Error('G7_UPGRADE_DATA_CHANGED');
    j={...j,phase:'POSTCHECKED',afterDataSha256:after.hash};saveJournal(t,j);
    privateAtomicWrite(t.manifest,{...plan.targetIdentity,installId:found.installId});
    hooks?.checkpoint?.('MANIFEST_COMMITTED');
    j={...j,phase:'COMPLETE'};saveJournal(t,j);
    const previous=existsSync(historyPath(t))?safeJson(historyPath(t)):[];
    if(!Array.isArray(previous)||previous.length>32)
      throw new Error('G7_UPGRADE_RESTORE_REQUIRED');
    privateAtomicWrite(historyPath(t),[...previous,j].slice(-32));
    unlinkSync(holdPath(t));
    unlinkSync(lockPath(t));
    const dirFd=openSync(t.dbDir,constants.O_RDONLY|constants.O_DIRECTORY);
    try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
    return {state:'G7_GREENFIELD_READY',mode:'UPGRADE',backupId:backup.id};
  }catch(error){
    if(j.phase==='LOCKED'||j.phase==='BACKED_UP'){
      try{
        const source=registry.releases.find(r=>r.version===found.version);
        if(source){
          const current=currentData(t,source);
          if(current.hash===plan.dataSha256&&
            JSON.stringify(current.cad)===JSON.stringify(plan.cad)&&
            fileSha256(t.manifest)===plan.sourceManifestSha256&&
            volume(t)===plan.volume&&
            readFileSync(lockPath(t),'utf8')===plan.planId&&
            JSON.parse(readFileSync(holdPath(t),'utf8')).planId===plan.planId){
            saveJournal(t,{...j,phase:'FAILED_PREWRITE'});
            unlinkSync(holdPath(t));unlinkSync(lockPath(t));
            const fd=openSync(t.dbDir,constants.O_RDONLY|constants.O_DIRECTORY);
            try{fsyncSync(fd);}finally{closeSync(fd);}
            throw error;
          }
        }
      }catch(inner){if(inner===error)throw error;}
    }
    try{saveJournal(t,{...j,phase:'RESTORE_REQUIRED'});}catch{/* lock remains */}
    throw error;
  }
}
function planGreenfieldUpgradeAfterLock(env:Readonly<Record<string,string|undefined>>,
  t:Paths,found:Installation,plan:UpgradePlan,registry:UpgradeRegistry):string {
  const source=registry.releases.find(r=>r.version===found.version);
  if(!source)throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
  const now=currentData(t,source);
  if(fileSha256(t.manifest)!==plan.sourceManifestSha256||
    JSON.stringify(now.cad)!==JSON.stringify(plan.cad)||now.hash!==plan.dataSha256||
    volume(t)!==plan.volume||readInstallation(t).installId!==found.installId)
    throw new Error('G7_UPGRADE_DATA_CHANGED');
  const base={decision:plan.decision,from:plan.from,to:plan.to,installId:plan.installId,
    chain:plan.chain,declarations:plan.declarations,
    sourceManifestSha256:plan.sourceManifestSha256,
    targetIdentity:identity(env),dataSha256:now.hash,cad:now.cad,volume:volume(t),
    requiresApproval:plan.requiresApproval};
  return sha(JSON.stringify(base));
}
export function statusGreenfieldUpgrade(env:Readonly<Record<string,string|undefined>>){
  assertOperationalMode(env);
  const t=target(env),j=journal(t);
  if(existsSync(lockPath(t))||existsSync(holdPath(t))||j&&j.phase!=='COMPLETE'&&j.phase!=='FAILED_PREWRITE')
    return {state:'RESTORE_REQUIRED',
    phase:j?.phase??'LOCKED',backupId:j?.backupId??null};
  const plan=planGreenfieldUpgrade(env);
  return {state:plan.decision,planId:plan.planId};
}
export function restoreGreenfieldUpgrade(env:Readonly<Record<string,string|undefined>>,
  id:string,targetDbDir:string,targetCadDir:string,sourceDbDir?:string){
  assertOperationalMode(env);
  const t=target(env);
  const source=sourceDbDir??t.dbDir;
  const installation=readInstallation(t);
  const recovery=verifyRecoverySet(source,id);
  if(recovery.installId!==installation.installId)
    throw new Error('G7_UPGRADE_BACKUP_INVALID');
  if(targetDbDir===t.dbDir||targetCadDir===t.cad||
    targetDbDir.startsWith(t.dbDir+path.sep)||targetCadDir.startsWith(t.cad+path.sep))
    throw new Error('G7_UPGRADE_RESTORE_TARGET_INVALID');
  const result=restoreRecoverySet(source,id,targetDbDir,targetCadDir);
  return {state:'RESTORED_ISOLATED',backupId:result.id,sourceVersion:result.sourceVersion};
}
