/** OR58 archive preflight: production release declaration is the only DDL authority. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { assertDeclaredSchema, GREENFIELD_UPGRADE_REGISTRY } from '../../server/g7-operational/greenfield-upgrade-registry';

const Sqlite = createRequire(import.meta.url)('better-sqlite3') as new (
  filename:string, options:{readonly:boolean;fileMustExist:boolean}
) => {close():void};

try {
  if(process.argv.length!==4)throw new Error('ARGS');
  const release=GREENFIELD_UPGRADE_REGISTRY.releases.find(row=>row.version==='0.58.0');
  if(!release)throw new Error('RELEASE');
  const manifest:unknown=JSON.parse(readFileSync(process.argv[3],'utf8'));
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
     (manifest as {version?:unknown}).version!==release.version||
     (manifest as {schemaId?:unknown}).schemaId!==release.schemaId)
    throw new Error('MANIFEST');
  const db= new Sqlite(process.argv[2],{readonly:true,fileMustExist:true});
  try {assertDeclaredSchema(db as never,release);}
  finally {db.close();}
  process.stdout.write('OR58_SCHEMA_OK\n');
} catch {
  // Never disclose a row, path, manifest, or dependency exception to callers.
  process.exitCode=1;
}
