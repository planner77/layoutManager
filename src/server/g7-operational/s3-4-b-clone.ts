/**
 * #109 S3-4-B1: inspect an owned /tmp disposable RESTORED clone, never
 * production DB, operating CAD root or S3. This is a local byte-integrity
 * rehearsal; it cannot prove that source DB/CAD/S3 were snapshotted together.
 */
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { G7_S3_SCHEMA_ID } from './preflight';

export type S34B1State = 'BLOCKED' | 'ISOLATED_INTEGRITY_ONLY';
export type S34B1Result = Readonly<{
  state: S34B1State; versionCount: number; localChecked: number; s3ExportChecked: number;
  reasons: readonly string[]; operationalGo: false; runtimeActivated: false;
}>;
type Row = Record<string, string | number | null>;
type Db = {prepare(sql: string): {all(...v: (string|number)[]): Row[]; get(...v:(string|number)[]): Row | undefined}; close():void};
const SQLite = createRequire(import.meta.url)('better-sqlite3') as
  new(filename:string, options:{readonly:true;fileMustExist:true;timeout:number})=>Db;
const key = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/original\.(dxf|dwg)$/;
const s3key = /^s3:([a-z0-9][a-z0-9.-]{1,61}[a-z0-9]):(cad\/[0-9a-f-]{36}\/original\.(?:dxf|dwg))$/;
const snapId = /^SNAP-[a-zA-Z0-9_-]{2,64}$/;
const hex = /^[a-f0-9]{64}$/;
const MAX_CAD_BYTES = 110 * 1024 * 1024;
function result(reasons: string[], versions: number, local: number, s3: number): S34B1Result {
  const unique=[...new Set(reasons)].sort();
  return {state: unique.length ? 'BLOCKED' : 'ISOLATED_INTEGRITY_ONLY',
    versionCount: versions, localChecked:local, s3ExportChecked:s3,
    reasons:unique, operationalGo:false, runtimeActivated:false};
}
function ownedDirectory(dir: string): void {
  const s=lstatSync(dir);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid!==process.getuid?.() ||
      (s.mode&0o077)!==0 || realpathSync(dir)!==dir)
    throw new Error('INVALID_DIRECTORY');
}
function ownedBytes(root: string, rel: string): Buffer {
  if (rel.startsWith('/') || rel.includes('..') || rel.includes('\\')) throw new Error('UNSAFE_LOCATOR');
  const segments=rel.split('/');
  if (segments.some(s=>!s || s==='.' || s==='..')) throw new Error('UNSAFE_LOCATOR');
  let parent=root;
  for (const segment of segments.slice(0,-1)) {
    parent=path.join(parent,segment);
    ownedDirectory(parent);
  }
  const file=path.join(root,...segments);
  const before=lstatSync(file);
  if(!before.isFile() || before.isSymbolicLink() || before.uid!==process.getuid?.() ||
      (before.mode&0o077)!==0 || before.size<1 || before.size>MAX_CAD_BYTES)
    throw new Error('UNSAFE_SNAPSHOT_FILE');
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const after=fstatSync(fd);
    if(!after.isFile() || after.uid!==before.uid || after.dev!==before.dev ||
        after.ino!==before.ino || after.size!==before.size || (after.mode&0o077)!==0)
      throw new Error('REPLACED_SNAPSHOT_FILE');
    return readFileSync(fd);
  } finally {closeSync(fd);}
}
/** Require caller-owned synthetic/disposable mirror only. Never a real S3 fetch.
 * Manifest SNAP-ID is a label only and NOT proof of source writer quiescence.
 */
