import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrate } from '../helpers/database';
import { createDb, type Database } from '../../server/db';
import { hashLocalPassword } from '../../server/auth/password';
import { GET, POST } from '../../app/api/g7-operation/[...segments]/route';

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new
 (file:string)=>{exec(sql:string):void;close():void};
const sql=readFileSync(new URL('../../deploy/g7-operational/prisma/migrations/202610260001_g7_staging_auth/migration.sql',import.meta.url),'utf8');
const ORIGIN='http://127.0.0.1:3317';
const PASSWORD='g7-synthetic-admin-password';
const envKeys=[
  'G7_S3_GO','G7_AUTH_ENABLED','G7_RELEASE_CAPABILITY','G7_OPERATION_MANIFEST_PATH',
  'G7_OPERATION_GO_ID','G7_OPERATION_DATABASE_URL','G7_OPERATION_ORIGIN',
  'G7_RUNNING_APP_DIGEST','G7_RUNNING_MIGRATOR_DIGEST','G7_RUNNING_SOURCE_COMMIT',
  'G7_CAD_WRITE_CUTOVER_ENABLED','DATABASE_URL','CAD_STORAGE_PATH',
];
let root='',database:Database,saved:Record<string,string|undefined>={};
const props=(kind:string,command:string)=>({params:Promise.resolve({segments:[kind,command]})});
function req(method:string,endpoint:string,body?:object,cookie?:string,csrf?:string) {
  const headers=new Headers({origin:ORIGIN});
  if(body)headers.set('content-type','application/json');
  if(cookie)headers.set('cookie',cookie);
  if(csrf)headers.set('x-csrf-token',csrf);
  return new Request(ORIGIN+'/api/g7-operation/'+endpoint,{
    method,headers,body:body?JSON.stringify(body):undefined,
  });
}
beforeEach(async()=>{
  saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  root=mkdtempSync(path.join(tmpdir(),'g7-operation-route-'));
  mkdirSync(path.join(root,'cad'));
  const file=path.join(root,'fixture.sqlite');
  await migrate(file);
  const raw=new Sqlite(file);
  try {
    raw.exec('PRAGMA foreign_keys=ON;');
    raw.exec(sql);
    raw.exec('CREATE TABLE "_prisma_migrations" (migration_name TEXT PRIMARY KEY, finished_at DATETIME,rolled_back_at DATETIME);');
    raw.exec("INSERT INTO _prisma_migrations(migration_name,finished_at) VALUES('202610260001_g7_staging_auth','2026-10-26T01:00:00Z');");
  } finally {raw.close();}
  const manifest={
    scope:'G7_S3_RELEASE_SPECIFIC_GO',decision:'GO',
    schemaId:'202610260001_g7_staging_auth',
    operationGoId:'GO-G7-LOCAL',snapshotId:'SNAP-G7-LOCAL',
    appDigest:'sha256:'+'a'.repeat(64),migratorDigest:'sha256:'+'b'.repeat(64),
    rollbackAppDigest:'sha256:'+'c'.repeat(64),
    rollbackMigratorDigest:'sha256:'+'d'.repeat(64),
    sourceCommit:'e'.repeat(40),
    origin:ORIGIN,databaseUrl:'file:'+file,cadStoragePath:path.join(root,'cad'),
    evidenceIds:['EV-01','EV-02','EV-03'],
    operatorId:'operator-local',rollbackOperatorId:'recovery-local',ownerId:'owner-local',
    validFrom:new Date(Date.now()-60000).toISOString(),
    validUntil:new Date(Date.now()+60000).toISOString(),
  };
  const manifestFile=path.join(root,'owner-go.json');
  writeFileSync(manifestFile,JSON.stringify(manifest),{mode:0o600});
  Object.assign(process.env,{
    G7_S3_GO:'true',G7_AUTH_ENABLED:'true',
    G7_RELEASE_CAPABILITY:'G7-OPERATIONAL-V1',
    G7_OPERATION_MANIFEST_PATH:manifestFile,
    G7_OPERATION_GO_ID:manifest.operationGoId,
    G7_OPERATION_DATABASE_URL:manifest.databaseUrl,
    G7_OPERATION_ORIGIN:ORIGIN,
    G7_RUNNING_APP_DIGEST:manifest.appDigest,
    G7_RUNNING_MIGRATOR_DIGEST:manifest.migratorDigest,
    G7_RUNNING_SOURCE_COMMIT:manifest.sourceCommit,
    G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    DATABASE_URL:manifest.databaseUrl,CAD_STORAGE_PATH:manifest.cadStoragePath,
  });
  database=createDb('file:'+file);
});
afterEach(async()=>{
  await database?.$disconnect();
  for(const k of envKeys){
    if(saved[k]===undefined)delete process.env[k];
    else process.env[k]=saved[k];
  }
  if(root)rmSync(root,{recursive:true,force:true});root='';
});
describe('#109 S2 guarded real CAD Auth App Router contract (synthetic DB)',()=>{
  test('Nginx forwarding public Host works even if standalone Request.url is internal',async()=>{
    const internal=new Request('http://0.0.0.0:3000/api/g7-operation/auth/session',{
      headers:{host:new URL(ORIGIN).host},
    });
    const accepted=await GET(internal,props('auth','session'));
    expect(accepted.status).toBe(401); // missing session, not host mismatch 404
    const wrong=new Request('http://0.0.0.0:3000/api/g7-operation/auth/session',{
      headers:{host:'unapproved.example'},
    });
    expect((await GET(wrong,props('auth','session'))).status).toBe(404);
  });
  test('private GO absent: all Auth/Admin/Audit routes invisible, legacy GET unaffected',async()=>{
    process.env.G7_S3_GO='false';
    expect((await GET(req('GET','auth/session'),props('auth','session'))).status).toBe(404);
    expect((await POST(req('POST','access/audit',{limit:1}),props('access','audit'))).status).toBe(404);
    process.env.G7_S3_GO='true';
    expect((await POST(req('POST','access/outline',{}),props('access','outline'))).status).toBe(404);
    expect((await GET(req('GET','access/logs'),props('access','logs'))).status).toBe(404);
  });
  test('admin session+CSRF+grant require real DB actor, no client Role headers',async()=>{
    const username='testadmin',actorId=randomUUID(),affected=randomUUID();
    const passHash=await hashLocalPassword(PASSWORD),now=BigInt(Date.now());
    await database.user.create({data:{id:actorId,loginName:username,passwordHash:passHash,
      status:'ACTIVE',mustChangePassword:false,createdAt:now,updatedAt:now}});
    await database.userRoleGrant.create({data:{userId:actorId,role:'Admin',grantedAt:now}});
    await database.user.create({data:{id:affected,loginName:'targetreader',
      passwordHash:passHash,status:'ACTIVE',mustChangePassword:false,
      createdAt:now,updatedAt:now}});
    const login=await POST(req('POST','auth/login',{login:username,password:PASSWORD}),
      props('auth','login'));
    expect(login.status,await login.clone().text()).toBe(200);
    const cookie=login.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toMatch(/^cad_session=/);
    const csrf=(await login.json()).csrfToken as string;
    const wrong=await POST(req('POST','access/grant',{
      kind:'role',operation:'grant',affectedUserId:affected,value:'Reader',
    },cookie,'wrong'),props('access','grant'));
    expect(wrong.status).toBe(403);
    const valid=await POST(req('POST','access/grant',{
      kind:'role',operation:'grant',affectedUserId:affected,value:'Reader',
    },cookie,csrf),props('access','grant'));
    expect(valid.status,await valid.clone().text()).toBe(200);
    expect(await database.userRoleGrant.count({where:{userId:affected}})).toBe(1);
    const audit=await database.auditEvent.findFirst({where:{action:'ROLE_GRANTED'}});
    expect(audit?.actorUserId).toBe(actorId);
    const create=await POST(req('POST','access/create-user',{
      loginName:'stagingnewreader',temporaryPassword:'private-test-temp-password',
    },cookie,csrf),props('access','create-user'));
    expect(create.status,await create.clone().text()).toBe(201);
    const added=await create.json() as {id:string;mustChangePassword:boolean};
    const created=await database.user.findUnique({where:{id:added.id}});
    expect(created?.mustChangePassword).toBe(true);
    expect(await database.userRoleGrant.findUnique({
      where:{userId_role:{userId:added.id,role:'Reader'}},
    })).toBeTruthy();
    expect((await database.auditEvent.findFirst({
      where:{action:'ACCOUNT_CREATED',affectedUserId:added.id},
    }))?.actorUserId).toBe(actorId);
    const notYet=await POST(req('POST','auth/login',{
      login:'stagingnewreader',password:'private-test-temp-password',
    }),props('auth','login'));
    expect(notYet.status).toBe(403);
    expect((await notYet.json()).error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  },60_000);
});
