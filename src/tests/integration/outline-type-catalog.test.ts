import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import packageInfo from '../../package.json' with {type:'json'};
import { initializeGreenfield } from '../../server/g7-operational/greenfield-install';
import { issueGreenfieldAuthority } from '../../server/g7-operational/greenfield-authority';
import { G7_GREENFIELD_SCHEMA_ID, G7_PREVIOUS_MEMO_BASELINE, G7_PREVIOUS_MEMO_CHECKSUM,
  G7_DELETE_PASSWORD_TRIGGERS, assertG7GreenfieldSchema } from '../../server/g7-operational/greenfield-schema';
import { G7_RUNTIME_MIGRATION_CHECKSUMS } from '../../server/g7-operational/runtime-db';
import { CAD_BUSINESS_DDL } from '../../server/cad-business/schema-ddl';
import { CAD_ANCHOR_DDL } from '../../server/cad-business/anchor-ddl';
import { CAD_MEMO_FEATURE_DDL } from '../../server/cad-business/memo-feature-ddl';
import { newSessionCandidate } from '../../server/auth/session';
import { csrfProof } from '../../server/auth/login-service';
import { installMonotonicTestClock } from '../helpers/monotonic-clock';
import { GET as list, POST as create } from '../../app/api/outline-types/route';
import { GET as access } from '../../app/api/outline-types/access/route';
import { PATCH as patch } from '../../app/api/outline-types/[typeId]/route';
import type { IsolatedDb } from '../../server/g7-staging/g1-store';

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>IsolatedDb;
const origin='https://cad.example.test';
let fixture:ReturnType<typeof setup>|undefined;
let saved:Record<string,string|undefined>={};
beforeEach(installMonotonicTestClock);
afterEach(()=>{
  for(const [key,value] of Object.entries(saved)) if(value===undefined)delete process.env[key];else process.env[key]=value;
  fixture?.cleanup();fixture=undefined;saved={};vi.restoreAllMocks();
});
function setup(seedUsers=true){
  const root=mkdtempSync(path.join(tmpdir(),'outline-type-r2-'));chmodSync(root,0o700);
  const dbdir=path.join(root,'db'),cad=path.join(root,'cad'),owner=path.join(root,'owner'),out=path.join(root,'out');
  for(const dir of [dbdir,cad,owner,out])mkdirSync(dir,{mode:0o700});
  const dbfile=path.join(dbdir,'cad.sqlite');
  const installEnv:Record<string,string>={NODE_ENV:'production',G7_GREENFIELD_MODE:'true',
    DATABASE_URL:'file:'+dbfile,CAD_STORAGE_PATH:cad,CAD_STORAGE_BACKEND:'local',
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_GREENFIELD_INSTALL_ACK:'CREATE_EMPTY_G7_DATABASE'};
  initializeGreenfield(installEnv);
  const db=new Sqlite(dbfile);db.exec('PRAGMA foreign_keys=ON');
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu','Synthetic');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('product','bu','Product');
  db.prepare('INSERT INTO "CadSite"(id,product_id,name) VALUES(?,?,?)').run('site-a','product','Site A');
  const tokens:Record<string,string>={};
  for(const role of seedUsers?['Admin','Reader','Editor']:[]){
    const id=role.toLowerCase(),now=Date.now();
    db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',0,?,?)')
      .run(id,id,'synthetic-hash',now,now);
    db.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(id,role,now);
    const candidate=newSessionCandidate(id,now);tokens[id]=candidate.rawToken;
    db.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
      .run(candidate.session.id,id,candidate.session.tokenHash,candidate.session.issuedAt,
        candidate.session.lastSeenAt,candidate.session.expiresAt);
  }
  db.close();
  const keys=generateKeyPairSync('ed25519'),key=path.join(owner,'key.pem');
  writeFileSync(key,keys.privateKey.export({format:'pem',type:'pkcs8'}).toString(),{mode:0o600});
  const input=path.join(owner,'input.json');
  const release={sourceCommit:'1'.repeat(40),version:packageInfo.version,
    appDigest:'sha256:'+'a'.repeat(64),migratorDigest:'sha256:'+'b'.repeat(64)};
  writeFileSync(input,JSON.stringify({origin,release,scopes:['AUTH','CAD_WRITE'],
    approvalId:'OWNER-outline-types',changeRequestId:'CR-outline-types',validMinutes:60}),{mode:0o600});
  issueGreenfieldAuthority('init',input,out,key,installEnv);
  const env:Record<string,string>={...installEnv,G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
    G7_RUNTIME_TRUST_PATH:path.join(out,'runtime-trust.json'),
    G7_RUNTIME_APPROVAL_PATH:path.join(out,'runtime-approval.json'),
    G7_RELEASE_VERSION:packageInfo.version,G7_RELEASE_SOURCE_COMMIT:release.sourceCommit,
    G7_RELEASE_CAPABILITY:'G7-GREENFIELD-AUTH-V1',G7_RELEASE_SCHEMA_ID:G7_GREENFIELD_SCHEMA_ID,
    G7_RELEASE_APP_DIGEST:release.appDigest,G7_RELEASE_MIGRATOR_DIGEST:release.migratorDigest};
  const envKeys=[...new Set([...Object.keys(env),...Object.keys(process.env).filter(key=>key.startsWith('G7_'))])];
  saved=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  for(const key of envKeys)if(key.startsWith('G7_'))delete process.env[key];
  Object.assign(process.env,env);
  return {root,dbfile,env,tokens,openDb:()=>new Sqlite(dbfile),cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
function request(method:'GET'|'POST'|'PATCH',pathname:string,token?:string,body?:object,extra:Record<string,string>={}){
  const headers=new Headers({host:'cad.example.test',...(body?{origin,'content-type':'application/json'}:{}),...extra});
  if(token){headers.set('cookie','cad_session='+token);if(body)headers.set('x-csrf-token',csrfProof(token));}
  return new Request('http://0.0.0.0'+pathname,{method,headers,body:body?JSON.stringify(body):undefined});
}
const listRequest=(token?:string,query='')=>list(request('GET','/api/outline-types'+query,token));
const accessRequest=(token?:string)=>access(request('GET','/api/outline-types/access',token));
const createRequest=(token:string,body:object,extra:Record<string,string>={})=>create(request('POST','/api/outline-types',token,body,extra));
const patchRequest=(token:string,id:string,body:object,extra:Record<string,string>={})=>patch(
  request('PATCH','/api/outline-types/'+id,token,body,extra),{params:Promise.resolve({typeId:id})});

test('TC-R2-001/003: global Admin CRUD, normalization, inactive reservation, CAS and safe audit',async()=>{
  fixture=setup();const admin=fixture.tokens.admin;
  expect((await accessRequest(admin)).status).toBe(200);
  const created=await createRequest(admin,{name:'  Étage  ',description:'  설비  ',sortOrder:3});
  expect(created.status).toBe(201);
  const item=(await created.json()).item;
  expect(item).toMatchObject({name:'Étage',description:'설비',revision:1,scope:'GLOBAL',active:true,
    createdById:'admin',updatedById:'admin'});
  expect((await createRequest(admin,{name:'e\u0301TAGE',sortOrder:0})).status).toBe(409);
  const changed=await patchRequest(admin,item.id,{expectedRevision:1,name:'새 타입',sortOrder:1});
  expect(changed.status).toBe(200);
  expect((await changed.json()).item).toMatchObject({revision:2,name:'새 타입',createdAt:item.createdAt,createdById:'admin'});
  expect((await patchRequest(admin,item.id,{expectedRevision:1,description:'stale'})).status).toBe(409);
  expect((await patchRequest(admin,item.id,{expectedRevision:2,active:false})).status).toBe(200);
  await expect((await listRequest(admin)).json()).resolves.toMatchObject({items:[],total:0});
  expect((await createRequest(admin,{name:'새 타입',sortOrder:0})).status).toBe(409);
  expect((await patchRequest(admin,item.id,{expectedRevision:3,active:true})).status).toBe(200);
  const audit=fixture.openDb();
  expect(audit.prepare('SELECT action,before_revision,after_revision FROM "OutlineTypeAudit" ORDER BY rowid').all())
    .toEqual([{action:'CREATE',before_revision:null,after_revision:1},
      {action:'UPDATE',before_revision:1,after_revision:2},
      {action:'DEACTIVATE',before_revision:2,after_revision:3},
      {action:'REACTIVATE',before_revision:3,after_revision:4}]);
  expect(JSON.stringify(audit.prepare('SELECT * FROM "OutlineTypeAudit"').all())).not.toContain('Étage');
  audit.close();
});

test('TC-R2-002: Reader/Editor global active read, Admin includeInactive and write only; revoke immediately',async()=>{
  fixture=setup();const {tokens}=fixture;
  expect((await listRequest()).status).toBe(401);
  for(const role of ['reader','editor']){
    expect((await listRequest(tokens[role])).status).toBe(200);
    expect((await listRequest(tokens[role],'?includeInactive=true')).status).toBe(403);
    expect((await createRequest(tokens[role],{name:'Denied',sortOrder:0})).status).toBe(403);
  }
  expect((await createRequest(tokens.reader,{name:'Forged',sortOrder:0},
    {'x-user':'admin','x-role':'Admin'})).status).toBe(403);
  expect((await accessRequest(tokens.reader)).status).toBe(200);
  expect(await (await accessRequest(tokens.admin)).json()).toMatchObject({canManage:true,writeEnabled:true});
  const db=fixture.openDb();db.prepare('DELETE FROM "UserRoleGrant" WHERE user_id=?').run('admin');db.close();
  expect((await createRequest(tokens.admin,{name:'Denied',sortOrder:0})).status).toBe(403);
});

test('TC-R2-003/004: CSRF/Host, audit rollback, Unicode nameKey and physical FK/DELETE guards',async()=>{
  fixture=setup();const admin=fixture.tokens.admin;
  expect((await createRequest(admin,{name:'No origin',sortOrder:0},{origin:'https://evil.test'})).status).toBe(403);
  expect((await createRequest(admin,{name:'Wrong host',sortOrder:0},{host:'evil.test'})).status).toBe(403);
  expect((await createRequest(admin,{name:'İ'.repeat(100),sortOrder:0})).status).toBe(201);
  const first=await createRequest(admin,{name:'ß',sortOrder:0});
  expect(first.status).toBe(201);
  expect((await createRequest(admin,{name:'ss',sortOrder:0})).status).toBe(201);
  const id=(await first.json()).item.id;
  const db=fixture.openDb();db.exec('PRAGMA foreign_keys=ON');
  expect(db.prepare('PRAGMA foreign_key_list("CadOutline")').all().some(row=>
    row.table==='OutlineType'&&row.from==='outline_type_id')).toBe(true);
  db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run('building','site-a','B');
  db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,1)')
    .run('floor','building','F');
  const sha=createHash('sha256').update('synthetic').digest('hex');
  db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)')
    .run('version','floor','fixture.dxf','fixture','scrypt$synthetic','DXF',9,sha,'storage/fixture.dxf','2026-10-31');
  const insert=db.prepare('INSERT INTO "CadOutline"(id,version_id,source_sha256,scene_revision,origin,validation_mode,kind,name,base_geometry_json,geometry_json,source_refs_json,derived_from_json,transform_json,outline_type_id,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,0,\'APP_CREATED\',\'APP_CREATED\',\'CONVEX\',?,?,?,?,?,?,?,?,?,?,?)');
  const outlineArgs=(typeId:string)=>['outline-1','version',sha,'Synthetic','{}','{"stable":true}','[]','[]','{}',typeId,'admin','admin','2026-10-31','2026-10-31'];
  expect(()=>insert.run(...outlineArgs(randomUUID()))).toThrow();
  insert.run(...outlineArgs(id));
  expect(()=>db.prepare('DELETE FROM "OutlineType" WHERE id=?').run(id)).toThrow();
  expect(()=>db.prepare('DELETE FROM "OutlineTypeAudit"').run()).toThrow();
  db.exec('CREATE TRIGGER synthetic_type_audit_failure BEFORE INSERT ON "OutlineTypeAudit" BEGIN SELECT RAISE(ABORT,\'synthetic\'); END');
  db.close();
  expect((await patchRequest(admin,id,{expectedRevision:1,name:'Rolled back'})).status).toBe(503);
  const check=fixture.openDb();
  expect(check.prepare('SELECT revision,name FROM "OutlineType" WHERE id=?').get(id)).toMatchObject({revision:1,name:'ß'});
  expect(check.prepare('SELECT outline_type_id,geometry_json FROM "CadOutline" WHERE id=?').get('outline-1'))
    .toMatchObject({outline_type_id:id,geometry_json:'{"stable":true}'});
  check.exec('DROP TRIGGER synthetic_type_audit_failure');check.close();
  const renamed=await patchRequest(admin,id,{expectedRevision:1,name:'Renamed'});
  expect(renamed.status).toBe(200);
  expect((await patchRequest(admin,id,{expectedRevision:2,active:false})).status).toBe(200);
  expect((await patchRequest(admin,id,{expectedRevision:3,active:true})).status).toBe(200);
  const linked=fixture.openDb();linked.exec('PRAGMA foreign_keys=ON');
  expect(linked.prepare('SELECT outline_type_id,geometry_json FROM "CadOutline" WHERE id=?').get('outline-1'))
    .toMatchObject({outline_type_id:id,geometry_json:'{"stable":true}'});
  expect(()=>linked.prepare('UPDATE "CadOutline" SET outline_type_id=? WHERE id=?').run(randomUUID(),'outline-1')).toThrow();
  expect(()=>linked.prepare('UPDATE "OutlineTypeAudit" SET action=?').run('UPDATE')).toThrow();
  const snapshot=path.join(fixture.root,'snapshot.sqlite');
  await (linked as IsolatedDb & {backup(filename:string):Promise<unknown>}).backup(snapshot);linked.close();
  const restoredPath=path.join(fixture.root,'restored.sqlite');copyFileSync(snapshot,restoredPath);
  const restored=new Sqlite(restoredPath);restored.exec('PRAGMA foreign_keys=ON');
  expect(()=>assertG7GreenfieldSchema(restored)).not.toThrow();
  expect(restored.prepare('SELECT revision,name FROM "OutlineType" WHERE id=?').get(id))
    .toMatchObject({revision:4,name:'Renamed'});
  expect(restored.prepare('SELECT COUNT(*) AS n FROM "OutlineTypeAudit" WHERE outline_type_id=?').get(id))
    .toMatchObject({n:4});
  expect(restored.prepare('SELECT outline_type_id,geometry_json FROM "CadOutline" WHERE id=?').get('outline-1'))
    .toMatchObject({outline_type_id:id,geometry_json:'{"stable":true}'});
  restored.close();
});

