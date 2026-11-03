import {afterEach,describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {singleSceneJobKey} from '../../domain/scene-single-worker-admission';
import {CAD_SCENE_BUILDER} from '../../domain/cad-scene';

type Statement={run:(...args:unknown[])=>unknown;get:(...args:unknown[])=>unknown;all:(...args:unknown[])=>unknown[]};
type SqliteDb={exec:(sql:string)=>void;prepare:(sql:string)=>Statement;close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>SqliteDb;
const instances:SqliteDb[]=[];
afterEach(()=>{for(const db of instances.splice(0))db.close();});
function fixture(){
 const db=new Sqlite(':memory:');instances.push(db);
 db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE "CadFileVersion" ("id" TEXT PRIMARY KEY);
  CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
  CREATE TABLE "CadSite" ("id" TEXT PRIMARY KEY);`);
 const sql=readFileSync(new URL('../../deploy/scene-build-jobs/migration.sql',import.meta.url),'utf8');
 db.exec(sql);
 for(const table of ['CadFileVersion','User','CadSite'])db.prepare(`INSERT INTO "${table}" (id) VALUES (?)`).run(table);
 return {db,sql};
}
function insert(db:SqliteDb,id='job-1',versionId='CadFileVersion',status='QUEUED',sha='a'.repeat(64)){
 return db.prepare(`INSERT INTO "SceneBuildJob"
  (id,version_id,source_sha256,builder,payload_schema,actor_id,site_id,request_id,status,due_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
  id,versionId,sha,CAD_SCENE_BUILDER,2,'User','CadSite','request-1',status,
  new Date(2026,0,1).toISOString());
}
describe('#225 B1 staged G7 schema: offline, no production migration',()=>{
 it('declares exactly the table and read/claim indexes expected by the model',()=>{
  const {db,sql}=fixture();
  const rows=db.prepare("SELECT name,type FROM sqlite_master WHERE tbl_name='SceneBuildJob' ORDER BY name").all() as Array<{name:string;type:string}>;
  expect(rows.filter(r=>r.type==='table').map(r=>r.name)).toEqual(['SceneBuildJob']);
  expect(rows.filter(r=>r.type==='index').map(r=>r.name)).toEqual(
    expect.arrayContaining(['ix_scene_build_due','ix_scene_build_version','uq_scene_build_identity']));
  expect(sql).not.toMatch(/token_hash|cookie|password/i);
  expect(singleSceneJobKey({versionId:'CadFileVersion',sourceSha256:'a'.repeat(64),
   builder:CAD_SCENE_BUILDER,payloadSchema:2})).toBeTruthy();
 });
 it('allows one exact Version+SHA+Builder+payload schema intent and forbids duplicates',()=>{
  const {db}=fixture();insert(db);
  expect(()=>insert(db,'another-job')).toThrow(/UNIQUE/);
  expect(db.prepare('SELECT count(*) AS n FROM "SceneBuildJob"').get()).toMatchObject({n:1});
 });
 it('rejects invalid state, broken source digest, and unknown version/actor/site',()=>{
  const {db}=fixture();
  expect(()=>insert(db,'bad-state','CadFileVersion','ACCEPTED')).toThrow(/CHECK/);
  expect(()=>insert(db,'bad-sha','CadFileVersion','QUEUED','ABC')).toThrow(/CHECK/);
  expect(()=>insert(db,'bad-version','unknown')).toThrow(/FOREIGN KEY/);
  expect(()=>db.prepare(`INSERT INTO "SceneBuildJob"
   (id,version_id,source_sha256,builder,payload_schema,actor_id,site_id,request_id,due_at)
   VALUES(?,?,?,?,?,?,?,?,?)`).run(
     'bad-user','CadFileVersion','a'.repeat(64),CAD_SCENE_BUILDER,2,'unknown','CadSite','id','2026-01-01'))
   .toThrow(/FOREIGN KEY/);
  expect(db.prepare('SELECT COUNT(*) AS n FROM "SceneBuildJob"').get()).toMatchObject({n:0});
 });
 it('rolls back Version and Job intent together on failure in a transaction',()=>{
  const {db}=fixture();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO "CadFileVersion" (id) VALUES (?)').run('new-version');
    insert(db,'to-rollback','new-version');
    db.exec('ROLLBACK');
  }catch(error){db.exec('ROLLBACK');throw error;}
  expect(db.prepare('SELECT 1 FROM "CadFileVersion" WHERE id=?').get('new-version')).toBeUndefined();
  expect(db.prepare('SELECT 1 FROM "SceneBuildJob" WHERE id=?').get('to-rollback')).toBeUndefined();
 });
 it('blocks version deletion while a job exists, but terminal cleanup permits it',()=>{
  const {db}=fixture();insert(db);
  expect(()=>db.prepare('DELETE FROM "CadFileVersion" WHERE id=?').run('CadFileVersion'))
    .toThrow(/FOREIGN KEY/);
  db.prepare('UPDATE "SceneBuildJob" SET status=? WHERE id=?').run('FAILED','job-1');
  db.prepare('DELETE FROM "SceneBuildJob" WHERE version_id=?').run('CadFileVersion');
  db.prepare('DELETE FROM "CadFileVersion" WHERE id=?').run('CadFileVersion');
  expect(db.prepare('SELECT count(*) AS n FROM "CadFileVersion"').get()).toMatchObject({n:0});
 });
});
