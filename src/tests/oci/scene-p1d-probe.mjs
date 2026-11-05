/** #225 P1-D: read-only assertions and one destructive tamper on a
 * fresh GitHub CI-owned G7 Docker volume. Never copied into production OCI.
 * Only the server-authoritative original locator may be mutated, and ONLY
 * inside a volume whose CI ownership marker is present.
 */
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const database='/data/db/cad.sqlite',root='/data/cad';
const marker='/data/ci-scene-p1d-ownership';
const actions=new Set(['inspect','tamper']);
const [action,id]=process.argv.slice(2);
const fail=code=>{throw new Error(code);};
if(!actions.has(action)||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id??'')){
  fail('P1D_PROBE_ARGUMENT_DENIED');
}
if(!existsSync(marker)||readFileSync(marker,'utf8')!=='P1D_CI_ONLY\n'){
  fail('P1D_PROBE_NOT_OWNED');
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const db=new Database(database,{fileMustExist:true});
try{
  const row=db.prepare('SELECT storage_path AS storagePath,sha256,file_size AS fileSize FROM "CadFileVersion" WHERE id=?')
    .get(id);
  if(!row)fail('P1D_PROBE_VERSION_NOT_FOUND');
  if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.dxf$/.test(row.storagePath)) {
    fail('P1D_PROBE_UNSAFE_ORIGINAL_LOCATOR');
  }
  const filename=path.resolve(root,row.storagePath);
  if(!filename.startsWith(root+path.sep))fail('P1D_PROBE_OUTSIDE_CAD');
  const file=readFileSync(filename);
  const originallyValid=file.length===row.fileSize&&hash(file)===row.sha256;
  if(action==='tamper'){
    if(!originallyValid)fail('P1D_PROBE_PRE_TAMPER_SHA_INVALID');
    const altered=Buffer.from(file);altered[5]^=1;
    if(altered.length!==file.length||hash(altered)===row.sha256)fail('P1D_PROBE_TAMPER_INVALID');
    writeFileSync(filename,altered,{mode:0o600});
  }
  const job=db.prepare('SELECT status,attempt,last_code AS lastCode FROM "SceneBuildJob" WHERE version_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(id);
  const pointer=db.prepare('SELECT asset_id AS assetId,revision FROM "CurrentScene" WHERE version_id=?').get(id);
  const assets=db.prepare('SELECT count(*) AS n FROM "SceneAsset" WHERE version_id=?').get(id).n;
  const uploaded=db.prepare('SELECT count(*) AS n FROM "AuditEvent" WHERE target_id=? AND action=?').get(id,'CAD_UPLOADED').n;
  const published=db.prepare('SELECT count(*) AS n FROM "AuditEvent" WHERE target_id=? AND action=?').get(id,'SCENE_PUBLISHED').n;
  process.stdout.write(JSON.stringify({
    action,job:job??null,pointer:pointer??null,assets,uploaded,published,
    originalShaValid:action==='tamper'?false:originallyValid,
  })+'\n');
}finally{db.close();}
