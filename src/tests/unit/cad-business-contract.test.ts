import { createRequire } from 'node:module';
import {readFileSync} from 'node:fs';
import { afterEach,describe,expect,test } from 'vitest';
import { CAD_BUSINESS_DDL } from '../../server/cad-business/schema-ddl';
import { geometry,operations,point,transformed,provenance,revision,keys,memoEditOperation } from '../../server/cad-business/validation';
import { MemoSession, type PersistedMemoDraft } from '../../domain/cad-memo';
import {importedId,sceneScope} from '../../domain/cad-scene';
const require=createRequire(import.meta.url);
const Sqlite=require('better-sqlite3') as new (path:string)=>{exec:(sql:string)=>void;prepare:(sql:string)=>{get:(...args:unknown[])=>Record<string,unknown>;run:(...args:unknown[])=>unknown};close:()=>void};
const dbs:{close:()=>void}[]=[];
afterEach(()=>{for(const d of dbs.splice(0))d.close();});
const v='a550c84e-6783-4d30-b8a7-272bc6dd0a40',sha='c'.repeat(64);
const triangle={type:'Polygon' as const,coordinates:[[[0,0],[3,0],[0,3],[0,0]]]};

describe('#98/#83 closed-world geometry and memo validation',()=>{
 test('accepts a finite closed WCS polygon, server computes sequential rigid edits',()=>{
  const base=geometry(triangle);
  expect(transformed(base,[{type:'Translate',dx:10,dy:-2},
   {type:'Rotate',angleDegrees:90,pivot:[0,0]}]).geometry.type).toBe('Polygon');
  expect(operations([{type:'Translate',dx:1,dy:2}])).toHaveLength(1);
 });
 test('rejects altered provenance and unsafe coordinates/operations',()=>{
  expect(()=>geometry({type:'Polygon',coordinates:[[[0,0],[1,0],[0,1],[2,2]]]})).toThrow();
  expect(()=>geometry({type:'Polygon',coordinates:[[[0,0],[Infinity,0],[0,1],[0,0]]]})).toThrow();
  expect(()=>operations([{type:'Rotate',angleDegrees:NaN,pivot:[0,0]}])).toThrow();
  expect(()=>operations([{type:'Translate',dx:1,dy:1,matrix:[1,0,0,1,0,0]}])).toThrow();
  expect(()=>point({x:0,y:0,z:0})).toThrow();
  expect(()=>provenance(['one','one'])).toThrow();
  expect(()=>revision(-1)).toThrow();
  expect(()=>keys({expectedRevision:0,origin:'DXF_IMPORTED'},['expectedRevision'])).toThrow();
 });
 test('R3 render Scene occurrence IDs remain intact within the bounded provenance contract',()=>{
  const sceneId=importedId(sceneScope(v,sha,'4'),[1,2,3,4,5,6,7,8,9,10]);
  expect(sceneId).toHaveLength(220);
  expect(provenance([sceneId])).toEqual([sceneId]);
  expect(provenance(['x'.repeat(250)])).toEqual(['x'.repeat(250)]);
  for(const invalid of [['x'.repeat(251)],[''],[sceneId,sceneId],
    Array.from({length:257},(_,i)=>'ref-'+i)]){
    try{provenance(invalid);throw new Error('unexpectedly accepted');}
    catch(error){expect(error).toMatchObject({code:'OUTLINE_DERIVATION_INVALID'});}
  }
 });
 test('server hydrated memo keeps immutable Version/SHA and revision',()=>{
  const m=new MemoSession({versionId:v,sourceSha256:sha});
  const raw:PersistedMemoDraft={id:'197e1526-12a8-49c7-8187-fb6c5c58f20a',versionId:v,
   sourceSha256:sha,title:'server memo',content:'plain text',anchorWcsXY:{x:100,y:200},
   labelOffset:{x:14,y:-12},createdAt:'2026-10-30T00:00:00.000Z',updatedAt:'2026-10-30T00:01:00.000Z',
   textFormat:'plain',persisted:true,revision:2,createdById:'editor-id',updatedById:'editor-id'};
  expect(m.acceptPersisted(raw,{versionId:v,sourceSha256:sha}).revision).toBe(2);
  expect(m.list()).toHaveLength(1);
  expect(()=>m.acceptPersisted({...raw,versionId:'bb21eeb1-ed08-42b0-89f4-2e995257745d'},{
   versionId:v,sourceSha256:sha})).toThrow();
 });
});
describe('#98/#83 new empty-schema DDL invariants',()=>{
 test('new business tables enforce immutable ownership and append-only audit',()=>{
  const db=new Sqlite(':memory:');dbs.push(db);
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('CREATE TABLE "User"("id" TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE "CadSite"("id" TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE "CadFileVersion"("id" TEXT PRIMARY KEY)');
  for(const row of CAD_BUSINESS_DDL)db.exec(row.sql);
  db.exec("INSERT INTO User(id) VALUES ('editor')");
  db.exec("INSERT INTO CadSite(id) VALUES ('site')");
  db.exec("INSERT INTO CadFileVersion(id) VALUES ('v')");
  const sql="INSERT INTO CadMemo(id,version_id,source_sha256,title,content,anchor_x,anchor_y,offset_x,offset_y,created_by_id,updated_by_id,created_at,updated_at) VALUES('m','v','"+sha+"','memo','plain',1,2,14,-12,'editor','editor','2026-10-30','2026-10-30')";
  db.exec(sql);
  expect(db.prepare('SELECT COUNT(*) AS n FROM CadMemo').get().n).toBe(1);
  expect(()=>db.exec("UPDATE CadMemo SET source_sha256='"+'a'.repeat(64)+"' WHERE id='m'")).toThrow('CAD_MEMO_IMMUTABLE');
  db.exec("INSERT INTO CadBusinessAudit(id,actor_user_id,site_id,version_id,target_kind,target_id,action,outcome,request_id,timestamp_utc) VALUES('e','editor','site','v','MEMO','m','CREATE','SUCCESS','req','2026-10-30')");
  expect(()=>db.exec("DELETE FROM CadBusinessAudit")).toThrow('CAD_BUSINESS_AUDIT_APPEND_ONLY');
  expect(()=>db.exec("UPDATE CadBusinessAudit SET outcome='SUCCESS'")).toThrow('CAD_BUSINESS_AUDIT_APPEND_ONLY');
  expect(()=>db.exec("UPDATE CadMemo SET deleted_at='2026-10-30',deleted_by_id='editor' WHERE id='m'")).not.toThrow();
  expect(()=>db.exec("UPDATE CadMemo SET title='back' WHERE id='m'")).toThrow('CAD_MEMO_IMMUTABLE');
 });
});

