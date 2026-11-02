import type {Prisma} from '../../generated/prisma/client';
import {createZone as createZoneService} from '../../server/cad-business/zone-service';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import packageInfo from '../../package.json' with {type:'json'};
import {initializeGreenfield} from '../../server/g7-operational/greenfield-install';
import {issueGreenfieldAuthority} from '../../server/g7-operational/greenfield-authority';
import {G7_GREENFIELD_BASELINE,G7_GREENFIELD_SCHEMA_ID,assertG7GreenfieldSchema} from '../../server/g7-operational/greenfield-schema';
import {newSessionCandidate} from '../../server/auth/session';
import {csrfProof} from '../../server/auth/login-service';
import {createDb,type Database} from '../../server/db';
import {MasterRepository} from '../../server/repositories/master';
import {CadListRepository} from '../../server/repositories/cad-list';
import {installMonotonicTestClock} from '../helpers/monotonic-clock';
import {GET as list,POST as create} from '../../app/api/cad-files/[versionId]/zones/route';
import {PATCH as patch,DELETE as remove} from '../../app/api/cad-files/[versionId]/zones/[zoneId]/route';
import {POST as createCategory} from '../../app/api/cad-files/[versionId]/zone-categories/route';
import {DELETE as deleteCategory} from '../../app/api/cad-files/[versionId]/zone-categories/[categoryId]/route';
import {resetBusinessVersion} from '../../server/cad-business/reset-service';
import {requireBusinessWrite} from '../../server/cad-business/service';
import type {IsolatedDb} from '../../server/g7-staging/g1-store';
vi.mock('server-only',()=>({}));

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>IsolatedDb;
const origin='https://cad.example.test';
const ring=(x:number,y:number,size:number)=>({type:'Polygon' as const,coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]]});
const dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','LWPOLYLINE','5','1A','8','0','90','4','70','1',
  '10','0','20','0','10','10','20','0','10','10','20','10','10','0','20','10',
  '0','ENDSEC','0','EOF',''].join('\n');
