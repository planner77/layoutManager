import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {chmodSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import packageInfo from '../../package.json' with {type:'json'};
import {initializeGreenfield} from '../../server/g7-operational/greenfield-install';
import {issueGreenfieldAuthority} from '../../server/g7-operational/greenfield-authority';
import {G7_GREENFIELD_BASELINE,G7_GREENFIELD_SCHEMA_ID,G7_PREVIOUS_TYPES_BASELINE,
 G7_PREVIOUS_TYPES_CHECKSUM,assertG7GreenfieldSchema} from '../../server/g7-operational/greenfield-schema';
import {newSessionCandidate} from '../../server/auth/session';
import {csrfProof} from '../../server/auth/login-service';
import {createDb,type Database} from '../../server/db';
import {installMonotonicTestClock} from '../helpers/monotonic-clock';
import {GET as catalog} from '../../app/api/cad-files/[versionId]/outline-types/route';
import {GET as list,POST as create} from '../../app/api/cad-files/[versionId]/outlines/route';
import {GET as getOne,PATCH as patch,DELETE as remove} from '../../app/api/cad-files/[versionId]/outlines/[outlineId]/route';
import type {IsolatedDb} from '../../server/g7-staging/g1-store';
import {BusinessRepository,requireBusinessWrite} from '../../server/cad-business/service';
import {resetBusinessVersion} from '../../server/cad-business/reset-service';
import {PATCH as patchMemoAnchor} from '../../app/api/cad-files/[versionId]/memos/[memoId]/anchor/route';
import {parseDxfOutlineIndex} from '../../viewers/core/outline-geometry';
import {computeOutline} from '../../viewers/core/outline-compute';
import {buildTypedOutlineRequest} from '../../domain/typed-outline-draft';
import type {AuthorizedOutlineCatalog} from '../../domain/typed-outline';
vi.mock('server-only',()=>({}));

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>IsolatedDb;
const origin='https://cad.example.test';
const polygon={type:'Polygon' as const,coordinates:[[[0,0],[4,0],[4,4],[0,0]]]};
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
  if(role!=='Admin')raw.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)').run(id,'site-a',now);
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
 return {root,dbfile,versionId,sha,typeId,tokens,ids,foreignSiteId,open:()=>new Sqlite(dbfile)};
}
function request(method:string,url:string,token?:string,body?:object,key?:string){
 const headers=new Headers({host:'cad.example.test',...(body?{origin,'content-type':'application/json'}:{})});
 if(token){headers.set('cookie','cad_session='+token);if(body)headers.set('x-csrf-token',csrfProof(token));}
 if(key)headers.set('idempotency-key',key);
 return new Request('http://0.0.0.0'+url,{method,headers,body:body?JSON.stringify(body):undefined});
}
const args=(versionId:string)=>({params:Promise.resolve({versionId})});
const itemArgs=(versionId:string,outlineId:string)=>({params:Promise.resolve({versionId,outlineId})});
function body(f:ReturnType<typeof setup>,typeId:string|null=f.typeId){return {mode:'APP_CREATED',sourceSha256:f.sha,
 expectedSceneRevision:0,name:'Synthetic',kind:'CONVEX',geometry:polygon,derivedFrom:[],outlineTypeId:typeId};}

test('TC-R3-001/009: authorized Version catalogue and paged Outline read enforce Site and role',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId;
 expect((await catalog(request('GET',url+'/outline-types',f.tokens.admin),args(f.versionId))).status).toBe(403);
 const reader=await catalog(request('GET',url+'/outline-types',f.tokens.reader),args(f.versionId));
 expect(reader.status).toBe(200);
 expect(reader.headers.get('cache-control')).toBe('private, no-store');
 expect(reader.headers.get('vary')).toBe('Cookie');
 expect(await reader.json()).toMatchObject({actorId:f.ids.reader,versionId:f.versionId,sourceSha256:f.sha,
  catalogScope:'GLOBAL',canCreate:false,total:1,limit:50,items:[{id:f.typeId,name:'Pipe',active:true}]});
 const editor=await catalog(request('GET',url+'/outline-types',f.tokens.editor),args(f.versionId));
 expect(await editor.json()).toMatchObject({actorId:f.ids.editor,canCreate:true,total:1});
 expect(await (await catalog(request('GET',url+'/outline-types?q=%25',f.tokens.reader),args(f.versionId))).json())
  .toMatchObject({total:0,items:[]});
 const invalid=await catalog(request('GET',url+'/outline-types?limit=1&limit=2',f.tokens.editor),args(f.versionId));
 expect(invalid.status).toBe(400);
 expect(invalid.headers.get('cache-control')).toBe('private, no-store');
 expect(invalid.headers.get('vary')).toBe('Cookie');
 expect(await db!.auditEvent.count({where:{action:'AUTHORIZATION_DENIED',targetId:f.versionId}})).toBeGreaterThanOrEqual(2);
 expect((await list(request('GET',url+'/outlines',f.tokens.reader),args(f.versionId))).status).toBe(200);
});

