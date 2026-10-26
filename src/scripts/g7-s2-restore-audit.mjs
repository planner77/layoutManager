/** #109 S2 read-only offline DB/CAD/S3-rehydrated-sample byte verifier.
 * Input is local private operator material. Does not read remote S3, restore,
 * modify files or upload data. S3 provenance requires separate internal proof.
 */
import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, realpathSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const HEX = /^[0-9a-f]{64}$/;
const SNAP = /^SNAP-[A-Za-z0-9_-]{2,64}$/;
const Sqlite = createRequire(import.meta.url)('better-sqlite3');
async function shaFile(path) {
  const h=createHash('sha256');
  for await(const buf of createReadStream(path)) h.update(buf);
  return h.digest('hex');
}
function regularReadable(p) {
  if (typeof p!=='string' || !isAbsolute(p)) throw Error('INVALID_FILE_PATH');
  const st=lstatSync(p);
  if (!st.isFile() || st.isSymbolicLink() || realpathSync(p)!==p) throw Error('INVALID_SOURCE_FILE');
}
function rows(db) {
  return {
    versions: db.prepare('SELECT location_id,version,sha256,delete_password_hash,id FROM "CadFileVersion" ORDER BY id').all(),
    locations: db.prepare('SELECT id,current_version_id,next_version FROM "CadLocation" ORDER BY id').all(),
  };
}
function databaseInvariants(a,b) {
  const first=new Sqlite(a,{readonly:true,fileMustExist:true});
  const second=new Sqlite(b,{readonly:true,fileMustExist:true});
  try {
    if (first.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
        second.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') return false;
    if (first.prepare('PRAGMA foreign_key_check').all().length ||
        second.prepare('PRAGMA foreign_key_check').all().length) return false;
    return JSON.stringify(rows(first)) === JSON.stringify(rows(second));
  } finally {first.close();second.close();}
}
/** No file contents, paths, hashes or evidence identifiers in the output. */
export async function assessG7OfflineRestore(bundle) {
  const failed=[];
  if (!bundle || bundle.schemaVersion!==1 || !SNAP.test(bundle.snapshotId) ||
      !Array.isArray(bundle.files)) {
    return { state:'BLOCKED', reasons:['INVALID_BUNDLE'],checked:0 };
  }
  const expected=['SQLITE','CAD_LOCAL','S3_EXPORTED_BYTES'];
  let checked=0;
  for(const kind of expected) {
    const items=bundle.files.filter(x=>x.kind===kind);
    if(!items.length) {failed.push('MISSING_KIND:'+kind);continue;}
    for(const item of items) {
      try {
        if(item.snapshotId!==bundle.snapshotId || !HEX.test(item.sha256)) throw Error();
        regularReadable(item.source);
        regularReadable(item.restored);
        const [source,restored]=await Promise.all([
          shaFile(item.source),shaFile(item.restored),
        ]);
        if(source!==item.sha256 || restored!==item.sha256) throw Error();
        if(kind==='SQLITE' && !databaseInvariants(item.source,item.restored)) throw Error();
        checked++;
      } catch {failed.push('RESTORE_MISMATCH:'+kind);}
    }
  }
  return {
    state:failed.length?'BLOCKED':'READY_FOR_PRIVATE_OPERATOR_REVIEW',
    reasons:[...new Set(failed)],checked,
    note:'Read-only local bytes/invariants only; S3 provenance, real rollback and Owner GO are separate.',
  };
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if(process.argv.length!==3) throw Error();
    regularReadable(process.argv[2]);
    const st=lstatSync(process.argv[2]);
    if((st.mode & 0o077)!==0 || typeof process.getuid!=='function' ||
        st.uid!==process.getuid() || st.size>131072) throw Error();
    const bundle=JSON.parse(readFileSync(process.argv[2],'utf8'));
    const outcome=await assessG7OfflineRestore(bundle);
    process.stdout.write(JSON.stringify(outcome)+'\n');
    if(outcome.state!=='READY_FOR_PRIVATE_OPERATOR_REVIEW') process.exitCode=3;
  } catch {
    process.stderr.write('G7_RESTORE_AUDIT_INVALID (private data withheld)\n');
    process.exitCode=2;
  }
}
