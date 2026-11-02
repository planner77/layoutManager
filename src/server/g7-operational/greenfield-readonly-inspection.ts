/** CLI-only SQLite inspection on a source that may be bind-mounted read-only.
 * A cleanly closed WAL database retains WAL header bytes but often has no
 * sidecars. SQLite would create -shm on open, which a read-only bind forbids.
 * Only that exact sidecar-free case is inspected from a verified private copy.
 */
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdtempSync,
  openSync, readSync, realpathSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

type Identity={dev:bigint;ino:bigint;size:bigint;mtimeNs:bigint;ctimeNs:bigint};
function identity(file:string):Identity {
  const parent=path.dirname(file);
  if(!path.isAbsolute(file)||realpathSync(file)!==file||
    realpathSync(parent)!==parent||!lstatSync(parent).isDirectory())
    throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
  const stat=lstatSync(file,{bigint:true});
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||
    stat.uid!==BigInt(process.getuid?.()??-1)||(stat.mode&0o077n)!==0n)
    throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
  return {dev:stat.dev,ino:stat.ino,size:stat.size,
    mtimeNs:stat.mtimeNs,ctimeNs:stat.ctimeNs};
}
function same(a:Identity,b:Identity):boolean {
  return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&
    a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
}
function absent(file:string):boolean {
  try{lstatSync(file);return false;}
  catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return true;
    throw error;
  }
}
function sidecarsAbsent(file:string):boolean {
  return ['-wal','-shm','-journal'].every(suffix=>absent(file+suffix));
}
function hashFd(fd:number):string {
  const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
  let offset=0,bytes:number;
  while((bytes=readSync(fd,buffer,0,buffer.length,offset))>0){
    hash.update(buffer.subarray(0,bytes));offset+=bytes;
  }
  return hash.digest('hex');
}
function copyFd(source:number,destination:number):string {
  const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
  let offset=0,bytes:number;
  while((bytes=readSync(source,buffer,0,buffer.length,offset))>0){
    hash.update(buffer.subarray(0,bytes));
    let written=0;
    while(written<bytes)written+=writeSync(destination,buffer,written,bytes-written);
    offset+=bytes;
  }
  return hash.digest('hex');
}
export function withReadOnlyInspection<T>(file:string,inspect:(databasePath:string)=>T):T {
  const initial=identity(file);
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const opened=fstatSync(fd,{bigint:true});
    if(opened.dev!==initial.dev||opened.ino!==initial.ino||opened.size!==initial.size)
      throw new Error('G7_UPGRADE_DATA_CHANGED');
    const header=Buffer.alloc(100);
    const headerBytes=readSync(fd,header,0,header.length,0);
    const wal=headerBytes===100&&header.subarray(0,16).equals(Buffer.from('SQLite format 3\0'))&&
      header[18]===2&&header[19]===2;
    if(!wal||!sidecarsAbsent(file))return inspect(file);
    const originalHash=hashFd(fd);
    if(!same(initial,identity(file))||!sidecarsAbsent(file))
      throw new Error('G7_UPGRADE_DATA_CHANGED');
    const temporaryBase=realpathSync(tmpdir());
    const sourceParent=path.dirname(file);
    if(!path.isAbsolute(temporaryBase)||temporaryBase===sourceParent||
      temporaryBase.startsWith(sourceParent+path.sep))
      throw new Error('G7_UPGRADE_STORAGE_UNSAFE');
    const temporaryRoot=mkdtempSync(path.join(temporaryBase,'g7-upgrade-inspect-'));
    chmodSync(temporaryRoot,0o700);
    try{
      const copy=path.join(temporaryRoot,'cad.sqlite');
      const copyFdHandle=openSync(copy,
        constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      let copiedHash:string;
      try{copiedHash=copyFd(fd,copyFdHandle);}finally{closeSync(copyFdHandle);}
      if(copiedHash!==originalHash||!same(initial,identity(file))||
        hashFd(fd)!==originalHash||!sidecarsAbsent(file))
        throw new Error('G7_UPGRADE_DATA_CHANGED');
      const result=inspect(copy);
      if(!same(initial,identity(file))||hashFd(fd)!==originalHash||!sidecarsAbsent(file))
        throw new Error('G7_UPGRADE_DATA_CHANGED');
      return result;
    }finally{rmSync(temporaryRoot,{recursive:true,force:true});}
  }finally{closeSync(fd);}
}