test('TC-R3-002/004/012: typed create, concurrent same-key replay, mismatch, inactive and explicit Scene CAS',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId+'/outlines',key=randomUUID();
 const post=(value:object,k=key)=>create(request('POST',url,f.tokens.editor,value,k),args(f.versionId));
 const results=await Promise.all([post(body(f)),post(body(f))]);
 expect(results.map(r=>r.status).sort()).toEqual([200,201]);
 const rows=await Promise.all(results.map(r=>r.json()));expect(rows[0].id).toBe(rows[1].id);
 expect((await getOne(request('GET',url+'/'+rows[0].id,f.tokens.reader),itemArgs(f.versionId,rows[0].id))).status).toBe(200);
 expect(rows.map(r=>r.replayed).sort()).toEqual([false,true]);
 expect((await post({...body(f),name:'Different'})).status).toBe(409);
 expect(await db!.cadOutline.count()).toBe(1);
 expect(await db!.cadOutlineCreateReceipt.count()).toBe(1);
 expect(await db!.cadBusinessAudit.count({where:{targetKind:'OUTLINE',action:'CREATE'}})).toBe(1);
 const reversed={outlineTypeId:f.typeId,derivedFrom:[],geometry:polygon,kind:'CONVEX',
  name:'Synthetic',expectedSceneRevision:0,sourceSha256:f.sha,mode:'APP_CREATED'};
 expect((await post(reversed)).status).toBe(200);
 await db!.outlineType.update({where:{id:f.typeId},data:{active:false,revision:2}});
 expect((await post(body(f))).status).toBe(200);
 expect((await post(body(f),randomUUID())).status).toBe(409);
 await db!.currentScene.update({where:{versionId:f.versionId},data:{revision:1}});
 const page=await list(request('GET',url,f.tokens.reader),args(f.versionId));
 expect(await page.json()).toMatchObject({total:1,sceneRevision:1,outlines:[{id:rows[0].id,
  sceneRevision:0,outlineType:{id:f.typeId,name:'Pipe',active:false}}]});
 expect((await post(body(f))).status).toBe(200);
 const edit=(value:object)=>patch(request('PATCH',url+'/'+rows[0].id,f.tokens.editor,value),itemArgs(f.versionId,rows[0].id));
 expect((await edit({expectedRevision:0,operation:'rename',name:'Legacy blocked'})).status).toBe(409);
 expect((await edit({expectedRevision:0,expectedSceneRevision:0,operation:'rename',name:'Old pointer'})).status).toBe(409);
 expect((await edit({expectedRevision:0,expectedSceneRevision:1,operation:'rename',name:'Current'})).status).toBe(200);
 expect(await db!.cadOutline.findUnique({where:{id:rows[0].id}})).toMatchObject({revision:1,sceneRevision:1,name:'Current'});
 const proof=requireBusinessWrite(request('POST','/api/cad-files/'+f.versionId+'/reset',f.tokens.editor,
  {mode:'SOURCE_ONLY'}),'synthetic-source-reset');
 await expect(resetBusinessVersion(db!,f.versionId,{mode:'SOURCE_ONLY',sourceSha256:f.sha,
  expectedSceneRevision:1,outlines:[{id:rows[0].id,revision:1}],memos:[]},proof))
  .resolves.toMatchObject({mode:'SOURCE_ONLY',deletedOutlines:0});
 expect(await (await list(request('GET',url,f.tokens.reader),args(f.versionId))).json())
  .toMatchObject({total:1,outlines:[{id:rows[0].id,revision:1,sceneRevision:1}]});
});

test('TC-R3-002/004: typed header/body guards and distinct keys create distinct UUIDs',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId+'/outlines';
 const post=(value:object,key?:string)=>create(request('POST',url,f.tokens.editor,value,key),args(f.versionId));
 expect((await post(body(f))).status).toBe(400);
 expect((await post({...body(f),outlineTypeId:randomUUID()},randomUUID())).status).toBe(409);
 expect((await post({...body(f),actorId:f.ids.admin},randomUUID())).status).toBe(400);
 expect((await post({...body(f),name:'A\u200bB'},randomUUID())).status).toBe(400);
 const created=await Promise.all([post(body(f),randomUUID()),post(body(f),randomUUID())]);
 expect(created.map(row=>row.status)).toEqual([201,201]);
 const ids=await Promise.all(created.map(async row=>(await row.json()).id));
 expect(new Set(ids).size).toBe(2);
 expect(await db!.cadOutlineCreateReceipt.count()).toBe(2);
 expect(await db!.cadBusinessAudit.count({where:{targetKind:'OUTLINE',action:'CREATE'}})).toBe(2);
});

