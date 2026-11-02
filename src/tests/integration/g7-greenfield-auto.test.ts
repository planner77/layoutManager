import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import packageInfo from '../../package.json' with {type:'json'};
import { ensureAutomatedGreenfield, G7_SETUP_TTL_MS,
  readAutomatedSetupCode, rotateAutomatedSetupCode } from '../../server/g7-operational/greenfield-auto';
import { resolveG7RuntimeGate } from '../../server/g7-operational/runtime-gate';
import { handleGreenfieldFirstSetup } from '../../server/g7-operational/greenfield-first-setup';
import { assertG7GreenfieldSchema } from '../../server/g7-operational/greenfield-schema';
import { openG7RuntimeDb } from '../../server/g7-operational/runtime-db';

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(
  file:string,options?:{fileMustExist?:boolean;readonly?:boolean}
)=>{prepare:(sql:string)=>{get:(...args:unknown[])=>Record<string,unknown>;all:(...args:unknown[])=>Record<string,unknown>[];run:(...args:unknown[])=>unknown};
  exec:(sql:string)=>void;close:()=>void};
const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
function fresh(){
  const root=mkdtempSync(path.join(tmpdir(),'g7-auto-'));chmodSync(root,0o700);
  roots.push(root);
  const db=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(db,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const file=path.join(db,'cad.sqlite'),code=path.join(db,'first-admin.code');
  const release='ghcr.io/planner77/layoutmanager:'+packageInfo.version;
  const env:Record<string,string>={
    G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_DEPLOY_APP_IMAGE:release,G7_DEPLOY_MIGRATOR_IMAGE:release+'-migrate',
    G7_RELEASE_SOURCE_COMMIT:'1'.repeat(40),
    G7_RUNTIME_ORIGIN:'https://cad.example.test',
    DATABASE_URL:'file:'+file,CAD_STORAGE_PATH:cad,CAD_STORAGE_BACKEND:'local',
  };
  return {root,db,cad,file,code,env};
}
function runtime(f:ReturnType<typeof fresh>,options:Record<string,string>={}){
  const env={...f.env,G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',...options};
  for(const [k,v] of Object.entries(env))vi.stubEnv(k,v);
  for(const key of ['G7_RUNTIME_TRUST_PATH','G7_RUNTIME_APPROVAL_PATH','G7_STAGING_ONLY',
    'G7_STAGING_ENABLED','G7_S3_AUTH_API_PREVIEW_ONLY','G7_S3_CAD_PREVIEW_ONLY'])
    vi.stubEnv(key,'');
  return resolveG7RuntimeGate();
}
function setupRequest(method:'GET'|'POST',content?:object,
  headers:Record<string,string>={}){
  return new Request('https://cad.example.test/api/g7-runtime/setup',{
    method,headers:{host:'cad.example.test',...headers},
    body:content===undefined?undefined:JSON.stringify(content),
  });
}

describe('#109 unattended Greenfield install and first Admin security',()=>{
  test('empty DB has one final baseline, 0 sites/versions, private install/code, restart preserves bytes',()=>{
    const f=fresh();
    expect(ensureAutomatedGreenfield(f.env)).toMatchObject({mode:'NEW_INSTALL'});
    const previousCode=readFileSync(f.code,'utf8');
    expect(previousCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const marker=readFileSync(path.join(f.db,'g7-install.json'),'utf8');
    const d=new Sqlite(f.file);
    try{
      expect(()=>assertG7GreenfieldSchema(d as never)).not.toThrow();
      expect(d.prepare('SELECT count(*) AS n FROM "User"').get().n).toBe(0);
      expect(d.prepare('SELECT count(*) AS n FROM "CadSite"').get().n).toBe(0);
      expect(d.prepare('SELECT count(*) AS n FROM "CadFileVersion"').get().n).toBe(0);
    }finally{d.close();}
    expect(ensureAutomatedGreenfield(f.env)).toMatchObject({mode:'RESTART'});
    expect(readFileSync(f.code,'utf8')).toBe(previousCode);
    expect(readFileSync(path.join(f.db,'g7-install.json'),'utf8')).toBe(marker);
    expect(runtime(f)).toMatchObject({state:'ACTIVE',operationMode:'SELF_HOSTED',
      siteIds:[],cadWriteEnabled:true});
    expect(readAutomatedSetupCode(f.env)).toBe(previousCode);
    expect(()=>readAutomatedSetupCode(f.env,Date.now()+G7_SETUP_TTL_MS+1000))
      .toThrow('G7_AUTO_SETUP_EXPIRED');
    expect(rotateAutomatedSetupCode(f.env).state).toBe('G7_AUTO_SETUP_CODE_ROTATED');
    expect(readFileSync(f.code,'utf8')).not.toBe(previousCode);
  });

  test('never overwrites non-empty/legacy DB or CAD content, and rejects release drift',()=>{
    const a=fresh();writeFileSync(a.file,'existing bytes');
    expect(()=>ensureAutomatedGreenfield(a.env)).toThrow('G7_AUTO_NONEMPTY_VOLUME_USE_NEW_EMPTY_VOLUME');
    expect(readFileSync(a.file,'utf8')).toBe('existing bytes');
    const b=fresh();writeFileSync(path.join(b.cad,'old.dxf'),'legacy object');
    expect(()=>ensureAutomatedGreenfield(b.env)).toThrow('G7_AUTO_NONEMPTY_VOLUME_USE_NEW_EMPTY_VOLUME');
    expect(readFileSync(path.join(b.cad,'old.dxf'),'utf8')).toBe('legacy object');
    const c=fresh();ensureAutomatedGreenfield(c.env);
    expect(()=>ensureAutomatedGreenfield({...c.env,G7_DEPLOY_APP_IMAGE:'ghcr.io/x/y:99.0.0'})).toThrow();
    expect(runtime(c,{G7_DEPLOY_MIGRATOR_IMAGE:'ghcr.io/x/y:99.0.0-migrate'}).state).toBe('BLOCKED');
    const d=fresh();ensureAutomatedGreenfield(d.env);
    const db=new Sqlite(d.file);
    try{db.exec('DROP TRIGGER "cad_version_delete_password_insert"');}finally{db.close();}
    expect(runtime(d).state).toBe('BLOCKED');
    expect(()=>ensureAutomatedGreenfield(d.env)).toThrow();
  });

  test('first Admin requires owner code and valid origin/CSRF; one-shot DB audit survives replay',async()=>{
    const f=fresh();ensureAutomatedGreenfield(f.env);
    const gate=runtime(f);
    if(gate.state!=='ACTIVE')throw new Error('expected greenfield gate');
    const ready=await handleGreenfieldFirstSetup(setupRequest('GET'),gate);
    expect(ready.status).toBe(200);
    const body=await ready.json() as {csrfToken:string;state:string};
    expect(body.state).toBe('SETUP_REQUIRED');
    const cookie=ready.headers.get('set-cookie')?.split(';')[0]??'';
    expect(ready.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    expect(JSON.stringify(body)).not.toContain(readAutomatedSetupCode(f.env));
    const valid={login:'admin',password:'synthetic-first-password',code:readAutomatedSetupCode(f.env)};
    const send=(payload:object,extra:Record<string,string>={})=>
      handleGreenfieldFirstSetup(setupRequest('POST',payload,{
        origin:f.env.G7_RUNTIME_ORIGIN,'content-type':'application/json',
        cookie,'x-setup-csrf':body.csrfToken,...extra,
      }),gate);
    expect((await send({...valid,code:'x'.repeat(43)})).status).toBe(403);
    expect((await send(valid,{'x-setup-csrf':'forged'})).status).toBe(403);
    expect((await send(valid,{origin:'https://evil.example'})).status).toBe(403);
    const accepted=await send(valid);
    expect(accepted.status).toBe(201);
    const d=openG7RuntimeDb(gate);
    try {
      const users=d.prepare('SELECT id,login_name,password_hash,must_change_password FROM "User"').all();
      expect(users).toHaveLength(1);expect(users[0].login_name).toBe('admin');
      expect(users[0].must_change_password).toBe(1);
      expect(String(users[0].password_hash)).toMatch(/^scrypt\$local-v1\$/);
      expect(String(users[0].password_hash)).not.toContain(valid.password);
      expect(d.prepare('SELECT role FROM "UserRoleGrant"').all()).toEqual([{role:'Admin'}]);
      expect(d.prepare('SELECT COUNT(*) AS n FROM "UserSiteGrant"').get()?.n).toBe(0);
      expect(d.prepare('SELECT action FROM "AuditEvent"').all()).toEqual([{action:'ADMIN_BOOTSTRAP'}]);
    }finally{d.close();}
    expect((await send(valid)).status).toBe(404);
    expect(()=>readAutomatedSetupCode(f.env)).toThrow();
    expect(()=>rotateAutomatedSetupCode(f.env)).toThrow();
    expect(runtime(f)).toMatchObject({state:'ACTIVE',siteIds:[]});
  });
});
