/** RR2-only Browser Job/READY fixture on an actual 0.60 installed volume.
 * Requires a real preceding HTTP upload and exact owned-volume marker. This
 * adds historical Scene data only; installation manifest/schema are untouched.
 */
import Database from 'better-sqlite3';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {CAD_SCENE_BUILDER,sceneScope,sceneIdentity,createSceneRef,importedId}
  from '../domain/cad-scene.ts';
import {SceneBlobStorage} from '../server/storage/scene-storage.ts';
import {SceneRepository} from '../server/scene/scene-repository.ts';
import {createDb} from '../server/db.ts';

const nonce=process.env.RR2_NONCE;
if(!/^[0-9a-f]{16}$/.test(nonce??''))throw Error('RR2_NONCE_INVALID');
const marker='/data/rr2-ownership.marker';
if(!existsSync(marker)||readFileSync(marker,'utf8')!=='RR2:'+nonce+'\n')
  throw Error('RR2_VOLUME_NOT_OWNED');
const state=JSON.parse(readFileSync('/app/src/scripts/rr2-old-fixture-input.json','utf8'));
if(state.kind!=='RR2_FIXTURE_INPUT'||state.nonce!==nonce)
  throw Error('RR2_HTTP_STATE_MISMATCH');
const dbPath='/data/db/cad.sqlite',cad='/data/cad';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=new Database(dbPath,{fileMustExist:true});raw.pragma('foreign_keys=ON');
let ready,queued;
try{
  ready=raw.prepare('SELECT * FROM "CadFileVersion" WHERE id=?').get(state.readyVersion);
  queued=raw.prepare('SELECT * FROM "CadFileVersion" WHERE id=?').get(state.queuedVersion);
  for(const row of [ready,queued]){
    if(!row||row.sha256!==state.sourceSha||
        !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.dxf$/.test(row.storage_path))
      throw Error('RR2_SOURCE_ROW_INVALID');
    const source=path.resolve(cad,row.storage_path);
    if(!source.startsWith(cad+path.sep)||hash(readFileSync(source))!==row.sha256)
      throw Error('RR2_SOURCE_BYTES_INVALID');
  }
  if(raw.prepare('SELECT count(*) AS n FROM "SceneBuildJob"').get().n!==0||
      raw.prepare('SELECT count(*) AS n FROM "SceneAsset"').get().n!==0)
    throw Error('RR2_FIXTURE_NOT_EMPTY');
}finally{raw.close();}

const scope=sceneScope(state.readyVersion,state.sourceSha,'UNSPECIFIED');
const sceneId=sceneIdentity(scope);
const ref=createSceneRef(scope,'DXF_IMPORTED',importedId(scope,[]),{treePath:[]});
const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const bytes=Buffer.from(JSON.stringify({schema:1,asset:{scope,sceneId,state:'READY',revision:0,
  objects:[{ref,treePath:[],kind:'Group',visible:true,transform:matrix,revision:0}]},
  root:{type:'Group',name:'rr2-browser-fixture',visible:true,matrix,ref,children:[]}}));
const assetId=randomUUID();
const manifest={scope,sceneId,format:'CUSTOM_DTO',state:'READY',revision:0,
  byteLength:bytes.length,sha256:hash(bytes)};
const storage=new SceneBlobStorage(cad,{CAD_STORAGE_BACKEND:'local'});
try{
  await storage.putVerified(storage.locator(assetId),bytes,hash(bytes));
}finally{storage.close();}
const jobs={ready:randomUUID(),queued:randomUUID()};
const now='2026-11-05T00:00:00.000Z';
const writable=new Database(dbPath,{fileMustExist:true});
writable.pragma('foreign_keys=ON');
try{
  writable.transaction(()=>{
    for(const [name,row,status,stage,attempt] of [
      ['ready',ready,'READY','PUBLISHED',1],
      ['queued',queued,'QUEUED','JOB_ENQUEUED',0],
    ]){
      writable.prepare('INSERT INTO "SceneBuildJob"(id,version_id,source_sha256,builder,payload_schema,actor_id,site_id,request_id,status,stage,attempt,due_at,started_at,finished_at,last_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(jobs[name],row.id,row.sha256,CAD_SCENE_BUILDER,2,state.editorId,state.ids.sites,
          'rr2-browser-'+name,status,stage,attempt,1,status==='READY'?2:null,
          status==='READY'?3:null,null,1,3);
    }
    writable.prepare('INSERT INTO "SceneAsset"(id,version_id,source_sha256,manifest_json,digest,byte_length,format,storage_locator) VALUES(?,?,?,?,?,?,?,?)')
      .run(assetId,state.readyVersion,state.sourceSha,JSON.stringify(manifest),hash(bytes),
        bytes.length,'CUSTOM_DTO',`scenes/${assetId}.json`);
    writable.prepare('INSERT INTO "CurrentScene"(version_id,asset_id,revision) VALUES(?,?,?)')
      .run(state.readyVersion,assetId,0);
    writable.prepare('INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(),state.editorId,null,state.ids.sites,'SCENE_PUBLISHED','VERSION',
        state.readyVersion,null,0,'SUCCESS',now,'rr2-browser-ready');
  })();
}finally{writable.close();}

const db=createDb('file:'+dbPath),reader=new SceneBlobStorage(cad,{CAD_STORAGE_BACKEND:'local'});
try{
  const repo=new SceneRepository(db,reader),status=await repo.status(state.readyVersion);
  if(status.status!=='READY'||status.assetId!==assetId||
      hash(await repo.content(state.readyVersion,assetId))!==hash(bytes))
    throw Error('RR2_BROWSER_READY_READBACK_FAILED');
}finally{reader.close();await db.$disconnect();}
writeFileSync('/data/rr2-browser-fixture.json',JSON.stringify({nonce,assetId,jobs,
  readyVersion:state.readyVersion,queuedVersion:state.queuedVersion,
  sceneSha:hash(bytes)}),{flag:'wx',mode:0o600});
process.stdout.write('RR2_BROWSER_FIXTURE_READY\n');