describe('#83 Codex P2 / #98 migrator P1 prevention',()=>{
 test('PATCH edit policy rejects delete (400) and only DELETE route enables deletion',()=>{
  expect(memoEditOperation('text',false)).toBe('text');
  expect(memoEditOperation('move',false)).toBe('move');
  for(const raw of ['delete','DELETE',null,undefined,'rename']) {
   try {
    memoEditOperation(raw,false);
    throw new Error('PATCH must reject unsafe operation');
   } catch(error) {
    expect(error).toMatchObject({code:'BUSINESS_OPERATION_INVALID',status:400});
   }
  }
  expect(memoEditOperation(undefined,true)).toBe('delete');
  // Server repository is intentionally not imported: it is a Next server-only
  // module that cannot be evaluated inside this generic Vitest worker.
  const service=readFileSync(new URL('../../server/cad-business/service.ts',import.meta.url),'utf8');
  expect(service).toContain('const operation=memoEditOperation(b.operation,remove)');
  expect(service).toContain("remove?'DELETE':'EDIT'");
  expect(service).toContain('if(remove)return {deleted:true,revision:expected+1}');
 });
 test('migrator Docker closure explicitly includes the new required DDL module',()=>{
  const docker=readFileSync(new URL('../../Dockerfile',import.meta.url),'utf8');
  expect(docker).toContain('COPY --from=builder /app/src/server/cad-business/schema-ddl.ts ./server/cad-business/schema-ddl.ts');
  expect(docker).toContain('CAD_BUSINESS_DDL.length !== 11');
 });
});
