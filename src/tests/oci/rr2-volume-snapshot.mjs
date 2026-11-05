/** RR2 owned-volume read-only snapshot. Emits only counts and SHA256 digests. */
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';

const nonce=process.env.RR2_NONCE;
if(!/^[0-9a-f]{16}$/.test(nonce??''))throw Error('RR2_NONCE_INVALID');
const marker='/data/rr2-ownership.marker';
if(!existsSync(marker)||readFileSync(marker,'utf8')!=='RR2:'+nonce+'\n')
  throw Error('RR2_VOLUME_NOT_OWNED');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const db=new Database('/data/db/cad.sqlite',{readonly:true,fileMustExist:true});
const result={nonce,kind:'RR2_OWNED_VOLUME_SNAPSHOT',tables:{},files:{},
  prefixHashes:{},foreignKeys:0,manifestSha:'',manifestVersion:'',manifestSchemaId:''};
try{
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for(const {name} of names){
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('RR2_TABLE_NAME_INVALID');
    const rows=db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all();
    const bytes=Buffer.from(JSON.stringify(rows,(_key,value)=>
      typeof value==='bigint'?value.toString():value));
    result.tables[name]={count:rows.length,sha:sha(bytes)};
    if(['CadFileVersion','SceneBuildJob','SceneAsset','CurrentScene','AuditEvent'].includes(name))
      result.prefixHashes[name]=rows.map(row=>sha(Buffer.from(JSON.stringify(row,(_key,value)=>
        typeof value==='bigint'?value.toString():value))));
  }
  result.foreignKeys=db.prepare('PRAGMA foreign_key_check').all().length;
  if(result.foreignKeys!==0)throw Error('RR2_FK_INVALID');
}finally{db.close();}
const manifest=readFileSync('/data/db/g7-install.json');
const parsed=JSON.parse(manifest.toString('utf8'));
result.manifestSha=sha(manifest);
result.manifestVersion=parsed.version;
result.manifestSchemaId=parsed.schemaId;
const backupRoot='/data/db/g7-upgrade-backups';
result.backupIds=existsSync(backupRoot)?readdirSync(backupRoot).sort():[];
if(result.backupIds.some(id=>!/^[0-9a-f-]{36}$/.test(id)))
  throw Error('RR2_BACKUP_ID_INVALID');
function visit(root,dir){
  for(const entry of readdirSync(dir).sort()){
    const full=path.join(dir,entry),relative=path.relative(root,full);
    const info=statSync(full);
    if(info.isDirectory())visit(root,full);
    else if(info.isFile())result.files[relative]=sha(readFileSync(full));
    else throw Error('RR2_CAD_NONFILE');
  }
}
visit('/data/cad','/data/cad');
process.stdout.write(JSON.stringify(result)+'\n');
