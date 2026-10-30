import {createRequire} from 'node:module';
import {describe,expect,test} from 'vitest';
import {CAD_MEMO_FEATURE_DDL} from '../../server/cad-business/memo-feature-ddl';
const require=createRequire(import.meta.url);
const Sqlite=require('better-sqlite3') as new (path:string)=>{exec:(sql:string)=>void;close:()=>void};
describe('#85/#86 Greenfield sidecar constraints',()=>{
 test('one-owner group scope and immutable memo meta ownership are enforced by SQLite',()=>{
  const db=new Sqlite(':memory:');
  try{
   db.exec('PRAGMA foreign_keys=ON');
   db.exec('CREATE TABLE "User"("id" TEXT PRIMARY KEY)');
   db.exec('CREATE TABLE "CadFileVersion"("id" TEXT PRIMARY KEY)');
   db.exec('CREATE TABLE "CadMemo"("id" TEXT PRIMARY KEY)');
   CAD_MEMO_FEATURE_DDL.forEach(row=>db.exec(row.sql));
   db.exec("INSERT INTO User(id) VALUES ('editor')");
   db.exec("INSERT INTO CadFileVersion(id) VALUES ('v')");
   db.exec("INSERT INTO CadMemo(id) VALUES ('m')");
   const sha='a'.repeat(64);
   db.exec(`INSERT INTO CadMemoGroup(id,version_id,source_sha256,name,sort_order,created_by_id,updated_by_id,created_at,updated_at)
   VALUES('g','v','${sha}','조직',0,'editor','editor','2026-10-31','2026-10-31')`);
   db.exec(`INSERT INTO CadMemoFeature(memo_id,version_id,source_sha256,group_id)
   VALUES('m','v','${sha}','g')`);
   expect(()=>db.exec("UPDATE CadMemoFeature SET version_id='other' WHERE memo_id='m'"))
    .toThrow('CAD_MEMO_FEATURE_SCOPE_IMMUTABLE');
   expect(()=>db.exec("UPDATE CadMemoFeature SET is_completed=1 WHERE memo_id='m'")).toThrow();
   expect(()=>db.exec("UPDATE CadMemoFeature SET start_date='2026-11-01' WHERE memo_id='m'")).toThrow();
   db.exec("UPDATE CadMemoFeature SET schedule_enabled=1,start_date='2026-11-01' WHERE memo_id='m'");
   db.exec("UPDATE CadMemoFeature SET completion_enabled=1,is_completed=1,completed_at='2026-10-31T00:00:00.000Z' WHERE memo_id='m'");
   expect(()=>db.exec("UPDATE CadMemoGroup SET source_sha256='"+'b'.repeat(64)+"' WHERE id='g'"))
    .toThrow('CAD_MEMO_GROUP_IMMUTABLE');
   db.exec("UPDATE CadMemoFeature SET group_id=NULL WHERE memo_id='m'");
   db.exec("UPDATE CadMemoGroup SET deleted_at='2026-10-31',deleted_by_id='editor' WHERE id='g'");
   expect(()=>db.exec("UPDATE CadMemoGroup SET name='reused' WHERE id='g'")).toThrow('CAD_MEMO_GROUP_IMMUTABLE');
  }finally{db.close();}
 });
});
