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
function setup(withUsers=true){
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
 return {root,dbfile,versionId,sha,typeId,tokens,ids,open:()=>new Sqlite(dbfile)};
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
