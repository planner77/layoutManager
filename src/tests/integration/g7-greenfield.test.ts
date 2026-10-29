import { afterEach, describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import packageInfo from '../../package.json' with {type:'json'};
import { initializeGreenfield, seedGreenfieldSites } from '../../server/g7-operational/greenfield-install';
import { issueGreenfieldAuthority } from '../../server/g7-operational/greenfield-authority';
import { resolveG7RuntimeGate, resolveG7RuntimeMigrationAuthority } from '../../server/g7-operational/runtime-gate';
import { assertG7RuntimeSchema } from '../../server/g7-operational/runtime-db';
import { executeG7RuntimeAdmin } from '../../server/g7-operational/runtime-admin';
import { G7_GREENFIELD_BASELINE } from '../../server/g7-operational/greenfield-schema';

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(
  file:string,options?:{readonly?:boolean;fileMustExist?:boolean}
)=>{prepare:(sql:string)=>{all:()=>Record<string,unknown>[];get:()=>Record<string,unknown>};
  exec:(sql:string)=>void;close:()=>void};
const roots:string[]=[];
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
function fresh() {
  const root=mkdtempSync(path.join(tmpdir(),'g7-greenfield-'));chmodSync(root,0o700);roots.push(root);
  const dbdir=path.join(root,'db'),cad=path.join(root,'cad');
  mkdirSync(dbdir,{mode:0o700});mkdirSync(cad,{mode:0o700});
  const dbfile=path.join(dbdir,'cad.sqlite');
  const env:Record<string,string>={NODE_ENV:'production',G7_GREENFIELD_MODE:'true',
    DATABASE_URL:'file:'+dbfile,CAD_STORAGE_PATH:cad,CAD_STORAGE_BACKEND:'local',
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_GREENFIELD_INSTALL_ACK:'CREATE_EMPTY_G7_DATABASE'};
  return {root,dbfile,dbdir,cad,env};
}
function seed(f:ReturnType<typeof fresh>) {
  const dir=path.join(f.root,'seed');mkdirSync(dir,{mode:0o700});
  const input=path.join(dir,'seed.json');
  writeFileSync(input,JSON.stringify({businessUnit:'Synthetic',product:'Product',
    sites:[{name:'Site A',building:'Building A',floor:'Floor 1'},
      {name:'Site B',building:'Building B',floor:'Floor 2'}]}),{mode:0o600});
  return seedGreenfieldSites({...f.env,G7_GREENFIELD_SEED_ACK:'SEED_EMPTY_GREENFIELD',
    G7_GREENFIELD_SEED_FILE:input});
}
function owner(f:ReturnType<typeof fresh>,sites:readonly string[]) {
  const keyDir=path.join(f.root,'owner'),out=path.join(f.root,'g7'),op=path.join(f.root,'operator');
  for(const dir of [keyDir,out,op])mkdirSync(dir,{mode:0o700});
  const keys=generateKeyPairSync('ed25519');
  const key=path.join(keyDir,'owner-private.pem');
  writeFileSync(key,keys.privateKey.export({format:'pem',type:'pkcs8'}).toString(),{mode:0o600});
  const input=path.join(op,'release-input.json');
  const release={sourceCommit:'1'.repeat(40),version:packageInfo.version,
    appDigest:'sha256:'+'a'.repeat(64),migratorDigest:'sha256:'+'b'.repeat(64)};
  const config={origin:'https://cad.example.test',release,scopes:['AUTH','CAD_WRITE'],
    approvalId:'OWNER-greenfield-first',changeRequestId:'CR-greenfield-first',validMinutes:60};
  writeFileSync(input,JSON.stringify(config),{mode:0o600});
  expect(issueGreenfieldAuthority('init',input,out,key,f.env).state).toBe('G7_GREENFIELD_OWNER_SIGNATURE_VERIFIED');
  const env:Record<string,string>={...f.env,G7_AUTH_ENABLED:'true',
    G7_CAD_WRITE_CUTOVER_ENABLED:'true',G7_RUNTIME_TRUST_PATH:path.join(out,'runtime-trust.json'),
    G7_RUNTIME_APPROVAL_PATH:path.join(out,'runtime-approval.json'),
    G7_RELEASE_VERSION:packageInfo.version,G7_RELEASE_SOURCE_COMMIT:release.sourceCommit,
    G7_RELEASE_CAPABILITY:'G7-GREENFIELD-AUTH-V1',
    G7_RELEASE_SCHEMA_ID:'G7-GREENFIELD-20261029-1',
    G7_RELEASE_APP_DIGEST:release.appDigest,G7_RELEASE_MIGRATOR_DIGEST:release.migratorDigest};
  return {env,input,out,key,config,sites};
}

describe('#153 empty Greenfield installation without prior data or migration replay',()=>{
  test('only an empty database accepts final schema, 2 security triggers and one baseline marker',()=>{
    const f=fresh();
    expect(initializeGreenfield(f.env)).toMatchObject({state:'G7_GREENFIELD_SCHEMA_READY'});
    const db=new Sqlite(f.dbfile);
    try{
      assertG7RuntimeSchema(db as never);
      const history=db.prepare('SELECT migration_name FROM "_prisma_migrations"').all();
      expect(history).toEqual([{migration_name:G7_GREENFIELD_BASELINE}]);
      const names=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'cad_version_delete_password_%' ORDER BY name").all();
      expect(names).toEqual([{name:'cad_version_delete_password_insert'},
        {name:'cad_version_delete_password_update'}]);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM "CadFileVersion"').get()?.n).toBe(0);
    }finally{db.close();}
    expect(()=>initializeGreenfield(f.env)).toThrow('G7_GREENFIELD_SETUP_BLOCKED');
    expect(()=>initializeGreenfield({...f.env,DATABASE_URL:'file:'+f.dbfile,
      G7_GREENFIELD_INSTALL_ACK:'WRONG'})).toThrow();
  });

  test('initial Sites seeded once, signed Owner trust opens Auth/CAD, then denies tampered objects',()=>{
    const f=fresh();
    initializeGreenfield(f.env);
    const sites=seed(f).siteIds;
    expect(sites).toHaveLength(2);
    const seedFile=path.join(f.root,'seed','seed.json');
    expect(()=>seedGreenfieldSites({...f.env,G7_GREENFIELD_SEED_ACK:'SEED_EMPTY_GREENFIELD',
      G7_GREENFIELD_SEED_FILE:seedFile})).toThrow();
    const x=owner(f,sites);
    expect(resolveG7RuntimeGate(x.env)).toMatchObject({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true});
    expect(resolveG7RuntimeMigrationAuthority(x.env)).toMatchObject({state:'BLOCKED'});
    expect(resolveG7RuntimeGate({...x.env,G7_RELEASE_APP_DIGEST:'sha256:'+'f'.repeat(64)}).state).toBe('BLOCKED');
    expect(resolveG7RuntimeGate({...x.env,G7_CAD_WRITE_CUTOVER_ENABLED:'false'}))
      .toMatchObject({state:'ACTIVE',cadWriteEnabled:false});
    const db=new Sqlite(f.dbfile);
    try{db.exec('DROP TRIGGER cad_version_delete_password_insert');}finally{db.close();}
    expect(resolveG7RuntimeGate(x.env).state).toBe('BLOCKED');
  });

  test('first Admin setup is one-shot; approval renewal is signed and independent of any snapshot',async()=>{
    const f=fresh();
    initializeGreenfield(f.env);
    const sites=seed(f).siteIds;
    const x=owner(f,sites);
    const secretDir=path.join(f.root,'secret');mkdirSync(secretDir,{mode:0o700});
    const secret=path.join(secretDir,'admin.password');writeFileSync(secret,'synthetic-initial-password',{mode:0o600});
    const bootstrap={...x.env,ADMIN_BOOTSTRAP_ENABLED:'true',
      ADMIN_BOOTSTRAP_USERNAME:'admin',ADMIN_BOOTSTRAP_PASSWORD_FILE:secret};
    expect(await executeG7RuntimeAdmin(bootstrap)).toBe('bootstrap');
    expect(await executeG7RuntimeAdmin(bootstrap)).toBe('disabled');
    const db=new Sqlite(f.dbfile);
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n).toBe(1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM "AuditEvent"').get()?.n).toBe(1);
    } finally{db.close();}
    const later={...x.config,approvalId:'OWNER-greenfield-renewed'};
    writeFileSync(x.input,JSON.stringify(later),{mode:0o600});
    expect(issueGreenfieldAuthority('renew',x.input,x.out,x.key,f.env).mode).toBe('renew');
    expect(resolveG7RuntimeGate(x.env).state).toBe('ACTIVE');
    const raw=JSON.parse(readFileSync(x.env.G7_RUNTIME_APPROVAL_PATH,'utf8'));
    raw.approvalId='OWNER-forged';
    writeFileSync(x.env.G7_RUNTIME_APPROVAL_PATH,JSON.stringify(raw),{mode:0o600});
    expect(resolveG7RuntimeGate(x.env).state).toBe('BLOCKED');
  });
});