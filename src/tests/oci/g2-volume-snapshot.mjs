/** Read-only, bounded table/CAD fingerprint for a stopped, owned G2 clone. */
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,lstatSync} from 'node:fs';
import path from 'node:path';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_key,item)=>
  typeof item==='bigint'?item.toString():Buffer.isBuffer(item)?{blob:item.toString('hex')}:item);
const baseline=process.env.G2_BASELINE_JSON?JSON.parse(process.env.G2_BASELINE_JSON):null;
const db=new Database('/data/db/cad.sqlite',{readonly:true,fileMustExist:true});
const result={kind:'G2_VOLUME_SNAPSHOT',tables:{},cad:{},fk:0,integrity:false,
  manifestVersion:null,manifestSchemaId:null,manifestSha256:null,
  manifestAppRefSha256:null,manifestMigratorRefSha256:null,
  manifestSource:null,manifestInstallIdSha256:null};
try{
  result.integrity=db.pragma('integrity_check',{simple:true})==='ok';
  result.fk=db.pragma('foreign_key_check').length;
  if(!result.integrity||result.fk!==0)throw Error('G2_DB_INVALID');
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for(const {name} of names){
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('G2_TABLE_NAME');
    const columns=db.prepare(`PRAGMA table_info("${name}")`).all().map(row=>row.name);
    if(columns.length>128||columns.some(column=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)))
      throw Error('G2_COLUMN_NAME');
    const old=baseline?.tables[name]?.columns;
    const selected=old??columns;
    if(selected.some(column=>!columns.includes(column)))throw Error('G2_COLUMN_REMOVED');
    const rows=db.prepare(`SELECT ${selected.map(column=>`"${column}"`).join(',')} FROM "${name}"`).all();
    if(rows.length>100000)throw Error('G2_TABLE_LIMIT');
    const hashes=rows.map(row=>sha(Buffer.from(canonical(row)))).sort();
    result.tables[name]={columns,count:rows.length,sha256:sha(Buffer.from(hashes.join('\n')))};
  }
}finally{db.close();}
const manifest=readFileSync('/data/db/g7-install.json');
if(manifest.length>4096)throw Error('G2_MANIFEST_LIMIT');
const parsed=JSON.parse(manifest);
result.manifestVersion=parsed.version;
result.manifestSchemaId=parsed.schemaId;
result.manifestSha256=sha(manifest);
result.manifestAppRefSha256=sha(Buffer.from(parsed.appImage));
result.manifestMigratorRefSha256=sha(Buffer.from(parsed.migratorImage));
result.manifestSource=parsed.sourceCommit;
result.manifestInstallIdSha256=sha(Buffer.from(parsed.installId));
let count=0;
function visit(directory,relative=''){
  for(const entry of readdirSync(directory).sort()){
    const next=path.join(directory,entry),rel=path.posix.join(relative,entry);
    const info=lstatSync(next);
    if(info.isDirectory())visit(next,rel);
    else if(info.isFile()){
      if(++count>10000||info.size>100*1024*1024)throw Error('G2_CAD_LIMIT');
      result.cad[sha(Buffer.from(rel))]={bytes:info.size,sha256:sha(readFileSync(next))};
    }else throw Error('G2_CAD_NONFILE');
  }
}
if(!existsSync('/data/cad'))throw Error('G2_CAD_MISSING');
visit('/data/cad');
process.stdout.write(JSON.stringify(result)+'\n');