test('TC-R2-003: strict body/query, missing ID and release writer OFF',async()=>{
  fixture=setup();const admin=fixture.tokens.admin;
  for(const path of ['?limit=101','?limit=1&limit=2','?unknown=x','?includeInactive=yes','?q=%00'])
    expect((await listRequest(admin,path)).status).toBe(400);
  expect((await createRequest(admin,{name:'Bad',sortOrder:0,actor:'admin'})).status).toBe(400);
  expect((await createRequest(admin,{name:'Bad',sortOrder:-1})).status).toBe(400);
  expect((await patchRequest(admin,randomUUID(),{expectedRevision:1,name:'Missing'})).status).toBe(404);
  expect((await patchRequest(admin,'bad',{expectedRevision:1,name:'Missing'})).status).toBe(400);
  process.env.G7_CAD_WRITE_CUTOVER_ENABLED='false';
  expect((await createRequest(admin,{name:'Disabled',sortOrder:0})).status).toBe(503);
});

test('TC-R2-001/003: concurrent revision and unique-name races serialize in the DB',async()=>{
  fixture=setup();const admin=fixture.tokens.admin;
  const base=await createRequest(admin,{name:'Base',sortOrder:0});
  const id=(await base.json()).item.id;
  const revisions=await Promise.all([
    patchRequest(admin,id,{expectedRevision:1,name:'Left'}),
    patchRequest(admin,id,{expectedRevision:1,name:'Right'}),
  ]);
  expect(revisions.map(row=>row.status).sort()).toEqual([200,409]);
  const duplicates=await Promise.all([
    createRequest(admin,{name:'  Same  ',sortOrder:0}),
    createRequest(admin,{name:'same',sortOrder:0}),
  ]);
  expect(duplicates.map(row=>row.status).sort()).toEqual([201,409]);
  const db=fixture.openDb();
  expect(db.prepare('SELECT COUNT(*) AS n FROM "OutlineTypeAudit"').get()).toMatchObject({n:3});
  db.close();
});

