import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import packageInfo from '../../package.json' with {type:'json'};
import {initializeGreenfield} from '../../server/g7-operational/greenfield-install';
import {issueGreenfieldAuthority} from '../../server/g7-operational/greenfield-authority';
import {G7_GREENFIELD_SCHEMA_ID,assertG7GreenfieldSchema} from '../../server/g7-operational/greenfield-schema';
import {newSessionCandidate} from '../../server/auth/session';
import {csrfProof} from '../../server/auth/login-service';
import {createDb,type Database} from '../../server/db';
import {CadRepository} from '../../server/repositories/cad';
import {hashDeletePassword} from '../../server/password';
import {requireBusinessWrite} from '../../server/cad-business/service';
import {createTreeFolder} from '../../server/cad-business/tree-service';
import {installMonotonicTestClock} from '../helpers/monotonic-clock';
import type {IsolatedDb} from '../../server/g7-staging/g1-store';
import {GET,POST,PATCH,DELETE} from '../../app/api/cad-files/[versionId]/tree/route';
import {PATCH as patchZone} from '../../app/api/cad-files/[versionId]/zones/[zoneId]/route';
import {GET as getZones} from '../../app/api/cad-files/[versionId]/zones/route';
vi.mock('server-only',()=>({}));

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>IsolatedDb;
const origin='https://cad.example.test';
let db:Database|undefined,cleanup:(()=>void)|undefined;
beforeEach(installMonotonicTestClock);
afterEach(async()=>{await db?.$disconnect();db=undefined;cleanup?.();cleanup=undefined;vi.restoreAllMocks();});

/** Disposable real G7 schema, signed authority, real sessions and two Sites.
 * Test-only monotonic time does not establish native host-clock correctness. */
