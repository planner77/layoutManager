import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmodSync, constants, closeSync, copyFileSync, existsSync, fstatSync, fsyncSync,
  lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync,
  renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertDeclaredSchema, GREENFIELD_UPGRADE_REGISTRY,
  type ReleaseDeclaration, type UpgradeRegistry } from './greenfield-upgrade-registry';
import { validateInstallation } from './greenfield-auto';
import { withReadOnlyInspection } from './greenfield-readonly-inspection';

type Db={backup:(filename:string)=>Promise<unknown>;prepare:(sql:string)=>{all:()=>Record<string,unknown>[]};close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(filename:string,options?:{readonly?:boolean;fileMustExist?:boolean})=>Db;
export type FileHash={path:string;size:number;sha256:string};
export type Snapshot={dbSha256:string;cad:FileHash[]};
export type RecoverySet={id:string;installId:string;sourceVersion:string;sourceManifestSha256:string;
  dbSha256:string;cad:FileHash[];createdAt:string};

export function fileSha256(file:string):string{
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
      stat.uid!==process.getuid?.()||(stat.mode&0o022)!==0)
      throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
    const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
    let bytes:number;
    while((bytes=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,bytes));
    return hash.digest('hex');
  }finally{closeSync(fd);}
}
function syncDir(dir:string):void{
  const fd=openSync(dir,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{fsyncSync(fd);}finally{closeSync(fd);}
}
function privateFile(file:string,max=Number.MAX_SAFE_INTEGER):void{
  const stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
    stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||
    stat.size<2||stat.size>max)
    throw new Error('G7_UPGRADE_BACKUP_INVALID');
}
export function privateAtomicWrite(file:string,value:unknown):void {
  const dir=path.dirname(file),tmp=file+'.pending-'+randomUUID();
  const fd=openSync(tmp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}
  try{
    renameSync(tmp,file);
    syncDir(dir);
  }catch{throw new Error('G7_UPGRADE_RESTORE_REQUIRED');}
}
function walk(dir:string,prefix=''):FileHash[]{
  const files:FileHash[]=[];
  for(const name of readdirSync(dir).sort()){
    const relative=prefix?prefix+'/'+name:name;
    const full=path.join(dir,name),s=lstatSync(full);
    if(s.isSymbolicLink()||s.uid!==process.getuid?.()||(s.mode&0o022)!==0)
      throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
    if(s.isDirectory())files.push(...walk(full,relative));
    else if(s.isFile()&&s.nlink===1)files.push({path:relative,size:s.size,sha256:fileSha256(full)});
    else throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
  }
  return files;
}
export function cadSnapshot(cadDir:string):FileHash[]{return walk(cadDir);}
export function assertCadSnapshot(cadDir:string,want:readonly FileHash[]):void {
  if(JSON.stringify(cadSnapshot(cadDir))!==JSON.stringify(want))
    throw new Error('G7_UPGRADE_DATA_CHANGED');
}
export function assertSpace(dir:string,minimumBytes:number):void {
  const s=statfsSync(dir,{bigint:true});
  if(s.bavail*s.bsize<BigInt(minimumBytes))throw new Error('G7_UPGRADE_BACKUP_REQUIRED');
}
function copyCad(source:string,destination:string,files:readonly FileHash[]):void {
  const directories=new Set<string>([destination]);
  for(const item of files){
    if(!safeRelative(item.path))throw new Error('G7_UPGRADE_BACKUP_INVALID');
    const dest=path.join(destination,item.path);
    mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});
    let parent=path.dirname(dest);
    while(parent.startsWith(destination+path.sep)){
      directories.add(parent);parent=path.dirname(parent);
    }
    copyFileSync(path.join(source,item.path),dest,constants.COPYFILE_EXCL);
    chmodSync(dest,0o600);
    const fd=openSync(dest,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const stat=fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||fileSha256(dest)!==item.sha256)
      throw new Error('G7_UPGRADE_BACKUP_REQUIRED');fsyncSync(fd);}finally{closeSync(fd);}
  }
  for(const directory of [...directories].sort((a,b)=>b.length-a.length))syncDir(directory);
}
function safeRelative(value:string):boolean{
  return value.length>0&&value.length<=512&&!value.includes('\\')&&
    value.split('/').every(part=>part!==''&&part!=='.'&&part!=='..'&&
      !/[\x00-\x1f]/.test(part))&&!path.isAbsolute(value);
}
export async function createRecoverySet(input:{dbPath:string;dbDir:string;cadDir:string;
  manifest:string;installId:string;sourceVersion:string;cad:FileHash[];
  sourceRelease:ReleaseDeclaration;registry:UpgradeRegistry}):Promise<RecoverySet>{
  const backupRoot=path.join(input.dbDir,'g7-upgrade-backups');
  if(!existsSync(backupRoot)){mkdirSync(backupRoot,{mode:0o700});syncDir(input.dbDir);}
  const rootStat=lstatSync(backupRoot);
  if(!rootStat.isDirectory()||rootStat.uid!==process.getuid?.()||(rootStat.mode&0o077)!==0)
    throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
  const id=randomUUID(),dir=path.join(backupRoot,id);
  mkdirSync(dir,{mode:0o700});mkdirSync(path.join(dir,'cad'),{mode:0o700});
  syncDir(backupRoot);
  syncDir(dir);
  const db=new Sqlite(input.dbPath,{fileMustExist:true,readonly:true});
  try{
    assertDeclaredSchema(db as never,input.sourceRelease);
    await db.backup(path.join(dir,'cad.sqlite'));
  }catch{throw new Error('G7_UPGRADE_BACKUP_REQUIRED');}
  finally{db.close();}
  chmodSync(path.join(dir,'cad.sqlite'),0o600);
  const backupFd=openSync(path.join(dir,'cad.sqlite'),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{fsyncSync(backupFd);}finally{closeSync(backupFd);}
  try{withReadOnlyInspection(path.join(dir,'cad.sqlite'),inspectedPath=>{
    const backupDb=new Sqlite(inspectedPath,{fileMustExist:true,readonly:true});
    try{assertDeclaredSchema(backupDb as never,input.sourceRelease);}
    finally{backupDb.close();}
  });}catch{throw new Error('G7_UPGRADE_BACKUP_REQUIRED');}
  copyCad(input.cadDir,path.join(dir,'cad'),input.cad);
  assertCadSnapshot(input.cadDir,input.cad);
  const sourceManifestSha256=fileSha256(input.manifest);
  copyFileSync(input.manifest,path.join(dir,'g7-install.json'),constants.COPYFILE_EXCL);
  chmodSync(path.join(dir,'g7-install.json'),0o600);
  const manifestFd=openSync(path.join(dir,'g7-install.json'),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{fsyncSync(manifestFd);}finally{closeSync(manifestFd);}
  if(fileSha256(path.join(dir,'g7-install.json'))!==sourceManifestSha256)
    throw new Error('G7_UPGRADE_BACKUP_REQUIRED');
  const record:RecoverySet={id,installId:input.installId,sourceVersion:input.sourceVersion,
    sourceManifestSha256,dbSha256:fileSha256(path.join(dir,'cad.sqlite')),
    cad:input.cad,createdAt:new Date().toISOString()};
  privateAtomicWrite(path.join(dir,'recovery.json'),record);
  syncDir(dir);
  // A verified copy is still insufficient if the operator cannot reconstruct
  // a working directory tree. Rehearse the exact isolated restore before DDL.
  const rehearsal=path.join(path.dirname(input.dbDir),'g7-upgrade-verify-'+randomUUID());
  mkdirSync(rehearsal,{mode:0o700});
  const restoredDb=path.join(rehearsal,'db'),restoredCad=path.join(rehearsal,'cad');
  mkdirSync(restoredDb,{mode:0o700});mkdirSync(restoredCad,{mode:0o700});
  try{restoreRecoverySet(input.dbDir,id,restoredDb,restoredCad,input.registry);}
  catch{throw new Error('G7_UPGRADE_BACKUP_REQUIRED');}
  finally{rmSync(rehearsal,{recursive:true,force:true});}
  return record;
}
export function verifyRecoverySet(dbDir:string,id:string,
  registry:UpgradeRegistry=GREENFIELD_UPGRADE_REGISTRY):RecoverySet {
  if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('G7_UPGRADE_BACKUP_INVALID');
  const root=path.join(dbDir,'g7-upgrade-backups'),dir=path.join(root,id);
  for(const directory of [root,dir,path.join(dir,'cad')]){
    const stat=lstatSync(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||
      (stat.mode&0o077)!==0||realpathSync(directory)!==directory)
      throw new Error('G7_UPGRADE_BACKUP_INVALID');
  }
  privateFile(path.join(dir,'recovery.json'),16*1024*1024);
  privateFile(path.join(dir,'cad.sqlite'));
  privateFile(path.join(dir,'g7-install.json'),4096);
  const parsed:unknown=JSON.parse(readFileSync(path.join(dir,'recovery.json'),'utf8'));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
    throw new Error('G7_UPGRADE_BACKUP_INVALID');
  const raw=parsed as RecoverySet;
  if(raw.id!==id||!/^[0-9a-f-]{36}$/.test(raw.installId)||
    !/^\d+\.\d+\.\d+$/.test(raw.sourceVersion)||
    !/^[a-f0-9]{64}$/.test(raw.dbSha256)||
    !/^[a-f0-9]{64}$/.test(raw.sourceManifestSha256)||
    !Array.isArray(raw.cad)||raw.cad.some(item=>!item||typeof item!=='object'||
      !safeRelative(item.path)||
      !Number.isSafeInteger(item.size)||item.size<0||!/^[a-f0-9]{64}$/.test(item.sha256))||
    new Set(raw.cad.map(item=>item.path)).size!==raw.cad.length||
    fileSha256(path.join(dir,'cad.sqlite'))!==raw.dbSha256||
    fileSha256(path.join(dir,'g7-install.json'))!==raw.sourceManifestSha256)
    throw new Error('G7_UPGRADE_BACKUP_INVALID');
  const manifest=validateInstallation(JSON.parse(readFileSync(path.join(dir,'g7-install.json'),'utf8')));
  const manifestRelease=registry.releases.find(r=>r.version===manifest.version);
  if(manifest.installId!==raw.installId||manifest.version!==raw.sourceVersion||
    !manifestRelease||manifest.schemaId!==manifestRelease.schemaId)
    throw new Error('G7_UPGRADE_BACKUP_INVALID');
  assertCadSnapshot(path.join(dir,'cad'),raw.cad);
  withReadOnlyInspection(path.join(dir,'cad.sqlite'),inspectedPath=>{
    const db=new Sqlite(inspectedPath,{fileMustExist:true,readonly:true});
    try{
      const release=registry.releases.find(r=>r.version===raw.sourceVersion);
      if(!release)throw new Error('G7_UPGRADE_BACKUP_INVALID');
      assertDeclaredSchema(db as never,release);
    }finally{db.close();}
  });
  return raw;
}
export function restoreRecoverySet(dbDir:string,id:string,targetDbDir:string,targetCadDir:string,
  registry:UpgradeRegistry=GREENFIELD_UPGRADE_REGISTRY):RecoverySet {
  const record=verifyRecoverySet(dbDir,id,registry);
  for(const dir of [targetDbDir,targetCadDir]){
    const s=lstatSync(dir);
    if(!path.isAbsolute(dir)||!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid?.()||
      (s.mode&0o077)!==0||realpathSync(dir)!==dir||readdirSync(dir).length)
      throw new Error('G7_UPGRADE_RESTORE_TARGET_INVALID');
  }
  if(targetDbDir===targetCadDir||targetDbDir.startsWith(targetCadDir+path.sep)||
    targetCadDir.startsWith(targetDbDir+path.sep)||targetDbDir.startsWith(dbDir+path.sep)||
    targetCadDir.startsWith(dbDir+path.sep))throw new Error('G7_UPGRADE_RESTORE_TARGET_INVALID');
  const root=path.join(dbDir,'g7-upgrade-backups',id);
  copyFileSync(path.join(root,'cad.sqlite'),path.join(targetDbDir,'cad.sqlite'),constants.COPYFILE_EXCL);
  copyFileSync(path.join(root,'g7-install.json'),path.join(targetDbDir,'g7-install.json'),constants.COPYFILE_EXCL);
  chmodSync(path.join(targetDbDir,'cad.sqlite'),0o600);
  chmodSync(path.join(targetDbDir,'g7-install.json'),0o600);
  copyCad(path.join(root,'cad'),targetCadDir,record.cad);
  if(fileSha256(path.join(targetDbDir,'cad.sqlite'))!==record.dbSha256||
    fileSha256(path.join(targetDbDir,'g7-install.json'))!==record.sourceManifestSha256)
    throw new Error('G7_UPGRADE_RESTORE_REQUIRED');
  const db=new Sqlite(path.join(targetDbDir,'cad.sqlite'),{fileMustExist:true,readonly:true});
  try{
    const release=registry.releases.find(r=>r.version===record.sourceVersion);
    if(!release)throw new Error('G7_UPGRADE_BACKUP_INVALID');
    assertDeclaredSchema(db as never,release);
  }finally{db.close();}
  for(const filename of ['cad.sqlite','g7-install.json']){
    const fd=openSync(path.join(targetDbDir,filename),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{fsyncSync(fd);}finally{closeSync(fd);}
  }
  syncDir(targetDbDir);
  return record;
}