export function inspectS34B1Clone(root: string,
  expected: Readonly<{snapshotId:string;schema:'CAD_BASELINE'|'G7_CANDIDATE'}>): S34B1Result {
  const reasons:string[]=[];let total=0,local=0,s3=0;
  try {
    if(process.platform==='win32'||typeof process.getuid!=='function'||!path.isAbsolute(root)||
        path.normalize(root)!==root ||
        !/^cad-g7-s3-b-[A-Za-z0-9_-]{6,64}$/.test(path.basename(root))||
        path.dirname(root)!==realpathSync('/tmp')||
        !snapId.test(expected.snapshotId) ||
        !['CAD_BASELINE','G7_CANDIDATE'].includes(expected.schema))
      return result(['G7_S3_4B_DISPOSABLE_ONLY'],0,0,0);
    ownedDirectory(root);
    const manifest=JSON.parse(ownedBytes(root,'snapshot.json').toString('utf8')) as unknown;
    if (!manifest || typeof manifest!=='object'||Array.isArray(manifest)) throw Error('MANIFEST');
    const m=manifest as Record<string,unknown>;
    if(Object.keys(m).sort().join(',')!=='schema,schemaId,snapshotId,scope' ||
      m.scope!=='G7-S3-4B-DISPOSABLE-RESTORE'||
      m.snapshotId!==expected.snapshotId||m.schema!==expected.schema ||
      m.schemaId!==(expected.schema==='G7_CANDIDATE'?G7_S3_SCHEMA_ID:'CAD_BASELINE'))
      return result(['SNAPSHOT_MANIFEST_MISMATCH'],0,0,0);
    const databaseFile=path.join(root,'snapshot.sqlite');
    // Validate descriptor and physical ownership before better-sqlite3 opens.
    const check=ownedBytes(root,'snapshot.sqlite');
    if(check.subarray(0,16).toString('binary')!=='SQLite format 3\0')
      return result(['INVALID_SQLITE_SNAPSHOT'],0,0,0);
    const db=new SQLite(databaseFile,{readonly:true,fileMustExist:true,timeout:5000});
    try {
      if(db.prepare('PRAGMA quick_check').all().some(row=>row.quick_check!=='ok') ||
         db.prepare('PRAGMA foreign_key_check').all().length)
        reasons.push('DB_INTEGRITY_OR_FK');
      const hasAuth=!!db.prepare("SELECT 1 AS yes FROM sqlite_master WHERE type='table' AND name='AuditEvent'").get();
      if((expected.schema==='G7_CANDIDATE')!==hasAuth)reasons.push('SCHEMA_BOUNDARY_MISMATCH');
      if(hasAuth&&!(db.prepare("SELECT 1 AS yes FROM sqlite_master WHERE type='table' AND name='AuthSession'").get()))
        reasons.push('AUTH_TABLES_INCOMPLETE');
      const versions=db.prepare('SELECT id,location_id,version,file_format,file_size,sha256,storage_path FROM "CadFileVersion" ORDER BY id').all();
      const locations=db.prepare('SELECT id,current_version_id,next_version FROM "CadLocation"').all();
      total=versions.length;
      const byId=new Map(versions.map(row=>[String(row.id),row]));
      const owned=new Map<string,number>();
      for(const v of versions){
        const l=String(v.location_id);
        owned.set(l,Math.max(owned.get(l)||0,Number(v.version)));
        const locator=String(v.storage_path), f=String(v.file_format).toLowerCase();
        let filePath='';
        const lm=key.exec(locator), sm=s3key.exec(locator);
        if(lm&&lm[3]===f&&lm[2]===String(v.id)){
          filePath='local/'+locator;local++;
        }else if(sm&&sm[2].endsWith('.'+f)){
          filePath='s3-export/'+sm[1]+'/'+sm[2];s3++;
        }else{reasons.push('INVALID_STORAGE_LOCATOR');continue;}
        try {
          const bytes=ownedBytes(root,filePath);
          if(bytes.length!==Number(v.file_size) ||
              !hex.test(String(v.sha256)) ||
              createHash('sha256').update(bytes).digest('hex')!==v.sha256)
            reasons.push('CAD_OR_S3_BYTES_MISMATCH');
        }catch{reasons.push('CAD_OR_S3_EXPORT_MISSING');}
      }
      for(const l of locations){
        const current=l.current_version_id;
        if(current!==null&&(!byId.has(String(current))||
          byId.get(String(current))?.location_id!==l.id))
          reasons.push('CURRENT_OWNER_INVALID');
        if(Number(l.next_version)<(owned.get(String(l.id))||0)+1)
          reasons.push('VERSION_SEQUENCE_INVALID');
      }
      if(versions.length===0||local===0||s3===0)reasons.push('BOTH_STORAGE_KINDS_REQUIRED');
    }finally {db.close();}
  }catch{reasons.push('ISOLATED_MIRROR_UNAVAILABLE');}
  return result(reasons,total,local,s3);
}
