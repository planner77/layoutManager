import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import packageInfo from '../../package.json' with { type: 'json' };
import { initializeGreenfield } from '../../server/g7-operational/greenfield-install';
import { issueGreenfieldAuthority } from '../../server/g7-operational/greenfield-authority';
import { G7_GREENFIELD_SCHEMA_ID } from '../../server/g7-operational/greenfield-schema';
import { resolveG7RuntimeGate } from '../../server/g7-operational/runtime-gate';
import { csrfProof } from '../../server/auth/login-service';
import { newSessionCandidate } from '../../server/auth/session';
import { createDb, type Database } from '../../server/db';
import * as dbModule from '../../server/db';
import { installMonotonicTestClock } from '../helpers/monotonic-clock';
import { GET as catalog } from '../../app/api/cad-files/[versionId]/outline-types/route';
import { GET as list } from '../../app/api/cad-files/[versionId]/outlines/route';
import { POST as create } from '../../app/api/cad-files/[versionId]/outlines/route';
import { BusinessRepository, requireBusinessWrite } from '../../server/cad-business/service';
import type { IsolatedDb } from '../../server/g7-staging/g1-store';
vi.mock('server-only', () => ({}));

const Sqlite = createRequire(import.meta.url)('better-sqlite3') as new(file: string) => IsolatedDb & {
  backup(filename: string): Promise<unknown>;
};
const origin = 'https://cad.example.test';
const geometry = { type:'Polygon' as const, coordinates:[[[0,0],[4,0],[4,4],[0,0]]] };
const dxf = ['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','LWPOLYLINE','5','1A','8','0','90','4','70','1',
  '10','0','20','0','10','10','20','0','10','10','20','10','10','0','20','10',
  '0','ENDSEC','0','EOF',''].join('\n');