const dxfBytes=new TextEncoder().encode(dxf);
let cleanup:(()=>void)|undefined,db:Database|undefined;
beforeEach(installMonotonicTestClock);
afterEach(async()=>{await db?.$disconnect();db=undefined;cleanup?.();cleanup=undefined;vi.restoreAllMocks();});
function setup(withUsers=true,withForeignSite=false){
 const root=mkdtempSync(path.join(tmpdir(),'typed-outline-r3-'));chmodSync(root,0o700);
 const dir=path.join(root,'db'),cad=path.join(root,'cad'),owner=path.join(root,'owner'),out=path.join(root,'out');
 for(const value of [dir,cad,owner,out])mkdirSync(value,{mode:0o700});
 const dbfile=path.join(dir,'cad.sqlite');
 const install:Record<string,string>={NODE_ENV:'production',G7_GREENFIELD_MODE:'true',
  DATABASE_URL:'file:'+dbfile,CAD_STORAGE_PATH:cad,CAD_STORAGE_BACKEND:'local',
  G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
  G7_GREENFIELD_INSTALL_ACK:'CREATE_EMPTY_G7_DATABASE'};
 initializeGreenfield(install);
 const raw=new Sqlite(dbfile);raw.exec('PRAGMA foreign_keys=ON');
 raw.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu','Synthetic');
 raw.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('product','bu','Product');
 raw.prepare('INSERT INTO "CadSite"(id,product_id,name) VALUES(?,?,?)').run('site-a','product','Site A');
 const foreignSiteId=withForeignSite?randomUUID():undefined;
 if(foreignSiteId)raw.prepare('INSERT INTO "CadSite"(id,product_id,name) VALUES(?,?,?)')
  .run(foreignSiteId,'product','R4 foreign Site');
 raw.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run('building','site-a','B');
 const floorId=randomUUID();
 raw.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,1)').run(floorId,'building','F');
 const versionId=randomUUID(),sha=createHash('sha256').update(dxfBytes).digest('hex');
 const storagePath=floorId+'/'+versionId+'/original.dxf';
 mkdirSync(path.join(cad,floorId,versionId),{recursive:true,mode:0o700});
 writeFileSync(path.join(cad,storagePath),dxfBytes,{mode:0o600});
 raw.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)')
  .run(versionId,floorId,'fixture.dxf','fixture','scrypt$synthetic','DXF',dxfBytes.byteLength,sha,storagePath,'2026-11-01');
 const assetId=randomUUID();
 raw.prepare('INSERT INTO "SceneAsset"(id,version_id,source_sha256,manifest_json,digest,byte_length,format,storage_locator) VALUES(?,?,?,?,?,1,\'CUSTOM_DTO\',?)')
  .run(assetId,versionId,sha,'{}','a'.repeat(64),'scene/fixture');
 raw.prepare('INSERT INTO "CurrentScene"(version_id,asset_id,revision) VALUES(?,?,0)').run(versionId,assetId);
 const tokens:Record<string,string>={},ids:Record<string,string>={};
 for(const role of withUsers?['Admin','Editor','Reader']:[]){
  const id=randomUUID(),now=Date.now(),name=role.toLowerCase();ids[name]=id;
  raw.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',0,?,?)')
   .run(id,name,'synthetic-hash',now,now);
  raw.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(id,role,now);
  raw.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)').run(id,'site-a',now);
  const candidate=newSessionCandidate(id,now);tokens[name]=candidate.rawToken;
  raw.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
   .run(candidate.session.id,id,candidate.session.tokenHash,candidate.session.issuedAt,candidate.session.lastSeenAt,candidate.session.expiresAt);
 }
 const typeId=randomUUID();
 if(withUsers)raw.prepare('INSERT INTO "OutlineType"(id,name,name_key,active,sort_order,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,1,0,1,?,?,?,?)')
  .run(typeId,'Pipe','pipe',ids.admin,ids.admin,'2026-11-01','2026-11-01');
 expect(raw.prepare('SELECT migration_name FROM "_prisma_migrations"').get()).toMatchObject({migration_name:G7_GREENFIELD_BASELINE});
 expect(()=>assertG7GreenfieldSchema(raw)).not.toThrow();raw.close();
 const keys=generateKeyPairSync('ed25519'),key=path.join(owner,'key.pem');
 writeFileSync(key,keys.privateKey.export({format:'pem',type:'pkcs8'}).toString(),{mode:0o600});
 const input=path.join(owner,'input.json');
 const release={sourceCommit:'1'.repeat(40),version:packageInfo.version,
  appDigest:'sha256:'+'a'.repeat(64),migratorDigest:'sha256:'+'b'.repeat(64)};
 writeFileSync(input,JSON.stringify({origin,release,scopes:['AUTH','CAD_WRITE'],
  approvalId:'OWNER-typed-outline',changeRequestId:'CR-typed-outline',validMinutes:60}),{mode:0o600});
 issueGreenfieldAuthority('init',input,out,key,install);
 const env:Record<string,string>={...install,G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
  G7_RUNTIME_TRUST_PATH:path.join(out,'runtime-trust.json'),G7_RUNTIME_APPROVAL_PATH:path.join(out,'runtime-approval.json'),
  G7_RELEASE_VERSION:packageInfo.version,G7_RELEASE_SOURCE_COMMIT:release.sourceCommit,
  G7_RELEASE_CAPABILITY:'G7-GREENFIELD-AUTH-V1',G7_RELEASE_SCHEMA_ID:G7_GREENFIELD_SCHEMA_ID,
  G7_RELEASE_APP_DIGEST:release.appDigest,G7_RELEASE_MIGRATOR_DIGEST:release.migratorDigest};
 const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
 const extra=Object.keys(process.env).filter(key=>key.startsWith('G7_')&&!Object.hasOwn(env,key));
 for(const key of extra){saved[key]=process.env[key];delete process.env[key];}
 Object.assign(process.env,env);
 cleanup=()=>{for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(root,{recursive:true,force:true});};
 db=createDb('file:'+dbfile);
 return {root,dbfile,versionId,floorId,sha,typeId,tokens,ids,foreignSiteId,open:()=>new Sqlite(dbfile)};
}
function request(method:string,url:string,token?:string,body?:object,key?:string,csrf=true){
 const headers=new Headers({host:'cad.example.test',...(body?{origin,'content-type':'application/json'}:{})});
 if(token){headers.set('cookie','cad_session='+token);if(body&&csrf)headers.set('x-csrf-token',csrfProof(token));}
 if(key)headers.set('idempotency-key',key);
 return new Request('http://0.0.0.0'+url,{method,headers,body:body?JSON.stringify(body):undefined});
}
const args=(versionId:string)=>({params:Promise.resolve({versionId})});
const itemArgs=(versionId:string,zoneId:string)=>({params:Promise.resolve({versionId,zoneId})});
function zoneBody(f:ReturnType<typeof setup>,name:string,polygon?:ReturnType<typeof ring>,parentZoneId:string|null=null,categoryId:string|null=null){
 return {name,categoryId,description:'',code:'',tags:[],sortOrder:0,parentZoneId,references:[],
  ...(polygon?{geometry:{sourceSha256:f.sha,sceneRevision:0,polygon}}:{})};
}
test('TC-Z196-02/06: signed Site roles, CSRF, idempotency, CAS and Audit',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId;
 const reader=await list(request('GET',url+'/zones',f.tokens.reader),args(f.versionId));
 expect(reader.status).toBe(200);expect(await reader.json()).toMatchObject({canEdit:false,zones:[]});
 expect((await create(request('POST',url+'/zones',f.tokens.reader,zoneBody(f,'A'),randomUUID()),args(f.versionId))).status).toBe(403);
 expect((await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'A'),randomUUID(),false),args(f.versionId))).status).toBe(403);
 const category=await createCategory(request('POST',url+'/zone-categories',f.tokens.admin,{name:'Area',sortOrder:0}),args(f.versionId));
 expect(category.status).toBe(201);const categoryId=(await category.json()).category.id as string;
 const key=randomUUID(),payload=zoneBody(f,'A',ring(0,0,10),null,categoryId);
 const first=await create(request('POST',url+'/zones',f.tokens.editor,payload,key),args(f.versionId));
 expect(first.status).toBe(201);const zone=(await first.json()).zone;
 expect(zone.geometry).toMatchObject({state:'MAPPED',area:100});
 const again=await create(request('POST',url+'/zones',f.tokens.editor,payload,key),args(f.versionId));
 expect(again.status).toBe(200);expect(await again.json()).toMatchObject({zone:{id:zone.id},replayed:true});
 expect((await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'B'),key),args(f.versionId))).status).toBe(409);
 expect((await patch(request('PATCH',url+'/zones/'+zone.id,f.tokens.editor,{expectedRevision:99,...payload}),itemArgs(f.versionId,zone.id))).status).toBe(409);
 expect((await remove(request('DELETE',url+'/zones/'+zone.id,f.tokens.admin,{expectedRevision:1}),itemArgs(f.versionId,zone.id))).status).toBe(200);
 const reuse=await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'A'),randomUUID()),args(f.versionId));
 expect(reuse.status).toBe(201);
 const raw=f.open();
 expect(raw.prepare('SELECT COUNT(*) AS n FROM "CadZone"').get()).toMatchObject({n:2});
 expect(raw.prepare('SELECT COUNT(*) AS n FROM "CadZoneCreateReceipt"').get()).toMatchObject({n:2});
 expect(raw.prepare('SELECT COUNT(*) AS n FROM "CadZoneAudit"').get()).toMatchObject({n:4});
 raw.close();
});
test('TC-204-03: full Greenfield memo, zone, Version, Current and source survive all five master renames',async()=>{
 const f=setup(),masters=new MasterRepository(db!),listRepo=new CadListRepository(db!);
 const zoneResponse=await create(request('POST','/api/cad-files/'+f.versionId+'/zones',f.tokens.editor,
  zoneBody(f,'Stable zone',ring(0,0,10)),randomUUID()),args(f.versionId));
 expect(zoneResponse.status).toBe(201);
 const zone=(await zoneResponse.json()).zone;
 const memoId=randomUUID(),now='2026-11-02T00:00:00.000Z';
 await db!.cadMemo.create({data:{id:memoId,versionId:f.versionId,sourceSha256:f.sha,title:'Stable memo',content:'Persistent body',
  anchorX:1,anchorY:2,offsetX:3,offsetY:4,createdById:f.ids.editor,updatedById:f.ids.editor,createdAt:now,updatedAt:now}});
 const secondId=randomUUID(),secondStorage=f.floorId+'/'+secondId+'/original.dxf';
 const firstStorage=path.join(f.root,'cad',f.floorId,f.versionId,'original.dxf');
 const bytes=readFileSync(firstStorage),secondFile=path.join(f.root,'cad',secondStorage);
 mkdirSync(path.dirname(secondFile),{recursive:true,mode:0o700});writeFileSync(secondFile,bytes,{mode:0o600});
 await db!.cadFileVersion.create({data:{id:secondId,locationId:f.floorId,version:2,originalFilename:'second.dxf',
  drawingName:'사용자 도면명',description:'설명',deletePasswordHash:'scrypt$synthetic',fileFormat:'DXF',fileSize:bytes.length,
  sha256:f.sha,storagePath:secondStorage,registeredAt:'2026-11-02'}});
 await db!.cadLocation.update({where:{id:f.floorId},data:{currentVersionId:secondId,nextVersion:3}});
 const snapshot=async()=>({
  floor:await db!.cadLocation.findUniqueOrThrow({where:{id:f.floorId},select:{id:true,buildingId:true,active:true,currentVersionId:true,nextVersion:true}}),
  versions:await db!.cadFileVersion.findMany({where:{locationId:f.floorId},orderBy:{version:'asc'}}),
  memo:await db!.cadMemo.findUniqueOrThrow({where:{id:memoId}}),
  zone:await db!.cadZone.findUniqueOrThrow({where:{id:zone.id}}),
  geometry:await db!.cadZoneGeometry.findMany({where:{zoneId:zone.id},orderBy:{versionId:'asc'}}),
 });
 const before=await snapshot(),sourceHash=createHash('sha256').update(bytes).digest('hex');
 const levels=[['business-units','bu'],['products','product'],['sites','site-a'],['buildings','building'],['floors',f.floorId]] as const;
 for(const [type,id] of levels)for(let n=1;n<=2;n++) {
  const updated=await masters.update(type,id,{name:`M204 ${type} ${n}`});
  expect(updated.id).toBe(id);
 }
 expect(await snapshot()).toEqual(before);
 expect(createHash('sha256').update(readFileSync(firstStorage)).digest('hex')).toBe(sourceHash);
 expect(createHash('sha256').update(readFileSync(secondFile)).digest('hex')).toBe(sourceHash);
 const freshDb=createDb('file:'+f.dbfile),fresh=new CadListRepository(freshDb);
 try {
  const detail=await fresh.version(secondId);
  expect(detail.location).toMatchObject({businessUnit:'M204 business-units 2',product:'M204 products 2',
   site:'M204 sites 2',building:'M204 buildings 2',floor:'M204 floors 2'});
  expect(detail.displayName).toBe('사용자 도면명');
  expect((await listRepo.version(f.versionId)).location.floor).toBe('M204 floors 2');
 } finally { await freshDb.$disconnect(); }
});
test('TC-Z196-03/05: parent containment, category reference, both reset modes and stale CAS',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId;
 const category=await createCategory(request('POST',url+'/zone-categories',f.tokens.admin,{name:'Area',sortOrder:0}),args(f.versionId));
 const categoryId=(await category.json()).category.id as string;
 const parentResponse=await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'Parent',ring(0,0,10),null,categoryId),randomUUID()),args(f.versionId));
 expect(parentResponse.status).toBe(201);const parent=(await parentResponse.json()).zone;
 const childResponse=await create(request('POST',url+'/zones',f.tokens.editor,{
  name:'Child',parentZoneId:parent.id,description:'Persistent reference',
  references:[{kind:'EQUIPMENT',label:'설비',value:'SYN-1'},
   {kind:'DOCUMENT',label:'문서',value:'SYN-2',url:'https://example.test/manual'}],
  geometry:{sourceSha256:f.sha,sceneRevision:0,polygon:ring(1,1,2)}
 },randomUUID()),args(f.versionId));
 expect(childResponse.status).toBe(201);const child=(await childResponse.json()).zone;
 expect(child).toMatchObject({categoryId:null,code:'',tags:[],sortOrder:0,references:[
  {kind:'EQUIPMENT',label:'설비',value:'SYN-1'},
  {kind:'DOCUMENT',label:'문서',value:'SYN-2',url:'https://example.test/manual'}]});
 expect((await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'Outside',ring(20,20,2),parent.id),randomUUID()),args(f.versionId))).status).toBe(409);
 expect((await patch(request('PATCH',url+'/zones/'+parent.id,f.tokens.editor,{expectedRevision:1,...zoneBody(f,'Parent',ring(0,0,2),null,categoryId)}),itemArgs(f.versionId,parent.id))).status).toBe(409);
 expect((await remove(request('DELETE',url+'/zones/'+parent.id,f.tokens.editor,{expectedRevision:1}),itemArgs(f.versionId,parent.id))).status).toBe(409);
 expect((await deleteCategory(request('DELETE',url+'/zone-categories/'+categoryId,f.tokens.admin,{expectedRevision:1}),
  {params:Promise.resolve({versionId:f.versionId,categoryId})})).status).toBe(409);
 const proof=requireBusinessWrite(request('POST',url+'/reset',f.tokens.editor,{mode:'SOURCE_ONLY'}),'zone-reset-test');
 const before=await db!.cadFileVersion.findUniqueOrThrow({where:{id:f.versionId}});
 for(const mode of ['SOURCE_ONLY','ALL']){
  const result=await resetBusinessVersion(db!,f.versionId,{mode,sourceSha256:f.sha,expectedSceneRevision:0,outlines:[],memos:[]},proof);
  expect(result.unmappedZones).toBe(2);
 }
 const after=await db!.cadFileVersion.findUniqueOrThrow({where:{id:f.versionId}});
 expect(after.sha256).toBe(before.sha256);expect(after.storagePath).toBe(before.storagePath);
 const page=await list(request('GET',url+'/zones',f.tokens.reader),args(f.versionId));
 expect(page.status).toBe(200);const data=await page.json();
 expect(data.zones).toEqual(expect.arrayContaining([expect.objectContaining({id:child.id,geometry:expect.objectContaining({state:'UNMAPPED',reason:'RESET'})})]));
 expect((await patch(request('PATCH',url+'/zones/'+child.id,f.tokens.editor,{expectedRevision:1,...zoneBody(f,'Child',undefined,parent.id,categoryId)}),itemArgs(f.versionId,child.id))).status).toBe(409);
});
test('TC-Z196-06: database identity, FK, live-name uniqueness and receipt guards',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId;
 const response=await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'A',ring(0,0,4)),randomUUID()),args(f.versionId));
 expect(response.status).toBe(201);const zone=(await response.json()).zone;
 const raw=f.open();raw.exec('PRAGMA foreign_keys=ON');
 expect(()=>raw.prepare('UPDATE "CadZone" SET location_id=? WHERE id=?').run(randomUUID(),zone.id)).toThrow();
 expect(()=>raw.prepare('UPDATE "CadZoneCreateReceipt" SET request_sha256=? WHERE zone_id=?').run('a'.repeat(64),zone.id)).toThrow();
 expect(()=>raw.prepare('INSERT INTO "CadZone"(id,location_id,site_id,name,name_key,description,code,tags_json,sort_order,references_json,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,?,\'\',\'\',\'[]\',0,\'[]\',1,?,?,?,?)')
  .run(randomUUID(),zone.locationId,zone.siteId,'A','a',f.ids.editor,f.ids.editor,'now','now')).toThrow();
 expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);raw.close();
});
test('TC-Z196-03/05: cycle/cross-floor rejected and new Version starts unmapped',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId;
 const parentResponse=await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'Parent',ring(0,0,10)),randomUUID()),args(f.versionId));
 expect(parentResponse.status).toBe(201);const parent=(await parentResponse.json()).zone;
 const childResponse=await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'Child',ring(1,1,2),parent.id),randomUUID()),args(f.versionId));
 expect(childResponse.status).toBe(201);const child=(await childResponse.json()).zone;
 expect((await patch(request('PATCH',url+'/zones/'+parent.id,f.tokens.editor,{expectedRevision:1,...zoneBody(f,'Parent',undefined,child.id)}),itemArgs(f.versionId,parent.id))).status).toBe(409);
 const raw=f.open();raw.exec('PRAGMA foreign_keys=ON');
 const secondFloor=randomUUID(),foreignParent=randomUUID(),now='2026-11-01T00:00:00.000Z';
 raw.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,1)').run(secondFloor,'building','F2');
 raw.prepare('INSERT INTO "CadZone"(id,location_id,site_id,name,name_key,description,code,tags_json,sort_order,references_json,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,?,\'\',\'\',\'[]\',0,\'[]\',1,?,?,?,?)')
  .run(foreignParent,secondFloor,'site-a','Other Floor','other floor',f.ids.editor,f.ids.editor,now,now);
 const secondVersion=randomUUID(),secondAsset=randomUUID(),path2=f.floorId+'/'+secondVersion+'/original.dxf';
 raw.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,2,?,?,?,?,?,?,?,?)')
  .run(secondVersion,f.floorId,'fixture2.dxf','fixture2','scrypt$synthetic','DXF',1,f.sha,path2,'2026-11-01');
 raw.prepare('INSERT INTO "SceneAsset"(id,version_id,source_sha256,manifest_json,digest,byte_length,format,storage_locator) VALUES(?,?,?,?,?,1,\'CUSTOM_DTO\',?)')
  .run(secondAsset,secondVersion,f.sha,'{}','b'.repeat(64),'scene/fixture2');
 raw.prepare('INSERT INTO "CurrentScene"(version_id,asset_id,revision) VALUES(?,?,0)').run(secondVersion,secondAsset);
 raw.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?').run(secondVersion,f.floorId);
 expect(()=>raw.prepare('UPDATE "CadZone" SET parent_zone_id=?,revision=revision+1 WHERE id=?').run(child.id,parent.id)).toThrow();
 raw.close();
 expect((await patch(request('PATCH',url+'/zones/'+child.id,f.tokens.editor,{expectedRevision:1,...zoneBody(f,'Child',undefined,foreignParent)}),itemArgs(f.versionId,child.id))).status).toBe(409);
 const secondUrl='/api/cad-files/'+secondVersion;
 const listing=await list(request('GET',secondUrl+'/zones',f.tokens.reader),args(secondVersion));
 expect(listing.status).toBe(200);
 expect(await listing.json()).toMatchObject({versionId:secondVersion,zones:[{id:child.id,geometry:null},{id:parent.id,geometry:null}]});
 const mapped=await patch(request('PATCH',secondUrl+'/zones/'+child.id,f.tokens.editor,
  {expectedRevision:1,...zoneBody(f,'Child',ring(1,1,2),parent.id)}),itemArgs(secondVersion,child.id));
 expect(mapped.status).toBe(200);
 const firstAgain=await list(request('GET',url+'/zones',f.tokens.reader),args(f.versionId));
 expect((await firstAgain.json()).zones.find((z:{id:string})=>z.id===child.id).geometry.state).toBe('MAPPED');
 expect((await db!.cadLocation.findUniqueOrThrow({where:{id:f.floorId}})).currentVersionId).toBe(secondVersion);
});
test('TC-Z196-06: revoked session, Site grant, SHA/Scene proof and schema drift fail closed',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId;
 const wrongSha=zoneBody(f,'Bad source',ring(0,0,3));wrongSha.geometry!.sourceSha256='f'.repeat(64);
 expect((await create(request('POST',url+'/zones',f.tokens.editor,wrongSha,randomUUID()),args(f.versionId))).status).toBe(409);
 const wrongScene=zoneBody(f,'Bad scene',ring(0,0,3));wrongScene.geometry!.sceneRevision=5;
 expect((await create(request('POST',url+'/zones',f.tokens.editor,wrongScene,randomUUID()),args(f.versionId))).status).toBe(409);
 const raw=f.open();
 raw.prepare('DELETE FROM "UserSiteGrant" WHERE user_id=?').run(f.ids.admin);
 raw.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE user_id=?').run(Date.now(),f.ids.reader);
 raw.close();
 expect((await list(request('GET',url+'/zones',f.tokens.reader),args(f.versionId))).status).toBe(401);
 expect((await createCategory(request('POST',url+'/zone-categories',f.tokens.admin,{name:'Denied',sortOrder:0}),args(f.versionId))).status).toBe(403);
 const tamper=f.open();
 tamper.exec('CREATE TRIGGER "zone_test_audit_fail" BEFORE INSERT ON "CadZoneAudit" BEGIN SELECT RAISE(ABORT,\'audit unavailable\'); END');
 tamper.close();
 const failed=await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'Rollback'),randomUUID()),args(f.versionId));
 expect(failed.status).toBe(503);
 const check=f.open();
 expect(check.prepare('SELECT COUNT(*) AS n FROM "CadZone"').get()).toMatchObject({n:0});
 expect(check.prepare('SELECT COUNT(*) AS n FROM "CadZoneCreateReceipt"').get()).toMatchObject({n:0});
 check.close();
});