function setup(){
 const root=mkdtempSync(path.join(tmpdir(),'tree201-'));chmodSync(root,0o700);
 const dirs=Object.fromEntries(['db','cad','owner','authority'].map(n=>[n,path.join(root,n)]));
 for(const p of Object.values(dirs))mkdirSync(p,{mode:0o700});
 const dbfile=path.join(dirs.db,'cad.sqlite');
 const install={NODE_ENV:'production',G7_GREENFIELD_MODE:'true',DATABASE_URL:'file:'+dbfile,
  CAD_STORAGE_PATH:dirs.cad,CAD_STORAGE_BACKEND:'local',G7_AUTH_ENABLED:'false',
  G7_CAD_WRITE_CUTOVER_ENABLED:'false',G7_GREENFIELD_INSTALL_ACK:'CREATE_EMPTY_G7_DATABASE'};
 initializeGreenfield(install);
 const raw=new Sqlite(dbfile);raw.exec('PRAGMA foreign_keys=ON; BEGIN');
 raw.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu','Synthetic');
 raw.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('product','bu','Product');
 for(const site of ['a','b']){
  raw.prepare('INSERT INTO "CadSite"(id,product_id,name) VALUES(?,?,?)').run('site-'+site,'product','Site '+site);
  raw.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run('building-'+site,'site-'+site,'Building '+site);
 }
 const floorId=randomUUID(),otherFloorId=randomUUID();
 for(const [id,building] of [[floorId,'building-a'],[otherFloorId,'building-b']])
  raw.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,3)').run(id,building,'F');
 const versionId=randomUUID(),version2=randomUUID(),foreignVersion=randomUUID();
 const bytes=Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');
 const sha=createHash('sha256').update(bytes).digest('hex');
 for(const [id,floor,number] of [[versionId,floorId,1],[version2,floorId,2],[foreignVersion,otherFloorId,1]] as const){
  const locator=floor+'/'+id+'/original.dxf';mkdirSync(path.join(dirs.cad,floor,id),{recursive:true,mode:0o700});
  writeFileSync(path.join(dirs.cad,locator),bytes,{mode:0o600});
  raw.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,\'DXF\',?,?,?,?)')
   .run(id,floor,number,'fixture.dxf','fixture','scrypt$synthetic',bytes.length,sha,locator,'2026-11-13');
 }
 const ids:Record<string,string>={},tokens:Record<string,string>={};
 for(const [name,role,grant] of [['admin','Admin',true],['editor','Editor',true],['editor2','Editor',true],['reader','Reader',true],['nogrant','Admin',false]] as const){
  const id=randomUUID(),now=Date.now();ids[name]=id;
  raw.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',0,?,?)').run(id,name,'synthetic',now,now);
  raw.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(id,role,now);
  if(grant)raw.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)').run(id,'site-a',now);
  const candidate=newSessionCandidate(id,now);tokens[name]=candidate.rawToken;
  raw.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
   .run(candidate.session.id,id,candidate.session.tokenHash,candidate.session.issuedAt,candidate.session.lastSeenAt,candidate.session.expiresAt);
 }
 const typeId=randomUUID(),categoryId=randomUUID();
 raw.prepare('INSERT INTO "OutlineType"(id,name,name_key,active,sort_order,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,1,0,1,?,?,?,?)')
  .run(typeId,'Safety','safety',ids.admin,ids.admin,'2026-11-13','2026-11-13');
 raw.prepare('INSERT INTO "ZoneCategory"(id,site_id,name,name_key,active,sort_order,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,1,0,1,?,?,?,?)')
  .run(categoryId,'site-a','Production','production',ids.admin,ids.admin,'2026-11-13','2026-11-13');
 const outlineIds=[randomUUID(),randomUUID(),randomUUID()];
 const polygon=JSON.stringify({type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]});
 for(const [index,id] of outlineIds.entries())raw.prepare('INSERT INTO "CadOutline"(id,version_id,source_sha256,scene_revision,origin,validation_mode,kind,name,base_geometry_json,geometry_json,source_refs_json,derived_from_json,transform_json,outline_type_id,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,0,\'APP_CREATED\',\'APP_CREATED\',\'CONVEX\',?,?,?,?,?,?,?,?,?,?,?)')
  .run(id,versionId,sha,'Outline '+index,polygon,polygon,'[]','[]','{}',typeId,ids.editor,ids.editor,'2026-11-13','2026-11-13');
 const zoneIds=[randomUUID(),randomUUID(),randomUUID()];
 for(const [index,id] of zoneIds.entries())raw.prepare('INSERT INTO "CadZone"(id,location_id,site_id,name,name_key,category_id,description,code,tags_json,sort_order,parent_zone_id,references_json,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,\'site-a\',?,?,?,?,?,\'[]\',0,?,\'[]\',?,?,?,?)')
  .run(id,floorId,'Zone '+index,'zone '+index,categoryId,'description','ZONE-'+index,index?zoneIds[index-1]:null,ids.editor,ids.editor,'2026-11-13','2026-11-13');
 raw.exec('COMMIT');expect(()=>assertG7GreenfieldSchema(raw)).not.toThrow();raw.close();
 const keys=generateKeyPairSync('ed25519'),key=path.join(dirs.owner,'key.pem'),input=path.join(dirs.owner,'input.json');
 writeFileSync(key,keys.privateKey.export({format:'pem',type:'pkcs8'}).toString(),{mode:0o600});
 const release={sourceCommit:'1'.repeat(40),version:packageInfo.version,appDigest:'sha256:'+'a'.repeat(64),migratorDigest:'sha256:'+'b'.repeat(64)};
 writeFileSync(input,JSON.stringify({origin,release,scopes:['AUTH','CAD_WRITE'],approvalId:'OWNER-T201',changeRequestId:'CR-T201',validMinutes:60}),{mode:0o600});
 issueGreenfieldAuthority('init',input,dirs.authority,key,install);
 const env:Record<string,string>={...install,G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
  G7_RUNTIME_TRUST_PATH:path.join(dirs.authority,'runtime-trust.json'),G7_RUNTIME_APPROVAL_PATH:path.join(dirs.authority,'runtime-approval.json'),
  G7_RELEASE_VERSION:packageInfo.version,G7_RELEASE_SOURCE_COMMIT:release.sourceCommit,G7_RELEASE_CAPABILITY:'G7-GREENFIELD-AUTH-V1',
  G7_RELEASE_SCHEMA_ID:G7_GREENFIELD_SCHEMA_ID,G7_RELEASE_APP_DIGEST:release.appDigest,G7_RELEASE_MIGRATOR_DIGEST:release.migratorDigest};
 const saved=Object.fromEntries(Object.keys(process.env).filter(k=>k.startsWith('G7_')||Object.hasOwn(env,k)).map(k=>[k,process.env[k]]));
 for(const k of Object.keys(saved))delete process.env[k];Object.assign(process.env,env);
 cleanup=()=>{for(const k of Object.keys(env))delete process.env[k];for(const [k,v] of Object.entries(saved))if(v!==undefined)process.env[k]=v;rmSync(root,{recursive:true,force:true});};
 db=createDb('file:'+dbfile);
 return {root,dbfile,versionId,version2,foreignVersion,floorId,sha,ids,tokens,outlineIds,zoneIds,typeId,categoryId,open:()=>new Sqlite(dbfile)};
}
type Fixture=ReturnType<typeof setup>;
type Folder={id:string;revision:number;name:string;parentFolderId:string|null;sortOrder:number};
function request(f:Fixture,method:string,body?:object,actor='editor',version=f.versionId,options:{csrf?:boolean;origin?:string}={}){
 const token=f.tokens[actor],headers=new Headers({host:'cad.example.test'});
 if(token)headers.set('cookie','cad_session='+token);
 if(body){headers.set('content-type','application/json');headers.set('origin',options.origin??origin);if(token&&options.csrf!==false)headers.set('x-csrf-token',csrfProof(token));}
 return new Request('http://0.0.0.0/api/cad-files/'+version+'/tree',{method,headers,body:body?JSON.stringify(body):undefined});
}
const args=(versionId:string)=>({params:Promise.resolve({versionId})});
const folderBody=(name:string,parent:Folder|null=null)=>({name,parentFolderId:parent?.id??null,expectedParentRevision:parent?.revision??null,sortOrder:0});
async function createFolder(f:Fixture,name:string,parent:Folder|null=null,actor='editor',version=f.versionId):Promise<Folder>{
 const response=await POST(request(f,'POST',folderBody(name,parent),actor,version),args(version));expect(response.status).toBe(201);return (await response.json()).folder;
}
const moveBody=(f:Fixture,folder:Folder|null,objectId:string=f.outlineIds[0],kind='OUTLINE',expectedRevision=0)=>({target:'membership',kind,objectId,folderId:folder?.id??null,expectedRevision,expectedFolderRevision:folder?.revision??null,sortOrder:0});
const editBody=(folder:Folder,parent:Folder|null=null)=>({target:'folder',folderId:folder.id,expectedRevision:folder.revision,...folderBody(folder.name,parent)});
const deleteBody=(folder:Folder)=>({target:'folder',folderId:folder.id,expectedRevision:folder.revision});

