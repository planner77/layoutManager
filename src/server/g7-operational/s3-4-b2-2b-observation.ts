/**
 * #142 S3-4-B2-2B: inspect independently supplied, DISPOSABLE byte copies.
 *
 * This module takes Buffers, never file paths, sockets or credentials. Even a
 * successful comparison cannot authenticate where those bytes came from,
 * prove that production writers stopped, or verify S3 VersionId provenance.
 * It MUST NOT be used as an operational GO/restore/rollback decision.
 */
import { createHash } from 'node:crypto';
import { assessS34B22CapturePacket } from './s3-4-b2-capture';
import { openS34B1MemoryClone } from './s3-4-b-clone';

type Dict = Record<string, unknown>;
type ClaimLocation = { id: string; currentKey: string | null; nextVersion: number };
type ClaimVersion = {
  key: string; locationId: string; version: number; storage: 'local' | 's3';
  bytes: number; sha256: string; storageVersionId?: string;
};
type ClaimObject = { key: string; bytes: number; sha256: string; storageVersionId?: string };
type Packet = {
  snapshotId: string;
  barrier: { epochBefore: string };
  sqlite: { backupSha256: string; locations: ClaimLocation[]; versions: ClaimVersion[] };
  local: { objects: ClaimObject[] };
  s3: { markerSnapshotId: string; markerVersionId: string; objects: ClaimObject[] };
};
type LocationBinding = { key: string; dbLocationId: string };
type ObservedObject = {
  key: string; dbVersionId: string; locationKey: string;
  storage: 'local' | 's3'; bytes: Buffer; storageVersionId?: string;
  // Unlike a local CAD locator, S3 object UUID is allocated independently
  // of the CadFileVersion DB UUID. Only synthetic/disposable source claims.
  s3ObjectLocator?: string;
};
type IsolatedBundle = {
  scope: 'G7-S3-4B2-B2B-DISPOSABLE-BYTES';
  snapshotId: string; sourceEpoch: string; sqliteBytes: Buffer;
  locations: LocationBinding[]; objects: ObservedObject[];
  marker: { versionId: string; bytes: Buffer };
};
export type S34B22BResult = Readonly<{
  state: 'BLOCKED' | 'DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF';
  reasons: readonly string[]; dbVersions: number; localBytesCompared: number;
  s3BytesCompared: number; isolatedBytesCompared: boolean;
  writerQuiescenceVerified: false; sameSnapshotVerified: false;
  sourceObjectVersionsVerified: false; provenanceVerified: false;
  operationalGo: false; runtimeActivated: false;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE = /^(?:L|V)-[A-Za-z0-9_-]{2,64}$/;
const HASH = /^[0-9a-f]{64}$/;
// Match S3ObjectStorage's stored locator grammar; no URLs, file paths or I/O.
const S3_LOCATOR = /^s3:([a-z0-9][a-z0-9.-]{1,61}[a-z0-9]):cad\/([0-9a-f-]{36})\/original\.(dxf|dwg)$/;
function validS3Locator(raw: unknown): raw is string {
  if(typeof raw!=='string')return false;
  const matched=S3_LOCATOR.exec(raw);
  return Boolean(matched&&UUID.test(matched[2]));
}
const MAX_DB_BYTES = 128 * 1024 * 1024;
const MAX_CAD_BYTES = 110 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const AUTH_TABLES = [
  'User', 'UserRoleGrant', 'UserSiteGrant', 'SpecialGrant',
  'AuthSession', 'AuditEvent', 'AdminRecoveryNonce', 'G3LoginAttempt',
];
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
function plain(value: unknown): value is Dict {
  return value!==null && typeof value==='object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value)===Object.prototype;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[]=[]): value is Dict {
  return plain(value) && required.every(k=>Object.hasOwn(value,k)) &&
    Object.keys(value).every(k=>required.includes(k)||optional.includes(k));
}
function result(errors: string[], versions=0, local=0, s3=0): S34B22BResult {
  const reasons=[...new Set(errors)].sort();
  return { state: reasons.length ? 'BLOCKED' : 'DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF',
    reasons, dbVersions: versions, localBytesCompared: local, s3BytesCompared: s3,
    isolatedBytesCompared: reasons.length===0,
    writerQuiescenceVerified:false, sameSnapshotVerified:false,
    sourceObjectVersionsVerified:false, provenanceVerified:false,
    operationalGo:false, runtimeActivated:false };
}
function verifiedBuffer(value: unknown, max: number): value is Buffer {
  return Buffer.isBuffer(value) && value.length>0 && value.length<=max;
}
function validBundle(value: unknown): value is IsolatedBundle {
  if(!exact(value,['scope','snapshotId','sourceEpoch','sqliteBytes','locations','objects','marker'])||
    value.scope!=='G7-S3-4B2-B2B-DISPOSABLE-BYTES' ||
    typeof value.snapshotId!=='string'||typeof value.sourceEpoch!=='string'||
    !verifiedBuffer(value.sqliteBytes,MAX_DB_BYTES)||
    !Array.isArray(value.locations)||!Array.isArray(value.objects)||
    !exact(value.marker,['versionId','bytes'])||
    typeof value.marker.versionId!=='string'||
    !verifiedBuffer(value.marker.bytes,4096)) return false;
  if(value.locations.length<1||value.locations.length>10000||
     value.objects.length<2||value.objects.length>10000)return false;
  let total=value.sqliteBytes.length+value.marker.bytes.length;
  for(const location of value.locations){
    if(!exact(location,['key','dbLocationId'])||
       typeof location.key!=='string'||!OPAQUE.test(location.key)||!location.key.startsWith('L-')||
       typeof location.dbLocationId!=='string'||!UUID.test(location.dbLocationId))return false;
  }
  for(const object of value.objects){
    if(!exact(object,['key','dbVersionId','locationKey','storage','bytes'],
      ['storageVersionId','s3ObjectLocator'])||
      typeof object.key!=='string'||!OPAQUE.test(object.key)||!object.key.startsWith('V-')||
      typeof object.locationKey!=='string'||!OPAQUE.test(object.locationKey)||
      !object.locationKey.startsWith('L-')||
      typeof object.dbVersionId!=='string'||!UUID.test(object.dbVersionId)||
      (object.storage!=='local'&&object.storage!=='s3')||
      !verifiedBuffer(object.bytes,MAX_CAD_BYTES)||
      (object.storage==='local'
        ? object.storageVersionId!==undefined||object.s3ObjectLocator!==undefined
        : typeof object.storageVersionId!=='string'||
          !validS3Locator(object.s3ObjectLocator)))return false;
    total+=object.bytes.length;
    if(total>MAX_TOTAL_BYTES)return false;
  }
  return true;
}
function markerConsistent(marker: Buffer,snapshotId:string,epoch:string):boolean {
  try {
    const parsed:unknown=JSON.parse(marker.toString('utf8'));
    return exact(parsed,['scope','snapshotId','sourceEpoch']) &&
      parsed.scope==='G7-S3-4B2-B2B-DISPOSABLE-MARKER' &&
      parsed.snapshotId===snapshotId && parsed.sourceEpoch===epoch;
  }catch{return false;}
}
function locatorMatches(raw: unknown, kind:'local'|'s3',locationId:string,
  versionId:string,format:unknown,s3ObjectLocator?:string):boolean {
  if(typeof raw!=='string'||typeof format!=='string')return false;
  const ext=format.toLowerCase();
  if(ext!=='dxf'&&ext!=='dwg')return false;
  if(kind==='local')return raw===locationId+'/'+versionId+'/original.'+ext;
  const match=S3_LOCATOR.exec(raw);
  // S3ObjectStorage.prepare() chooses its own UUID before DB registration
  // assigns versionId. Compare with the independently supplied S3 locator,
  // not with the unrelated CadFileVersion UUID.
  return Boolean(match&&UUID.test(match[2])&&match[3]===ext&&
    raw===s3ObjectLocator);
}
/**
 * Compare true in-memory SQLite/asset bytes against a separate B2-2A packet.
 * Inputs may be fabricated: positive results are ONLY disposable rehearsals.
 */
export function inspectS34B22BDisposableBytes(rawPacket:unknown,rawBundle:unknown):S34B22BResult {
  if(assessS34B22CapturePacket(rawPacket).state!=='CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF')
    return result(['CAPTURE_PACKET_BLOCKED']);
  if(!validBundle(rawBundle))return result(['INVALID_DISPOSABLE_BUNDLE']);
  const packet=rawPacket as Packet;
  const bundle=rawBundle;
  const errors:string[]=[];
  if(bundle.snapshotId!==packet.snapshotId||bundle.sourceEpoch!==packet.barrier.epochBefore)
    errors.push('SNAPSHOT_EPOCH_MISMATCH');
  if(bundle.marker.versionId!==packet.s3.markerVersionId ||
     !markerConsistent(bundle.marker.bytes,packet.snapshotId,packet.barrier.epochBefore))
    errors.push('MARKER_BYTES_OR_VERSION_MISMATCH');
  if(!HASH.test(packet.sqlite.backupSha256)||
      digest(bundle.sqliteBytes)!==packet.sqlite.backupSha256)
    errors.push('SQLITE_BACKUP_DIGEST_MISMATCH');

  const locationMap=new Map<string,string>(),locationIds=new Set<string>();
  for(const l of bundle.locations){
    if(locationMap.has(l.key)||locationIds.has(l.dbLocationId))
      errors.push('DUPLICATE_PRIVATE_LOCATION_BINDING');
    locationMap.set(l.key,l.dbLocationId);
    locationIds.add(l.dbLocationId);
  }
  const claimLocations=new Map(packet.sqlite.locations.map(l=>[l.id,l]));
  if(locationMap.size!==claimLocations.size ||
     [...locationMap.keys()].some(k=>!claimLocations.has(k)))
    errors.push('LOCATION_INVENTORY_INCOMPLETE');

  const claimVersions=new Map(packet.sqlite.versions.map(v=>[v.key,v]));
  const localClaims=new Map(packet.local.objects.map(v=>[v.key,v]));
  const s3Claims=new Map(packet.s3.objects.map(v=>[v.key,v]));
  const observed=new Map<string,ObservedObject>(),dbVersionIds=new Set<string>();
  let local=0,s3=0;
  for(const obj of bundle.objects){
    if(observed.has(obj.key)||dbVersionIds.has(obj.dbVersionId))
      errors.push('DUPLICATE_PRIVATE_VERSION_BINDING');
    observed.set(obj.key,obj);
    dbVersionIds.add(obj.dbVersionId);
    const claim=claimVersions.get(obj.key);
    const payload=(obj.storage==='local'?localClaims:s3Claims).get(obj.key);
    if(!claim||!payload||claim.storage!==obj.storage||
       claim.locationId!==obj.locationKey||
       !locationMap.has(obj.locationKey))
      {errors.push('VERSION_INVENTORY_INCOMPLETE');continue;}
    if(claim.bytes!==obj.bytes.length||claim.sha256!==digest(obj.bytes)||
       payload.bytes!==obj.bytes.length||payload.sha256!==digest(obj.bytes))
      errors.push('INDEPENDENT_PAYLOAD_BYTES_MISMATCH');
    if(obj.storage==='local')local++;
    else {
      s3++;
      if(obj.storageVersionId!==claim.storageVersionId||
         obj.storageVersionId!==payload.storageVersionId)
        errors.push('S3_VERSION_CLAIM_MISMATCH');
    }
  }
  if(observed.size!==claimVersions.size||local!==packet.local.objects.length||
     s3!==packet.s3.objects.length)
    errors.push('VERSION_INVENTORY_INCOMPLETE');

  let dbVersions=0;
  // Never interpret a supplied path. Open exactly the already supplied bytes
  // in a disposable in-memory SQLite handle; no filesystem/database writes.
  if(!errors.includes('SQLITE_BACKUP_DIGEST_MISMATCH')){
    try {
      const db=openS34B1MemoryClone(bundle.sqliteBytes);
      try {
        const quick=db.prepare('PRAGMA quick_check').all();
        if(quick.length!==1||quick[0]?.quick_check!=='ok')errors.push('SQLITE_QUICK_CHECK_FAILED');
        if(db.prepare('PRAGMA foreign_key_check').all().length!==0)
          errors.push('SQLITE_FOREIGN_KEY_VIOLATIONS');
        const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all().map(r=>String(r.name)));
        if(AUTH_TABLES.some(t=>tables.has(t)))errors.push('B2B_BASELINE_SCHEMA_ONLY');
        const locRows=db.prepare('SELECT id,current_version_id,next_version FROM "CadLocation"').all();
        const verRows=db.prepare('SELECT id,location_id,version,file_size,sha256,storage_path,file_format FROM "CadFileVersion"').all();
        dbVersions=verRows.length;
        if(locRows.length!==claimLocations.size||verRows.length!==claimVersions.size)
          errors.push('SQLITE_INVENTORY_INCOMPLETE');
        const locationsById=new Map(locRows.map(r=>[String(r.id),r]));
        const versionsById=new Map(verRows.map(r=>[String(r.id),r]));
        if(locationsById.size!==locRows.length||versionsById.size!==verRows.length)
          errors.push('SQLITE_INVENTORY_DUPLICATED');
        for(const [key,loc] of claimLocations){
          const physicalId=locationMap.get(key);
          const row=physicalId===undefined?undefined:locationsById.get(physicalId);
          const current=loc.currentKey===null?null:observed.get(loc.currentKey)?.dbVersionId;
          if(!row||row.next_version!==loc.nextVersion||
             row.current_version_id!==current)
            errors.push('SQLITE_CURRENT_OR_SEQUENCE_MISMATCH');
        }
        for(const [key,claim] of claimVersions){
          const item=observed.get(key);
          const row=item===undefined?undefined:versionsById.get(item.dbVersionId);
          const locationId=locationMap.get(claim.locationId);
          if(!row||!item||!locationId||row.location_id!==locationId||
             row.version!==claim.version||row.file_size!==claim.bytes||
             row.sha256!==claim.sha256||
             !locatorMatches(row.storage_path,claim.storage,locationId,
               item.dbVersionId,row.file_format,item.s3ObjectLocator))
            errors.push('SQLITE_VERSION_OR_LOCATOR_MISMATCH');
        }
        if([...locationsById.keys()].some(k=>!locationIds.has(k))||
           [...versionsById.keys()].some(k=>!dbVersionIds.has(k)))
          errors.push('SQLITE_INVENTORY_INCOMPLETE');
      }finally{db.close();}
    }catch{errors.push('ISOLATED_SQLITE_UNREADABLE');}
  }
  return result(errors,dbVersions,local,s3);
}
