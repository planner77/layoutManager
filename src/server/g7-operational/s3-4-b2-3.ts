/**
 * #142 S3-4-B2-3: disposable seven-migration CAD invariants verifier.
 * Accepts only *supplied in-memory bytes*. NEVER opens a file path,
 * stops writers, connects to a DB/S3/registry, or runs migrations.
 *
 * The integration suite separately executes six fixed CAD migration SQL files
 * and the quarantined seventh Auth migration on synthetic disposable DBs.
 * This checker is NOT source provenance, a migration runner, or Owner GO.
 */
import { createHash } from 'node:crypto';
import { openS34B1MemoryClone } from './s3-4-b-clone';
import { G7_S3_SCHEMA_ID } from './preflight';

type Row = Record<string, string | number | null>;
type Db = {
  prepare(sql:string):{
    all(...params:(string|number)[]):Row[];
    get(...params:(string|number)[]):Row|undefined;
    run(...params:(string|number)[]):unknown;
  };
  close():void;
};
const CAD_TABLES = [
  'BusinessUnit','Product','CadSite','Building',
  'CadLocation','CadFileVersion','CadDeletionJob',
] as const;
const AUTH_TABLES = [
  'User','UserRoleGrant','UserSiteGrant','SpecialGrant',
  'AuthSession','AuditEvent','AdminRecoveryNonce','G3LoginAttempt',
] as const;
const AUDIT_TRIGGERS=['g1_audit_no_update','g1_audit_no_delete'] as const;
const SHA=/^[a-f0-9]{64}$/;
const SNAP=/^SNAP-[A-Za-z0-9_-]{2,64}$/;
const UUID='[0-9a-f-]{36}';
const LOCAL=new RegExp('^'+UUID+'/'+UUID+'/original\\.(dxf|dwg)$');
const S3=new RegExp('^s3:[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]:cad/'+UUID+'/original\\.(dxf|dwg)$');
const MAX_DB_BYTES=128*1024*1024;
const MAX_CAD_BYTES=110*1024*1024;
const MAX_TOTAL_BYTES=512*1024*1024;
type Asset={dbVersionId:string;storagePath:string;storage:'local'|'s3';bytes:Buffer};
type Packet={scope:string;schemaId:string;snapshotId:string;
  beforeBytes:Buffer;afterBytes:Buffer;assets:Asset[]};