test('TC-T201-02/04: signed roles, Site grant, Origin/CSRF, read-only and revoked sessions fail closed',async()=>{
 const f=setup(),folder=await createFolder(f,'Protected folder');
 const reader=await GET(request(f,'GET',undefined,'reader'),args(f.versionId));
 expect(reader.status).toBe(200);expect(reader.headers.get('cache-control')).toContain('no-store');expect(reader.headers.get('vary')).toBe('Cookie');
 expect(await reader.json()).toMatchObject({actorId:f.ids.reader,canEdit:false,folders:[{id:folder.id}]});
 for(const actor of ['reader','nogrant','anonymous'])expect((await POST(request(f,'POST',folderBody('Denied'),actor),args(f.versionId))).status).toBe(actor==='anonymous'?401:403);
 for(const options of [{csrf:false},{origin:'https://evil.example'}])expect((await POST(request(f,'POST',folderBody('Denied'),'editor',f.versionId,options),args(f.versionId))).status).toBe(403);
 for(const actor of ['nogrant','anonymous']){
  const denied=await GET(request(f,'GET',undefined,actor),args(f.versionId));expect(denied.status).toBe(actor==='anonymous'?401:403);expect(await denied.text()).not.toContain('Protected folder');
 }
 const cross=await GET(request(f,'GET',undefined,'admin',f.foreignVersion),args(f.foreignVersion));expect(cross.status).toBe(403);expect(await cross.text()).not.toContain('Outline');
 await db!.userSiteGrant.deleteMany({where:{userId:f.ids.editor2}});
 const revokedGrant=await GET(request(f,'GET',undefined,'editor2'),args(f.versionId));expect(revokedGrant.status).toBe(403);expect(await revokedGrant.text()).not.toContain('Protected folder');
 process.env.G7_CAD_WRITE_CUTOVER_ENABLED='false';expect((await POST(request(f,'POST',folderBody('Denied')),args(f.versionId))).status).toBeGreaterThanOrEqual(400);process.env.G7_CAD_WRITE_CUTOVER_ENABLED='true';
 await db!.authSession.updateMany({where:{userId:f.ids.editor},data:{revokedAt:BigInt(Date.now())}});
 expect((await GET(request(f,'GET'),args(f.versionId))).status).toBe(401);
});

