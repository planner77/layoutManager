/** FUP1 read-only business-state digest inside the exact restored old App.
 * Deliberately never selects User/password, Session, Recovery or login-attempt
 * rows. Normal authentication/Audit changes are outside this comparison.
 * No row values, CAD names, paths or contents are written to stdout.
 */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const Sqlite=createRequire(import.meta.url)('better-sqlite3');
const db=new Sqlite('/data/db/cad.sqlite',{readonly:true,fileMustExist:true});
const tables=['Building','BusinessUnit','CadBusinessAudit','CadDeletionJob',
  'CadFileVersion','CadLocation','CadMemo','CadMemoAnchor','CadMemoFeature','CadMemoGroup',
  'CadOutline','CadOutlineCreateReceipt','CadSite','CadZone','CadZoneAudit',
  'CadZoneCreateReceipt','CadZoneGeometry','CurrentScene','OutlineType','OutlineTypeAudit',
  'Product','SceneAsset','SceneOrphanJob','ZoneCategory'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const result={schema:'fup1-business-fingerprint@1',tables:{},cadFiles:0,cadBytes:0,cadTreeSha256:''};
const versionColumns=['id','location_id','version','original_filename','drawing_name','description',
  'file_format','file_size','sha256','storage_path','registered_at','created_at','updated_at'];
const fingerprint=db.transaction(()=>{
  for(const table of tables){
    const projection=table==='CadFileVersion'?versionColumns.map(c=>`"${c}"`).join(','):'*';
    const rows=db.prepare(`SELECT ${projection} FROM "${table}" LIMIT 100001`).all();
    if(rows.length>100000)throw new Error('BUSINESS_BOUND');
    const canonical=rows.map(row=>JSON.stringify(row)).sort();
    result.tables[table]={count:rows.length,sha256:hash(JSON.stringify(canonical))};
  }
});
try{fingerprint();}finally{db.close();}
const files=[];
function visit(dir,depth=0){
  if(depth>16)throw new Error('CAD_DEPTH_BOUND');
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())visit(file,depth+1);
    else if(entry.isFile()){
      const size=fs.statSync(file).size;
      if(++result.cadFiles>10000||size>32*1024*1024||(result.cadBytes+=size)>256*1024*1024)
        throw new Error('CAD_BYTE_BOUND');
      files.push([path.relative('/data/cad',file),size,hash(fs.readFileSync(file))]);
    }else throw new Error('CAD_NONREGULAR');
  }
}
visit('/data/cad');
result.cadTreeSha256=hash(JSON.stringify(files));
process.stdout.write(JSON.stringify(result)+'\n');