test('TC-R3-010: legacy keyless typeless POST remains a separate unclassified path',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId+'/outlines';
 const response=await create(request('POST',url,f.tokens.editor,body(f,null)),args(f.versionId));
 expect(response.status).toBe(201);
 expect(await response.json()).toMatchObject({outlineTypeId:null,outlineType:null,replayed:false});
 expect(await db!.cadOutlineCreateReceipt.count()).toBe(0);
});

test('TC-R3-003: source mode reads immutable server DXF and checks type claim after scoped preflight',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId,reader=await catalog(
  request('GET',url+'/outline-types',f.tokens.editor),args(f.versionId));
 const catalogue=await reader.json() as AuthorizedOutlineCatalog;
 const preview=computeOutline('CONVEX',parseDxfOutlineIndex(dxf,f.versionId,f.sha).entities);
 const input=buildTypedOutlineRequest(preview,catalogue,
  {actorId:f.ids.editor,versionId:f.versionId,sourceSha256:f.sha,unitCode:4},f.typeId,'Source',1);
 expect(input.mode).toBe('SOURCE_CANONICAL');
 const created=await create(request('POST',url+'/outlines',f.tokens.editor,input,randomUUID()),args(f.versionId));
 expect(created.status).toBe(201);
 expect(await created.json()).toMatchObject({validationMode:'SOURCE_CANONICAL',outlineTypeId:f.typeId,
  sourceSha256:f.sha,sourceRefs:[expect.stringContaining(f.versionId+':'+f.sha+':')]});
 const forged=structuredClone(input);
 if(forged.mode!=='SOURCE_CANONICAL')throw new Error('source expected');
 (forged.sourceExport as {outlines:{outlineTypeId:string}[]}).outlines[0].outlineTypeId=randomUUID();
 expect((await create(request('POST',url+'/outlines',f.tokens.editor,forged,randomUUID()),args(f.versionId))).status).toBe(409);
 expect((await create(request('POST',url+'/outlines',f.tokens.admin,
  {...input,sourceExport:{invalid:true}},randomUUID()),args(f.versionId))).status).toBe(403);
 expect(await db!.cadOutline.count()).toBe(1);
});

test('TC-R3-004/005: soft-deleted replay returns 410; receipt is append-only and scope-bound',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId+'/outlines',key=randomUUID();
 const created=await create(request('POST',url,f.tokens.editor,body(f),key),args(f.versionId));
 expect(created.status).toBe(201);const item=await created.json();
 await db!.currentScene.update({where:{versionId:f.versionId},data:{revision:1}});
 expect((await remove(request('DELETE',url+'/'+item.id,f.tokens.editor,{expectedRevision:0}),
  itemArgs(f.versionId,item.id))).status).toBe(409);
 const deleted=await remove(request('DELETE',url+'/'+item.id,f.tokens.editor,{expectedRevision:0,expectedSceneRevision:1}),
  itemArgs(f.versionId,item.id));
 expect(deleted.status).toBe(200);
 expect((await create(request('POST',url,f.tokens.editor,body(f),key),args(f.versionId))).status).toBe(410);
 expect(await db!.cadOutline.count({where:{deletedAt:null}})).toBe(0);
 const raw=f.open();raw.exec('PRAGMA foreign_keys=ON');
 expect(()=>raw.prepare('DELETE FROM "CadOutlineCreateReceipt"').run()).toThrow();
 expect(()=>raw.prepare('UPDATE "CadOutlineCreateReceipt" SET created_at=?').run('x')).toThrow();
 const receipt=raw.prepare('SELECT outline_id FROM "CadOutlineCreateReceipt"').get()!;
 expect(receipt.outline_id).toBe(item.id);
 const unattached=randomUUID();
 raw.prepare('INSERT INTO "CadOutline"(id,version_id,source_sha256,scene_revision,origin,validation_mode,kind,name,base_geometry_json,geometry_json,source_refs_json,derived_from_json,transform_json,outline_type_id,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,1,\'APP_CREATED\',\'APP_CREATED\',\'CONVEX\',?,?,?,?,?,?,?,?,?,?,?)')
  .run(unattached,f.versionId,f.sha,'Unreceipted',JSON.stringify(polygon),JSON.stringify(polygon),
   '[]','[]','[]',f.typeId,f.ids.editor,f.ids.editor,'2026-11-01','2026-11-01');
 expect(()=>raw.prepare('INSERT INTO "CadOutlineCreateReceipt"(id,actor_user_id,version_id,idempotency_key,request_sha256,outline_id,created_at) VALUES(?,?,?,?,?,?,?)')
  .run(randomUUID(),f.ids.reader,f.versionId,randomUUID(),'a'.repeat(64),unattached,'2026-11-01'))
  .toThrow('CAD_OUTLINE_RECEIPT_SCOPE');
 raw.close();
});