test('TC-T201-01/02/06: mixed objects, nested folders and Version-only membership persist without domain edits',async()=>{
 const f=setup(),before={outlines:await db!.cadOutline.findMany(),zones:await db!.cadZone.findMany(),versions:await db!.cadFileVersion.findMany()};
 await db!.outlineType.update({where:{id:f.typeId},data:{active:false,revision:{increment:1}}});
 const parent=await createFolder(f,'Logistics'),child=await createFolder(f,'Inspection',parent);
 expect((await PATCH(request(f,'PATCH',moveBody(f,child)),args(f.versionId))).status).toBe(200);
 expect((await PATCH(request(f,'PATCH',moveBody(f,parent,f.zoneIds[0],'ZONE')),args(f.versionId))).status).toBe(200);
 expect((await PATCH(request(f,'PATCH',moveBody(f,parent,f.zoneIds[1],'ZONE')),args(f.versionId))).status).toBe(404);
 const reopened=await GET(request(f,'GET',undefined,'reader'),args(f.versionId)),data=await reopened.json();
 expect(data.folders).toHaveLength(2);expect(data.memberships).toHaveLength(2);expect(data.outlines).toHaveLength(3);expect(data.zones).toHaveLength(3);
 expect(data.types).toEqual([{id:f.typeId,name:'Safety',active:false}]);
 expect(data.outlines[0].bounds).toEqual({minX:0,minY:0,maxX:10,maxY:10});
 const v2=await GET(request(f,'GET',undefined,'reader',f.version2),args(f.version2)),other=await v2.json();
 expect(v2.status).toBe(200);expect(other.folders).toEqual([]);expect(other.memberships).toEqual([]);expect(other.outlines).toEqual([]);expect(other.zones).toEqual(data.zones);
 const zonesV2=await getZones(request(f,'GET',undefined,'reader',f.version2),args(f.version2));expect(zonesV2.status).toBe(200);expect((await zonesV2.json()).zones.every((z:{geometry:unknown})=>z.geometry===null)).toBe(true);
 expect({outlines:await db!.cadOutline.findMany(),zones:await db!.cadZone.findMany(),versions:await db!.cadFileVersion.findMany()}).toEqual(before);
 const source=path.join(f.root,'cad',f.floorId,f.versionId,'original.dxf');expect(createHash('sha256').update(readFileSync(source)).digest('hex')).toBe(f.sha);
 await db!.$disconnect();db=createDb('file:'+f.dbfile);
 expect(await db!.treeMembership.count()).toBe(2);expect(await db!.treeFolder.count()).toBe(2);
});

test('TC-T201-02: self/cycle, cross-Version/deleted parents, duplicate names, parent CAS and nonempty delete',async()=>{
 const f=setup(),parent=await createFolder(f,'Parent'),child=await createFolder(f,'Child',parent);
 expect((await POST(request(f,'POST',folderBody(' parent ')),args(f.versionId))).status).toBe(409);
 for(const body of [editBody(parent,parent),editBody(parent,child),{...editBody(child,parent),expectedRevision:99},{...editBody(child,parent),expectedParentRevision:99}])
  expect((await PATCH(request(f,'PATCH',body),args(f.versionId))).status).toBe(409);
 const moved=await PATCH(request(f,'PATCH',{...editBody(child),sortOrder:9}),args(f.versionId));expect(moved.status).toBe(200);
 const movedFolder=(await moved.json()).folder;expect(movedFolder).toMatchObject({parentFolderId:null,revision:2,sortOrder:9});
 const returned=await PATCH(request(f,'PATCH',editBody(movedFolder,parent)),args(f.versionId));expect(returned.status).toBe(200);
 expect((await returned.json()).folder).toMatchObject({parentFolderId:parent.id,revision:3,sortOrder:0});
 expect((await POST(request(f,'POST',folderBody('Wrong version',parent),'editor',f.version2),args(f.version2))).status).toBe(409);
 expect((await DELETE(request(f,'DELETE',deleteBody(parent)),args(f.versionId))).status).toBe(409);
 const occupied=await createFolder(f,'Occupied');await PATCH(request(f,'PATCH',moveBody(f,occupied)),args(f.versionId));
 expect((await DELETE(request(f,'DELETE',deleteBody(occupied)),args(f.versionId))).status).toBe(409);
 const empty=await createFolder(f,'Empty');expect((await DELETE(request(f,'DELETE',deleteBody(empty)),args(f.versionId))).status).toBe(200);
 expect((await POST(request(f,'POST',folderBody('Deleted parent',empty)),args(f.versionId))).status).toBe(409);
 expect((await PATCH(request(f,'PATCH',moveBody(f,empty,f.outlineIds[1])),args(f.versionId))).status).toBe(409);
 expect(await db!.cadOutline.count()).toBe(3);expect(await db!.cadZone.count()).toBe(3);
});