test('TC-Z196-RESET-HISTORY: 201 deleted mappings do not consume the 200 live Zone reset limit',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId;
 const response=await create(request('POST',url+'/zones',f.tokens.editor,zoneBody(f,'Live',ring(0,0,4)),randomUUID()),args(f.versionId));
 expect(response.status).toBe(201);const live=(await response.json()).zone;
 const raw=f.open();raw.exec('PRAGMA foreign_keys=ON');
 const insertZone=raw.prepare(`INSERT INTO "CadZone" (id,location_id,site_id,name,name_key,category_id,description,code,tags_json,sort_order,parent_zone_id,references_json,revision,created_by_id,updated_by_id,deleted_by_id,created_at,updated_at,deleted_at)
  SELECT ?,location_id,site_id,?,?,NULL,description,code,tags_json,sort_order,NULL,references_json,1,created_by_id,updated_by_id,created_by_id,created_at,updated_at,updated_at FROM "CadZone" WHERE id=?`);
 const insertGeometry=raw.prepare(`INSERT INTO "CadZoneGeometry" (zone_id,location_id,version_id,source_sha256,scene_revision,polygon_json,bounds_json,area,state,reason,revision,created_at,updated_at)
  SELECT ?,location_id,version_id,source_sha256,scene_revision,polygon_json,bounds_json,area,state,reason,1,created_at,updated_at FROM "CadZoneGeometry" WHERE zone_id=?`);
 for(let i=0;i<201;i++){
  const zoneId=randomUUID();insertZone.run(zoneId,'Deleted '+i,'deleted '+i,live.id);insertGeometry.run(zoneId,live.id);
 }
 expect(raw.prepare('SELECT COUNT(*) AS n FROM "CadZoneGeometry"').get()).toMatchObject({n:202});raw.close();
 const proof=requireBusinessWrite(request('POST',url+'/reset',f.tokens.editor,{mode:'SOURCE_ONLY'}),'zone-reset-history');
 for(const mode of ['SOURCE_ONLY','ALL']){
  const result=await resetBusinessVersion(db!,f.versionId,{mode,sourceSha256:f.sha,expectedSceneRevision:0,outlines:[],memos:[]},proof);
  expect(result.unmappedZones).toBe(1);
 }
 const check=f.open();
 expect(check.prepare(`SELECT COUNT(*) AS n FROM "CadZoneGeometry" g JOIN "CadZone" z ON z.id=g.zone_id WHERE z.deleted_at IS NOT NULL AND g.state='MAPPED'`).get()).toMatchObject({n:201});
 expect(check.prepare('SELECT revision,state FROM "CadZoneGeometry" WHERE zone_id=?').get(live.id)).toMatchObject({revision:3,state:'UNMAPPED'});
 check.close();
});