test('TC-R3-005: receipt insert failure rolls back Outline and CREATE audit',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId+'/outlines';
 const key=randomUUID(),input=body(f),http=request('POST',url,f.tokens.editor,input,key);
 const proof=requireBusinessWrite(http,'synthetic-receipt-fault');
 const faulted=db!.$extends({query:{cadOutlineCreateReceipt:{async create(){throw new Error('synthetic receipt failure');}}}});
 await expect(new BusinessRepository(faulted as unknown as Database)
  .createOutline(f.versionId,input,proof,key)).rejects.toThrow('synthetic receipt failure');
 expect(await db!.cadOutline.count()).toBe(0);
 expect(await db!.cadOutlineCreateReceipt.count()).toBe(0);
 expect(await db!.cadBusinessAudit.count({where:{targetKind:'OUTLINE',action:'CREATE'}})).toBe(0);
});

test('TC-R3-005: audit insert failure rolls back Outline and receipt',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId+'/outlines';
 const key=randomUUID(),input=body(f),http=request('POST',url,f.tokens.editor,input,key);
 const proof=requireBusinessWrite(http,'synthetic-audit-fault');
 const faulted=db!.$extends({query:{cadBusinessAudit:{async create(){throw new Error('synthetic audit failure');}}}});
 await expect(new BusinessRepository(faulted as unknown as Database)
  .createOutline(f.versionId,input,proof,key)).rejects.toThrow('synthetic audit failure');
 expect(await db!.cadOutline.count()).toBe(0);
 expect(await db!.cadOutlineCreateReceipt.count()).toBe(0);
 expect(await db!.cadBusinessAudit.count()).toBe(0);
});

test('TC-R3-009: 100 tied rows paginate without gaps and the 101st creation is refused',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId+'/outlines',raw=f.open();
 raw.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
 try{
  const insert=raw.prepare('INSERT INTO "CadOutline"(id,version_id,source_sha256,scene_revision,origin,validation_mode,kind,name,base_geometry_json,geometry_json,source_refs_json,derived_from_json,transform_json,outline_type_id,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,0,\'APP_CREATED\',\'APP_CREATED\',\'CONVEX\',?,?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<100;i++)insert.run(randomUUID(),f.versionId,f.sha,'Row '+i,
   JSON.stringify(polygon),JSON.stringify(polygon),'[]','[]','[]',f.typeId,f.ids.editor,f.ids.editor,
   '2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z');
  raw.exec('COMMIT');
 }catch(error){raw.exec('ROLLBACK');throw error;}finally{raw.close();}
 const seen:string[]=[];
 for(const offset of [0,25,50,75]){
  const response=await list(request('GET',url+'?offset='+offset+'&limit=25',f.tokens.reader),args(f.versionId));
  expect(response.status).toBe(200);
  const page=await response.json();expect(page).toMatchObject({total:100,offset,limit:25});
  seen.push(...page.outlines.map((row:{id:string})=>row.id));
 }
 expect(seen).toHaveLength(100);expect(new Set(seen).size).toBe(100);
 expect(seen).toEqual([...seen].sort());
 expect((await getOne(request('GET',url+'/'+seen[99],f.tokens.reader),itemArgs(f.versionId,seen[99]))).status).toBe(200);
 expect((await create(request('POST',url,f.tokens.editor,body(f),randomUUID()),args(f.versionId))).status).toBe(413);
 expect(await db!.cadOutline.count()).toBe(100);
});

test('TC-R3-001/005: exact R2 schema stays valid but new Version endpoints return 503 without DDL',async()=>{
 const f=setup(),url='/api/cad-files/'+f.versionId,raw=f.open();
 raw.exec('DROP TABLE "CadOutlineCreateReceipt"');
 raw.prepare('UPDATE "_prisma_migrations" SET migration_name=?,checksum=?')
  .run(G7_PREVIOUS_TYPES_BASELINE,G7_PREVIOUS_TYPES_CHECKSUM);
 expect(()=>assertG7GreenfieldSchema(raw)).not.toThrow();
 const objects=raw.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
 raw.close();
 expect((await catalog(request('GET',url+'/outline-types',f.tokens.editor),args(f.versionId))).status).toBe(503);
 expect((await list(request('GET',url+'/outlines',f.tokens.reader),args(f.versionId))).status).toBe(503);
 expect((await create(request('POST',url+'/outlines',f.tokens.editor,body(f),randomUUID()),args(f.versionId))).status).toBe(503);
 const after=f.open();
 expect(after.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all()).toEqual(objects);
 after.close();
});

