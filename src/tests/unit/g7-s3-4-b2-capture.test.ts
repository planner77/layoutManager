import {describe,expect,test} from 'vitest';
import {assessS34B22CapturePacket} from '../../server/g7-operational/s3-4-b2-capture';

function fixture(){
  const snapshotId='SNAP-synthetic-barrier',sourceEpoch='E-source101',
    base={snapshotId,sourceEpoch};
  const v1={key:'V-local100',locationId:'L-zone100',version:1,storage:'local',
    bytes:10,sha256:'a'.repeat(64)};
  const v2={key:'V-s3item100',locationId:'L-zone100',version:2,storage:'s3',
    bytes:20,sha256:'b'.repeat(64),storageVersionId:'S3version00001'};
  // A tuple keeps the S3-only version ID on index 1 when negative tests mutate it.
  const versions:[typeof v1,typeof v2]=[v1,v2];
  return {scope:'G7-S3-4B2-CAPTURE',schemaVersion:1,snapshotId,
    operatorId:'OP-person001',changeRequestId:'CR-change001',
    barrier:{id:'BAR-holder001',quiescedUtc:'2026-10-27T10:00:00.000Z',
      resumedUtc:'2026-10-27T10:00:06.000Z',epochBefore:sourceEpoch,
      epochAfter:sourceEpoch,activeWriters:0,writesDuringCapture:0,leaseClaimed:true},
    sqlite:{...base,startedUtc:'2026-10-27T10:00:01.000Z',
      finishedUtc:'2026-10-27T10:00:02.000Z',backupSha256:'c'.repeat(64),
      quickCheck:'ok',foreignKeyViolations:0,currentOwnerViolations:0,
      auditInvariantViolations:0,locations:[{id:'L-zone100',
        currentKey:'V-local100',nextVersion:3}],versions},
    local:{...base,startedUtc:'2026-10-27T10:00:02.000Z',
      finishedUtc:'2026-10-27T10:00:03.000Z',
      objects:[{key:v1.key,bytes:v1.bytes,sha256:v1.sha256}]},
    s3:{...base,startedUtc:'2026-10-27T10:00:03.000Z',
      finishedUtc:'2026-10-27T10:00:04.000Z',
      markerSnapshotId:snapshotId,markerVersionId:'versionMarker001',
      objects:[{key:v2.key,bytes:v2.bytes,sha256:v2.sha256,
        storageVersionId:v2.storageVersionId}]},
  };
}
describe('#142 B2-2A supplied capture/barrier packet, never source proof',()=>{
  test('internally consistent synthetic claim never establishes actual writer freeze or restore',()=>{
    const r=assessS34B22CapturePacket(fixture());
    expect(r).toMatchObject({state:'CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF',
      versions:2,localCount:1,s3Count:1,writerQuiescenceVerified:false,
      sameSnapshotVerified:false,bytesVerified:false,provenanceVerified:false,
      operationalGo:false,runtimeActivated:false});
  });
  test('missing writer lease, concurrent writes, or source epoch change all BLOCK',()=>{
    const p=fixture();p.barrier.writesDuringCapture=1;
    expect(assessS34B22CapturePacket(p).reasons).toContain('BARRIER_NOT_PROVEN');
    const b=fixture();b.barrier.leaseClaimed=false;
    expect(assessS34B22CapturePacket(b).state).toBe('BLOCKED');
    const c=fixture();c.barrier.epochAfter='E-changed99';
    expect(assessS34B22CapturePacket(c).state).toBe('BLOCKED');
  });
  test('capture before barrier or after writers restart is blocked',()=>{
    const p=fixture();p.s3.finishedUtc='2026-10-27T10:00:07.000Z';
    expect(assessS34B22CapturePacket(p).reasons).toContain('SNAPSHOT_INTERVAL_OR_SOURCE_MISMATCH');
    const q=fixture();q.local.startedUtc='2026-10-27T09:59:59.000Z';
    expect(assessS34B22CapturePacket(q).state).toBe('BLOCKED');
  });
  test('no S3 versioned marker, or different snapshot ID is blocked',()=>{
    const p=fixture();p.s3.markerVersionId='';
    expect(assessS34B22CapturePacket(p).reasons).toContain('SNAPSHOT_INTERVAL_OR_SOURCE_MISMATCH');
    const q=fixture();q.s3.markerSnapshotId='SNAP-different';
    expect(assessS34B22CapturePacket(q).state).toBe('BLOCKED');
  });
  test('local/S3 hash, byte count or immutable S3 version mismatch blocks',()=>{
    const p=fixture();p.local.objects[0].sha256='d'.repeat(64);
    expect(assessS34B22CapturePacket(p).reasons).toContain('DB_OBJECT_MISMATCH');
    const q=fixture();q.s3.objects[0].storageVersionId='changedVersion99';
    expect(assessS34B22CapturePacket(q).reasons).toContain('DB_OBJECT_MISMATCH');
    const r=fixture();r.s3.objects[0].bytes=999;
    expect(assessS34B22CapturePacket(r).state).toBe('BLOCKED');
  });
  test('broken Current ownership or Version sequence blocks',()=>{
    const p=fixture();p.sqlite.locations[0].nextVersion=2;
    expect(assessS34B22CapturePacket(p).reasons).toContain('VERSION_SEQUENCE_INVALID');
    const q=fixture();q.sqlite.locations[0].currentKey='V-unknown99';
    expect(assessS34B22CapturePacket(q).reasons).toContain('CURRENT_OWNER_INVALID');
  });
  test('different opaque keys cannot repeat a Version number in one location',()=>{
    const p=fixture();p.sqlite.versions[1].version=1;
    expect(assessS34B22CapturePacket(p).reasons).toContain('DUPLICATE_LOCATION_VERSION');
    const q=fixture();q.sqlite.versions[1].locationId='L-other100';
    q.sqlite.versions[1].version=1;
    q.sqlite.locations.push({id:'L-other100',currentKey:'V-s3item100',nextVersion:2});
    expect(assessS34B22CapturePacket(q).state).toBe('CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF');
  });
  test('S3 object and marker Version IDs accept opaque UTF-8 up to 1024 bytes',()=>{
    const p=fixture(),versionId='3/L4kqtJlcpXroDTDmJ+rmSpX=Id';
    p.sqlite.versions[1].storageVersionId=versionId;
    p.s3.objects[0].storageVersionId=versionId;
    p.s3.markerVersionId='marker+/=id';
    expect(assessS34B22CapturePacket(p).state).toBe('CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF');
    const boundary=fixture(),large='é'.repeat(512);
    boundary.sqlite.versions[1].storageVersionId=large;
    boundary.s3.objects[0].storageVersionId=large;
    boundary.s3.markerVersionId=large;
    expect(assessS34B22CapturePacket(boundary).state).toBe('CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF');
  });
  test('S3 null, >1024-byte and invalid UTF-8 IDs BLOCK for marker and assets',()=>{
    const marker=fixture();marker.s3.markerVersionId='null';
    expect(assessS34B22CapturePacket(marker).reasons).toContain('SNAPSHOT_INTERVAL_OR_SOURCE_MISMATCH');
    const item=fixture();item.sqlite.versions[1].storageVersionId='null';
    item.s3.objects[0].storageVersionId='null';
    expect(assessS34B22CapturePacket(item).reasons).toContain('INVALID_DB_VERSION');
    const object=fixture();object.s3.objects[0].storageVersionId='a'.repeat(1025);
    expect(assessS34B22CapturePacket(object).reasons).toContain('INVALID_OBJECT');
    const longMarker=fixture();longMarker.s3.markerVersionId='a'.repeat(1025);
    expect(assessS34B22CapturePacket(longMarker).reasons).toContain('SNAPSHOT_INTERVAL_OR_SOURCE_MISMATCH');
    const malformed=fixture();malformed.s3.markerVersionId=String.fromCharCode(0xd800);
    expect(assessS34B22CapturePacket(malformed).state).toBe('BLOCKED');
  });
  test('foreign key and audit violations, incomplete inventory block',()=>{
    const p=fixture();p.sqlite.foreignKeyViolations=1;
    expect(assessS34B22CapturePacket(p).state).toBe('BLOCKED');
    const q=fixture();q.sqlite.auditInvariantViolations=1;
    expect(assessS34B22CapturePacket(q).state).toBe('BLOCKED');
    const r=fixture();r.local.objects.length=0;
    expect(assessS34B22CapturePacket(r).reasons).toContain('INVENTORY_BOUNDS');
  });
  test('unknown or duplicate asset and unexpected fields cannot pass',()=>{
    const p=fixture();
    p.local.objects.push({key:'V-orphan999',bytes:1,sha256:'e'.repeat(64)});
    expect(assessS34B22CapturePacket(p).reasons).toContain('ORPHAN_OBJECT');
    const q={...fixture(),secrets:'unexpected'};
    expect(assessS34B22CapturePacket(q).reasons).toContain('INVALID_PACKET');
    const dup=fixture();dup.local.objects.push({...dup.local.objects[0]});
    expect(assessS34B22CapturePacket(dup).reasons).toContain('DUPLICATE_OBJECT');
  });
});
