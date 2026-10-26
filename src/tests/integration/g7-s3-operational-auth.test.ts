import {afterEach, describe, expect, test} from 'vitest';
import {createRequire} from 'node:module';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {resolveG7S3PreviewGate} from '../../server/g7-operational/preview-gate';
import {openG7S3PreviewDb} from '../../server/g7-operational/preview-db';
import {G7_S3_SCHEMA_ID} from '../../server/g7-operational/preflight';
import {GET,POST,PUT,DELETE} from '../../app/api/g7-operational/[...segments]/route';

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>{close():void};
const ROOT=path.resolve(process.cwd());
const ORIGIN='http://127.0.0.1:3317';
const PASS1='s3-initial-admin-passphrase';
const PASS2='s3-changed-admin-passphrase';
const EDITOR1='s3-initial-editor-passphrase';
const EDITOR2='s3-new-editor-passphrase';
const RECOVERY='s3-unique-recovery-passphrase';
type Args={params:Promise<{segments:string[]}>};
const params=(key:string):Args=>({params:Promise.resolve({segments:key.split('/')})});
let home: string|null=null;
let saved: Record<string,string|undefined>={};
const KEYS=[
 'NODE_ENV','G7_S3_MIGRATION_TEST_ONLY','G7_S3_TEST_ROOT','G7_S3_TEST_DATABASE_URL',
 'DATABASE_URL','G7_AUTH_ENABLED','G7_CAD_WRITE_CUTOVER_ENABLED',
 'G7_S3_AUTH_API_PREVIEW_ONLY','G7_S3_TEST_ORIGIN',
 'G7_OPERATION_APPROVAL_ID','G7_OPERATION_CHANGE_ID',
] as const;
afterEach(()=>{
  for(const k of KEYS){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
  if(home)rmSync(home,{recursive:true,force:true});
  home=null;saved={};
});
function cli(executable:string,args:string[],extra:Record<string,string>={}) {
  return spawnSync(executable,args,{
    cwd:ROOT,encoding:'utf8',timeout:90000,env:{...process.env,...extra},
  });
}
function request(method:string,action:string,body?:object,cookie?:string,csrf?:string,origin=ORIGIN) {
  const headers=new Headers({origin});
  if(body)headers.set('content-type','application/json');
  if(cookie)headers.set('cookie',cookie);
  if(csrf)headers.set('x-csrf-token',csrf);
  return new Request(ORIGIN+'/api/g7-operational/'+action,{
    method,headers,body:body?JSON.stringify(body):undefined,
  });
}
const send=(method:string,action:string,body?:object,cookie?:string,csrf?:string,origin=ORIGIN)=>
  (method==='GET'?GET:method==='POST'?POST:method==='PUT'?PUT:DELETE)(
    request(method,action,body,cookie,csrf,origin),params(action));
function uid(value:Response) {return value.headers.get('set-cookie')?.split(';')[0]??'';}
async function login(name:string,password:string) {
  const r=await send('POST','auth/login',{login:name,password});
  const data=await r.json() as {csrfToken?:string};
  return {response:r,data,cookie:uid(r)};
}
async function setup() {
  saved=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
  home=mkdtempSync(path.join(tmpdir(),'cad-g7-s3-'));
  const dbFile=path.join(home,'fixture.sqlite');
  writeFileSync(dbFile,'',{mode:0o600});
  writeFileSync(path.join(home,'s3-disposable.json'),JSON.stringify({
    scope:'G7-S3-DISPOSABLE-MIGRATION-TEST',schemaId:G7_S3_SCHEMA_ID,
    databasePath:dbFile,fixtureNonce:randomBytes(16).toString('hex'),
  }),{mode:0o600});
  Object.assign(process.env,{
    NODE_ENV:'test',G7_S3_MIGRATION_TEST_ONLY:'true',
    G7_S3_TEST_ROOT:home,G7_S3_TEST_DATABASE_URL:'file:'+dbFile,
    DATABASE_URL:'file:'+dbFile,G7_AUTH_ENABLED:'false',
    G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_S3_AUTH_API_PREVIEW_ONLY:'true',G7_S3_TEST_ORIGIN:ORIGIN,
  });
  delete process.env.G7_OPERATION_APPROVAL_ID;
  delete process.env.G7_OPERATION_CHANGE_ID;
  const migration=cli(process.execPath,[
    path.join(ROOT,'node_modules/prisma/build/index.js'),
    'migrate','deploy','--config','deploy/g7-s3/prisma.config.ts',
  ]);
  expect(migration.status,(migration.stderr+ migration.stdout).slice(-1500)).toBe(0);
  const gate=resolveG7S3PreviewGate(process.env);
  expect(gate).not.toBeNull();
  const db=openG7S3PreviewDb(gate!);
  return {db,dbFile};
}

describe('#109 S3-2 reserved Auth/Admin/Session/Role/Site API',()=>{
  test('disabled for production regardless of release/Owner flags, and no operating cookie accepted',async()=>{
    saved=Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
    const before=await send('GET','auth/session',undefined,'cad_session=not-a-preview-session');
    expect(before.status).toBe(404);
    Object.assign(process.env,{
      NODE_ENV:'production',G7_AUTH_ENABLED:'true',
      G7_CAD_WRITE_CUTOVER_ENABLED:'true',
      G7_S3_MIGRATION_TEST_ONLY:'true',G7_S3_AUTH_API_PREVIEW_ONLY:'true',
      G7_S3_TEST_ORIGIN:ORIGIN,G7_OPERATION_APPROVAL_ID:'OWNER-fake',
      G7_OPERATION_CHANGE_ID:'CR-fake',
    });
    for(const fn of [
      ()=>send('GET','auth/session'),
      ()=>send('POST','auth/login',{login:'admin',password:PASS1}),
      ()=>send('POST','access/grant',{kind:'role'}),
      ()=>send('POST','users/create',{login:'another',initialPassword:EDITOR1}),
    ])expect((await fn()).status).toBe(404);
  });
  test('disposable-only Admin CLI bootstrap/recovery, HTTP login, grants and Audit E2E',async()=>{
    const {db}=await setup();
    try {
      const filename=path.join(home!,'admin.secret');
      writeFileSync(filename,PASS1,{mode:0o600});
      const command=path.join(ROOT,'node_modules/.bin/tsx');
      const bootstrap=cli(command,['scripts/g7-s3-admin.ts','--ack-disposable-only'],{
        ADMIN_BOOTSTRAP_ENABLED:'true',ADMIN_BOOTSTRAP_USERNAME:'previewadmin',
        ADMIN_BOOTSTRAP_PASSWORD_FILE:filename,
      });
      expect(bootstrap.status,bootstrap.stderr).toBe(0);
      expect(bootstrap.stdout).toContain('G7_S3_DISPOSABLE_ADMIN_ACTION=bootstrap');
      expect(bootstrap.stdout).not.toContain(PASS1);
      const first=await login('previewadmin',PASS1);
      expect(first.response.status).toBe(403);
      const change=await send('POST','auth/initial-change',{
        login:'previewadmin',password:PASS1,newPassword:PASS2,
      });
      expect(change.status,await change.clone().text()).toBe(200);
      const admin=await login('previewadmin',PASS2);
      expect(admin.response.status,await admin.response.clone().text()).toBe(200);
      expect(admin.response.headers.get('set-cookie')).toContain('Path=/api/g7-operational;');
      expect(admin.cookie).toMatch(/^cad_g7_s3_session=/);
      expect(admin.response.headers.get('set-cookie')).not.toMatch(/^cad_session=/);
      const csrf=admin.data.csrfToken!;
      const legacy=await send('GET','auth/session',undefined,
        'cad_session='+admin.cookie.split('=')[1]);
      expect(legacy.status).toBe(401);
      const session=await send('GET','auth/session',undefined,admin.cookie);
      expect(session.status).toBe(200);
      const actor=(await session.json() as {actor:{id:string}}).actor.id;
      const noCsrf=await send('POST','users/create',{
        login:'s3editor',initialPassword:EDITOR1,
      },admin.cookie);
      expect(noCsrf.status).toBe(403);
      const created=await send('POST','users/create',{
        login:'s3editor',initialPassword:EDITOR1,
      },admin.cookie,csrf);
      expect(created.status,await created.clone().text()).toBe(201);
      const editorId=(await created.json() as {id:string}).id;
      expect(db.prepare('SELECT must_change_password FROM "User" WHERE id=?')
        .get(editorId)?.must_change_password).toBe(1);
      const beforeRole=await send('POST','access/grant',{
        kind:'role',operation:'grant',affectedUserId:editorId,value:'Editor',
      },admin.cookie,csrf);
      expect(beforeRole.status,await beforeRole.clone().text()).toBe(200);
      const bu=randomUUID(),product=randomUUID(),site=randomUUID(),otherSite=randomUUID(),building=randomUUID(),floor=randomUUID();
      db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(bu,'S3-local');
      db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run(product,bu,'S3-product');
      db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
        .run(site,product,'S3-site','SITE');
      db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
        .run(otherSite,product,'Unassigned Site','SITE');
      db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
        .run(building,site,'S3-building');
      db.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)')
        .run(floor,building,'S3-floor');
      const grant=await send('POST','access/grant',{
        kind:'site',operation:'grant',affectedUserId:editorId,value:site,
      },admin.cookie,csrf);
      expect(grant.status,await grant.clone().text()).toBe(200);
      const editorForced=await login('s3editor',EDITOR1);
      expect(editorForced.response.status).toBe(403);
      const newPassword=await send('POST','auth/initial-change',{
        login:'s3editor',password:EDITOR1,newPassword:EDITOR2,
      });
      expect(newPassword.status).toBe(200);
      const editor=await login('s3editor',EDITOR2);
      expect(editor.response.status).toBe(200);
      const own=await send('POST','access/permit',{
        action:'cad:upload',resource:{kind:'site',siteId:site},
      },editor.cookie,editor.data.csrfToken);
      expect(own.status).toBe(200);
      const wrong=await send('POST','access/permit',{
        action:'cad:current',resource:{kind:'site',siteId:otherSite},
      },editor.cookie,editor.data.csrfToken);
      expect(wrong.status).toBe(403);
      const adminNoSite=await send('POST','access/permit',{
        action:'cad:upload',resource:{kind:'site',siteId:site},
      },admin.cookie,csrf);
      expect(adminNoSite.status).toBe(403);
      const noAudit=await send('POST','access/audit',{limit:30},admin.cookie,csrf);
      expect(noAudit.status).toBe(403);
      const special=await send('POST','access/grant',{
        kind:'special',operation:'grant',affectedUserId:actor,value:'audit:read',
      },admin.cookie,csrf);
      expect(special.status).toBe(200);
      const audit=await send('POST','access/audit',{limit:100},admin.cookie,csrf);
      expect(audit.status).toBe(200);
      const auditBody=JSON.stringify(await audit.json());
      expect(auditBody).toContain('ACCOUNT_CREATED');
      expect(auditBody).toContain('SITE_GRANTED');
      expect(auditBody).not.toContain(PASS1);
      expect(auditBody).not.toContain(EDITOR1);
      const disabled=await send('POST','access/disable',{userId:editorId},admin.cookie,csrf);
      expect(disabled.status).toBe(200);
      expect((await send('GET','auth/session',undefined,editor.cookie)).status).toBe(401);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
      expect((await send('POST','cad/upload',{},admin.cookie,csrf)).status).toBe(404);
      const recoverySecret=path.join(home!,'recovery.secret');
      writeFileSync(recoverySecret,RECOVERY,{mode:0o600});
      const recoveryEnv={
        ADMIN_RECOVERY_ENABLED:'true',ADMIN_RECOVERY_TARGET_USER_ID:actor,
        ADMIN_RECOVERY_ONCE_ID:'s3_unique_nonce_20261026',ADMIN_RECOVERY_PASSWORD_FILE:recoverySecret,
      };
      const recovered=cli(command,['scripts/g7-s3-admin.ts','--ack-disposable-only'],recoveryEnv);
      expect(recovered.status,recovered.stderr).toBe(0);
      expect(recovered.stdout).toContain('G7_S3_DISPOSABLE_ADMIN_ACTION=recover');
      expect((await send('GET','auth/session',undefined,admin.cookie)).status).toBe(401);
      const replay=cli(command,['scripts/g7-s3-admin.ts','--ack-disposable-only'],recoveryEnv);
      expect(replay.status).not.toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS n FROM "AdminRecoveryNonce"').get()?.n).toBe(1);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
    }finally{db.close();}
  },180000);
  test('wrong origin, flags, production env or unavailable Auth schema fail closed',async()=>{
    const {db}=await setup();
    try {
      const wrongOrigin=await send('POST','auth/login',{
        login:'previewadmin',password:PASS1,
      },undefined,undefined,'http://127.0.0.1:9999');
      expect(wrongOrigin.status).toBe(403);
      process.env.G7_AUTH_ENABLED='true';
      expect((await send('GET','auth/session')).status).toBe(404);
      process.env.G7_AUTH_ENABLED='false';
      process.env.G7_S3_TEST_ORIGIN='http://0.0.0.0:3317';
      expect((await send('GET','auth/session')).status).toBe(404);
      process.env.G7_S3_TEST_ORIGIN=ORIGIN;
      process.env.NODE_ENV='production';
      expect((await send('GET','auth/session')).status).toBe(404);
    }finally{db.close();}
  },100000);
});