test('TC-R3-001: User0 catalogue/Outline probes return 503 and leave all audit ledgers empty',async()=>{
 const f=setup(false),url='/api/cad-files/'+f.versionId;
 expect((await catalog(request('GET',url+'/outline-types'),args(f.versionId))).status).toBe(503);
 expect((await list(request('GET',url+'/outlines'),args(f.versionId))).status).toBe(503);
 expect((await create(request('POST',url+'/outlines',undefined,body(f),randomUUID()),args(f.versionId))).status).toBe(503);
 const raw=f.open();
 for(const table of ['User','AuditEvent','CadBusinessAudit','OutlineTypeAudit','CadOutlineCreateReceipt'])
  expect(raw.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get()).toMatchObject({n:0});
 raw.close();
});

test('TC-R4-004/005: explicit owner KEEP uses existing target inverse across Scene pointer change; DETACH is atomic',async()=>{
 const f=setup(),outlineId=randomUUID(),memoId=randomUUID(),now='2026-11-01T00:00:00.000Z';
 const base={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,0]]]},ops=[{type:'Translate',dx:5,dy:0}];
 await db!.cadOutline.create({data:{id:outlineId,versionId:f.versionId,sourceSha256:f.sha,
  sceneRevision:0,origin:'APP_CREATED',validationMode:'APP_CREATED',kind:'CONVEX',name:'Target',
  baseGeometryJson:JSON.stringify(base),geometryJson:JSON.stringify(base),sourceRefsJson:'[]',
  derivedFromJson:'[]',transformJson:JSON.stringify(ops),revision:2,createdById:f.ids.editor,
  updatedById:f.ids.editor,createdAt:now,updatedAt:now}});
 await db!.cadMemo.create({data:{id:memoId,versionId:f.versionId,sourceSha256:f.sha,title:'Pinned',
  content:'synthetic',anchorX:5,anchorY:0,offsetX:0,offsetY:0,revision:0,
  createdById:f.ids.editor,updatedById:f.ids.editor,createdAt:now,updatedAt:now}});
 await db!.cadMemoAnchor.create({data:{memoId,versionId:f.versionId,sourceSha256:f.sha,
  status:'ATTACHED',targetOrigin:'APP_CREATED',targetId:outlineId,localX:0,localY:0,
  createdAt:now,updatedAt:now}});
 await db!.currentScene.update({where:{versionId:f.versionId},data:{revision:1}});
 const url='/api/cad-files/'+f.versionId+'/memos/'+memoId+'/anchor';
 const move=(token:string,value:object)=>patchMemoAnchor(request('PATCH',url,token,value),
  {params:Promise.resolve({versionId:f.versionId,memoId})});
 const keep={operation:'reposition',behavior:'KEEP',expectedRevision:0,expectedSceneRevision:1,
  expectedTargetRevision:2,anchorWcsXY:{x:9,y:3}};
 expect((await move(f.tokens.reader,keep)).status).toBe(403);
 expect((await move(f.tokens.editor,{...keep,targetId:randomUUID()})).status).toBe(400);
 expect((await move(f.tokens.editor,{operation:'reposition',behavior:'KEEP',expectedRevision:0,
  expectedSceneRevision:1,anchorWcsXY:{x:9,y:3}})).status).toBe(400);
 expect((await move(f.tokens.editor,{...keep,expectedTargetRevision:1})).status).toBe(409);
 expect((await move(f.tokens.editor,{...keep,expectedSceneRevision:0})).status).toBe(409);
 const secondId=randomUUID(),session=newSessionCandidate(secondId,Date.now());
 await db!.user.create({data:{id:secondId,loginName:'r4-second-editor',passwordHash:'synthetic-hash',
  status:'ACTIVE',mustChangePassword:false,createdAt:BigInt(Date.now()),updatedAt:BigInt(Date.now())}});
 await db!.userRoleGrant.create({data:{userId:secondId,role:'Editor',grantedAt:BigInt(Date.now())}});
 await db!.userSiteGrant.create({data:{userId:secondId,siteId:'site-a',grantedAt:BigInt(Date.now())}});
 await db!.authSession.create({data:{id:session.session.id,userId:secondId,
  tokenHash:session.session.tokenHash,issuedAt:BigInt(session.session.issuedAt),
  lastSeenAt:BigInt(session.session.lastSeenAt),expiresAt:BigInt(session.session.expiresAt)}});
 expect((await move(session.rawToken,keep)).status).toBe(403);
 const raw=f.open();raw.exec("CREATE TRIGGER r4_audit_fail BEFORE INSERT ON CadBusinessAudit BEGIN SELECT RAISE(ABORT,'R4_AUDIT_FAILURE'); END");raw.close();
 expect((await move(f.tokens.editor,keep)).status).toBeGreaterThanOrEqual(500);
 const rawAfter=f.open();rawAfter.exec('DROP TRIGGER r4_audit_fail');rawAfter.close();
 expect(await db!.cadMemo.findUnique({where:{id:memoId}})).toMatchObject({anchorX:5,revision:0});
 expect(await db!.cadMemoAnchor.findUnique({where:{memoId}})).toMatchObject({localX:0,localY:0});
 const response=await move(f.tokens.editor,keep);
 expect(response.status).toBe(200);
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(response.headers.get('vary')).toBe('Cookie');
 expect(await response.json()).toMatchObject({revision:1,anchorWcsXY:{x:9,y:3},
  anchor:{mode:'ATTACHED',localAnchorWcsXY:{x:4,y:3}}});
 expect(await db!.cadBusinessAudit.count({where:{targetKind:'MEMO',targetId:memoId,
  action:'EDIT',outcome:'SUCCESS'}})).toBe(1);
 expect((await move(f.tokens.editor,{operation:'reposition',behavior:'DETACH',expectedRevision:1,
  expectedSceneRevision:1,expectedTargetRevision:2,anchorWcsXY:{x:8,y:7}})).status).toBe(400);
 const detached=await move(f.tokens.editor,{operation:'reposition',behavior:'DETACH',expectedRevision:1,
  expectedSceneRevision:1,anchorWcsXY:{x:8,y:7}});
 expect(detached.status).toBe(200);
 expect(await detached.json()).toMatchObject({revision:2,anchor:{mode:'FREE'},anchorWcsXY:{x:8,y:7}});
 expect(await db!.cadMemoAnchor.findUnique({where:{memoId}})).toBeNull();
 expect(await db!.cadBusinessAudit.count({where:{targetId:memoId,action:'EDIT'}})).toBe(2);
 const free=await move(f.tokens.editor,{operation:'reposition',behavior:'DETACH',expectedRevision:2,
  expectedSceneRevision:1,anchorWcsXY:{x:10,y:8}});
 expect(free.status).toBe(200);expect(await free.json()).toMatchObject({revision:3,anchor:{mode:'FREE'}});
});

