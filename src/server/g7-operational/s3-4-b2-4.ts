/**
 * #142 S3-4-B2-4 disposable restore/rollback REPLAY preflight.
 * Supplied Buffers only: never performs a restore, rolls back an app/image,
 * opens a source path, invokes Prisma/Docker, contacts S3/OCI or stops writers.
 * Coherent synthetic labels and bytes are NOT authenticated site proof.
 */
import { inspectS34B2OfflinePair, type S34B2OfflineRequest } from './s3-4-b2-oci';
import { assessS34B23DisposableMigration } from './s3-4-b2-3';
import { G7_S3_SCHEMA_ID } from './preflight';

type StageObject = Readonly<{
  dbVersionId:string;storagePath:string;storage:'local'|'s3';
  bytes:Buffer;storageVersionId?:string;
}>;
type Stage = Readonly<{
  snapshotId:string;sourceEpoch:string;sqliteBytes:Buffer;
  objects:readonly StageObject[];markerBytes:Buffer;markerVersionId:string;
}>;
type Request = Readonly<{
  scope:string;snapshotId:string;sourceEpoch:string;
  imagePair:S34B2OfflineRequest;source:Stage;candidate:Stage;rollback:Stage;
}>;
export type S34B24Result=Readonly<{
  state:'BLOCKED'|'DISPOSABLE_REPLAY_MATCH_NOT_SITE_PROOF';
  reasons:readonly string[];versionsCompared:number;
  localObjectsCompared:number;s3ObjectsCompared:number;
  fourOciRolesLocallyConsistent:boolean;
  registryVerified:false;provenanceVerified:false;rollbackCompatible:false;
  writerQuiescenceVerified:false;sourceSnapshotVerified:false;
  sameSnapshotRestored:false;restoreExecuted:false;rollbackExecuted:false;
  operationalGo:false;runtimeActivated:false;
}>;
const SNAP=/^SNAP-[A-Za-z0-9_-]{2,64}$/;
const EPOCH=/^E-[A-Za-z0-9_-]{2,64}$/;
const UUID=/^[0-9a-f-]{36}$/;
const LOCAL=/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.(dxf|dwg)$/;
const S3=/^s3:[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]:cad\/[0-9a-f-]{36}\/original\.(dxf|dwg)$/;
const MAX_DB=128*1024*1024, MAX_OBJECT=110*1024*1024;
const MAX_TOTAL=512*1024*1024;
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
  return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
    Object.getPrototypeOf(v)===Object.prototype&&
    Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
}
function validVersion(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value!=='null'&&
    Buffer.byteLength(value,'utf8')<=1024&&
    Buffer.from(value,'utf8').toString('utf8')===value;
}
function stage(raw:unknown):raw is Stage{
  if(!exact(raw,['snapshotId','sourceEpoch','sqliteBytes','objects','markerBytes','markerVersionId'])||
    typeof raw.snapshotId!=='string'||!SNAP.test(raw.snapshotId)||
    typeof raw.sourceEpoch!=='string'||!EPOCH.test(raw.sourceEpoch)||
    !Buffer.isBuffer(raw.sqliteBytes)||raw.sqliteBytes.length<100||
    raw.sqliteBytes.length>MAX_DB||!Buffer.isBuffer(raw.markerBytes)||
    raw.markerBytes.length<2||raw.markerBytes.length>4096||
    !validVersion(raw.markerVersionId)||!Array.isArray(raw.objects)||
    raw.objects.length<2||raw.objects.length>1000)return false;
  let bytes=raw.sqliteBytes.length+raw.markerBytes.length;
  for(const o of raw.objects){
    if(!exact(o,o?.storage==='s3'?
        ['dbVersionId','storagePath','storage','bytes','storageVersionId']:
        ['dbVersionId','storagePath','storage','bytes'])||
       typeof o.dbVersionId!=='string'||!UUID.test(o.dbVersionId)||
       typeof o.storagePath!=='string'||o.storagePath.length>512||
       (o.storage!=='local'&&o.storage!=='s3')||
       !(o.storage==='local'?LOCAL.test(o.storagePath):S3.test(o.storagePath))||
       !Buffer.isBuffer(o.bytes)||o.bytes.length<1||o.bytes.length>MAX_OBJECT||
       (o.storage==='s3'&&!validVersion(o.storageVersionId)))return false;
    bytes+=o.bytes.length;
    if(bytes>MAX_TOTAL)return false;
  }
  return true;
}
function valid(raw:unknown):raw is Request{
  return exact(raw,['scope','snapshotId','sourceEpoch','imagePair','source','candidate','rollback'])&&
    raw.scope==='G7-S3-4B2-4-DISPOSABLE-REPLAY'&&
    typeof raw.snapshotId==='string'&&SNAP.test(raw.snapshotId)&&
    typeof raw.sourceEpoch==='string'&&EPOCH.test(raw.sourceEpoch)&&
    stage(raw.source)&&stage(raw.candidate)&&stage(raw.rollback)&&
    Object.keys(raw).length===7;
}
function markerMatches(s:Stage,snapshotId:string,sourceEpoch:string):boolean{
  try{
    const json:unknown=JSON.parse(s.markerBytes.toString('utf8'));
    return exact(json,['scope','snapshotId','sourceEpoch'])&&
      json.scope==='G7-S3-4B2-4-DISPOSABLE-MARKER'&&
      json.snapshotId===snapshotId&&json.sourceEpoch===sourceEpoch;
  }catch{return false;}
}
function answer(reasons:string[],local=0,s3=0,oci=false):S34B24Result{
  const unique=[...new Set(reasons)].sort();
  return {state:unique.length?'BLOCKED':'DISPOSABLE_REPLAY_MATCH_NOT_SITE_PROOF',
    reasons:unique,versionsCompared:local+s3,localObjectsCompared:local,
    s3ObjectsCompared:s3,fourOciRolesLocallyConsistent:oci,
    registryVerified:false,provenanceVerified:false,rollbackCompatible:false,
    writerQuiescenceVerified:false,sourceSnapshotVerified:false,
    sameSnapshotRestored:false,restoreExecuted:false,rollbackExecuted:false,
    operationalGo:false,runtimeActivated:false};
}
function compareObjects(source:Stage,target:Stage,reason:string,reasons:string[]):void{
  if(source.objects.length!==target.objects.length){
    reasons.push(reason);return;
  }
  const reference=new Map<string,StageObject>();
  for(const o of source.objects)reference.set(o.dbVersionId,o);
  const matched=new Set<string>();
  for(const o of target.objects){
    const initial=reference.get(o.dbVersionId);
    if(matched.has(o.dbVersionId)||!initial||
       initial.storage!==o.storage||initial.storagePath!==o.storagePath||
       initial.storageVersionId!==o.storageVersionId||
       !initial.bytes.equals(o.bytes))reasons.push(reason);
    matched.add(o.dbVersionId);
  }
  if(matched.size!==reference.size)reasons.push(reason);
}
/**
 * Reconcile separately supplied source/candidate/rollback payloads.
 * The stage labels, four OCI local manifests and any S3 VersionId are
 * UNTRUSTED claims. Positive never means actual restore/rollback execution.
 */
