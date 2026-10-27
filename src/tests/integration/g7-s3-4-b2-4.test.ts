import {describe,expect,test} from 'vitest';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {migrations} from '../helpers/database';
import {G7_S3_CAPABILITY,G7_S3_SCHEMA_ID} from '../../server/g7-operational/preflight';
import {inspectS34B24DisposableReplay} from '../../server/g7-operational/s3-4-b2-4';
import type {S34B2ImageRole} from '../../server/g7-operational/s3-4-b2-oci';

type SqliteDb={
  exec(sql:string):void;close():void;serialize():Buffer;
  prepare(sql:string):{
    run(...args:(string|number|null)[]):unknown;
    get(...args:(string|number|null)[]):Record<string,unknown>|undefined;
    all(...args:(string|number|null)[]):Record<string,unknown>[];
  };
};
const SQLite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>SqliteDb;
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const sha=(b:Buffer)=>'sha256:'+digest(b);
const dir=path.resolve(process.cwd(),'deploy/g7-s3/prisma/migrations');
const sql=(name:string)=>readFileSync(path.join(dir,name,'migration.sql'),'utf8');
const loc='11111111-1111-4111-8111-111111111111';
const localId='22222222-2222-4222-8222-222222222222';
const s3Id='33333333-3333-4333-8333-333333333333';
const objectId='66666666-6666-4666-8666-666666666666';
const localBytes=Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');
const s3Bytes=Buffer.from('SYNTHETIC_EXPORTED_S3_DWG');
const snap='SNAP-fixture-replay',epoch='E-fixture-replay';
const markerRaw=Buffer.from(JSON.stringify({
  scope:'G7-S3-4B2-4-DISPOSABLE-MARKER',snapshotId:snap,sourceEpoch:epoch,
}));
const commitCurrent='a'.repeat(40),commitRollback='b'.repeat(40);
const roles:readonly S34B2ImageRole[]=['app','migrator','rollbackApp','rollbackMigrator'];
function artifact(role:S34B2ImageRole){
  const back=role.startsWith('rollback');
  const configRaw=Buffer.from(JSON.stringify({
    architecture:'amd64',os:'linux',config:{Labels:{
      'org.opencontainers.image.revision':back?commitRollback:commitCurrent,
      'org.opencontainers.image.version':back?'0.42.1':'0.43.0',
      'com.planner77.g7.schema-id':back?'CAD_BASELINE':G7_S3_SCHEMA_ID,
      'com.planner77.g7.capability':back?'CAD_BASELINE':G7_S3_CAPABILITY,
      'com.planner77.g7.image-role':role,
    }},
  }));
  const manifestRaw=Buffer.from(JSON.stringify({
    schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',
    config:{mediaType:'application/vnd.oci.image.config.v1+json',
      size:configRaw.length,digest:sha(configRaw)},
    layers:[{mediaType:'application/vnd.oci.image.layer.v1.tar+gzip',
      size:100,digest:sha(Buffer.from('layer-'+role))}],
  }));
  return {role,immutableRef:'ghcr.io/planner77/layoutmanager@'+sha(manifestRaw),
    configRaw,manifestRaw};
}
function seed(db:SqliteDb){
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu','Synthetic');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)')
    .run('p','bu','Product');
  db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
    .run('s','p','Site','SITE');
  db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
    .run('b','s','Building');
  db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,?)')
    .run(loc,'b','Floor',3);
  const insert=db.prepare('INSERT INTO "CadFileVersion"'+
    '(id,location_id,version,original_filename,description,delete_password_hash,'+
    'file_format,file_size,sha256,storage_path,registered_at)'+
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  insert.run(localId,loc,1,'local.dxf','','scrypt$synthetic',
    'DXF',localBytes.length,digest(localBytes),loc+'/'+localId+'/original.dxf','2026-10-28');
  insert.run(s3Id,loc,2,'export.dwg','','scrypt$synthetic',
    'DWG',s3Bytes.length,digest(s3Bytes),
    's3:fixture-bucket:cad/'+objectId+'/original.dwg','2026-10-28');
  db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?')
    .run(localId,loc);
}
function images(){
  return {sourceCommit:commitCurrent,version:'0.43.0',
    rollbackSourceCommit:commitRollback,rollbackVersion:'0.42.1',
    artifacts:roles.map(artifact)};
}
function fixture(modifyCandidate?:(db:SqliteDb)=>void){
  const db=new SQLite(':memory:');
  let baseline:Buffer,candidate:Buffer;
  try{
    for(const migration of migrations)db.exec(sql(migration));
    seed(db);
    baseline=db.serialize();
    db.exec(sql(G7_S3_SCHEMA_ID));
    modifyCandidate?.(db);
    candidate=db.serialize();
  }finally{db.close();}
  const objects=()=>[
    {dbVersionId:localId,storage:'local' as const,
      storagePath:loc+'/'+localId+'/original.dxf',bytes:Buffer.from(localBytes)},
    {dbVersionId:s3Id,storage:'s3' as const,
      storagePath:'s3:fixture-bucket:cad/'+objectId+'/original.dwg',
      storageVersionId:'fixture+S3/V2',bytes:Buffer.from(s3Bytes)},
  ];
  const stage=(sqliteBytes:Buffer)=>({
    snapshotId:snap,sourceEpoch:epoch,sqliteBytes:Buffer.from(sqliteBytes),
    objects:objects(),markerBytes:Buffer.from(markerRaw),
    markerVersionId:'fixture+marker-v3',
  });
  return {scope:'G7-S3-4B2-4-DISPOSABLE-REPLAY',snapshotId:snap,
    sourceEpoch:epoch,imagePair:images(),source:stage(baseline),
    candidate:stage(candidate),rollback:stage(baseline)};
}
function blocked(packet:unknown,reason:string){
  const r=inspectS34B24DisposableReplay(packet);
  expect(r.state,r.reasons.join(',')).toBe('BLOCKED');
  expect(r.reasons).toContain(reason);
  expect(r).toMatchObject({
    rollbackCompatible:false,registryVerified:false,provenanceVerified:false,
    sourceSnapshotVerified:false,sameSnapshotRestored:false,
    restoreExecuted:false,rollbackExecuted:false,
    operationalGo:false,runtimeActivated:false,
  });
}
describe('#142 B2-4 disposable same-SNAP restore/rollback replay: never field proof',()=>{
  test('matching independent synthetic OCI/candidate/rollback buffers still have GO=false',()=>{
    const r=inspectS34B24DisposableReplay(fixture());
    expect(r).toMatchObject({
      state:'DISPOSABLE_REPLAY_MATCH_NOT_SITE_PROOF',reasons:[],
      versionsCompared:2,localObjectsCompared:1,s3ObjectsCompared:1,
      fourOciRolesLocallyConsistent:true,
      registryVerified:false,provenanceVerified:false,rollbackCompatible:false,
      writerQuiescenceVerified:false,sourceSnapshotVerified:false,
      sameSnapshotRestored:false,restoreExecuted:false,rollbackExecuted:false,
      operationalGo:false,runtimeActivated:false,
    });
  });
  test('changed candidate SQLite CAD Version SHA, Current, FK or candidate Schema blocks',()=>{
    blocked(fixture(db=>db.prepare('UPDATE "CadFileVersion" SET sha256=? WHERE id=?')
      .run('a'.repeat(64),s3Id)),'CANDIDATE_INVARIANTS_BLOCKED');
    blocked(fixture(db=>db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?')
      .run(s3Id,loc)),'CANDIDATE_INVARIANTS_BLOCKED');
    blocked(fixture(db=>{
      db.exec('PRAGMA foreign_keys=OFF');
      db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
        .run('unknown','s',0);
    }),'CANDIDATE_INVARIANTS_BLOCKED');
    blocked(fixture(db=>db.exec('DROP TABLE "G3LoginAttempt"')),
      'CANDIDATE_INVARIANTS_BLOCKED');
  });
  test('candidate interrupted before seventh migration cannot count as restored',()=>{
    const p=fixture();
    p.candidate.sqliteBytes=Buffer.from(p.source.sqliteBytes);
    blocked(p,'CANDIDATE_INVARIANTS_BLOCKED');
  });
  test('rollback SQLite must equal original byte-for-byte, not only declared SNAP',()=>{
    const p=fixture();
    p.rollback.sqliteBytes=Buffer.from(p.candidate.sqliteBytes);
    blocked(p,'ROLLBACK_SQLITE_BYTES_MISMATCH');
    const bad=fixture();
    bad.rollback.sqliteBytes[bad.rollback.sqliteBytes.length-1]^=1;
    blocked(bad,'ROLLBACK_SQLITE_BYTES_MISMATCH');
  });
  test('Local or S3 payload mutated in candidate or rollback is blocked',()=>{
    const a=fixture();
    a.candidate.objects[0].bytes=Buffer.from('candidate-corrupt');
    blocked(a,'CANDIDATE_OBJECT_MISMATCH');
    const b=fixture();
    b.rollback.objects[1].bytes=Buffer.from('rollback-corrupt');
    blocked(b,'ROLLBACK_OBJECT_MISMATCH');
  });
  test('missing, duplicate or swapped S3 Version claim cannot fake restoration',()=>{
    const p=fixture();
    p.rollback.objects.pop();
    blocked(p,'INVALID_DISPOSABLE_REPLAY_PACKET');
    const dup=fixture();
    dup.source.objects[1].dbVersionId=localId;
    blocked(dup,'SOURCE_OBJECT_DUPLICATED');
    const version=fixture();
    version.candidate.objects[1].storageVersionId='different-version';
    blocked(version,'CANDIDATE_OBJECT_MISMATCH');
  });
  test('one SNAP/Epoch, complete S3 marker and immutable marker claim required',()=>{
    const changed=fixture();changed.candidate.snapshotId='SNAP-other';
    blocked(changed,'SNAPSHOT_EPOCH_MISMATCH');
    const epochChanged=fixture();epochChanged.rollback.sourceEpoch='E-other';
    blocked(epochChanged,'SNAPSHOT_EPOCH_MISMATCH');
    const marker=fixture();marker.candidate.markerBytes=Buffer.from('{}');
    blocked(marker,'S3_MARKER_MISMATCH');
    const markerClaim=fixture();markerClaim.rollback.markerVersionId='different-version';
    blocked(markerClaim,'S3_MARKER_MISMATCH');
  });
  test('OCI mutable/tag-only refs or incompatible pair claims fail closed',()=>{
    const tag=fixture();
    tag.imagePair.artifacts[0].immutableRef='ghcr.io/planner77/layoutmanager:latest';
    blocked(tag,'OFFLINE_OCI_PAIR_BLOCKED');
    const schema=fixture();schema.imagePair.rollbackSourceCommit=commitCurrent;
    schema.imagePair.rollbackVersion='0.43.0';
    blocked(schema,'OFFLINE_OCI_PAIR_BLOCKED');
    const omitted=fixture();omitted.imagePair.artifacts.pop();
    blocked(omitted,'OFFLINE_OCI_PAIR_BLOCKED');
  });
  test('unexpected production pathname, invalid SQLite or malicious marker is refused',()=>{
    blocked({...fixture(),operatingDatabasePath:'/srv/cad/prod.sqlite'},
      'INVALID_DISPOSABLE_REPLAY_PACKET');
    const invalid=fixture();invalid.source.sqliteBytes=Buffer.from('invalid sqlite');
    blocked(invalid,'INVALID_DISPOSABLE_REPLAY_PACKET');
    const badMarker=fixture();
    badMarker.source.markerBytes=Buffer.from(JSON.stringify({
      scope:'G7-S3-4B2-4-DISPOSABLE-MARKER',snapshotId:'SNAP-another',
      sourceEpoch:epoch,
    }));
    blocked(badMarker,'S3_MARKER_MISMATCH');
  });
});