test('TC-Z196-AUDIT-ROLLBACK: Audit insert failure rolls back Zone, Geometry and receipt without schema tampering',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId,key=randomUUID();
 const proof=requireBusinessWrite(request('POST',url+'/zones',f.tokens.editor,{},key),'zone-audit-rollback');
 let reachedAudit=false;
 const intercepted=new Proxy(db!,{get(target,property,receiver){
  if(property==='$transaction')return (action:(tx:Prisma.TransactionClient)=>Promise<unknown>)=>target.$transaction(async tx=>{
   const wrapped=new Proxy(tx,{get(transaction,field,innerReceiver){
    if(field==='cadZoneAudit')return new Proxy(transaction.cadZoneAudit,{get(delegate,method,delegateReceiver){
     if(method==='create')return async()=>{reachedAudit=true;throw new Error('synthetic audit insert failure');};
     return Reflect.get(delegate,method,delegateReceiver);
    }});
    return Reflect.get(transaction,field,innerReceiver);
   }});
   return action(wrapped);
  });
  return Reflect.get(target,property,receiver);
 }});
 await expect(createZoneService(intercepted,f.versionId,zoneBody(f,'Atomic',ring(0,0,4)),proof,key)).rejects.toThrow('synthetic audit insert failure');
 expect(reachedAudit).toBe(true);
 expect(await db!.cadZone.count()).toBe(0);expect(await db!.cadZoneGeometry.count()).toBe(0);
 expect(await db!.cadZoneCreateReceipt.count()).toBe(0);expect(await db!.cadZoneAudit.count()).toBe(0);
 const retry=await createZoneService(db!,f.versionId,zoneBody(f,'Atomic',ring(0,0,4)),proof,key);
 expect(retry.replayed).toBe(false);expect(retry.zone.geometry?.state).toBe('MAPPED');
 expect(await db!.cadZoneCreateReceipt.count()).toBe(1);
});