export function inspectS34B24DisposableReplay(raw:unknown):S34B24Result{
  if(!valid(raw))return answer(['INVALID_DISPOSABLE_REPLAY_PACKET']);
  const reasons:string[]=[];
  let local=0,s3=0,oci=false;
  try{
    const image=inspectS34B2OfflinePair(raw.imagePair);
    oci=image.state==='LOCAL_DIGESTS_MATCH_NOT_REGISTRY_PROOF'&&image.checked===4;
    if(!oci)reasons.push('OFFLINE_OCI_PAIR_BLOCKED');
    const reference=raw.source;
    const initialKeys=new Set<string>(),initialLocators=new Set<string>();
    for(const o of reference.objects){
      if(initialKeys.has(o.dbVersionId)||initialLocators.has(o.storagePath))
        reasons.push('SOURCE_OBJECT_DUPLICATED');
      initialKeys.add(o.dbVersionId);initialLocators.add(o.storagePath);
      if(o.storage==='local')local++;else s3++;
    }
    if(local===0||s3===0)reasons.push('BOTH_STORAGE_KINDS_REQUIRED');
    for(const stage of [raw.source,raw.candidate,raw.rollback]){
      if(stage.snapshotId!==raw.snapshotId||stage.sourceEpoch!==raw.sourceEpoch)
        reasons.push('SNAPSHOT_EPOCH_MISMATCH');
      if(!markerMatches(stage,raw.snapshotId,raw.sourceEpoch)||
         stage.markerVersionId!==reference.markerVersionId||
         !stage.markerBytes.equals(reference.markerBytes))
        reasons.push('S3_MARKER_MISMATCH');
    }
    compareObjects(reference,raw.candidate,'CANDIDATE_OBJECT_MISMATCH',reasons);
    compareObjects(reference,raw.rollback,'ROLLBACK_OBJECT_MISMATCH',reasons);
    // A byte-for-byte restored baseline is stronger than row-only matching.
    // In this synthetic preflight it is still a caller-supplied Buffer claim.
    if(!reference.sqliteBytes.equals(raw.rollback.sqliteBytes))
      reasons.push('ROLLBACK_SQLITE_BYTES_MISMATCH');
    const candidate=assessS34B23DisposableMigration({
      scope:'G7-S3-4B2-3-DISPOSABLE-ONLY',schemaId:G7_S3_SCHEMA_ID,
      snapshotId:raw.snapshotId,beforeBytes:reference.sqliteBytes,
      afterBytes:raw.candidate.sqliteBytes,
      assets:reference.objects.map(o=>({
        dbVersionId:o.dbVersionId,storagePath:o.storagePath,
        storage:o.storage,bytes:o.bytes,
      })),
    });
    if(candidate.state!=='DISPOSABLE_SEVEN_SCHEMA_INVARIANTS_ONLY')
      reasons.push('CANDIDATE_INVARIANTS_BLOCKED');
  }catch{reasons.push('DISPOSABLE_REPLAY_UNREADABLE');}
  return answer(reasons,local,s3,oci);
}
