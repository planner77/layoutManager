import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {sceneScope,createSceneRef,importedId} from '../../domain/cad-scene';
import {SceneWorkDocument} from '../../domain/scene-work';
import {IDENTITY_2D} from '../../domain/generated-document';
import {projectAffine,invertAffine,resolveMemoAnchor} from '../../domain/cad-memo-anchor';
import {resetRows,sameRevisionSnapshot} from '../../domain/cad-reset';
import {CAD_ANCHOR_DDL} from '../../server/cad-business/anchor-ddl';
import {CAD_BUSINESS_DDL} from '../../server/cad-business/schema-ddl';

const v='a550c84e-6783-4d30-b8a7-272bc6dd0a40',sha='c'.repeat(64);
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new (path:string)=>{exec:(sql:string)=>void;
 prepare:(sql:string)=>{get:()=>Record<string,unknown>};close:()=>void};
const uuid=(n:number)=>'197e1526-12a8-49c7-8187-'+n.toString(16).padStart(12,'0');
describe('#84 M3 immutable WCS origin and #167 S6 reset',()=>{
 it('source-only reset clears ALL DXF_IMPORTED changes/undo but keeps baseline refs',()=>{
  const scope=sceneScope(v,sha);
  const ref=createSceneRef(scope,'DXF_IMPORTED',importedId(scope,[0]),{treePath:[0]});
  const doc=new SceneWorkDocument(scope,[ref]);
  const selected=[doc.getState().objects[0].ref];
  doc.execute({type:'Translate',ids:[ref.id],dx:3,dy:-5},selected);
  doc.execute({type:'Rotate',ids:[ref.id],angleDegrees:90,pivot:[0,0]},selected);
  expect(doc.getState().objects[0].transform).not.toEqual(IDENTITY_2D);
  doc.reset();
  expect(doc.getState().objects[0].transform).toEqual(IDENTITY_2D);
  expect(doc.getState()).toMatchObject({undo:0,redo:0});
  expect(doc.getState().objects[0].sceneRef).toEqual(ref);
 });
 it('anchored point follows translation + rotation, inverse is drift-free',()=>{
  const local={x:2,y:1};
  const p=resolveMemoAnchor(local,[1,0,0,1,10,20]);
  expect(p).toEqual({x:12,y:21});
  expect(resolveMemoAnchor(local,[1,0,0,1,13,15])).toEqual({x:15,y:16});
  const rotated=projectAffine([0,1,-1,0,0,0],local);
  expect(rotated).toEqual({x:-1,y:2});
  expect(invertAffine([0,1,-1,0,0,0],rotated)).toEqual(local);
  expect(()=>projectAffine([1,0,0,1,Number.POSITIVE_INFINITY,0],local)).toThrow();
  expect(()=>invertAffine([0,0,0,0,0,0],local)).toThrow();
 });
 it('reset snapshots reject omissions, duplicates, stale revisions and malicious inputs',()=>{
  const expected=resetRows([{id:uuid(1),revision:0},{id:uuid(2),revision:4}]);
  expect(sameRevisionSnapshot(expected,[{id:uuid(2),revision:4},{id:uuid(1),revision:0}])).toBe(true);
  expect(sameRevisionSnapshot(expected,[{id:uuid(2),revision:5},{id:uuid(1),revision:0}])).toBe(false);
  expect(sameRevisionSnapshot(expected,[{id:uuid(2),revision:4}])).toBe(false);
  expect(()=>resetRows([{id:uuid(1),revision:1},{id:uuid(1),revision:1}])).toThrow();
  expect(()=>resetRows([{id:uuid(1),revision:0,deletedAt:'now'}])).toThrow();
  expect(()=>resetRows([{id:uuid(1),revision:Number.NaN}])).toThrow();
  expect(()=>resetRows(new Array(101).fill({id:uuid(1),revision:0}))).toThrow();
 });
 it('fresh anchor DDL preserves FK, binding identity and BROKEN_ANCHOR one-way guard',()=>{
  const db=new Sqlite(':memory:');
  try{
   db.exec('PRAGMA foreign_keys=ON');
   db.exec('CREATE TABLE "User"("id" TEXT PRIMARY KEY)');
   db.exec('CREATE TABLE "CadSite"("id" TEXT PRIMARY KEY)');
   db.exec('CREATE TABLE "CadFileVersion"("id" TEXT PRIMARY KEY)');
   for(const item of CAD_BUSINESS_DDL)db.exec(item.sql);
   for(const item of CAD_ANCHOR_DDL)db.exec(item.sql);
   db.exec("INSERT INTO User(id) VALUES('editor')");
   db.exec("INSERT INTO CadSite(id) VALUES('site')");
   db.exec("INSERT INTO CadFileVersion(id) VALUES('v')");
   db.exec("INSERT INTO CadMemo(id,version_id,source_sha256,title,content,anchor_x,anchor_y,offset_x,offset_y,created_by_id,updated_by_id,created_at,updated_at) VALUES('m','v','"+sha+"','m','',12,21,14,-12,'editor','editor','now','now')");
   const create="INSERT INTO CadMemoAnchor(memo_id,version_id,source_sha256,status,target_origin,target_id,local_x,local_y,created_at,updated_at) VALUES('m','v','"+sha+"','ATTACHED','APP_CREATED','"+uuid(1)+"',2,1,'now','now')";
   db.exec(create);
   expect(db.prepare("SELECT local_x as x FROM CadMemoAnchor WHERE memo_id='m'").get().x).toBe(2);
   expect(()=>db.exec("UPDATE CadMemoAnchor SET version_id='other' WHERE memo_id='m'")).toThrow('CAD_MEMO_ANCHOR_IMMUTABLE');
   expect(()=>db.exec("DELETE FROM CadMemo WHERE id='m'")).toThrow();
   db.exec("UPDATE CadMemoAnchor SET status='BROKEN_ANCHOR',target_origin=NULL,target_id=NULL,local_x=NULL,local_y=NULL WHERE memo_id='m'");
   expect(()=>db.exec("UPDATE CadMemoAnchor SET status='ATTACHED',target_origin='APP_CREATED',target_id='new',local_x=1,local_y=2 WHERE memo_id='m'"))
    .toThrow('CAD_MEMO_ANCHOR_IMMUTABLE');
  }finally{db.close();}
 });
});
