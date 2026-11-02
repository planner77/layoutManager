/** #109: host-owned, unattended GREENFIELD path. Never upgrades or erases a historical DB.
 * The one-time manifest is installed by the migrator, never by HTTP or the app.
 * Legacy signed authority remains a separate, opt-in expert mode.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync,
  openSync, readFileSync, realpathSync, renameSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import packageInfo from '../../package.json' with {type:'json'};
import type { G7RuntimeGate } from './runtime-gate';
import { initializeGreenfield } from './greenfield-install';
import { G7_GREENFIELD_SCHEMA_ID } from './greenfield-schema';
import { openG7RuntimeDb } from './runtime-db';

const INSTALL_FILE='g7-install.json';
const SETUP_FILE='first-admin.code';
export const G7_SETUP_TTL_MS=60*60*1000;
const blocked=(code:string):never=>{throw new Error(code);};

export type Identity={schemaId:string;version:string;appImage:string;migratorImage:string;sourceCommit:string};
export type Installation=Identity&{installId:string};
const digestRef=/@sha256:[a-f0-9]{64}$/;
function validPair(version:string,appImage:string,migratorImage:string):boolean {
  if(!appImage||!migratorImage||appImage===migratorImage||
    appImage.includes('://')||migratorImage.includes('://'))return false;
  if(appImage==='cad-layout-viewer:local'&&
    migratorImage==='cad-layout-viewer:local-migrate')return true;
  const parse=(ref:string):{repo:string;tag:string;digest:string}|null=>{
    const at=ref.indexOf('@');
    const digest=at<0?'':ref.slice(at+1);
    if(at>=0&&!/^sha256:[a-f0-9]{64}$/.test(digest))return null;
    const name=at<0?ref:ref.slice(0,at);
    const colon=name.lastIndexOf(':'),slash=name.lastIndexOf('/');
    const tagged=colon>slash;
    const repo=tagged?name.slice(0,colon):name;
    const tag=tagged?name.slice(colon+1):'';
    if(!repo||tagged&&!tag||!/^[a-z0-9][a-z0-9./:_-]*$/.test(repo)||repo.includes('..')||
      repo.includes('//')||repo.endsWith('/')||tag&&!/^v?\d+\.\d+\.\d+(-migrate)?$/.test(tag))
      return null;
    return {repo,tag,digest};
  };
  const app=parse(appImage),migrator=parse(migratorImage);
  if(!app||!migrator||app.repo!==migrator.repo||Boolean(app.digest)!==Boolean(migrator.digest)||
    app.digest&&app.digest===migrator.digest)return false;
  if(!app.digest&&(!app.tag||!migrator.tag))return false;
  if(app.tag&&app.tag.replace(/^v/,'')!==version)return false;
  if(migrator.tag&&migrator.tag.replace(/^v/,'')!==version+'-migrate')return false;
  return true;
}
export function identity(env:Readonly<Record<string,string|undefined>>):Identity {
  if(env.G7_GREENFIELD_MODE!=='true'||env.G7_GREENFIELD_AUTOMATED!=='true'||
    env.CAD_STORAGE_BACKEND!=='local')blocked('G7_AUTO_CONFIGURATION');
  const appImage=env.G7_DEPLOY_APP_IMAGE??'',migratorImage=env.G7_DEPLOY_MIGRATOR_IMAGE??'';
  const sourceCommit=env.G7_RELEASE_SOURCE_COMMIT??'';
  if(!appImage||!migratorImage||appImage===migratorImage||
    (sourceCommit!==''&&!/^[a-f0-9]{40}$/.test(sourceCommit)))
    blocked('G7_AUTO_RELEASE_INVALID');
  const version=packageInfo.version;
  if(!validPair(version,appImage,migratorImage)||
    (digestRef.test(appImage)&&sourceCommit===''))blocked('G7_AUTO_IMAGE_PAIR_INVALID');
  return {schemaId:G7_GREENFIELD_SCHEMA_ID,version,appImage,migratorImage,sourceCommit};
}
export function target(env:Readonly<Record<string,string|undefined>>) {
  const dbUrl=env.DATABASE_URL,cad=env.CAD_STORAGE_PATH;
  // A direct throw is intentional: strict TS control flow must narrow these
  // values before slice()/path calls (same failure class as #153 ledger).
  if(typeof dbUrl!=='string'||!dbUrl.startsWith('file:/')||
     typeof cad!=='string'||!path.isAbsolute(cad))
    throw new Error('G7_AUTO_STORAGE_INVALID');
  const dbPath=dbUrl.slice(5), dbDir=path.dirname(dbPath);
  if(!path.isAbsolute(dbPath)||dbDir===cad||dbPath.startsWith(cad+path.sep)||
     cad.startsWith(dbDir+path.sep))blocked('G7_AUTO_STORAGE_INVALID');
  for(const dir of [dbDir,cad]) {
    const s=lstatSync(dir);
    if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(dir)!==dir||
       s.uid!==process.getuid?.()||(s.mode&0o022)!==0)
      blocked('G7_AUTO_STORAGE_UNSAFE');
  }
  return {dbPath,dbDir,cad,manifest:path.join(dbDir,INSTALL_FILE),
    code:path.join(dbDir,SETUP_FILE)};
}
function privateFile(filename:string,max=4096):{text:string;modified:number} {
  if(!path.isAbsolute(filename)||realpathSync(filename)!==filename)
    blocked('G7_AUTO_FILE_UNSAFE');
  const parent=lstatSync(path.dirname(filename)),fd=openSync(filename,
    constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const stat=fstatSync(fd);
    if(!parent.isDirectory()||parent.uid!==process.getuid?.()||
       (parent.mode&0o022)!==0||!stat.isFile()||stat.isSymbolicLink()||
       stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||
       stat.nlink!==1||stat.size<2||stat.size>max)
      blocked('G7_AUTO_FILE_UNSAFE');
    const bytes=readFileSync(fd);
    if(bytes.length!==stat.size)blocked('G7_AUTO_FILE_UNSAFE');
    return {text:bytes.toString('utf8'),modified:stat.mtimeMs};
  }finally{closeSync(fd);}
}
export function validateInstallation(raw:unknown):Installation {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))blocked('G7_AUTO_INSTALL_INVALID');
  const found=raw as Record<string,unknown>;
  if(Object.keys(found).sort().join()!=='appImage,installId,migratorImage,schemaId,sourceCommit,version'||
    !/^[0-9a-f-]{36}$/.test(String(found.installId))||
    !/^\d+\.\d+\.\d+$/.test(String(found.version))||
    typeof found.schemaId!=='string'||typeof found.appImage!=='string'||
    typeof found.migratorImage!=='string'||
    !validPair(String(found.version),String(found.appImage),String(found.migratorImage))||
    (digestRef.test(String(found.appImage))&&found.sourceCommit==='')||
    (found.sourceCommit!==''&&!/^[a-f0-9]{40}$/.test(String(found.sourceCommit))))
    blocked('G7_AUTO_INSTALL_INVALID');
  return found as Installation;
}
export function readInstallation(t:ReturnType<typeof target>):Installation {
  return validateInstallation(JSON.parse(privateFile(t.manifest).text));
}
function verifyInstallation(env:Readonly<Record<string,string|undefined>>,t:ReturnType<typeof target>) {
  const want=identity(env),found=readInstallation(t);
  if(Object.entries(want).some(([key,value])=>found[key as keyof Identity]!==value))
    blocked('G7_AUTO_RELEASE_MISMATCH');
  if(existsSync(path.join(t.dbDir,'g7-upgrade.lock')))blocked('G7_UPGRADE_RESTORE_REQUIRED');
  const journal=path.join(t.dbDir,'g7-upgrade-journal.json');
  if(existsSync(journal)){
    const raw:unknown=JSON.parse(privateFile(journal,65536).text);
    const record=raw as {phase?:unknown;source?:unknown}|null;
    if(!record||typeof record!=='object'||
      !(record.phase==='COMPLETE'||record.phase==='FAILED_PREWRITE'&&
        JSON.stringify(record.source)===JSON.stringify(found)))
      blocked('G7_UPGRADE_RESTORE_REQUIRED');
  }
  const db=openG7RuntimeDb({databasePath:t.dbPath,schemaMode:'GREENFIELD'},true);
  try{return db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n as number;}
  finally{db.close();}
}
function writeSecret(filename:string) {
  writeFileSync(filename,randomBytes(32).toString('base64url'),{encoding:'utf8',mode:0o600,flag:'wx'});
}
/** Called only by the one-shot Compose migrator, before App starts. */
export function ensureAutomatedGreenfield(env:Readonly<Record<string,string|undefined>>) {
  const release=identity(env),t=target(env);
  if(existsSync(t.manifest)) {
    const users=verifyInstallation(env,t);
    if(users===0){
      if(!existsSync(t.code))blocked('G7_AUTO_SETUP_INCOMPLETE');
      privateFile(t.code,128); // Missing or unsafe code is an incomplete installation.
    }
    return {state:'G7_GREENFIELD_READY' as const,mode:'RESTART' as const};
  }
  // A DB without our marker, even a valid old #153 Greenfield database, is not
  // adopted. An interrupted install requires a NEW volume, never implicit repair.
  if(existsSync(t.dbPath)||readdirSync(t.dbDir).length!==0||readdirSync(t.cad).length!==0)
    blocked('G7_AUTO_NONEMPTY_VOLUME_USE_NEW_EMPTY_VOLUME');
  initializeGreenfield({...env,G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false',
    G7_GREENFIELD_INSTALL_ACK:'CREATE_EMPTY_G7_DATABASE'});
  // The marker is the LAST step. If interrupted, a DB or code without a marker
  // is refused on restart rather than silently adopted or reset.
  writeSecret(t.code);
  const manifest:Installation={...release,installId:randomUUID()};
  writeFileSync(t.manifest,JSON.stringify(manifest),{flag:'wx',mode:0o600});
  return {state:'G7_GREENFIELD_READY' as const,mode:'NEW_INSTALL' as const};
}
/** Operator-only recovery of an expired setup code; it never resets users/data. */
export function rotateAutomatedSetupCode(env:Readonly<Record<string,string|undefined>>) {
  const t=target(env);
  if(verifyInstallation(env,t)!==0)blocked('G7_AUTO_SETUP_ALREADY_COMPLETE');
  // Explicit host-operated code recovery is safe only while User/Audit are
  // pristine. A missing code does not justify deleting or recreating SQLite.
  if(existsSync(t.code))privateFile(t.code,128);
  const next=t.code+'.pending-'+process.pid;
  writeSecret(next);
  renameSync(next,t.code);
  return {state:'G7_AUTO_SETUP_CODE_ROTATED' as const};
}
/** Raw code is never returned via an HTTP endpoint or emitted in any log. */
export function readAutomatedSetupCode(env:Readonly<Record<string,string|undefined>>,now=Date.now()):string {
  const t=target(env);
  if(verifyInstallation(env,t)!==0)blocked('G7_AUTO_SETUP_ALREADY_COMPLETE');
  const value=privateFile(t.code,128);
  if(!/^[A-Za-z0-9_-]{43}$/.test(value.text)||now-value.modified < -1000 ||
    now-value.modified>=G7_SETUP_TTL_MS)blocked('G7_AUTO_SETUP_EXPIRED');
  return value.text;
}
export function resolveAutomatedGreenfieldGate(env:Readonly<Record<string,string|undefined>>,now=Date.now()):G7RuntimeGate {
  const deny=(reason:string):G7RuntimeGate=>({state:'BLOCKED',authEnabled:false,cadWriteEnabled:false,reasons:[reason]});
  if(!Number.isSafeInteger(now)||env.G7_AUTH_ENABLED!=='true'||
    env.G7_CAD_WRITE_CUTOVER_ENABLED!=='true'||env.G7_RUNTIME_RECOVERY_MODE==='true'||
    ['G7_RUNTIME_TRUST_PATH','G7_RUNTIME_APPROVAL_PATH','G7_S3_AUTH_API_PREVIEW_ONLY',
      'G7_S3_CAD_PREVIEW_ONLY','G7_STAGING_ENABLED','G7_STAGING_ONLY']
      .some(k=>Boolean(env[k])&&env[k]!=='false'))
    return deny('G7_AUTO_RUNTIME_CONFIGURATION');
  try {
    const t=target(env);
    verifyInstallation(env,t);
    const publicOrigin=env.G7_RUNTIME_ORIGIN??'';
    const uri=new URL(publicOrigin);
    if(uri.origin!==publicOrigin||uri.username||uri.password||uri.pathname!=='/'||
      uri.search||uri.hash||!['http:','https:'].includes(uri.protocol)||
      (uri.protocol==='http:'&&env.G7_RUNTIME_ALLOW_HTTP!=='true'))
      return deny('G7_AUTO_ORIGIN_INVALID');
    const db=openG7RuntimeDb({databasePath:t.dbPath,schemaMode:'GREENFIELD'},true);
    try {
      const siteIds=db.prepare('SELECT id FROM "CadSite" ORDER BY id').all()
        .map(row=>String(row.id));
      return {state:'ACTIVE',authEnabled:true,cadWriteEnabled:true,
        schemaMode:'GREENFIELD',operationMode:'SELF_HOSTED',
        origin:publicOrigin,databasePath:t.dbPath,cadStoragePath:t.cad,siteIds,
        expiresAt:Number.MAX_SAFE_INTEGER,approvalId:'GREENFIELD-SELF-HOSTED',
        snapshotId:'',changeRequestId:'',scopes:['AUTH','CAD_WRITE']};
    }finally{db.close();}
  }catch{return deny('G7_AUTO_INSTALL_OR_SCHEMA_INVALID');}
}
