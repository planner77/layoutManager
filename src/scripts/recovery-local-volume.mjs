/* Runs only in a networkless, one-shot container with /data as its sole data mount. */
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=process.env.RECOVERY283_TEST_ROOT||'/data', maxFiles=100000, maxBytes=20*1024**3, maxMember=10*1024**3;
const sha=b=>createHash('sha256').update(b).digest('hex');
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const cadPath=new RegExp(`^${uuid}/${uuid}/original\\.(?:dxf|dwg)$`,'i');
const scenePath=new RegExp(`^scenes/(${uuid})\\.json$`,'i');
const safe=p=>typeof p==='string'&&p.length>0&&p.length<=512&&!p.includes('\\')&&
  !path.posix.isAbsolute(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[\x00-\x1f]/.test(x));
function entries(){
  const out=[];let total=0;
  function visit(dir,prefix=''){
    for(const name of fs.readdirSync(dir).sort()){
      const rel=prefix?prefix+'/'+name:name;if(!safe(rel))throw Error('UNSAFE_PATH');
      const full=path.join(dir,name),s=fs.lstatSync(full);
      if(s.isSymbolicLink()||(s.mode&0o022)!==0)throw Error('UNSAFE_MEMBER');
      if(s.isDirectory()){visit(full,rel);continue;}
      if(!s.isFile()||s.nlink!==1||s.size>maxMember||(!process.env.RECOVERY283_TEST_ROOT&&(s.uid!==10001||s.gid!==10001)))throw Error('UNSAFE_MEMBER');
      total+=s.size;if(total>maxBytes||out.length>=maxFiles)throw Error('ARCHIVE_BOUND');
      const h=createHash('sha256'),fd=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      try{const buf=Buffer.allocUnsafe(1024*1024);let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));}
      finally{fs.closeSync(fd);}
      out.push({path:rel,size:s.size,sha256:h.digest('hex'),mode:s.mode&0o777,uid:s.uid,gid:s.gid});
    }
  }
  visit(root);return out;
}
function verifiedLocal(relative,length,digest){
  if(!safe(relative)||!Number.isSafeInteger(length)||length<1||length>maxMember||
    !/^[a-f0-9]{64}$/.test(digest))throw Error('STORAGE_REFERENCE');
  const cadRoot=path.join(root,'cad'),file=path.join(cadRoot,relative);
  const real=fs.realpathSync(file);
  if(!real.startsWith(fs.realpathSync(cadRoot)+path.sep))throw Error('STORAGE_ESCAPE');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size!==length)throw Error('STORAGE_LENGTH');
    const h=createHash('sha256'),b=Buffer.allocUnsafe(1024*1024);let n;
    while((n=fs.readSync(fd,b,0,b.length,null))>0)h.update(b.subarray(0,n));
    if(h.digest('hex')!==digest)throw Error('STORAGE_DIGEST');
  }finally{fs.closeSync(fd);}
}
function storageSnapshot(db,tableNames){
  const has=name=>tableNames.has(name),cad=[],scene=[];
  if(has('CadFileVersion'))for(const row of db.prepare('SELECT id,storage_path,file_size,sha256 FROM "CadFileVersion" ORDER BY id').all()){
    if(!cadPath.test(row.storage_path))throw Error('CAD_LOCATOR');
    verifiedLocal(row.storage_path,row.file_size,row.sha256);
    cad.push([row.id,row.storage_path,row.file_size,row.sha256]);
  }
  if(has('SceneAsset'))for(const row of db.prepare('SELECT id,storage_locator,byte_length,digest FROM "SceneAsset" ORDER BY id').all()){
    const match=scenePath.exec(row.storage_locator);
    if(!match||match[1].toLowerCase()!==String(row.id).toLowerCase()||row.byte_length>32*1024*1024)throw Error('SCENE_LOCATOR');
    verifiedLocal(row.storage_locator,row.byte_length,row.digest);
    scene.push([row.id,row.storage_locator,row.byte_length,row.digest]);
  }
  if(has('CadDeletionJob'))for(const row of db.prepare('SELECT storage_path FROM "CadDeletionJob"').all())
    if(!cadPath.test(row.storage_path))throw Error('CAD_DELETION_LOCATOR');
  if(has('SceneOrphanJob'))for(const row of db.prepare('SELECT storage_locator FROM "SceneOrphanJob"').all())
    if(!scenePath.test(row.storage_locator))throw Error('SCENE_ORPHAN_LOCATOR');
  const readyJobs=has('SceneBuildJob')?db.prepare("SELECT COUNT(*) AS n FROM \"SceneBuildJob\" WHERE status='READY'").get().n:0;
  const currentScenes=has('CurrentScene')?db.prepare('SELECT COUNT(*) AS n FROM "CurrentScene"').get().n:0;
  return {cadCount:cad.length,sceneAssetCount:scene.length,readyJobs,currentScenes,
    referenceSha256:sha(JSON.stringify({cad,scene}))};
}
async function dbSnapshot(){
  const require=createRequire(process.env.RECOVERY283_TEST_ROOT?path.join(process.cwd(),'package.json'):'/app/src/package.json');
  const Database=require('better-sqlite3');
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'r283-db-'));
  for(const name of ['cad.sqlite','cad.sqlite-wal','cad.sqlite-shm']){
    const source=path.join(root,'db',name);
    if(fs.existsSync(source))fs.copyFileSync(source,path.join(scratch,name),fs.constants.COPYFILE_EXCL);
  }
  const db=new Database(path.join(scratch,'cad.sqlite'),{readonly:true,fileMustExist:true});
  try{
    const integrity=db.pragma('integrity_check',{simple:true});
    if(integrity!=='ok'||db.pragma('foreign_key_check').length)throw Error('DB_INTEGRITY');
    const tables=[],tableNames=new Set();
    for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('DB_TABLE');
      tableNames.add(name);
      const h=createHash('sha256');let count=0;
      for(const row of db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).iterate()){
        h.update(JSON.stringify(row,(_,v)=>typeof v==='bigint'?v.toString():Buffer.isBuffer(v)?v.toString('base64'):v));h.update('\n');count++;
      }
      tables.push({name,count,sha256:h.digest('hex')});
    }
    const install=fs.readFileSync(path.join(root,'db/g7-install.json'));
    const parsed=JSON.parse(install.toString());
    if(typeof parsed.version!=='string'||typeof parsed.schemaId!=='string'||typeof parsed.installId!=='string')throw Error('INSTALL_IDENTITY');
    if(!process.env.RECOVERY283_TEST_ROOT){
      const {GREENFIELD_UPGRADE_REGISTRY,assertDeclaredSchema}=await import('/app/src/server/g7-operational/greenfield-upgrade-registry.ts');
      const {validateInstallation}=await import('/app/src/server/g7-operational/greenfield-auto.ts');
      const verified=validateInstallation(parsed);
      const release=GREENFIELD_UPGRADE_REGISTRY.releases.find(r=>r.version===verified.version);
      if(!release||release.schemaId!==verified.schemaId)throw Error('RELEASE_SCHEMA');
      assertDeclaredSchema(db,release);
    }
    const storage=storageSnapshot(db,tableNames);
    return {tables,storage,install:{version:parsed.version,schemaId:parsed.schemaId,installId:parsed.installId,
      appImage:parsed.appImage??'',migratorImage:parsed.migratorImage??'',sourceCommit:parsed.sourceCommit??'',
      sha256:sha(install)},integrity:'ok',foreignKeys:0};
  }finally{db.close();fs.rmSync(scratch,{recursive:true,force:true});}
}
function write(buf){if(!process.stdout.write(buf))return new Promise(r=>process.stdout.once('drain',r));return Promise.resolve();}
async function emit(){
  const list=entries(),logical=await dbSnapshot();
  await write(Buffer.from(JSON.stringify({format:'RECOVERY283-V1',files:list,logical})+'\n'));
  for(const e of list){
    const stream=fs.createReadStream(path.join(root,e.path),{highWaterMark:1024*1024});
    for await(const chunk of stream)await write(chunk);
  }
  if(JSON.stringify(entries())!==JSON.stringify(list)||JSON.stringify(await dbSnapshot())!==JSON.stringify(logical))throw Error('SOURCE_CHANGED');
}
async function receive(){
  if(fs.readdirSync(root).length)throw Error('TARGET_NONEMPTY');
  let buffer=Buffer.alloc(0),header,remaining=0,index=0,h;
  let fd=null;
  for await(const chunk of process.stdin){
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length||(header&&index<header.files.length&&header.files[index].size===0)){
      if(!header){
        const end=buffer.indexOf(10);if(end<0){if(buffer.length>64*1024*1024)throw Error('HEADER_BOUND');break;}
        header=JSON.parse(buffer.subarray(0,end).toString());buffer=buffer.subarray(end+1);
        if(header.format!=='RECOVERY283-V1'||!Array.isArray(header.files)||header.files.length>maxFiles)throw Error('ARCHIVE_FORMAT');
        let total=0;const seen=new Set();
        for(const e of header.files){
          if(!safe(e.path)||seen.has(e.path)||!Number.isSafeInteger(e.size)||e.size<0||e.size>maxMember||!/^[a-f0-9]{64}$/.test(e.sha256)||
            !Number.isInteger(e.mode)||e.mode<0||e.mode>0o777||(e.mode&0o022)!==0||
            (!process.env.RECOVERY283_TEST_ROOT&&(e.uid!==10001||e.gid!==10001)))throw Error('UNSAFE_MEMBER');
          seen.add(e.path);total+=e.size;if(total>maxBytes)throw Error('ARCHIVE_BOUND');
        }
        continue;
      }
      if(index===header.files.length)throw Error('ARCHIVE_TRAILING');
      const e=header.files[index];
      if(fd===null){
        const dest=path.join(root,e.path);fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});
        let parent=path.dirname(dest);while(parent.startsWith(root)){
          if(!process.env.RECOVERY283_TEST_ROOT)fs.chownSync(parent,10001,10001);
          fs.chmodSync(parent,0o700);
          if(parent===root)break;parent=path.dirname(parent);
        }
        fd=fs.openSync(dest,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
        h=createHash('sha256');remaining=e.size;
      }
      const n=Math.min(buffer.length,remaining),part=buffer.subarray(0,n);
      if(n){fs.writeSync(fd,part);h.update(part);buffer=buffer.subarray(n);remaining-=n;}
      if(remaining===0){if(!process.env.RECOVERY283_TEST_ROOT)fs.fchownSync(fd,e.uid,e.gid);fs.fchmodSync(fd,e.mode);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
        if(h.digest('hex')!==e.sha256)throw Error('FILE_HASH');index++;continue;}
      break;
    }
  }
  if(!header||index!==header.files.length)throw Error('ARCHIVE_TRUNCATED');
  if(JSON.stringify(entries())!==JSON.stringify(header.files)||JSON.stringify(await dbSnapshot())!==JSON.stringify(header.logical))throw Error('RESTORE_MISMATCH');
  process.stdout.write(JSON.stringify({files:header.files.length,logicalSha256:sha(JSON.stringify(header.logical)),install:header.logical.install})+'\n');
}
const action=process.argv[2];
try{
  if(action==='identity'){
    const bytes=fs.readFileSync(path.join(root,'db/g7-install.json')),install=JSON.parse(bytes.toString());
    process.stdout.write(JSON.stringify({version:install.version,schemaId:install.schemaId,installId:install.installId,
      appImage:install.appImage,migratorImage:install.migratorImage,sourceCommit:install.sourceCommit,sha256:sha(bytes)})+'\n');
  }
  else if(action==='scan')process.stdout.write(JSON.stringify({files:entries(),logical:await dbSnapshot()})+'\n');
  else if(action==='emit')await emit();
  else if(action==='receive')await receive();
  else throw Error('ACTION');
}catch(e){console.error('RECOVERY_VOLUME_HALT:'+e.message);process.exitCode=1;}
