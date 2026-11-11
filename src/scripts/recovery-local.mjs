#!/usr/bin/env node
/* Issue 283: local, operator-run recovery point. No operational action without --execute. */
import {spawn,spawnSync} from 'node:child_process';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const helper=fileURLToPath(new URL('./recovery-local-volume.mjs',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=(code)=>{throw Error('RECOVERY283_'+code);};
async function collect(iter,max=8*1024*1024){const parts=[];let n=0;for await(const b of iter){n+=b.length;if(n>max)fail('SETTINGS_BOUND');parts.push(b);}return Buffer.concat(parts);}
function readBounded(file,max=1024*1024){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)fail('SETTINGS_BOUND');return fs.readFileSync(file);}
const parse=argv=>{const out={_:[]};for(let i=0;i<argv.length;i++){
  const a=argv[i];if(!a.startsWith('--'))out._.push(a);
  else if(a==='--execute')out.execute=true;
  else {const k=a.slice(2);if(!argv[i+1]||argv[i+1].startsWith('--'))fail('ARGUMENT');
    if(k==='image'||k==='writer')(out[k]??=[]).push(argv[++i]);else if(out[k])fail('ARGUMENT');else out[k]=argv[++i];}
}return out;};
const command=(exe,args,input)=>{const r=spawnSync(exe,args,{input,encoding:'utf8',maxBuffer:16*1024*1024,timeout:30000});
  if(r.status!==0)fail('COMMAND');return r.stdout.trim();};
const docker=(...args)=>command('docker',args);
const inspect=(kind,id)=>JSON.parse(docker(kind,'inspect',id))[0];
const git=(...args)=>command('git',args);
function fileHash(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{
  const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1)fail('FILE');const h=createHash('sha256'),b=Buffer.allocUnsafe(1024*1024);let n;
  while((n=fs.readSync(fd,b,0,b.length,null))>0)h.update(b.subarray(0,n));return h.digest('hex');
}finally{fs.closeSync(fd);}}
function source(){const untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean).sort();
  const untrackedHashes=untracked.map(f=>[f,fileHash(f)]);
  return {head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),dirtySha256:sha(git('status','--porcelain=v1','--untracked-files=all')+'\n'+git('diff','--binary','HEAD')+'\n'+JSON.stringify(untrackedHashes)),
  helperSha256:fileHash(helper),cliSha256:fileHash(fileURLToPath(import.meta.url))};}
function parsePairs(values){const out={};for(const pair of values??[]){const n=pair.indexOf('=');if(n<1||out[pair.slice(0,n)])fail('ARGUMENT');out[pair.slice(0,n)]=pair.slice(n+1);}return out;}
function safePrivate(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(s.mode&0o077)!==0)fail('PRIVATE_FILE');}
function freshPrivatePath(value){const dest=path.resolve(value),parent=path.dirname(dest);
  let current=path.parse(parent).root;
  for(const part of path.relative(current,parent).split(path.sep).filter(Boolean)){
    current=path.join(current,part);const s=fs.lstatSync(current);
    if(!s.isDirectory()||s.isSymbolicLink())fail('PRIVATE_PARENT');
  }
  const s=fs.lstatSync(parent);
  if(s.uid!==process.getuid?.()||(s.mode&0o077)!==0||fs.realpathSync(parent)!==parent)fail('PRIVATE_PARENT');
  try{fs.lstatSync(dest);fail('DESTINATION_EXISTS');}catch(e){if(e.message==='RECOVERY283_DESTINATION_EXISTS')throw e;
    if(e.code!=='ENOENT')throw e;}
  return dest;
}
function volumeIdentity(name){const v=inspect('volume',name);if(v.Name!==name||v.Driver!=='local'||v.Scope!=='local')fail('VOLUME');return {name:v.Name,driver:v.Driver,scope:v.Scope,mountpoint:v.Mountpoint,createdAt:v.CreatedAt};}
function imageIdentity(role,ref){const i=inspect('image',ref),l=i.Config?.Labels??{};
  const expected=role==='worker'?'cpu-worker':role;
  if(l['com.planner77.g7.image-role']!==expected||!/^0\.\d+\.\d+$/.test(l['org.opencontainers.image.version']??'')||!/^\w{40}$/.test(l['org.opencontainers.image.revision']??''))fail('IMAGE_IDENTITY');
  return {role,id:i.Id,repoTags:(i.RepoTags??[]).slice().sort(),repoDigests:(i.RepoDigests??[]).slice().sort(),version:l['org.opencontainers.image.version'],source:l['org.opencontainers.image.revision']};}