test('TC-R4-004: Source KEEP requires the stored live canonical reference and forbids target revision',async()=>{
 const f=setup(),outlineId=randomUUID(),memoId=randomUUID(),ref=f.versionId+':'+f.sha+':handle-1',
  now='2026-11-01T00:00:00.000Z',base={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,0]]]};
 await db!.cadOutline.create({data:{id:outlineId,versionId:f.versionId,sourceSha256:f.sha,
  sceneRevision:0,origin:'APP_CREATED',validationMode:'SOURCE_CANONICAL',kind:'CONVEX',name:'Source',
  baseGeometryJson:JSON.stringify(base),geometryJson:JSON.stringify(base),sourceRefsJson:JSON.stringify([ref]),
  derivedFromJson:'[]',transformJson:'[]',revision:0,createdById:f.ids.editor,
  updatedById:f.ids.editor,createdAt:now,updatedAt:now}});
 await db!.cadMemo.create({data:{id:memoId,versionId:f.versionId,sourceSha256:f.sha,title:'Source memo',
  content:'synthetic',anchorX:1,anchorY:2,offsetX:0,offsetY:0,revision:0,
  createdById:f.ids.editor,updatedById:f.ids.editor,createdAt:now,updatedAt:now}});
 await db!.cadMemoAnchor.create({data:{memoId,versionId:f.versionId,sourceSha256:f.sha,
  status:'ATTACHED',targetOrigin:'DXF_IMPORTED',targetId:ref,localX:1,localY:2,
  createdAt:now,updatedAt:now}});
 const url='/api/cad-files/'+f.versionId+'/memos/'+memoId+'/anchor';
 const move=(value:object)=>patchMemoAnchor(request('PATCH',url,f.tokens.editor,value),
  {params:Promise.resolve({versionId:f.versionId,memoId})});
 const body={operation:'reposition',behavior:'KEEP',expectedRevision:0,expectedSceneRevision:0,
  anchorWcsXY:{x:7,y:8}};
 expect((await move({...body,expectedTargetRevision:0})).status).toBe(400);
 const kept=await move(body);expect(kept.status).toBe(200);
 expect(await kept.json()).toMatchObject({revision:1,anchorWcsXY:{x:7,y:8},
  anchor:{mode:'ATTACHED',localAnchorWcsXY:{x:7,y:8}}});
 await db!.cadOutline.update({where:{id:outlineId},data:{deletedAt:now,deletedById:f.ids.editor}});
 expect((await move({...body,expectedRevision:1,anchorWcsXY:{x:9,y:9}})).status).toBe(422);
 expect(await db!.cadMemo.findUnique({where:{id:memoId}})).toMatchObject({anchorX:7,anchorY:8,revision:1});
});