test('TC-T201-02: folder creator/Admin deletion, collaboration and atomic competing membership CAS',async()=>{
 const f=setup(),folder=await createFolder(f,'Shared');
 expect((await DELETE(request(f,'DELETE',deleteBody(folder),'editor2'),args(f.versionId))).status).toBe(403);
 const renamed=await PATCH(request(f,'PATCH',{...editBody(folder),name:'Collaborative',sortOrder:8},'editor2'),args(f.versionId));expect(renamed.status).toBe(200);const edited=(await renamed.json()).folder;
 const competing=await Promise.all([PATCH(request(f,'PATCH',moveBody(f,edited)),args(f.versionId)),PATCH(request(f,'PATCH',moveBody(f,edited)),args(f.versionId))]);
 expect(competing.map(r=>r.status).sort()).toEqual([200,409]);
 expect((await PATCH(request(f,'PATCH',moveBody(f,null,f.outlineIds[0],'OUTLINE',1)),args(f.versionId))).status).toBe(200);
 expect((await DELETE(request(f,'DELETE',deleteBody(edited),'admin'),args(f.versionId))).status).toBe(200);
 expect(await db!.treeAudit.count({where:{targetId:f.outlineIds[0]}})).toBe(2);
});

test('TC-T201-02/04: DB independently rejects cross scope/cycle/identity changes and append-only audit edits',async()=>{
 const f=setup(),a=await createFolder(f,'A'),b=await createFolder(f,'B',a),v2=await createFolder(f,'V2',null,'editor',f.version2);
 const raw=f.open();raw.exec('PRAGMA foreign_keys=ON');
 try{
  expect(()=>raw.prepare('UPDATE "TreeFolder" SET parent_folder_id=?,revision=revision+1 WHERE id=?').run(b.id,a.id)).toThrow();
  expect(()=>raw.prepare('UPDATE "TreeFolder" SET parent_folder_id=?,revision=revision+1 WHERE id=?').run(v2.id,b.id)).toThrow();
  expect(()=>raw.prepare('UPDATE "TreeFolder" SET version_id=?,revision=revision+1 WHERE id=?').run(f.version2,a.id)).toThrow();
  const insert=raw.prepare('INSERT INTO "TreeMembership"(id,version_id,kind,object_id,folder_id,sort_order,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,?,0,1,?,?,?,?)');
  for(const [version,kind,objectId,folder] of [[f.versionId,'OUTLINE',f.outlineIds[0],v2.id],[f.version2,'OUTLINE',f.outlineIds[0],v2.id],[f.versionId,'ZONE',f.zoneIds[1],a.id],[f.versionId,'UNKNOWN',f.outlineIds[0],a.id]])
   expect(()=>insert.run(randomUUID(),version,kind,objectId,folder,f.ids.editor,f.ids.editor,'2026-11-13','2026-11-13')).toThrow();
  expect(()=>raw.exec('UPDATE "TreeAudit" SET action=\'DELETE\'')).toThrow();expect(()=>raw.exec('DELETE FROM "TreeAudit"')).toThrow();
 }finally{raw.close();}
 expect((await PATCH(request(f,'PATCH',moveBody(f,v2)),args(f.versionId))).status).toBe(409);
 expect((await PATCH(request(f,'PATCH',moveBody(f,a,f.outlineIds[0],'OUTLINE'),'editor',f.version2),args(f.version2))).status).toBe(404);
});

