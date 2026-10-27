import {describe,expect,test} from 'vitest';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {inspectS34B22BDisposableBytes} from '../../server/g7-operational/s3-4-b2-2b-observation';
import {assessS34B22CapturePacket} from '../../server/g7-operational/s3-4-b2-capture';

type SqliteDb = {exec(s:string):void;prepare(sql:string):{run(...args:(string|number|null)[]):unknown};
  serialize():Buffer;close():void};
const SQLite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>SqliteDb;
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const loc='11111111-1111-4111-8111-111111111111';
const localId='22222222-2222-4222-8222-222222222222';
const s3Id='33333333-3333-4333-8333-333333333333';
const s3ObjectId='66666666-6666-4666-8666-666666666666';
const unrelatedS3ObjectId='77777777-7777-4777-8777-777777777777';
const additionalS3VersionId='88888888-8888-4888-8888-888888888888';
const additionalS3ObjectId='99999999-9999-4999-8999-999999999999';
const orphanId='44444444-4444-4444-8444-444444444444';
const missingLocation='55555555-5555-4555-8555-555555555555';
const snap='SNAP-b2b-synthetic',epoch='E-synthetic101';
const markerScope='G7-S3-4B2-B2B-DISPOSABLE-MARKER';
const scope='G7-S3-4B2-B2B-DISPOSABLE-BYTES';
type ClaimVersion={key:string;locationId:string;version:number;storage:'local'|'s3';
  bytes:number;sha256:string;storageVersionId?:string};
type ObservedObject={key:string;dbVersionId:string;locationKey:string;
  storage:'local'|'s3';bytes:Buffer;storageVersionId?:string;
  s3ObjectLocator?:string};