test('TC-R4-005 QA: concurrent owner KEEP CAS has one winner and later target rotation preserves its local point',async()=>{
 const f=setup(),outlineId=randomUUID(),memoId=randomUUID(),now='2026-11-01T00:00:00.000Z';
 const base={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,0]]]},initialOps=[{type:'Translate',dx:5,dy:0}];
 await db!.cadOutline.create({data:{id:outlineId,versionId:f.versionId,sourceSha256:f.sha,
  sceneRevision:0,origin:'APP_CREATED',validationMode:'APP_CREATED',kind:'CONVEX',name:'Concurrent target',
  baseGeometryJson:JSON.stringify(base),geometryJson:JSON.stringify(base),sourceRefsJson:'[]',derivedFromJson:'[]',
  transformJson:JSON.stringify(initialOps),revision:2,createdById:f.ids.editor,updatedById:f.ids.editor,
  createdAt:now,updatedAt:now}});
 await db!.cadMemo.create({data:{id:memoId,versionId:f.versionId,sourceSha256:f.sha,title:'CAS memo',content:'synthetic',
  anchorX:5,anchorY:0,offsetX:0,offsetY:0,revision:0,createdById:f.ids.editor,updatedById:f.ids.editor,
  createdAt:now,updatedAt:now}});
 await db!.cadMemoAnchor.create({data:{memoId,versionId:f.versionId,sourceSha256:f.sha,status:'ATTACHED',
  targetOrigin:'APP_CREATED',targetId:outlineId,localX:0,localY:0,createdAt:now,updatedAt:now}});
 const url='/api/cad-files/'+f.versionId+'/memos/'+memoId+'/anchor';
 const move=(value:object)=>patchMemoAnchor(request('PATCH',url,f.tokens.editor,value),
  {params:Promise.resolve({versionId:f.versionId,memoId})});
 const candidate=(anchorWcsXY:{x:number;y:number})=>({operation:'reposition',behavior:'KEEP',
  expectedRevision:0,expectedSceneRevision:0,expectedTargetRevision:2,anchorWcsXY});
 const responses=await Promise.all([move(candidate({x:9,y:3})),move(candidate({x:8,y:4}))]);
 expect(responses.map(value=>value.status).sort()).toEqual([200,409]);
 const winner=await responses.find(value=>value.status===200)!.json();
 const memoAfterRace=await db!.cadMemo.findUnique({where:{id:memoId}});
 const anchorAfterRace=await db!.cadMemoAnchor.findUnique({where:{memoId}});
 expect(memoAfterRace).toMatchObject({revision:1,anchorX:winner.anchorWcsXY.x,anchorY:winner.anchorWcsXY.y});
 expect(anchorAfterRace).toMatchObject({status:'ATTACHED',targetId:outlineId,
  localX:winner.anchorWcsXY.x-5,localY:winner.anchorWcsXY.y});
 expect(await db!.cadBusinessAudit.count({where:{targetKind:'MEMO',targetId:memoId,action:'EDIT',outcome:'SUCCESS'}})).toBe(1);
 const targetMove=await patch(request('PATCH','/api/cad-files/'+f.versionId+'/outlines/'+outlineId,f.tokens.editor,{
  expectedRevision:2,expectedSceneRevision:0,operation:'transform',operations:[...initialOps,
   {type:'Rotate',angleDegrees:90,pivot:[0,0]}],
 }),itemArgs(f.versionId,outlineId));
 expect(targetMove.status).toBe(200);
 const expectedWorld={x:-winner.anchorWcsXY.y,y:winner.anchorWcsXY.x};
 const memoAfterTargetMove=await db!.cadMemo.findUnique({where:{id:memoId}});
 expect(memoAfterTargetMove?.revision).toBe(2);
 expect(memoAfterTargetMove?.anchorX).toBeCloseTo(expectedWorld.x,10);
 expect(memoAfterTargetMove?.anchorY).toBeCloseTo(expectedWorld.y,10);
 expect(await db!.cadMemoAnchor.findUnique({where:{memoId}})).toMatchObject({targetId:outlineId,
  localX:winner.anchorWcsXY.x-5,localY:winner.anchorWcsXY.y});
 expect(await db!.cadBusinessAudit.count({where:{targetKind:'MEMO',targetId:memoId,action:'EDIT',outcome:'SUCCESS'}})).toBe(2);
});

