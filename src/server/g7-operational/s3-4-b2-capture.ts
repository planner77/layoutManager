/**
 * Issue #142 S3-4-B2-2A: pure validation of an operator-SUPPLIED barrier
 * packet. Does NOT freeze writers, open SQLite, read CAD, or contact S3.
 * Consistency of claims is NEVER trusted evidence of actual source capture.
 */
export type S34B22Result=Readonly<{
  state:'BLOCKED'|'CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF';
  reasons:readonly string[];versions:number;localCount:number;s3Count:number;
  writerQuiescenceVerified:false;sameSnapshotVerified:false;
  bytesVerified:false;provenanceVerified:false;operationalGo:false;runtimeActivated:false;
}>;
type Obj=Record<string,unknown>;
const SNAP=/^SNAP-[A-Za-z0-9_-]{2,64}$/;
const ID=/^[A-Z]+-[A-Za-z0-9_-]{2,64}$/;
const HASH=/^[a-f0-9]{64}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function shape(v:unknown,required:string[],optional:string[]=[]):v is Obj{
  return obj(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
}
const id=(v:unknown,prefix:string)=>typeof v==='string'&&ID.test(v)&&v.startsWith(prefix+'-');
const hash=(v:unknown)=>typeof v==='string'&&HASH.test(v);
const count=(v:unknown,min=0)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const utc=(v:unknown):v is string=>typeof v==='string'&&UTC.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function answer(errors:string[],vers=0,local=0,s3=0):S34B22Result{
  const reasons=[...new Set(errors)].sort();
  return {state:reasons.length?'BLOCKED':'CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF',
    reasons,versions:vers,localCount:local,s3Count:s3,writerQuiescenceVerified:false,
    sameSnapshotVerified:false,bytesVerified:false,provenanceVerified:false,
    operationalGo:false,runtimeActivated:false};
}
type Entry={key:string;bytes:number;sha256:string;storageVersionId?:string};
function entry(v:unknown,kind:'local'|'s3'):v is Entry{
  return shape(v,['key','bytes','sha256'],kind==='s3'?['storageVersionId']:[])&&
    id(v.key,'V')&&count(v.bytes,1)&&hash(v.sha256)&&
    (kind==='s3'?typeof v.storageVersionId==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(v.storageVersionId):v.storageVersionId===undefined);
}
function receipt(r:unknown,snap:string,epoch:string,from:number,to:number,kind:'sqlite'|'local'|'s3'):boolean{
  if(!obj(r)||r.snapshotId!==snap||r.sourceEpoch!==epoch||
     !utc(r.startedUtc)||!utc(r.finishedUtc)||Date.parse(r.startedUtc)<from||
     Date.parse(r.finishedUtc)>to||Date.parse(r.startedUtc)>Date.parse(r.finishedUtc))return false;
  if(kind==='sqlite')return shape(r,['snapshotId','sourceEpoch','startedUtc','finishedUtc',
    'backupSha256','quickCheck','foreignKeyViolations','currentOwnerViolations',
    'auditInvariantViolations','locations','versions'])&&hash(r.backupSha256)&&
    r.quickCheck==='ok'&&r.foreignKeyViolations===0&&
    r.currentOwnerViolations===0&&r.auditInvariantViolations===0;
  if(kind==='s3')return shape(r,['snapshotId','sourceEpoch','startedUtc','finishedUtc',
    'markerSnapshotId','markerVersionId','objects'])&&r.markerSnapshotId===snap&&
    typeof r.markerVersionId==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(r.markerVersionId);
  return shape(r,['snapshotId','sourceEpoch','startedUtc','finishedUtc','objects']);
}
export function assessS34B22CapturePacket(raw:unknown):S34B22Result{
  if(!shape(raw,['scope','schemaVersion','snapshotId','operatorId','changeRequestId',
    'barrier','sqlite','local','s3'])||raw.scope!=='G7-S3-4B2-CAPTURE'||
    raw.schemaVersion!==1||typeof raw.snapshotId!=='string'||!SNAP.test(raw.snapshotId)||
    !id(raw.operatorId,'OP')||!id(raw.changeRequestId,'CR'))return answer(['INVALID_PACKET']);
  const b=raw.barrier;
  if(!shape(b,['id','quiescedUtc','resumedUtc','epochBefore','epochAfter','activeWriters',
    'writesDuringCapture','leaseClaimed'])||!id(b.id,'BAR')||!utc(b.quiescedUtc)||
    !utc(b.resumedUtc)||Date.parse(b.resumedUtc)<=Date.parse(b.quiescedUtc)||
    !id(b.epochBefore,'E')||b.epochBefore!==b.epochAfter||
    b.activeWriters!==0||b.writesDuringCapture!==0||b.leaseClaimed!==true)
    return answer(['BARRIER_NOT_PROVEN']);
  const errors:string[]=[],from=Date.parse(b.quiescedUtc),to=Date.parse(b.resumedUtc);
  if(!receipt(raw.sqlite,raw.snapshotId as string,b.epochBefore as string,from,to,'sqlite')||
     !receipt(raw.local,raw.snapshotId as string,b.epochBefore as string,from,to,'local')||
     !receipt(raw.s3,raw.snapshotId as string,b.epochBefore as string,from,to,'s3'))errors.push('SNAPSHOT_INTERVAL_OR_SOURCE_MISMATCH');
  if(!obj(raw.sqlite)||!obj(raw.local)||!obj(raw.s3)||
     !Array.isArray(raw.sqlite.versions)||!Array.isArray(raw.sqlite.locations)||
     !Array.isArray(raw.local.objects)||!Array.isArray(raw.s3.objects))
    return answer([...errors,'MISSING_INVENTORY']);
  const versions=raw.sqlite.versions,locations=raw.sqlite.locations,
    locals=raw.local.objects,s3s=raw.s3.objects;
  if(versions.length<2||versions.length>10000||locations.length<1||
     locations.length>10000||locals.length<1||locals.length>10000||
     s3s.length<1||s3s.length>10000)return answer([...errors,'INVENTORY_BOUNDS']);
  const vm=new Map<string,Obj>(),lm=new Map<string,Obj>(),localMap=new Map<string,Entry>(),
    s3Map=new Map<string,Entry>();
  for(const v of versions){
    if(!shape(v,['key','locationId','version','storage','bytes','sha256'],['storageVersionId'])||
       !id(v.key,'V')||!id(v.locationId,'L')||!count(v.version,1)||
       !['local','s3'].includes(String(v.storage))||!entry({
         key:v.key,bytes:v.bytes,sha256:v.sha256,
         ...(v.storageVersionId===undefined?{}:{storageVersionId:v.storageVersionId}),
       },v.storage as 'local'|'s3')){errors.push('INVALID_DB_VERSION');continue;}
    if(vm.has(v.key as string))errors.push('DUPLICATE_VERSION');
    vm.set(v.key as string,v);
  }
  for(const l of locations){
    if(!shape(l,['id','currentKey','nextVersion'])||!id(l.id,'L')||
       !(l.currentKey===null||id(l.currentKey,'V'))||!count(l.nextVersion,1)){
      errors.push('INVALID_LOCATION');continue;}
    if(lm.has(l.id as string))errors.push('DUPLICATE_LOCATION');
    lm.set(l.id as string,l);
  }
  for(const [items,map,kind] of [[locals,localMap,'local'],[s3s,s3Map,'s3']] as const){
    for(const v of items){
      if(!entry(v,kind)){errors.push('INVALID_OBJECT');continue;}
      if(map.has(v.key))errors.push('DUPLICATE_OBJECT');
      map.set(v.key,v);
    }
  }
  const maxima=new Map<string,number>();
  for(const [key,v] of vm){
    const locationId=v.locationId as string,kind=v.storage as 'local'|'s3';
    if(!lm.has(locationId))errors.push('LOCATION_MISSING');
    maxima.set(locationId,Math.max(maxima.get(locationId)||0,v.version as number));
    const f=(kind==='local'?localMap:s3Map).get(key);
    if(!f||f.bytes!==v.bytes||f.sha256!==v.sha256||
       (kind==='s3'&&f.storageVersionId!==v.storageVersionId))
      errors.push('DB_OBJECT_MISMATCH');
  }
  for(const [loc,l] of lm){
    if((l.nextVersion as number)<=(maxima.get(loc)||0))errors.push('VERSION_SEQUENCE_INVALID');
    if(l.currentKey!==null&&vm.get(l.currentKey as string)?.locationId!==loc)
      errors.push('CURRENT_OWNER_INVALID');
  }
  for(const key of localMap.keys())if(vm.get(key)?.storage!=='local')errors.push('ORPHAN_OBJECT');
  for(const key of s3Map.keys())if(vm.get(key)?.storage!=='s3')errors.push('ORPHAN_OBJECT');
  return answer(errors,vm.size,localMap.size,s3Map.size);
}
