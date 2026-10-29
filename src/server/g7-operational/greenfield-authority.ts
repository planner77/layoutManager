/** #153: private, operator-invoked Greenfield Owner signing.
 * This is NOT an HTTP endpoint. The Owner key is never mounted into the app.
 */
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  realpathSync, renameSync, rmSync, writeFileSync, fsyncSync } from 'node:fs';
import path from 'node:path';
import packageInfo from '../../package.json' with {type:'json'};
import { G7_GREENFIELD_CAPABILITY, G7_GREENFIELD_SCHEMA_ID, assertG7GreenfieldSchema } from './greenfield-schema';
import { G7_GREENFIELD_SCOPE, greenfieldApprovalSigningBytes,
  type GreenfieldTrust, type GreenfieldApproval } from './greenfield-gate';

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new (
  filename:string,options?:{readonly?:boolean;fileMustExist?:boolean}
)=>{prepare:(sql:string)=>{all:()=>unknown[]};close:()=>void};
const blocked=():never=>{throw new Error('G7_GREENFIELD_OWNER_BLOCKED');};
function requiredGreenfieldEnv(value:string|undefined):string {
  if(typeof value!=='string' || value.length===0)blocked();
  return value;
}
function ownedParent(filename:string):void {
  if(!path.isAbsolute(filename))blocked();
  const dir=path.dirname(filename),s=lstatSync(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(dir)!==dir||
      s.uid!==process.getuid?.()||(s.mode&0o077)!==0)blocked();
}
function privateRead(filename:string,max=32768):Buffer{
  ownedParent(filename);
  if(realpathSync(filename)!==filename)blocked();
  const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const s=fstatSync(fd);
    if(!s.isFile()||s.uid!==process.getuid?.()||(s.mode&0o077)!==0||
        s.nlink!==1||s.size<2||s.size>max)blocked();
    const b=readFileSync(fd);
    if(b.length!==s.size)blocked();
    return b;
  }finally{closeSync(fd);}
}
function writePrivate(filename:string,body:string,renew:boolean):void{
  ownedParent(filename);
  const next=filename+'.pending-'+process.pid;
  const fd=openSync(next,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {
    writeFileSync(fd,body,'utf8');
    fsyncSync(fd);
  } finally {closeSync(fd);}
  try {
    if(renew) {
      const before=lstatSync(filename);
      if(!before.isFile()||before.isSymbolicLink()||before.uid!==process.getuid?.()||
          (before.mode&0o077)!==0||before.nlink!==1||realpathSync(filename)!==filename)blocked();
    } else {
      try {lstatSync(filename);blocked();}
      catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    }
    renameSync(next,filename);
    const df=openSync(path.dirname(filename),constants.O_RDONLY);
    try{fsyncSync(df);}finally{closeSync(df);}
  } finally{rmSync(next,{force:true});}
}
function input(v:unknown){
  if(!v||typeof v!=='object'||Array.isArray(v))blocked();
  const item=v as Record<string,unknown>;
  if(Object.keys(item).sort().join()!=='approvalId,changeRequestId,origin,release,scopes,validMinutes')blocked();
  const r=item.release;
  if(!r||typeof r!=='object'||Array.isArray(r))blocked();
  const rel=r as Record<string,unknown>;
  if(Object.keys(rel).sort().join()!=='appDigest,migratorDigest,sourceCommit,version'||
     rel.version!==packageInfo.version||
     typeof rel.sourceCommit!=='string'||!/^[a-f0-9]{40}$/.test(rel.sourceCommit)||
     typeof rel.appDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(rel.appDigest)||
     typeof rel.migratorDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(rel.migratorDigest)||
     rel.appDigest===rel.migratorDigest)blocked();
  if(typeof item.origin!=='string'||!/^https?:\/\//.test(item.origin)||
     new URL(item.origin).origin!==item.origin ||
     typeof item.approvalId!=='string'||!/^OWNER-[A-Za-z0-9_-]{2,64}$/.test(item.approvalId)||
     typeof item.changeRequestId!=='string'||!/^CR-[A-Za-z0-9_-]{2,64}$/.test(item.changeRequestId)||
     (JSON.stringify(item.scopes)!=='["AUTH"]'&&JSON.stringify(item.scopes)!=='["AUTH","CAD_WRITE"]')||
     !Number.isSafeInteger(item.validMinutes)||!(Number(item.validMinutes)>0&&Number(item.validMinutes)<=1440))blocked();
  return item as {approvalId:string;changeRequestId:string;origin:string;
    release:{sourceCommit:string;version:string;appDigest:string;migratorDigest:string};
    scopes:('AUTH'|'CAD_WRITE')[];validMinutes:number};
}
/** Caller supplies separate private input and Owner signing key. */
export function issueGreenfieldAuthority(
  mode:'init'|'renew',inputPath:string,outputDir:string,keyPath:string,
  env:Readonly<Record<string,string|undefined>>,
):{state:'G7_GREENFIELD_OWNER_SIGNATURE_VERIFIED';mode:string;expiresAtUtc:string}{
  if (env.G7_GREENFIELD_MODE!=='true' || !path.isAbsolute(outputDir)) blocked();
  // Return concrete strings only after validation; cross-statement narrowing
  // of Record<string,string|undefined> was not preserved by TypeScript CI.
  const databaseUrl=requiredGreenfieldEnv(env.DATABASE_URL);
  const cadPath=requiredGreenfieldEnv(env.CAD_STORAGE_PATH);
  if(!databaseUrl.startsWith('file:'))blocked();
  const spec=input(JSON.parse(privateRead(inputPath).toString('utf8')));
  const key=createPrivateKey(privateRead(keyPath).toString('utf8'));
  if(key.asymmetricKeyType!=='ed25519')blocked();
  const publicKey=createPublicKey(key).export({format:'pem',type:'spki'}).toString();
  const dbPath=databaseUrl.slice(5);
  const db=new Sqlite(dbPath,{readonly:true,fileMustExist:true});
  let sites:string[];
  try {
    assertG7GreenfieldSchema(db as never);
    sites=(db.prepare('SELECT id FROM "CadSite" ORDER BY id').all() as {id:string}[]).map(x=>x.id);
  } finally{db.close();}
  if(!sites.length||sites.length>100)blocked();
  const release={capability:G7_GREENFIELD_CAPABILITY,schemaId:G7_GREENFIELD_SCHEMA_ID,...spec.release};
  const trust:GreenfieldTrust={schemaVersion:1,ownerPublicKeyPem:publicKey,release,
    origin:spec.origin,databasePath:dbPath,cadStoragePath:cadPath,siteIds:sites};
  const trustFile=path.join(outputDir,'runtime-trust.json'),approvalFile=path.join(outputDir,'runtime-approval.json');
  if(realpathSync(outputDir)!==outputDir)blocked();
  const dir=lstatSync(outputDir);
  if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid?.()||
     (dir.mode&0o077)!==0)blocked();
  if(mode==='renew'){
    const existing=JSON.parse(privateRead(trustFile).toString('utf8'));
    if(JSON.stringify(existing)!==JSON.stringify(trust))blocked();
    const prior=JSON.parse(privateRead(approvalFile).toString('utf8')) as {approvalId?:string};
    if(prior.approvalId===spec.approvalId)blocked();
  }
  const now=new Date(),expires=new Date(now.getTime()+spec.validMinutes*60000);
  let approval:GreenfieldApproval={scope:G7_GREENFIELD_SCOPE,schemaVersion:1,decision:'GO',release,
    origin:trust.origin,databasePath:dbPath,cadStoragePath:cadPath,siteIds:sites,
    scopes:spec.scopes,approvalId:spec.approvalId,changeRequestId:spec.changeRequestId,
    approvedAtUtc:now.toISOString(),notBeforeUtc:now.toISOString(),expiresAtUtc:expires.toISOString(),signature:''};
  const bytes=greenfieldApprovalSigningBytes(approval);
  if(bytes===null)throw new Error('G7_GREENFIELD_OWNER_INVALID_APPROVAL');
  approval={...approval,signature:sign(null,bytes,key).toString('base64')};
  if(!greenfieldApprovalSigningBytes(approval))blocked();
  if(mode==='init')writePrivate(trustFile,JSON.stringify(trust),false);
  writePrivate(approvalFile,JSON.stringify(approval),mode==='renew');
  return {state:'G7_GREENFIELD_OWNER_SIGNATURE_VERIFIED',mode,expiresAtUtc:approval.expiresAtUtc};
}