let db: Database | undefined, cleanup: (() => void) | undefined;
beforeEach(installMonotonicTestClock);
afterEach(async () => { await db?.$disconnect(); db = undefined; cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(),'typed-outline-qa-')); chmodSync(root,0o700);
  const dbDir=path.join(root,'db'),cad=path.join(root,'cad'),owner=path.join(root,'owner'),out=path.join(root,'out');
  for(const dir of [dbDir,cad,owner,out])mkdirSync(dir,{mode:0o700});
  const dbfile=path.join(dbDir,'cad.sqlite');
  const install:Record<string,string>={NODE_ENV:'production',G7_GREENFIELD_MODE:'true',DATABASE_URL:'file:'+dbfile,
    CAD_STORAGE_PATH:cad,CAD_STORAGE_BACKEND:'local',G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_GREENFIELD_INSTALL_ACK:'CREATE_EMPTY_G7_DATABASE'};
  initializeGreenfield(install);
  const raw=new Sqlite(dbfile);raw.exec('PRAGMA foreign_keys=ON');
  raw.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu','Synthetic');
  raw.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('product','bu','Product');
  for(const [id,name] of [['site-a','Site A'],['site-b','Site B']])
    raw.prepare('INSERT INTO "CadSite"(id,product_id,name) VALUES(?,?,?)').run(id,'product',name);
  const versions:Record<string,{id:string;sha:string}>={};
  for(const [site,key] of [['site-a','a'],['site-b','b']]) {
    const building='building-'+key,floor='floor-'+key,versionId=randomUUID(),bytes=new TextEncoder().encode(dxf);
    raw.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run(building,site,'Building '+key);
    raw.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,2)').run(floor,building,'Floor '+key);
    const sha=createHash('sha256').update(bytes).digest('hex'),storagePath=floor+'/'+versionId+'/original.dxf';
    mkdirSync(path.join(cad,floor,versionId),{recursive:true,mode:0o700});
    writeFileSync(path.join(cad,storagePath),bytes,{mode:0o600});
    raw.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)')
      .run(versionId,floor,'fixture.dxf','synthetic','scrypt$fixture','DXF',bytes.byteLength,sha,storagePath,'2026-11-01');
    const asset=randomUUID();
    raw.prepare('INSERT INTO "SceneAsset"(id,version_id,source_sha256,manifest_json,digest,byte_length,format,storage_locator) VALUES(?,?,?,?,?,1,\'CUSTOM_DTO\',?)')
      .run(asset,versionId,sha,'{}','a'.repeat(64),'scene/'+key);
    raw.prepare('INSERT INTO "CurrentScene"(version_id,asset_id,revision) VALUES(?,?,0)').run(versionId,asset);
    versions[site]={id:versionId,sha};
  }
  const tokens:Record<string,string>={},ids:Record<string,string>={};
  for(const role of ['Admin','EditorA','ReaderA','ReaderB']) {
    const id=randomUUID(),now=Date.now();ids[role]=id;
    raw.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',0,?,?)')
      .run(id,role.toLowerCase(),'scrypt$fixture',now,now);
    raw.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(id,role.startsWith('Reader')?'Reader':role.startsWith('Editor')?'Editor':'Admin',now);
    const grantedSite=role.endsWith('B')?'site-b':'site-a';
    if(role!=='Admin')raw.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)').run(id,grantedSite,now);
    const session=newSessionCandidate(id,now);tokens[role]=session.rawToken;
    raw.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
      .run(session.session.id,id,session.session.tokenHash,session.session.issuedAt,session.session.lastSeenAt,session.session.expiresAt);
  }
  const typeId=randomUUID();
  raw.prepare('INSERT INTO "OutlineType"(id,name,name_key,active,sort_order,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,1,0,1,?,?,?,?)')
    .run(typeId,'Global Type','global type',ids.Admin,ids.Admin,'2026-11-01','2026-11-01');
  raw.close();
  const keys=generateKeyPairSync('ed25519'),key=path.join(owner,'key.pem');
  writeFileSync(key,keys.privateKey.export({format:'pem',type:'pkcs8'}).toString(),{mode:0o600});
  const input=path.join(owner,'input.json'),release={sourceCommit:'1'.repeat(40),version:packageInfo.version,
    appDigest:'sha256:'+'a'.repeat(64),migratorDigest:'sha256:'+'b'.repeat(64)};
  writeFileSync(input,JSON.stringify({origin,release,scopes:['AUTH','CAD_WRITE'],
    approvalId:'OWNER-outline-qa',changeRequestId:'CR-outline-qa',validMinutes:60}),{mode:0o600});
  issueGreenfieldAuthority('init',input,out,key,install);
  const env:Record<string,string>={...install,G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
    G7_RUNTIME_TRUST_PATH:path.join(out,'runtime-trust.json'),G7_RUNTIME_APPROVAL_PATH:path.join(out,'runtime-approval.json'),
    G7_RELEASE_VERSION:packageInfo.version,G7_RELEASE_SOURCE_COMMIT:release.sourceCommit,
    G7_RELEASE_CAPABILITY:'G7-GREENFIELD-AUTH-V1',G7_RELEASE_SCHEMA_ID:G7_GREENFIELD_SCHEMA_ID,
    G7_RELEASE_APP_DIGEST:release.appDigest,G7_RELEASE_MIGRATOR_DIGEST:release.migratorDigest};
  const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  const extra=Object.keys(process.env).filter(k=>k.startsWith('G7_')&&!Object.hasOwn(env,k));
  for(const k of extra){saved[k]=process.env[k];delete process.env[k];}
  Object.assign(process.env,env);
  cleanup=()=>{for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;rmSync(root,{recursive:true,force:true});};
  db=createDb('file:'+dbfile);
  return {root,dbfile,versions,tokens,ids,typeId,db:db!,open:()=>new Sqlite(dbfile)};
}
function req(method:string,url:string,token?:string,body?:object,key?:string){
  const headers=new Headers({host:'cad.example.test',...(body?{origin,'content-type':'application/json'}:{})});
  if(token){headers.set('cookie','cad_session='+token);if(body)headers.set('x-csrf-token',csrfProof(token));}
  if(key)headers.set('idempotency-key',key);
  return new Request('http://0.0.0.0'+url,{method,headers,body:body?JSON.stringify(body):undefined});
}
const args=(versionId:string)=>({params:Promise.resolve({versionId})});
function input(f:ReturnType<typeof fixture>, versionId:string, sha:string) {
  return {mode:'APP_CREATED',sourceSha256:sha,expectedSceneRevision:0,name:'QA Graph',kind:'CONVEX',geometry,
    derivedFrom:[],outlineTypeId:f.typeId};
}

test('QA TC-R3-001: second Version is denied without Site grant; authorized Site sees same global catalogue',async()=>{
  const f=fixture(),urlB='/api/cad-files/'+f.versions['site-b'].id+'/outline-types';
  const denied=await catalog(req('GET',urlB,f.tokens.ReaderA),args(f.versions['site-b'].id));
  expect(denied.status).toBe(403);
  const allowed=await catalog(req('GET',urlB,f.tokens.ReaderB),args(f.versions['site-b'].id));
  expect(allowed.status).toBe(200);
  expect(await allowed.json()).toMatchObject({versionId:f.versions['site-b'].id,catalogScope:'GLOBAL',
    items:[{id:f.typeId,name:'Global Type',active:true}],total:1});
  const write=await create(req('POST','/api/cad-files/'+f.versions['site-b'].id+'/outlines',f.tokens.EditorA,
    input(f,f.versions['site-b'].id,f.versions['site-b'].sha),randomUUID()),args(f.versions['site-b'].id));
  expect(write.status).toBe(403);
});