test('TC-R2-002/003: revoked session, missing CSRF and input bounds',async()=>{
  fixture=setup();const admin=fixture.tokens.admin;
  const db=fixture.openDb();
  expect(db.prepare('SELECT COUNT(*) AS n FROM "OutlineTypeAudit"').get()).toMatchObject({n:0});
  expect((await accessRequest()).status).toBe(401);
  expect(db.prepare('SELECT COUNT(*) AS n FROM "OutlineTypeAudit"').get()).toMatchObject({n:0});
  const missingCsrf=request('POST','/api/outline-types',admin,{name:'No csrf',sortOrder:0});
  missingCsrf.headers.delete('x-csrf-token');
  expect((await create(missingCsrf)).status).toBe(403);
  for(const name of ['', 'x'.repeat(101),'x\u0000y'])
    expect((await createRequest(admin,{name,sortOrder:0})).status).toBe(400);
  expect((await createRequest(admin,{name:'Okay',description:'x'.repeat(501),sortOrder:0})).status).toBe(400);
  db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=?').run(Date.now(),'admin');
  expect((await listRequest(admin)).status).toBe(401);
  db.close();
});

test('TC-R2-005: exact historical Memo baseline stays readable by validator but catalogue API returns 503 without DDL',async()=>{
  fixture=setup();
  const oldPath=path.join(fixture.root,'historical.sqlite');
  const historical=new Sqlite(oldPath);historical.exec('PRAGMA foreign_keys=ON');
  for(const name of Object.keys(G7_RUNTIME_MIGRATION_CHECKSUMS))
    historical.exec(readFileSync(new URL('../../deploy/g7-s3/prisma/migrations/'+name+'/migration.sql',import.meta.url),'utf8'));
  historical.exec(readFileSync(new URL('../../deploy/scene-assets/migration.sql',import.meta.url),'utf8'));
  for(const row of [...CAD_BUSINESS_DDL,...CAD_ANCHOR_DDL,...CAD_MEMO_FEATURE_DDL])historical.exec(row.sql);
  for(const sql of G7_DELETE_PASSWORD_TRIGGERS)historical.exec(sql);
  historical.exec('CREATE TABLE "_prisma_migrations"("id" TEXT NOT NULL PRIMARY KEY,"checksum" TEXT NOT NULL,"finished_at" TEXT,"migration_name" TEXT NOT NULL,"logs" TEXT,"rolled_back_at" TEXT,"started_at" TEXT NOT NULL,"applied_steps_count" INTEGER NOT NULL DEFAULT 0)');
  const now=new Date().toISOString();
  historical.prepare('INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count) VALUES(?,?,?,?,NULL,NULL,?,1)')
    .run('memo',G7_PREVIOUS_MEMO_CHECKSUM,now,G7_PREVIOUS_MEMO_BASELINE,now);
  expect(()=>assertG7GreenfieldSchema(historical)).not.toThrow();
  const objects=historical.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
  historical.close();
  copyFileSync(oldPath,fixture.dbfile);
  expect((await listRequest(fixture.tokens.admin)).status).toBe(503);
  expect((await accessRequest(fixture.tokens.admin)).status).toBe(503);
  expect((await createRequest(fixture.tokens.admin,{name:'Forbidden',sortOrder:0})).status).toBe(503);
  const after=fixture.openDb();
  expect(after.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all())
    .toEqual(objects);
  expect(()=>assertG7GreenfieldSchema(after)).not.toThrow();
  after.close();
});

test('TC-R2-002: pristine User0 catalogue probe creates no domain or auth audit',async()=>{
  fixture=setup(false);
  const before=fixture.openDb();
  expect(before.prepare('SELECT COUNT(*) AS n FROM "User"').get()).toMatchObject({n:0});
  expect(before.prepare('SELECT COUNT(*) AS n FROM "AuditEvent"').get()).toMatchObject({n:0});
  expect(before.prepare('SELECT COUNT(*) AS n FROM "OutlineTypeAudit"').get()).toMatchObject({n:0});
  before.close();
  for(const response of [await listRequest(),await accessRequest(),
    await create(request('POST','/api/outline-types',undefined,{name:'No user',sortOrder:0}))])
    expect(response.status).toBe(503);
  const after=fixture.openDb();
  for(const table of ['User','AuditEvent','OutlineTypeAudit','OutlineType'])
    expect(after.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get()).toMatchObject({n:0});
  after.close();
});