function assertLocalSettings(envBytes,runtime){
  const declared=dotenv.parse(envBytes);
  if(declared.CAD_STORAGE_BACKEND!==undefined&&declared.CAD_STORAGE_BACKEND!=='local')fail('NONLOCAL_STORAGE');
  for(const item of Object.values(runtime))for(const pair of item?.environment??[])
    if(typeof pair==='string'&&pair.startsWith('CAD_STORAGE_BACKEND=')&&pair!=='CAD_STORAGE_BACKEND=local')fail('NONLOCAL_STORAGE');
}
function containerIdentity(c){return {id:c.Id,name:c.Name,state:c.State?.Status,running:c.State?.Running===true,imageId:c.Image,
  mounts:(c.Mounts??[]).map(m=>({type:m.Type,name:m.Name??null,source:m.Source,destination:m.Destination,rw:m.RW===true})).sort((a,b)=>a.destination.localeCompare(b.destination))};}
function containerIds(volume){return docker('ps','-aq','--filter','volume='+volume).split('\n').filter(Boolean);}
function helperArgs(volume,image,readonly,action){return ['run',...(action==='receive'?['-i']:[]),'--rm','--name','r283-'+randomBytes(8).toString('hex'),'--label','recovery283.helper=true','--network','none','--read-only','--security-opt','no-new-privileges',
  '--user',readonly?'10001:10001':'0:0',
  '--tmpfs','/tmp:rw,nosuid,nodev,size=4g',
  '--entrypoint','node','--mount',`type=volume,src=${volume},dst=/data,volume-nocopy${readonly?',readonly':''}`,
  '--mount',`type=bind,src=${helper},dst=/tool/recovery-local-volume.mjs,readonly`,image,'--import','tsx','/tool/recovery-local-volume.mjs',action];}
function identity(volume,image){const r=JSON.parse(docker(...helperArgs(volume,image,true,'identity')));
  if(!r||typeof r.version!=='string'||typeof r.schemaId!=='string'||typeof r.installId!=='string'||
    typeof r.appImage!=='string'||typeof r.migratorImage!=='string'||typeof r.sourceCommit!=='string'||
    !/^[a-f0-9]{64}$/.test(r.sha256))fail('INSTALL');return r;}