test('TC-T201-04: OFF and unknown schema return no protected tree content',async()=>{
 const f=setup();await createFolder(f,'Secret classification');
 const raw=f.open();raw.prepare('UPDATE "_prisma_migrations" SET migration_name=?').run('unknown-baseline');raw.close();
 const old=await GET(request(f,'GET'),args(f.versionId));expect(old.status).toBe(503);expect(await old.text()).not.toContain('Secret classification');
 for(const key of Object.keys(process.env).filter(k=>k.startsWith('G7_')))delete process.env[key];
 const off=await GET(request(f,'GET'),args(f.versionId));expect(off.status).toBe(503);expect(await off.text()).not.toContain('Secret classification');
});

test('TC-T201-02/04: actual audit insertion failure rolls back folder mutation',async()=>{
 const f=setup(),body=folderBody('Must roll back');
 const proof=requireBusinessWrite(request(f,'POST',body),'TREE-AUDIT-ROLLBACK');
 const raw=f.open();raw.exec("CREATE TRIGGER tree201_test_audit_failure BEFORE INSERT ON TreeAudit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");raw.close();
 await expect(createTreeFolder(db!,f.versionId,body,proof)).rejects.toThrow();
 expect(await db!.treeFolder.count()).toBe(0);expect(await db!.treeAudit.count()).toBe(0);
 const restored=f.open();restored.exec('DROP TRIGGER tree201_test_audit_failure');expect(()=>assertG7GreenfieldSchema(restored)).not.toThrow();restored.close();
});

test('TC-T201-02/06: root→child→root retains membership identity/revision and audits classification release',async()=>{
 const f=setup(),folder=await createFolder(f,'Root classification');
 const classified=await PATCH(request(f,'PATCH',moveBody(f,folder,f.zoneIds[0],'ZONE')),args(f.versionId));expect(classified.status).toBe(200);const membership=(await classified.json()).membership;
 const alternateId=randomUUID();await db!.cadZone.create({data:{id:alternateId,locationId:f.floorId,siteId:'site-a',name:'Alternate',nameKey:'alternate',categoryId:null,description:'',code:'',tagsJson:'[]',sortOrder:0,parentZoneId:null,referencesJson:'[]',createdById:f.ids.editor,updatedById:f.ids.editor,createdAt:'2026-11-13',updatedAt:'2026-11-13'}});
 const zone=await db!.cadZone.findUniqueOrThrow({where:{id:f.zoneIds[0]}});
 const body={expectedRevision:zone.revision,name:zone.name,categoryId:zone.categoryId,description:zone.description,code:zone.code,tags:[],sortOrder:zone.sortOrder,parentZoneId:alternateId,references:[]};
 const zoneArgs={params:Promise.resolve({versionId:f.versionId,zoneId:zone.id})};
 expect((await patchZone(request(f,'PATCH',body),zoneArgs)).status).toBe(200);
 const tombstone=await db!.treeMembership.findUniqueOrThrow({where:{id:membership.id}});expect(tombstone).toMatchObject({folderId:null,revision:2});
 expect((await patchZone(request(f,'PATCH',{...body,expectedRevision:2,parentZoneId:null}),zoneArgs)).status).toBe(200);
 for(const revision of [0,1])expect((await PATCH(request(f,'PATCH',moveBody(f,folder,zone.id,'ZONE',revision)),args(f.versionId))).status).toBe(409);
 expect((await PATCH(request(f,'PATCH',moveBody(f,folder,zone.id,'ZONE',2)),args(f.versionId))).status).toBe(200);
 expect(await db!.treeMembership.findUnique({where:{id:membership.id}})).toMatchObject({revision:3,folderId:folder.id});
 expect(await db!.treeAudit.findMany({where:{targetId:zone.id},orderBy:{timestampUtc:'asc'}})).toHaveLength(3);
});