test('QA TC-R3-004/005: backup restores complete typed graph and reopened repository replays one receipt',async()=>{
  const f=fixture(),v=f.versions['site-a'],url='/api/cad-files/'+v.id+'/outlines',key=randomUUID();
  const createRequest=req('POST',url,f.tokens.EditorA,input(f,v.id,v.sha),key);
  const proof=requireBusinessWrite(createRequest,'qa-backup-replay');
  const first=await create(createRequest,args(v.id));expect(first.status).toBe(201);
  const original=await first.json();
  const raw=f.open();
  raw.prepare('INSERT INTO "OutlineTypeAudit"(id,actor_user_id,outline_type_id,action,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,\'CREATE\',NULL,1,\'SUCCESS\',?,?)')
    .run(randomUUID(),f.ids.Admin,f.typeId,'2026-11-01T00:00:00.000Z','qa-type-create');
  const graph=databaseGraph(raw);
  const snapshot=path.join(f.root,'typed-graph.sqlite');
  await raw.backup(snapshot);raw.close();
  const restoredPath=path.join(f.root,'restored.sqlite');copyFileSync(snapshot,restoredPath);
  const restoredRaw=new Sqlite(restoredPath);restoredRaw.exec('PRAGMA foreign_keys=ON');
  expect(restoredRaw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(databaseGraph(restoredRaw)).toEqual(graph);
  restoredRaw.close();
  const restored=createDb('file:'+restoredPath);
  try{
    const replay=await new BusinessRepository(restored).createOutline(v.id,input(f,v.id,v.sha),proof,key);
    expect(replay).toMatchObject({id:original.id,replayed:true,outlineTypeId:f.typeId,
      outlineType:{id:f.typeId,name:'Global Type'}});
    const reopened=new Sqlite(restoredPath);
    try{expect(databaseGraph(reopened)).toEqual(graph);}finally{reopened.close();}
    expect(await restored.cadOutline.count()).toBe(1);
    expect(await restored.cadOutlineCreateReceipt.count()).toBe(1);
    expect(await restored.cadBusinessAudit.count({where:{action:'CREATE'}})).toBe(1);
  }finally{await restored.$disconnect();}
});

test('QA TC-R3-004: receipt replay is denied after the original Site permission is revoked',async()=>{
  const f=fixture(),v=f.versions['site-a'],url='/api/cad-files/'+v.id+'/outlines',key=randomUUID();
  const created=await create(req('POST',url,f.tokens.EditorA,input(f,v.id,v.sha),key),args(v.id));
  expect(created.status).toBe(201);
  const item=await created.json();
  await f.db.userSiteGrant.deleteMany({where:{userId:f.ids.EditorA,siteId:'site-a'}});
  const replay=await create(req('POST',url,f.tokens.EditorA,input(f,v.id,v.sha),key),args(v.id));
  expect(replay.status).toBe(403);
  expect(await f.db.cadOutline.count()).toBe(1);
  expect(await f.db.cadOutlineCreateReceipt.count()).toBe(1);
  expect(await f.db.cadBusinessAudit.count({where:{action:'CREATE',targetId:item.id}})).toBe(1);
});

test('QA TC-R3-001: expiry during the HTTP list response maps to safe blocked-runtime 503',async()=>{
  const f=fixture(),gate=resolveG7RuntimeGate(process.env);
  expect(gate.state).toBe('ACTIVE');if(gate.state!=='ACTIVE')return;
  let now=Date.now();
  const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);
  const createDbSpy=vi.spyOn(dbModule,'createDb');
  try{
    const faulted=f.db.$extends({query:{cadOutline:{async findMany({args,query}){
      const rows=await query(args);now=gate.expiresAt+1;return rows;
    }}}});
    createDbSpy.mockReturnValue(faulted as unknown as Database);
    const response=await list(req('GET','/api/cad-files/'+f.versions['site-a'].id+'/outlines',f.tokens.ReaderA),
      {params:Promise.resolve({versionId:f.versions['site-a'].id})});
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({error:{code:'G7_RUNTIME_BLOCKED'}});
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
  }finally{clock.mockRestore();createDbSpy.mockRestore();}
});

function databaseGraph(raw:IsolatedDb){
  const tables=raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return tables.map(row=>{
    const table=String(row.name);
    const rows=raw.prepare('SELECT * FROM "'+table+'" ORDER BY rowid').all();
    // A valid replay refreshes the current session's activity timestamp; it must not mutate the business graph.
    return [table,table==='AuthSession'?rows.map(value=>({...value,last_seen_at:null})):rows];
  });
}