function liveInventory(opts){
  if(!opts.compose)fail('COMPOSE_REQUIRED');
  const images=parsePairs(opts.image),writers=parsePairs(opts.writer);
  if(Object.keys(images).sort().join(',')!=='app,migrator,worker'||Object.keys(writers).sort().join(',')!=='app,migrator,worker')fail('ROLES');
  const im={};for(const role of ['app','migrator','worker'])im[role]=imageIdentity(role,images[role]);
  if(new Set(Object.values(im).map(x=>x.source)).size!==1||new Set(Object.values(im).map(x=>x.version)).size!==1)fail('SOURCE_MISMATCH');
  const vol=volumeIdentity(opts.volume),all=containerIds(opts.volume).map(id=>containerIdentity(inspect('container',id)));
  const known={};for(const role of ['app','migrator','worker']){
    const c=all.find(x=>x.name==='/'+writers[role]);
    known[role]=c??null;
    if(c&&c.imageId!==im[role].id)fail('WRITER_IMAGE');
    if(c&&!c.mounts.some(m=>m.type==='volume'&&m.name===opts.volume&&m.destination==='/data'&&m.rw))fail('WRITER_MOUNT');
  }
  const allowed=new Set(Object.values(known).filter(Boolean).map(x=>x.id));
  if(all.some(c=>!allowed.has(c.id)&&c.mounts.some(m=>m.name===opts.volume&&m.rw)))fail('UNKNOWN_WRITER');
  const cfg=opts.config;safePrivate(cfg);
  const runtime={};for(const [role,c] of Object.entries(known))if(c)runtime[role]={environment:inspect('container',c.id).Config?.Env??[]};
  assertLocalSettings(readBounded(cfg),runtime);
  const config={path:path.resolve(cfg),sha256:fileHash(cfg)};
  const compose={path:path.resolve(opts.compose),sha256:fileHash(opts.compose)};
  const install=identity(opts.volume,im.migrator.id);
  if(install.version!==im.app.version)fail('RELEASE');
  if(!im.app.repoTags.includes(install.appImage)&&!im.app.repoDigests.includes(install.appImage))fail('MANIFEST_APP_IMAGE');
  if(!im.migrator.repoTags.includes(install.migratorImage)&&!im.migrator.repoDigests.includes(install.migratorImage))fail('MANIFEST_MIGRATOR_IMAGE');
  if(install.sourceCommit){if(install.sourceCommit!==im.app.source)fail('MANIFEST_SOURCE');}
  else if(!/^0\.(?:5[6-9]|60)\./.test(install.version))fail('MANIFEST_SOURCE');
  return {volume:vol,images:im,writers:known,config,compose,install,source:source()};
}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
function planHash(p){const body={...p};delete body.sha256;return sha(canonical(body));}
function writeExclusive(file,data){freshPrivatePath(file);
  const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
function loadPlan(file){safePrivate(file);const p=JSON.parse(fs.readFileSync(file));
  if(p.format!=='RECOVERY283-PLAN-V1'||!/^\d+$/.test(String(p.maxSeconds))||p.maxSeconds>3600||p.maxSeconds<30||
    !/^[a-f0-9]{32}$/.test(p.nonce)||planHash(p)!==p.sha256||
    Object.keys(p).sort().join(',')!=='format,inventory,maxSeconds,nonce,sha256')fail('PLAN');
  const i=p.inventory;if(!i||Object.keys(i).sort().join(',')!=='compose,config,images,install,source,volume,writerNames,writers'||
    Object.keys(i.images??{}).sort().join(',')!=='app,migrator,worker'||
    Object.keys(i.writers??{}).sort().join(',')!=='app,migrator,worker'||
    Object.keys(i.writerNames??{}).sort().join(',')!=='app,migrator,worker'||
    typeof i.volume?.name!=='string'||!i.volume.name||typeof i.config?.path!=='string'||
    !/^[a-f0-9]{64}$/.test(i.config?.sha256??'')||
    !/^[a-f0-9]{64}$/.test(i.source?.helperSha256??'')||
    !/^[a-f0-9]{64}$/.test(i.source?.cliSha256??'')||
    typeof i.install?.version!=='string'||typeof i.install?.schemaId!=='string')fail('PLAN');
  for(const role of ['app','migrator','worker']){
    const image=i.images[role],writer=i.writers[role],name=i.writerNames[role];
    if(typeof name!=='string'||!name||!/^sha256:[a-f0-9]{64}$/.test(image?.id??'')||
      image?.role!==role||!/^0\.\d+\.\d+$/.test(image.version??'')||
      !/^[a-f0-9]{40}$/.test(image.source??'')||!Array.isArray(image.repoDigests)||!Array.isArray(image.repoTags)||
      (writer!==null&&(writer?.name!=='/'+name||!/^\w{64}$/.test(writer.id??'')||
        !Array.isArray(writer.mounts)||typeof writer.running!=='boolean')))fail('PLAN');
  }
  return p;}
function checkPlanLive(p){const opts={volume:p.inventory.volume.name,config:p.inventory.config.path,compose:p.inventory.compose?.path,
  image:Object.entries(p.inventory.images).map(([r,x])=>r+'='+x.id),
  writer:Object.entries(p.inventory.writerNames).map(([r,x])=>r+'='+x)};
  const want={...p.inventory};delete want.writerNames;const actual=liveInventory(opts);
  if(canonical(actual)!==canonical(want))fail('DRIFT');}
function assertFrozenWriters(p){
  const all=containerIds(p.inventory.volume.name).map(id=>containerIdentity(inspect('container',id)));
  const expected=Object.values(p.inventory.writers).filter(Boolean),allowed=new Set(expected.map(x=>x.id));
  for(const c of all)if(!allowed.has(c.id)&&c.mounts.some(m=>m.name===p.inventory.volume.name&&m.rw))fail('UNKNOWN_WRITER');
  for(const original of expected){const now=all.find(x=>x.id===original.id);
    if(!now||now.running||now.imageId!==original.imageId||now.name!==original.name||
      canonical(now.mounts)!==canonical(original.mounts))fail('FROZEN_DRIFT');
  }
}
let operationDeadline=Infinity;
function runHelper(volume,image,action,stdin){return new Promise((resolve,reject)=>{
  const args=helperArgs(volume,image,action!=='receive',action),name=args[args.indexOf('--name')+1];
  const p=spawn('docker',args,{stdio:[stdin?'pipe':'ignore','pipe','pipe']});
  const timeout=setTimeout(()=>{p.kill('SIGKILL');spawnSync('docker',['rm','-f',name],{stdio:'ignore',timeout:10000});},
    Math.max(1000,Math.min(30000,operationDeadline-Date.now()-30000)));
  let stdout='',stderr='';p.stdout.on('data',b=>{stdout+=b;if(stdout.length>32*1024*1024)p.kill();});
  p.stderr.on('data',b=>{stderr+=b;if(stderr.length>1024*1024)p.kill();});
  if(stdin){stdin.pipe(p.stdin);stdin.on('error',reject);}p.on('error',reject);p.on('close',code=>{clearTimeout(timeout);
    if(code===0)resolve(stdout.trim());else reject(Error('RECOVERY283_HELPER_'+(stderr.match(/RECOVERY_VOLUME_HALT:([A-Z_]+)/)?.[1]??'FAILED')));});
});}
async function scan(volume,image){return JSON.parse(await runHelper(volume,image,'scan'));}
function keyFrom(file){safePrivate(file);const k=fs.readFileSync(file);if(k.length!==32)fail('KEY');return k;}
async function encryptFile(source,key,dest,aad){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
  const fd=fs.openSync(dest,'wx',0o600);try{fs.writeSync(fd,Buffer.from('R283GCM1'));fs.writeSync(fd,iv);
    for await(const b of source){const out=cipher.update(b);if(out.length)fs.writeSync(fd,out);}
    const last=cipher.final();if(last.length)fs.writeSync(fd,last);fs.writeSync(fd,cipher.getAuthTag());fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}return fileHash(dest);}
async function* decryptFile(file,key,aad){safePrivate(file);const s=fs.statSync(file);if(s.size<36)fail('CIPHER');
  const fd=fs.openSync(file,'r'),prefix=Buffer.alloc(20),tag=Buffer.alloc(16);
  try{fs.readSync(fd,prefix,0,20,0);fs.readSync(fd,tag,0,16,s.size-16);}finally{fs.closeSync(fd);}
  if(prefix.subarray(0,8).toString()!=='R283GCM1')fail('CIPHER');
  const d=createDecipheriv('aes-256-gcm',key,prefix.subarray(8));d.setAAD(Buffer.from(aad));d.setAuthTag(tag);
  for await(const chunk of fs.createReadStream(file,{start:20,end:s.size-17,highWaterMark:1024*1024})){const out=d.update(chunk);if(out.length)yield out;}
  const last=d.final();if(last.length)yield last;
}
async function validateArchive(file,key,aad){let buffer=Buffer.alloc(0),header,remaining=0,index=0,total=0,h;
  for await(const chunk of decryptFile(file,key,aad)){
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length||(header&&index<header.files.length&&header.files[index].size===0)){
      if(!header){const n=buffer.indexOf(10);if(n<0){if(buffer.length>64*1024*1024)fail('HEADER_BOUND');break;}
        header=JSON.parse(buffer.subarray(0,n));buffer=buffer.subarray(n+1);
        if(header.format!=='RECOVERY283-V1'||!Array.isArray(header.files)||header.files.length>100000||
          Object.keys(header).sort().join(',')!=='files,format,logical')fail('ARCHIVE');
        const paths=new Set();for(const e of header.files){if(Object.keys(e).sort().join(',')!=='gid,mode,path,sha256,size,uid'||
          typeof e.path!=='string'||e.path.length>512||e.path.includes('\\')||e.path.startsWith('/')||
          e.path.split('/').some(x=>!x||x==='.'||x==='..'||/[\x00-\x1f]/.test(x))||paths.has(e.path)||
          !Number.isSafeInteger(e.size)||e.size<0||e.size>10*1024**3||!/^[a-f0-9]{64}$/.test(e.sha256)||
          !Number.isInteger(e.uid)||e.uid!==10001||!Number.isInteger(e.gid)||e.gid!==10001||
          !Number.isInteger(e.mode)||e.mode<0||e.mode>0o777||(e.mode&0o022)!==0)fail('MEMBER');
          paths.add(e.path);total+=e.size;if(total>20*1024**3)fail('BOUND');}remaining=header.files[0]?.size??0;h=createHash('sha256');continue;}
      if(index===header.files.length)fail('TRAILING');
      const n=Math.min(buffer.length,remaining);if(n)h.update(buffer.subarray(0,n));buffer=buffer.subarray(n);remaining-=n;
      if(remaining===0){if(h.digest('hex')!==header.files[index].sha256)fail('FILE_HASH');index++;remaining=header.files[index]?.size??0;h=createHash('sha256');continue;}break;
    }
  }
  if(!header||index!==header.files.length)fail('TRUNCATED');return header;
}
function resumeOriginalWriters(running){for(const writer of [...running].reverse()){
  const now=containerIdentity(inspect('container',writer.id));
  if(now.id!==writer.id||now.imageId!==writer.imageId||now.name!==writer.name||
    canonical(now.mounts)!==canonical(writer.mounts))fail('RESTART_IDENTITY');
  if(!now.running)docker('start',writer.id);
  const resumed=containerIdentity(inspect('container',writer.id));
  if(!resumed.running||canonical(resumed.mounts)!==canonical(writer.mounts))fail('RESTART_FAILED');
}}
async function sealed(p,opts){
  const out=path.resolve(opts.out);safePrivate(path.join(out,'receipt.json'));
  const receipt=JSON.parse(readBounded(path.join(out,'receipt.json'))),key=keyFrom(opts.key);
  if(receipt.format!=='RECOVERY283-RECEIPT-V1'||receipt.planSha256!==p.sha256||
    receipt.archiveSha256!==fileHash(path.join(out,'archive.gcm'))||
    receipt.settingsSha256!==fileHash(path.join(out,'settings.gcm'))||receipt.keyId!==sha(key).slice(0,16))fail('SEAL');
  const header=await validateArchive(path.join(out,'archive.gcm'),key,p.sha256+':archive');
  const settings=JSON.parse((await collect(decryptFile(path.join(out,'settings.gcm'),key,p.sha256+':settings'))).toString());
  if(settings.format!=='RECOVERY283-SETTINGS-V1'||Object.keys(settings).sort().join(',')!=='composeBase64,envBase64,format,runtime'||
    sha(Buffer.from(settings.envBase64,'base64'))!==p.inventory.config.sha256||
    sha(Buffer.from(settings.composeBase64,'base64'))!==p.inventory.compose.sha256||
    typeof settings.runtime!=='object'||settings.runtime===null)fail('SETTINGS');
  assertLocalSettings(Buffer.from(settings.envBase64,'base64'),settings.runtime);
  if(header.logical?.install?.version!==p.inventory.install.version||
    header.logical.install.schemaId!==p.inventory.install.schemaId||
    header.logical.install.sha256!==p.inventory.install.sha256||
    receipt.logicalSha256!==sha(canonical(header.logical)))fail('SCHEMA');
  return {out,receipt,key,header,settings};
}
async function capture(p,opts){if(!opts.execute)fail('EXECUTE_REQUIRED');checkPlanLive(p);
  const out=path.resolve(opts.out),keyDir=path.resolve(opts['key-dir']);if(out===keyDir||out.startsWith(keyDir+'/')||keyDir.startsWith(out+'/'))fail('KEY_SEPARATION');
  const sourceMount=path.resolve(p.inventory.volume.mountpoint);
  if([out,keyDir].some(x=>x===sourceMount||x.startsWith(sourceMount+path.sep)))fail('SOURCE_SEPARATION');
  freshPrivatePath(out);freshPrivatePath(keyDir);
  fs.mkdirSync(out,{mode:0o700});fs.mkdirSync(keyDir,{mode:0o700});
  if((fs.statSync(out).mode&0o077)||(fs.statSync(keyDir).mode&0o077))fail('DIRECTORY_MODE');
  const key=randomBytes(32),keyFile=path.join(keyDir,p.nonce+'.key');writeExclusive(keyFile,key);
  const running=Object.values(p.inventory.writers).filter(x=>x?.running),deadline=Date.now()+p.maxSeconds*1000;
  let failure=null,receipt=null;operationDeadline=deadline;
  try{
    const pre=await scan(p.inventory.volume.name,p.inventory.images.migrator.id);
    for(const writer of running){if(Date.now()>deadline-30000)fail('TIME_BUDGET');docker('stop','--time','30',writer.id);}
    assertFrozenWriters(p);
    const frozen=await scan(p.inventory.volume.name,p.inventory.images.migrator.id);
    const args=helperArgs(p.inventory.volume.name,p.inventory.images.migrator.id,true,'emit'),helperName=args[args.indexOf('--name')+1];
    const proc=spawn('docker',args,{stdio:['ignore','pipe','pipe']});
    let stderr='';proc.stderr.on('data',b=>{stderr+=b;if(stderr.length>1024*1024)proc.kill();});
    const archive=path.join(out,'archive.gcm');
    const watchdog=setTimeout(()=>{proc.kill('SIGKILL');spawnSync('docker',['rm','-f',helperName],{stdio:'ignore',timeout:10000});},Math.max(1000,deadline-Date.now()-30000));
    let archiveSha;try{archiveSha=await encryptFile(proc.stdout,key,archive,p.sha256+':archive');}finally{clearTimeout(watchdog);}
    const exit=await new Promise(r=>proc.on('close',r));if(exit!==0)fail('CAPTURE_HELPER');
    assertFrozenWriters(p);
    const after=await scan(p.inventory.volume.name,p.inventory.images.migrator.id);
    if(canonical(frozen)!==canonical(after))fail('SOURCE_CHANGED');
    resumeOriginalWriters(running);operationDeadline=Infinity;
    const runtime={};for(const [role,writer] of Object.entries(p.inventory.writers))if(writer){
      const c=inspect('container',writer.id);if(c.Id!==writer.id)fail('WRITER_DRIFT');
      runtime[role]={environment:c.Config?.Env??[],entrypoint:c.Config?.Entrypoint??[],cmd:c.Config?.Cmd??[],user:c.Config?.User??''};
    }
    const settings={format:'RECOVERY283-SETTINGS-V1',envBase64:readBounded(p.inventory.config.path).toString('base64'),
      composeBase64:readBounded(p.inventory.compose.path).toString('base64'),runtime};
    if(Buffer.byteLength(JSON.stringify(settings))>8*1024*1024)fail('SETTINGS_BOUND');
    if(fileHash(p.inventory.config.path)!==p.inventory.config.sha256||fileHash(p.inventory.compose.path)!==p.inventory.compose.sha256)fail('CONFIG_CHANGED');
    const cfg=path.join(out,'settings.gcm');
    const cfgSha=await encryptFile([Buffer.from(JSON.stringify(settings))],key,cfg,p.sha256+':settings');
    const check=JSON.parse((await collect(decryptFile(cfg,key,p.sha256+':settings'))).toString());
    if(canonical(check)!==canonical(settings))fail('SETTINGS_VERIFY');
    const archiveHeader=await validateArchive(archive,key,p.sha256+':archive');
    if(canonical(archiveHeader.files)!==canonical(frozen.files)||canonical(archiveHeader.logical)!==canonical(frozen.logical))fail('CAPTURE_MISMATCH');
    receipt={format:'RECOVERY283-RECEIPT-V1',planSha256:p.sha256,archiveSha256:archiveSha,settingsSha256:cfgSha,
      keyId:sha(key).slice(0,16),sourceRelease:p.inventory.install.version,sourceSchema:p.inventory.install.schemaId,
      files:frozen.files.length,logicalSha256:sha(canonical(frozen.logical)),preFreezeChanged:canonical(pre)!==canonical(frozen),
      cadReferencesChecked:frozen.logical.storage.cadCount,sceneAssetsChecked:frozen.logical.storage.sceneAssetCount,
      readyJobs:frozen.logical.storage.readyJobs,currentScenes:frozen.logical.storage.currentScenes,
      readyPreservation:frozen.logical.storage.readyJobs+frozen.logical.storage.currentScenes===0?'NOT_EXERCISED':'VERIFIED_REFERENCES',
      capturedAt:new Date().toISOString(),offHost:'NOT_RUN',hostWriterInspection:'NOT_PROVEN'};
  }catch(e){failure=e;}
  operationDeadline=Infinity;
  try{resumeOriginalWriters(running);}catch(e){failure=Error('RECOVERY283_RESTART_HALT:'+e.message);}
  if(failure){for(const n of ['archive.gcm','settings.gcm'])try{fs.rmSync(path.join(out,n));}catch{}throw failure;}
  writeExclusive(path.join(out,'receipt.json'),JSON.stringify(receipt)+'\n');return receipt;
}
async function restore(p,opts){if(!opts.execute)fail('EXECUTE_REQUIRED');
  if(fileHash(helper)!==p.inventory.source.helperSha256)fail('TOOL_DRIFT');
  for(const [role,want] of Object.entries(p.inventory.images)){
    const actual=imageIdentity(role,want.id);
    if(canonical(actual)!==canonical(want))fail('IMAGE_DRIFT');
  }
  const {out,receipt,key,header}=await sealed(p,opts),archive=path.join(out,'archive.gcm');
  const dest=opts.destination;if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,100}$/.test(dest)||dest===p.inventory.volume.name)fail('DESTINATION');
  // Create is exclusive: Docker returns failure when a foreign existing volume has this name.
  if(spawnSync('docker',['volume','inspect',dest],{stdio:'ignore'}).status===0)fail('DESTINATION_EXISTS');
  docker('volume','create','--label','recovery283.nonce='+p.nonce,'--label','recovery283.plan='+p.sha256,dest);
  const v=inspect('volume',dest);if(v.Labels?.['recovery283.nonce']!==p.nonce||v.Labels?.['recovery283.plan']!==p.sha256)fail('OWNERSHIP');
  const args=helperArgs(dest,p.inventory.images.migrator.id,false,'receive'),helperName=args[args.indexOf('--name')+1];
  const proc=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
  let timedOut=false;const watchdog=setTimeout(()=>{timedOut=true;proc.kill('SIGKILL');
    spawnSync('docker',['rm','-f',helperName],{stdio:'ignore',timeout:10000});},p.maxSeconds*1000);
  let stdout='',stderr='',exitCode=null;proc.stdout.on('data',b=>stdout+=b);proc.stderr.on('data',b=>stderr+=b);proc.on('close',c=>exitCode=c);
  proc.stdin.on('error',()=>{});
  try{
    for await(const chunk of decryptFile(archive,key,p.sha256+':archive')){
      if(proc.stdin.destroyed)fail('RESTORE_HELPER');
      if(!proc.stdin.write(chunk))await new Promise(r=>{proc.stdin.once('drain',r);proc.stdin.once('close',r);});
    }
    if(!proc.stdin.destroyed)proc.stdin.end();
    const exit=exitCode??await new Promise(r=>proc.on('close',r));
    if(timedOut)fail('RESTORE_TIMEOUT');
    if(exit!==0)fail('RESTORE_HELPER_'+(stderr.match(/RECOVERY_VOLUME_HALT:([A-Z_]+)/)?.[1]??'FAILED'));
  }finally{clearTimeout(watchdog);if(exitCode!==0){proc.kill('SIGKILL');
    spawnSync('docker',['rm','-f',helperName],{stdio:'ignore',timeout:10000});}}
  const result=JSON.parse(stdout.trim());if(result.logicalSha256!==sha(JSON.stringify(header.logical)))fail('RESTORE_VERIFY');
  return {state:'RESTORED_ISOLATED',destination:dest,planSha256:p.sha256,files:result.files,
    logicalSha256:receipt.logicalSha256,sourceRelease:p.inventory.install.version,compatibility:'IDENTITY_ONLY; CLONE_STARTUP_NOT_RUN; AUTH_NOT_RUN; WORKER_NOT_RUN'};
}
async function verify(p,opts){
  const {header,receipt}=await sealed(p,opts),dest=opts.destination;
  if(!dest||dest===p.inventory.volume.name)fail('DESTINATION');
  const v=inspect('volume',dest);
  if(v.Labels?.['recovery283.nonce']!==p.nonce||v.Labels?.['recovery283.plan']!==p.sha256)fail('OWNERSHIP');
  if(containerIds(dest).length)fail('CLONE_WRITER_PRESENT');
  for(const [role,want] of Object.entries(p.inventory.images))if(canonical(imageIdentity(role,want.id))!==canonical(want))fail('IMAGE_DRIFT');
  const actual=await scan(dest,p.inventory.images.migrator.id);
  if(canonical(actual.files)!==canonical(header.files)||canonical(actual.logical)!==canonical(header.logical))fail('RESTORE_VERIFY');
  return {state:'VERIFIED_ISOLATED',destination:dest,planSha256:p.sha256,files:actual.files.length,
    logicalSha256:receipt.logicalSha256,release:actual.logical.install.version,
    images:'THREE_ROLE_IDENTITY_MATCH',schema:'G7_DECLARED_SCHEMA_MATCH',appHealth:'NOT_RUN',appRead:'NOT_RUN',worker:'NOT_RUN',auth:'NOT_RUN'};
}
function dockerEnv(args,values,timeout=30000){const r=spawnSync('docker',args,{encoding:'utf8',timeout,maxBuffer:1024*1024,
  env:{...process.env,...values}});if(r.status!==0)fail('PROBE_DOCKER');return r.stdout.trim();}