test('TC-T201-19: folder-only Version deletion and tombstones retain Current, Scene, jobs and audit atomically',async()=>{
 const f=setup(),version=f.version2,repo=new CadRepository(db!);
 await db!.cadFileVersion.update({where:{id:version},data:{deletePasswordHash:await hashDeletePassword('1234')}});
 await db!.cadLocation.update({where:{id:f.floorId},data:{currentVersionId:version}});
 const assetId=randomUUID();
 await db!.sceneAsset.create({data:{id:assetId,versionId:version,sourceSha256:f.sha,manifestJson:'{}',
  digest:'a'.repeat(64),byteLength:1,format:'CUSTOM_DTO',storageLocator:'scene/'+assetId}});
 await db!.currentScene.create({data:{versionId:version,assetId,revision:0}});
 await db!.sceneBuildJob.create({data:{id:randomUUID(),versionId:version,sourceSha256:f.sha,builder:'test-retention',
  payloadSchema:2,actorId:f.ids.admin,siteId:'site-a',requestId:'TREE-DELETE-TEST',status:'FAILED'}});
 const folder=await createFolder(f,'Retention only',null,'admin',version);
 const proof=requireBusinessWrite(request(f,'DELETE',{deletePassword:'1234'},'admin',version),'TREE-DELETE-RETENTION');
 const snapshot=async()=>({versions:await db!.cadFileVersion.findMany(),locations:await db!.cadLocation.findMany(),
  folders:await db!.treeFolder.findMany(),memberships:await db!.treeMembership.findMany(),audits:await db!.treeAudit.findMany(),
  assets:await db!.sceneAsset.findMany(),current:await db!.currentScene.findMany(),buildJobs:await db!.sceneBuildJob.findMany(),
  orphanJobs:await db!.sceneOrphanJob.findMany(),deletionJobs:await db!.cadDeletionJob.findMany()});
 for(const softDeleted of [false,true]){
  if(softDeleted)expect((await DELETE(request(f,'DELETE',deleteBody(folder),'admin',version),args(version))).status).toBe(200);
  const before=await snapshot();
  await expect(repo.deleteVersion(version,'1234',proof)).rejects.toMatchObject({code:'CAD_TREE_DATA_EXISTS',status:409});
  expect(await snapshot()).toEqual(before);
 }
 const source=path.join(f.root,'cad',f.floorId,version,'original.dxf');
 expect(createHash('sha256').update(readFileSync(source)).digest('hex')).toBe(f.sha);
});

test('TC-T201-19: current schema Version with no Tree records retains approved deletion behavior',async()=>{
 const f=setup(),version=f.version2;
 await db!.cadFileVersion.update({where:{id:version},data:{deletePasswordHash:await hashDeletePassword('1234')}});
 await db!.cadLocation.update({where:{id:f.floorId},data:{currentVersionId:version}});
 const proof=requireBusinessWrite(request(f,'DELETE',{deletePassword:'1234'},'admin',version),'TREE-EMPTY-DELETE');
 await expect(new CadRepository(db!).deleteVersion(version,'1234',proof)).resolves.toMatchObject({id:version,wasCurrent:true});
 expect(await db!.cadFileVersion.findUnique({where:{id:version}})).toBeNull();
 expect(await db!.cadDeletionJob.count({where:{versionId:version}})).toBe(1);
});


test.each(['audit','membership'] as const)('TC-T201-19: %s-only Tree history retains its Version',async(kind)=>{
 const f=setup(),version=f.version2;
 await db!.cadFileVersion.update({where:{id:version},data:{deletePasswordHash:await hashDeletePassword('1234')}});
 if(kind==='audit')await db!.treeAudit.create({data:{id:randomUUID(),actorUserId:f.ids.admin,siteId:'site-a',versionId:version,
  targetKind:'FOLDER',targetId:randomUUID(),action:'DELETE',beforeRevision:1,afterRevision:2,
  requestId:'TREE-AUDIT-RETENTION',timestampUtc:new Date().toISOString()}});
 else await db!.treeMembership.create({data:{id:randomUUID(),versionId:version,kind:'ZONE',objectId:f.zoneIds[0],
  folderId:null,sortOrder:0,revision:1,createdById:f.ids.admin,updatedById:f.ids.admin,
  createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});
 const before={folder:await db!.treeFolder.count(),membership:await db!.treeMembership.count(),audit:await db!.treeAudit.count()};
 expect(before.folder).toBe(0);expect(before.membership+before.audit).toBe(1);
 const proof=requireBusinessWrite(request(f,'DELETE',{deletePassword:'1234'},'admin',version),'TREE-HISTORY-DELETE');
 await expect(new CadRepository(db!).deleteVersion(version,'1234',proof)).rejects.toMatchObject({code:'CAD_TREE_DATA_EXISTS',status:409});
 expect(await db!.cadFileVersion.findUnique({where:{id:version}})).not.toBeNull();
 expect({folder:await db!.treeFolder.count(),membership:await db!.treeMembership.count(),audit:await db!.treeAudit.count()}).toEqual(before);
 expect(await db!.cadDeletionJob.count()).toBe(0);
});