test('TC-R4-003/004 QA: wrong Site/Version, forged local/target data and invalid stored affine do not mutate Memo',async()=>{
 const f=setup(true,true),outlineId=randomUUID(),memoId=randomUUID(),now='2026-11-01T00:00:00.000Z';
 const base={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,0]]]};
 await db!.cadOutline.create({data:{id:outlineId,versionId:f.versionId,sourceSha256:f.sha,sceneRevision:0,
  origin:'APP_CREATED',validationMode:'APP_CREATED',kind:'CONVEX',name:'Malformed target',
  baseGeometryJson:JSON.stringify(base),geometryJson:JSON.stringify(base),sourceRefsJson:'[]',derivedFromJson:'[]',
  transformJson:'[]',revision:0,createdById:f.ids.editor,updatedById:f.ids.editor,createdAt:now,updatedAt:now}});
 await db!.cadMemo.create({data:{id:memoId,versionId:f.versionId,sourceSha256:f.sha,title:'Guard memo',content:'synthetic',
  anchorX:1,anchorY:2,offsetX:0,offsetY:0,revision:0,createdById:f.ids.editor,updatedById:f.ids.editor,
  createdAt:now,updatedAt:now}});
 await db!.cadMemoAnchor.create({data:{memoId,versionId:f.versionId,sourceSha256:f.sha,status:'ATTACHED',
  targetOrigin:'APP_CREATED',targetId:outlineId,localX:1,localY:2,createdAt:now,updatedAt:now}});
 const url='/api/cad-files/'+f.versionId+'/memos/'+memoId+'/anchor';
 const body={operation:'reposition',behavior:'KEEP',expectedRevision:0,expectedSceneRevision:0,
  expectedTargetRevision:0,anchorWcsXY:{x:7,y:8}};
 const move=(token:string,value:object,versionId=f.versionId,memo=memoId)=>patchMemoAnchor(
  request('PATCH','/api/cad-files/'+versionId+'/memos/'+memo+'/anchor',token,value),
  {params:Promise.resolve({versionId,memoId:memo})});
 for(const forged of [{...body,targetId:outlineId},{...body,targetOrigin:'APP_CREATED'},
   {...body,matrix:[1,0,0,1,0,0]},{...body,localAnchorWcsXY:{x:1,y:2}}])
  expect((await move(f.tokens.editor,forged)).status).toBe(400);
 expect((await move(f.tokens.editor,{...body,anchorWcsXY:{x:null,y:8}})).status).toBe(422);
 expect((await move(f.tokens.editor,body,randomUUID())).status).toBe(403);
 const siteB=f.foreignSiteId!;
 const foreignId=randomUUID(),issuedAt=Date.now(),session=newSessionCandidate(foreignId,issuedAt);
 await db!.user.create({data:{id:foreignId,loginName:'r4-foreign-'+foreignId.slice(0,8),passwordHash:'synthetic-hash',
  status:'ACTIVE',mustChangePassword:false,createdAt:BigInt(issuedAt),updatedAt:BigInt(issuedAt)}});
 await db!.userRoleGrant.create({data:{userId:foreignId,role:'Editor',grantedAt:BigInt(issuedAt)}});
 await db!.userSiteGrant.create({data:{userId:foreignId,siteId:siteB,grantedAt:BigInt(issuedAt)}});
 await db!.authSession.create({data:{id:session.session.id,userId:foreignId,tokenHash:session.session.tokenHash,
  issuedAt:BigInt(session.session.issuedAt),lastSeenAt:BigInt(session.session.lastSeenAt),expiresAt:BigInt(session.session.expiresAt)}});
 expect((await move(session.rawToken,body)).status).toBe(403);
 const raw=f.open();raw.prepare('UPDATE "CadOutline" SET transform_json=? WHERE id=?').run('[{"type":"Scale"}]',outlineId);raw.close();
 const invalidAffine=await move(f.tokens.editor,body);expect(invalidAffine.status).toBe(422);
 expect(await db!.cadMemo.findUnique({where:{id:memoId}})).toMatchObject({revision:0,anchorX:1,anchorY:2});
 expect(await db!.cadMemoAnchor.findUnique({where:{memoId}})).toMatchObject({localX:1,localY:2,targetId:outlineId});
 expect(await db!.cadBusinessAudit.count({where:{targetKind:'MEMO',targetId:memoId,action:'EDIT'}})).toBe(0);
});