function fixture(opts:{
  current?:'local'|'s3';nextVersion?:number;orphan?:boolean;
  includeAuth?:boolean;wrongSize?:boolean;
  additionalS3?:'duplicate'|'distinct';
}={}){
  const local=Buffer.from('synthetic-local-DXF');
  const s3=Buffer.from('synthetic-exported-S3-DWG');
  const versionId='3/L4kqtJlcpXroDTDmJ+rmSpX=Id',markerId='marker+001/Id';
  const db=new SQLite(':memory:');
  try{
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE "CadLocation"('+
      'id TEXT PRIMARY KEY,current_version_id TEXT,next_version INTEGER NOT NULL);'+
      'CREATE TABLE "CadFileVersion"('+
      'id TEXT PRIMARY KEY,location_id TEXT NOT NULL REFERENCES "CadLocation"(id),'+
      'version INTEGER NOT NULL,file_size INTEGER NOT NULL,sha256 TEXT NOT NULL,'+
      'storage_path TEXT NOT NULL,file_format TEXT NOT NULL,'+
      // The deliberate duplicate case emulates a copied/malformed SQLite DB
      // missing uq_storage_path, proving the verifier enforces it itself.
      'UNIQUE(location_id,version)'+
      (opts.additionalS3==='duplicate'?'':',UNIQUE(storage_path)')+');');
    db.prepare('INSERT INTO "CadLocation"(id,current_version_id,next_version) VALUES(?,?,?)')
      .run(loc,opts.current==='s3'?s3Id:localId,opts.nextVersion??(opts.additionalS3?4:3));
    const insert=db.prepare('INSERT INTO "CadFileVersion"'+
      '(id,location_id,version,file_size,sha256,storage_path,file_format)'+
      ' VALUES(?,?,?,?,?,?,?)');
    insert.run(localId,loc,1,opts.wrongSize?local.length+1:local.length,
      digest(local),loc+'/'+localId+'/original.dxf','DXF');
    insert.run(s3Id,loc,2,s3.length,digest(s3),
      's3:fixture-bucket:cad/'+s3ObjectId+'/original.dwg','DWG');
    if(opts.additionalS3){
      insert.run(additionalS3VersionId,loc,3,s3.length,digest(s3),
        's3:fixture-bucket:cad/'+(opts.additionalS3==='duplicate'
          ?s3ObjectId:additionalS3ObjectId)+'/original.dwg','DWG');
    }
    if(opts.orphan){
      db.exec('PRAGMA foreign_keys=OFF');
      insert.run(orphanId,missingLocation,3,local.length,digest(local),
        missingLocation+'/'+orphanId+'/original.dxf','DXF');
    }
    if(opts.includeAuth)db.exec('CREATE TABLE "AuthSession"(id TEXT PRIMARY KEY)');
    const sqliteBytes=db.serialize();
    const versions:ClaimVersion[]=[
      {key:'V-local100',locationId:'L-zone100',version:1,storage:'local',
        bytes:local.length,sha256:digest(local)},
      {key:'V-s3item100',locationId:'L-zone100',version:2,storage:'s3',
        bytes:s3.length,sha256:digest(s3),storageVersionId:versionId},
    ];
    if(opts.additionalS3)versions.push({
      key:'V-s3item200',locationId:'L-zone100',version:3,storage:'s3',
      bytes:s3.length,sha256:digest(s3),storageVersionId:versionId,
    });
    const packet={
      scope:'G7-S3-4B2-CAPTURE',schemaVersion:1,snapshotId:snap,
      operatorId:'OP-fixture01',changeRequestId:'CR-fixture01',
      barrier:{id:'BAR-fixture01',quiescedUtc:'2026-10-27T09:00:00.000Z',
        resumedUtc:'2026-10-27T09:00:09.000Z',epochBefore:epoch,epochAfter:epoch,
        activeWriters:0,writesDuringCapture:0,leaseClaimed:true},
      sqlite:{snapshotId:snap,sourceEpoch:epoch,startedUtc:'2026-10-27T09:00:01.000Z',
        finishedUtc:'2026-10-27T09:00:03.000Z',backupSha256:digest(sqliteBytes),
        quickCheck:'ok',foreignKeyViolations:0,currentOwnerViolations:0,
        auditInvariantViolations:0,
        locations:[{id:'L-zone100',currentKey:'V-local100',
          nextVersion:opts.additionalS3?4:3}],versions},
      local:{snapshotId:snap,sourceEpoch:epoch,startedUtc:'2026-10-27T09:00:03.000Z',
        finishedUtc:'2026-10-27T09:00:05.000Z',
        objects:[{key:'V-local100',bytes:local.length,sha256:digest(local)}]},
      s3:{snapshotId:snap,sourceEpoch:epoch,startedUtc:'2026-10-27T09:00:05.000Z',
        finishedUtc:'2026-10-27T09:00:07.000Z',markerSnapshotId:snap,
        markerVersionId:markerId,
        objects:[{key:'V-s3item100',bytes:s3.length,sha256:digest(s3),
          storageVersionId:versionId}]},
    };
    const objects:ObservedObject[]=[
      {key:'V-local100',dbVersionId:localId,locationKey:'L-zone100',
        storage:'local',bytes:Buffer.from(local)},
      {key:'V-s3item100',dbVersionId:s3Id,locationKey:'L-zone100',
        storage:'s3',bytes:Buffer.from(s3),storageVersionId:versionId,
        s3ObjectLocator:'s3:fixture-bucket:cad/'+s3ObjectId+'/original.dwg'},
    ];
    const observed={scope,snapshotId:snap,sourceEpoch:epoch,sqliteBytes,
      locations:[{key:'L-zone100',dbLocationId:loc}],objects,
      marker:{versionId:markerId,
        bytes:Buffer.from(JSON.stringify({scope:markerScope,snapshotId:snap,sourceEpoch:epoch}))},
    };
    if(opts.additionalS3){
      packet.s3.objects.push({
        key:'V-s3item200',bytes:s3.length,sha256:digest(s3),
        storageVersionId:versionId,
      });
      observed.objects.push({
        key:'V-s3item200',dbVersionId:additionalS3VersionId,
        locationKey:'L-zone100',storage:'s3',bytes:Buffer.from(s3),
        storageVersionId:versionId,
        s3ObjectLocator:'s3:fixture-bucket:cad/'+
          (opts.additionalS3==='duplicate'?s3ObjectId:additionalS3ObjectId)+
          '/original.dwg',
      });
    }
    return {packet,observed};
  }finally{db.close();}
}
function blocked(packet:unknown,observed:unknown,reason:string){
  const r=inspectS34B22BDisposableBytes(packet,observed);
  expect(r.state).toBe('BLOCKED');
  expect(r.reasons).toContain(reason);
  expect(r).toMatchObject({writerQuiescenceVerified:false,sameSnapshotVerified:false,
    sourceObjectVersionsVerified:false,provenanceVerified:false,
    operationalGo:false,runtimeActivated:false});
}
describe('#142 B2-2B disposable byte-only preflight; not production site proof',()=>{
  test('actual in-memory SQLite and local/S3-export buffers match a valid assertion packet',()=>{
    const {packet,observed}=fixture();
    expect(inspectS34B22BDisposableBytes(packet,observed)).toMatchObject({
      state:'DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF',reasons:[],dbVersions:2,
      localBytesCompared:1,s3BytesCompared:1,isolatedBytesCompared:true,
      writerQuiescenceVerified:false,sameSnapshotVerified:false,
      sourceObjectVersionsVerified:false,provenanceVerified:false,
      operationalGo:false,runtimeActivated:false,
    });
  });
  test('S3 upload UUID differs from DB Version UUID and still matches its independent locator',()=>{
    const {packet,observed}=fixture();
    expect(s3ObjectId).not.toBe(s3Id);
    expect(observed.objects[1].dbVersionId).toBe(s3Id);
    expect(observed.objects[1].s3ObjectLocator)
      .toBe('s3:fixture-bucket:cad/'+s3ObjectId+'/original.dwg');
    expect(inspectS34B22BDisposableBytes(packet,observed)).toMatchObject({
      state:'DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF',reasons:[],
      sourceObjectVersionsVerified:false,operationalGo:false,
    });
  });
  test('independent S3 objects and DB Version UUIDs allow two distinct locators',()=>{
    const {packet,observed}=fixture({additionalS3:'distinct'});
    expect(assessS34B22CapturePacket(packet).state)
      .toBe('CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF');
    expect(additionalS3ObjectId).not.toBe(additionalS3VersionId);
    expect(inspectS34B22BDisposableBytes(packet,observed)).toMatchObject({
      state:'DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF',
      reasons:[],dbVersions:3,localBytesCompared:1,s3BytesCompared:2,
      sourceObjectVersionsVerified:false,operationalGo:false,
    });
  });
  test('distinct Version bindings must not reuse the same S3 locator',()=>{
    const {packet,observed}=fixture({additionalS3:'duplicate'});
    // The B2-2A packet remains internally consistent: unique Version keys,
    // version numbers and matching SHA/size/object VersionId claims.
    expect(assessS34B22CapturePacket(packet).state)
      .toBe('CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF');
    expect(observed.objects[1].dbVersionId).not.toBe(observed.objects[2].dbVersionId);
    expect(observed.objects[1].s3ObjectLocator)
      .toBe(observed.objects[2].s3ObjectLocator);
    const result=inspectS34B22BDisposableBytes(packet,observed);
    expect(result).toMatchObject({
      state:'BLOCKED',reasons:['DUPLICATE_S3_LOCATOR'],
      dbVersions:3,localBytesCompared:1,s3BytesCompared:2,
      isolatedBytesCompared:false,sourceObjectVersionsVerified:false,
      sameSnapshotVerified:false,operationalGo:false,runtimeActivated:false,
    });
  });
  test('wrong independently mapped S3 locator UUID or bucket is BLOCKED',()=>{
    const wrongUuid=fixture();
    wrongUuid.observed.objects[1].s3ObjectLocator=
      's3:fixture-bucket:cad/'+unrelatedS3ObjectId+'/original.dwg';
    blocked(wrongUuid.packet,wrongUuid.observed,'SQLITE_VERSION_OR_LOCATOR_MISMATCH');
    const wrongBucket=fixture();
    wrongBucket.observed.objects[1].s3ObjectLocator=
      's3:other-bucket:cad/'+s3ObjectId+'/original.dwg';
    blocked(wrongBucket.packet,wrongBucket.observed,'SQLITE_VERSION_OR_LOCATOR_MISMATCH');
  });
  test('missing, malformed, or local object S3 locator claims fail closed',()=>{
    const missing=fixture();
    missing.observed.objects[1].s3ObjectLocator=undefined;
    blocked(missing.packet,missing.observed,'INVALID_DISPOSABLE_BUNDLE');
    const malformed=fixture();
    malformed.observed.objects[1].s3ObjectLocator=
      'https://fixture-bucket.example/cad/'+s3ObjectId+'/original.dwg';
    blocked(malformed.packet,malformed.observed,'INVALID_DISPOSABLE_BUNDLE');
    const badLocal=fixture();
    badLocal.observed.objects[0].s3ObjectLocator=
      's3:fixture-bucket:cad/'+s3ObjectId+'/original.dwg';
    blocked(badLocal.packet,badLocal.observed,'INVALID_DISPOSABLE_BUNDLE');
  });
  test('unproved writer-freeze claim cannot pass the B2-2A parent gate',()=>{
    const {packet,observed}=fixture();
    packet.barrier.writesDuringCapture=1;
    blocked(packet,observed,'CAPTURE_PACKET_BLOCKED');
  });
  test('changed SQLite backup byte fails independent digest',()=>{
    const {packet,observed}=fixture();
    observed.sqliteBytes=Buffer.concat([observed.sqliteBytes,Buffer.from('tamper')]);
    blocked(packet,observed,'SQLITE_BACKUP_DIGEST_MISMATCH');
  });
  test('forged invalid SQLite with matching digest still cannot be interpreted',()=>{
    const {packet,observed}=fixture();
    observed.sqliteBytes=Buffer.from('not an SQLite database');
    packet.sqlite.backupSha256=digest(observed.sqliteBytes);
    blocked(packet,observed,'ISOLATED_SQLITE_UNREADABLE');
  });
  test('independent CAD Local and S3-export byte tampering each block',()=>{
    const local=fixture();local.observed.objects[0].bytes=Buffer.from('damaged');
    blocked(local.packet,local.observed,'INDEPENDENT_PAYLOAD_BYTES_MISMATCH');
    const s3=fixture();s3.observed.objects[1].bytes=Buffer.from('replaced');
    blocked(s3.packet,s3.observed,'INDEPENDENT_PAYLOAD_BYTES_MISMATCH');
  });
  test('missing Version, extra duplicate and duplicate DB ID binding block',()=>{
    const missing=fixture();missing.observed.objects.pop();
    blocked(missing.packet,missing.observed,'INVALID_DISPOSABLE_BUNDLE');
    const duplicate=fixture();
    duplicate.observed.objects.push({...duplicate.observed.objects[1]});
    blocked(duplicate.packet,duplicate.observed,'DUPLICATE_PRIVATE_VERSION_BINDING');
    const swapped=fixture();
    swapped.observed.objects[1].dbVersionId=localId;
    blocked(swapped.packet,swapped.observed,'DUPLICATE_PRIVATE_VERSION_BINDING');
  });
  test('missing or wrong opaque-to-DB location mapping rejects false coverage',()=>{
    const missing=fixture();missing.observed.locations[0].key='L-other001';
    blocked(missing.packet,missing.observed,'LOCATION_INVENTORY_INCOMPLETE');
    const wrong=fixture();wrong.observed.locations[0].dbLocationId=missingLocation;
    blocked(wrong.packet,wrong.observed,'SQLITE_CURRENT_OR_SEQUENCE_MISMATCH');
  });
  test('DB current, nextVersion and row SHA/size are checked against real SQLite',()=>{
    const current=fixture({current:'s3'});
    blocked(current.packet,current.observed,'SQLITE_CURRENT_OR_SEQUENCE_MISMATCH');
    const next=fixture({nextVersion:99});
    blocked(next.packet,next.observed,'SQLITE_CURRENT_OR_SEQUENCE_MISMATCH');
    const bytes=fixture({wrongSize:true});
    blocked(bytes.packet,bytes.observed,'SQLITE_VERSION_OR_LOCATOR_MISMATCH');
  });
  test('SQLite foreign-key violations and unclaimed rows block',()=>{
    const f=fixture({orphan:true});
    blocked(f.packet,f.observed,'SQLITE_FOREIGN_KEY_VIOLATIONS');
    expect(inspectS34B22BDisposableBytes(f.packet,f.observed).reasons)
      .toContain('SQLITE_INVENTORY_INCOMPLETE');
  });
  test('G7 Auth candidate is not accepted as B2-2B CAD baseline',()=>{
    const f=fixture({includeAuth:true});
    blocked(f.packet,f.observed,'B2B_BASELINE_SCHEMA_ONLY');
  });
  test('S3 Version ID and marker are still untrusted but must be consistent',()=>{
    const version=fixture();version.observed.objects[1].storageVersionId='differentVersion';
    blocked(version.packet,version.observed,'S3_VERSION_CLAIM_MISMATCH');
    const marker=fixture();marker.observed.marker.versionId='differentMarker';
    blocked(marker.packet,marker.observed,'MARKER_BYTES_OR_VERSION_MISMATCH');
    const bytes=fixture();
    bytes.observed.marker.bytes=Buffer.from(JSON.stringify({
      scope:markerScope,snapshotId:'SNAP-foreign',sourceEpoch:epoch,
    }));
    blocked(bytes.packet,bytes.observed,'MARKER_BYTES_OR_VERSION_MISMATCH');
  });
  test('source epoch mismatch and suspicious fields cannot become site proof',()=>{
    const epochChanged=fixture();epochChanged.observed.sourceEpoch='E-changed123';
    blocked(epochChanged.packet,epochChanged.observed,'SNAPSHOT_EPOCH_MISMATCH');
    const bad=fixture();
    blocked(bad.packet,{...bad.observed,siteCredential:'not-allowed'},
      'INVALID_DISPOSABLE_BUNDLE');
    const r=inspectS34B22BDisposableBytes(bad.packet,bad.observed);
    expect(JSON.stringify(r)).not.toContain(loc);
    expect(JSON.stringify(r)).not.toContain('fixture-bucket');
  });
});