export type B23Result=Readonly<{
  state:'BLOCKED'|'DISPOSABLE_SEVEN_SCHEMA_INVARIANTS_ONLY';
  reasons:readonly string[];cadVersionCount:number;assetBytesChecked:number;
  authTableCount:number;auditAppendOnlyChecked:boolean;
  actualSourceSnapshotVerified:false;formalPrismaDeployVerified:false;
  provenanceVerified:false;operationalGo:false;runtimeActivated:false;
}>;
const digest=(bytes:Buffer):string=>createHash('sha256').update(bytes).digest('hex');
function answer(reasons:string[],versionCount=0,assetCount=0,auth=0,audit=false):B23Result {
  const unique=[...new Set(reasons)].sort();
  return {state:unique.length?'BLOCKED':'DISPOSABLE_SEVEN_SCHEMA_INVARIANTS_ONLY',
    reasons:unique,cadVersionCount:versionCount,assetBytesChecked:assetCount,
    authTableCount:auth,auditAppendOnlyChecked:audit&&!unique.length,
    actualSourceSnapshotVerified:false,formalPrismaDeployVerified:false,
    provenanceVerified:false,operationalGo:false,runtimeActivated:false};
}
function exact(v:unknown,fields:readonly string[]):v is Record<string,unknown>{
  return Boolean(v)&&typeof v==='object'&&!Array.isArray(v)&&
    Object.getPrototypeOf(v)===Object.prototype &&
    Object.keys(v).length===fields.length &&
    fields.every(k=>Object.hasOwn(v,k));
}
function valid(raw:unknown):raw is Packet {
  if(!exact(raw,['scope','schemaId','snapshotId','beforeBytes','afterBytes','assets'])||
      raw.scope!=='G7-S3-4B2-3-DISPOSABLE-ONLY'||
      raw.schemaId!==G7_S3_SCHEMA_ID||typeof raw.snapshotId!=='string'||
      !SNAP.test(raw.snapshotId)||!Buffer.isBuffer(raw.beforeBytes)||
      !Buffer.isBuffer(raw.afterBytes)||raw.beforeBytes.length<100||
      raw.afterBytes.length<100||raw.beforeBytes.length>MAX_DB_BYTES||
      raw.afterBytes.length>MAX_DB_BYTES||!Array.isArray(raw.assets)||
      raw.assets.length<2||raw.assets.length>10000)return false;
  let total=raw.beforeBytes.length+raw.afterBytes.length;
  for(const a of raw.assets){
    if(!exact(a,['dbVersionId','storagePath','storage','bytes'])||
      typeof a.dbVersionId!=='string'||a.dbVersionId.length>128||
      typeof a.storagePath!=='string'||a.storagePath.length>512||
      !['local','s3'].includes(String(a.storage))||
      !Buffer.isBuffer(a.bytes)||a.bytes.length<1||a.bytes.length>MAX_CAD_BYTES||
      !(a.storage==='local'?LOCAL.test(a.storagePath):S3.test(a.storagePath)))
      return false;
    total+=a.bytes.length;
    if(total>MAX_TOTAL_BYTES)return false;
  }
  return true;
}
function rows(db:Db,table:(typeof CAD_TABLES)[number]):Row[]{
  // table is a compile-time fixed allowlist, never input SQL.
  return db.prepare('SELECT * FROM "'+table+'" ORDER BY "id"').all();
}
function integrity(db:Db,reasons:string[],stage:'BEFORE'|'AFTER'):void{
  const quick=db.prepare('PRAGMA quick_check').all();
  if(quick.length!==1||quick[0]?.quick_check!=='ok')
    reasons.push(stage+'_SQLITE_INTEGRITY');
  if(db.prepare('PRAGMA foreign_key_check').all().length)
    reasons.push(stage+'_FOREIGN_KEY_VIOLATIONS');
}
function auditMutationProbe(db:Db):boolean{
  // This is a separate in-memory SQLite copy. Only a synthetic row is
  // inserted. No source/operating data or database file can be changed.
  const id='G7-B2-3-synthetic-audit-probe';
  try{
    db.prepare('INSERT INTO "AuditEvent" (id,action,target_kind,target_id,outcome,timestamp_utc,request_id) VALUES (?,?,?,?,?,?,?)')
      .run(id,'LOGIN_DENIED','ACCOUNT','synthetic','DENIED','2026-10-27T00:00:00Z','B2-3-synthetic');
    let updateRejected=false,deleteRejected=false;
    try{
      db.prepare('UPDATE "AuditEvent" SET "outcome"=? WHERE "id"=?')
        .run('SUCCESS',id);
    }catch{updateRejected=true;}
    try{
      db.prepare('DELETE FROM "AuditEvent" WHERE "id"=?').run(id);
    }catch{deleteRejected=true;}
    return updateRejected&&deleteRejected;
  }catch{return false;}
}
/** Discrete byte reconciliation, not a migration runner nor site capture proof. */
export function assessS34B23DisposableMigration(raw:unknown):B23Result{
  if(!valid(raw))return answer(['INVALID_DISPOSABLE_PACKET']);
  const reasons:string[]=[];
  let before:Db|undefined,after:Db|undefined;
  let versionCount=0,assetCount=0,authCount=0,auditChecked=false;
  try{
    before=openS34B1MemoryClone(raw.beforeBytes) as unknown as Db;
    after=openS34B1MemoryClone(raw.afterBytes) as unknown as Db;
    integrity(before,reasons,'BEFORE');
    integrity(after,reasons,'AFTER');
    const beforeTables=new Set(before.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)));
    const afterTables=new Set(after.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)));
    if(CAD_TABLES.some(t=>!beforeTables.has(t)||!afterTables.has(t)))
      reasons.push('CAD_SCHEMA_INCOMPLETE');
    if(AUTH_TABLES.some(t=>beforeTables.has(t)))
      reasons.push('BASELINE_NOT_CAD_ONLY');
    authCount=AUTH_TABLES.filter(t=>afterTables.has(t)).length;
    if(authCount!==AUTH_TABLES.length)reasons.push('AUTH_SCHEMA_INCOMPLETE');
    // Capture immutable CAD rows in both independently materialized clones:
    // version, Current, sequence, UUID, SHA, locator and parent hierarchy.
    if(!reasons.includes('CAD_SCHEMA_INCOMPLETE')){
      for(const table of CAD_TABLES){
        if(JSON.stringify(rows(before,table))!==JSON.stringify(rows(after,table)))
          reasons.push('CAD_ROWS_CHANGED');
      }
      const vers=before.prepare('SELECT id,location_id,version,file_size,sha256,storage_path,file_format FROM "CadFileVersion"').all();
      const locs=before.prepare('SELECT id,current_version_id,next_version FROM "CadLocation"').all();
      versionCount=vers.length;
      if(vers.length<2||locs.length<1)reasons.push('CAD_FIXTURE_INCOMPLETE');
      const ids=new Set<string>(),locators=new Set<string>();
      const byId=new Map(vers.map(v=>[String(v.id),v]));
      const maxima=new Map<string,number>(),sequence=new Set<string>();
      const knownLocations=new Set(locs.map(l=>String(l.id)));
      for(const version of vers){
        const location=String(version.location_id),n=Number(version.version);
        const seqKey=location+'/'+n;
        if(!knownLocations.has(location)||!Number.isSafeInteger(n)||n<1||
           sequence.has(seqKey))reasons.push('CAD_VERSION_SEQUENCE_INVALID');
        sequence.add(seqKey);
        maxima.set(location,Math.max(maxima.get(location)||0,n));
      }
      const seenLocal=new Set<string>(),seenS3=new Set<string>();
      for(const a of raw.assets){
        if(ids.has(a.dbVersionId)||locators.has(a.storagePath)){
          reasons.push('DUPLICATE_ASSET_BINDING');continue;
        }
        ids.add(a.dbVersionId);locators.add(a.storagePath);
        const v=byId.get(a.dbVersionId);
        const ext=typeof v?.file_format==='string'?v.file_format.toLowerCase():null;
        if(!v||v.storage_path!==a.storagePath||v.file_size!==a.bytes.length||
           !SHA.test(String(v.sha256))||v.sha256!==digest(a.bytes)||
           !ext||!a.storagePath.endsWith('/original.'+ext))
          reasons.push('CAD_BYTES_OR_LOCATOR_MISMATCH');
        if(a.storage==='local')seenLocal.add(a.dbVersionId);
        else seenS3.add(a.dbVersionId);
        assetCount++;
      }
      if(ids.size!==vers.length||seenLocal.size===0||seenS3.size===0)
        reasons.push('CAD_ASSET_COVERAGE_INCOMPLETE');
      for(const l of locs){
        if(l.current_version_id!==null){
          const owner=byId.get(String(l.current_version_id));
          if(!owner||String(owner.location_id)!==String(l.id))
            reasons.push('CURRENT_VERSION_OWNER_INVALID');
        }
        const next=Number(l.next_version);
        if(!Number.isSafeInteger(next)||next<=(maxima.get(String(l.id))||0))
          reasons.push('CAD_VERSION_SEQUENCE_INVALID');
      }
    }
    if(authCount===AUTH_TABLES.length){
      const triggerNames=new Set(after.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(r=>String(r.name)));
      if(AUDIT_TRIGGERS.some(t=>!triggerNames.has(t)))
        reasons.push('AUDIT_TRIGGERS_INCOMPLETE');
      else {
        auditChecked=auditMutationProbe(after);
        if(!auditChecked)reasons.push('AUDIT_NOT_APPEND_ONLY');
      }
    }
  }catch{reasons.push('ISOLATED_SQLITE_UNREADABLE');}
  finally{after?.close();before?.close();}
  return answer(reasons,versionCount,assetCount,authCount,auditChecked);
}