function cloneEnvironment(settings,install){
  const config=dotenv.parse(Buffer.from(settings.envBase64,'base64'));
  const saved=Object.fromEntries((settings.runtime.app?.environment??settings.runtime.worker?.environment??[])
    .filter(x=>typeof x==='string'&&x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
  const env={};for(const [k,v] of Object.entries({...config,...saved}))
    if(/^(LOG_[A-Z0-9_]+|SESSION_[A-Z0-9_]+|MAX_UPLOAD_SIZE_MB)$/.test(k)&&typeof v==='string')env[k]=v;
  return {...env,G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',DATABASE_URL:'file:/data/db/cad.sqlite',
    CAD_STORAGE_PATH:'/data/cad',CAD_STORAGE_BACKEND:'local',G7_DEPLOY_APP_IMAGE:install.appImage,
    G7_DEPLOY_MIGRATOR_IMAGE:install.migratorImage,G7_RELEASE_SOURCE_COMMIT:install.sourceCommit,
    G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',G7_RUNTIME_ORIGIN:'http://127.0.0.1:3000',
    G7_RUNTIME_ALLOW_HTTP:'true',SCENE_AUTO_BUILD_ENABLED:'true',SCENE_CPU_WORKER_ENABLED:'true',
    LOG_STORE_ENABLED:'false',NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'3000'};
}
async function probe(p,opts){if(!opts.execute)fail('EXECUTE_REQUIRED');
  const baseline=await verify(p,opts),{settings,header}=await sealed(p,opts);
  const env=cloneEnvironment(settings,header.logical.install),envFlags=Object.keys(env).flatMap(k=>['--env',k]);
  const name='r283-probe-'+randomBytes(8).toString('hex'),dest=opts.destination;
  let cid,health='FAIL',read='NOT_RUN';
  try{cid=dockerEnv(['run','-d','--name',name,'--label','recovery283.probe='+p.sha256,
    '--network','none','--read-only','--security-opt','no-new-privileges','--cap-drop','ALL',
    '--user','10001:10001','--pids-limit','128','--memory','1g','--cpus','1.5',
    '--tmpfs','/tmp:rw,nosuid,nodev,size=128m,uid=10001,gid=10001',
    '--entrypoint','node','--mount',`type=volume,src=${dest},dst=/data,volume-nocopy`,
    ...envFlags,p.inventory.images.app.id,'server.js'],env);
    for(let attempt=0;attempt<30;attempt++){
      const r=spawnSync('docker',['exec',cid,'node','-e',
        "fetch('http://127.0.0.1:3000/api/health').then(r=>process.stdout.write(String(r.status))).catch(()=>process.exit(1))"],
        {encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
      if(r.status===0&&r.stdout.trim()==='200'){health='PASS';break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(health!=='PASS')fail('PROBE_APP_HEALTH');
    const r=dockerEnv(['exec',cid,'node','-e',
      "fetch('http://127.0.0.1:3000/api/masters').then(r=>process.stdout.write(String(r.status))).catch(()=>process.exit(1))"],{},10000);
    read=r==='200'?'PASS':r==='401'?'AUTH_BOUNDARY':'FAIL';
    if(read==='FAIL')fail('PROBE_APP_READ');
  }finally{spawnSync('docker',['rm','-f',name],{stdio:'ignore',timeout:10000});}
  const workerName='r283-worker-probe-'+randomBytes(8).toString('hex');let worker;
  try{worker=dockerEnv(['run','--rm','--name',workerName,
    '--label','recovery283.probe='+p.sha256,'--network','none','--read-only','--init',
    '--security-opt','no-new-privileges','--cap-drop','ALL','--user','10001:10001',
    '--pids-limit','64','--memory','768m','--cpus','1',
    '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
    '--entrypoint','node','--mount',`type=volume,src=${dest},dst=/data,volume-nocopy`,
    ...envFlags,p.inventory.images.worker.id,'--import','tsx','scripts/scene-cpu-worker.ts','--once'],env,150000);
  }finally{spawnSync('docker',['rm','-f',workerName],{stdio:'ignore',timeout:10000});}
  let outcome;try{const row=JSON.parse(worker.split('\n').at(-1));
    if(row.kind!=='CPU_SCENE_TICK'||!['IDLE','PUBLISHED','FAILED','RETRY_WAIT','CAS_LOST'].includes(row.outcome))fail('PROBE_WORKER');
    outcome=row.outcome;
  }catch{fail('PROBE_WORKER');}
  return {state:'CLONE_PROBED',baseline:baseline.state,planSha256:p.sha256,appHealth:health,appRead:read,
    worker:outcome,auth:'NOT_RUN',cloneMutatedAfterBaseline:true};
}
async function extractSettings(p,opts){if(!opts.execute)fail('EXECUTE_REQUIRED');
  const {settings}=await sealed(p,opts),dest=path.resolve(opts['destination-dir']);
  if(!dest||dest===path.resolve(opts.out))fail('DESTINATION');
  freshPrivatePath(dest);
  fs.mkdirSync(dest,{mode:0o700});if((fs.statSync(dest).mode&0o077)!==0||fs.readdirSync(dest).length)fail('DESTINATION');
  writeExclusive(path.join(dest,'approved.env'),Buffer.from(settings.envBase64,'base64'));
  writeExclusive(path.join(dest,'docker-compose.yml'),Buffer.from(settings.composeBase64,'base64'));
  writeExclusive(path.join(dest,'container-runtime.private.json'),JSON.stringify(settings.runtime)+'\n');
  return {state:'PRIVATE_SETTINGS_EXTRACTED',files:3,planSha256:p.sha256};
}
async function main(){const opts=parse(process.argv.slice(2)),action=opts._[0];
  if(action==='inventory'||action==='plan'){
    if(!opts.volume||!opts.config)fail('ARGUMENT');const inventory=liveInventory(opts);
    if(action==='inventory'){process.stdout.write(JSON.stringify({volume:inventory.volume.name,
      images:Object.fromEntries(Object.entries(inventory.images).map(([r,x])=>[r,{id:x.id,version:x.version,source:x.source,digestCount:x.repoDigests.length}])),
      writers:Object.fromEntries(Object.entries(inventory.writers).map(([r,x])=>[r,x?x.state:'missing'])),
      release:inventory.install.version,schemaId:inventory.install.schemaId,configSha256:inventory.config.sha256})+'\n');return;}
    inventory.writerNames=parsePairs(opts.writer);const p={format:'RECOVERY283-PLAN-V1',nonce:randomBytes(16).toString('hex'),inventory,maxSeconds:Number(opts['max-seconds']??1800)};
    if(!Number.isInteger(p.maxSeconds)||p.maxSeconds<30||p.maxSeconds>3600)fail('TIME_BUDGET');p.sha256=planHash(p);
    writeExclusive(opts.plan,JSON.stringify(p)+'\n');process.stdout.write(JSON.stringify({planSha256:p.sha256,nonce:p.nonce,plan:opts.plan,release:inventory.install.version})+'\n');return;
  }
  if(!opts.plan)fail('ARGUMENT');const p=loadPlan(opts.plan);
  if(action==='capture')process.stdout.write(JSON.stringify(await capture(p,opts))+'\n');
  else if(action==='restore')process.stdout.write(JSON.stringify(await restore(p,opts))+'\n');
  else if(action==='verify'||action==='compatibility')process.stdout.write(JSON.stringify(await verify(p,opts))+'\n');
  else if(action==='probe')process.stdout.write(JSON.stringify(await probe(p,opts))+'\n');
  else if(action==='settings')process.stdout.write(JSON.stringify(await extractSettings(p,opts))+'\n');
  else fail('ACTION');
}
export {encryptFile,decryptFile,validateArchive,canonical,planHash,loadPlan};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error(e.message.startsWith('RECOVERY283_')?e.message:'RECOVERY283_HALT');process.exitCode=1;});
