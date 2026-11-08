/** Test-only full 0.58 schema, derived from the production Greenfield installer. */
import { createRequire } from 'node:module';
import { initializeGreenfield } from '../../server/g7-operational/greenfield-install';
import { G7_PREVIOUS_ZONES_BASELINE, G7_PREVIOUS_ZONES_BASELINE_CHECKSUM } from '../../server/g7-operational/greenfield-schema';
import { SCENE_BUILD_JOB_OBJECT_NAMES } from '../../server/g7-operational/scene-job-ddl';
import { SCENE_CPU_OBJECT_NAMES } from '../../server/g7-operational/scene-cpu-ddl';
import { assertDeclaredSchema, GREENFIELD_UPGRADE_REGISTRY } from '../../server/g7-operational/greenfield-upgrade-registry';

const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new (path:string)=>{
  prepare(sql:string):{all():{type:string;name:string}[];run(...args:string[]):unknown};
  exec(sql:string):void;close():void;
};
const [dbPath,cadPath]=process.argv.slice(2);
if(!dbPath||!cadPath||process.argv.length!==4)process.exit(2);
initializeGreenfield({DATABASE_URL:`file:${dbPath}`,CAD_STORAGE_PATH:cadPath,
  CAD_STORAGE_BACKEND:'local',G7_GREENFIELD_MODE:'true',G7_GREENFIELD_INSTALL_ACK:'CREATE_EMPTY_G7_DATABASE'});
const db=new Sqlite(dbPath);
try {
  const rows=db.prepare("SELECT type,name FROM sqlite_master WHERE sql IS NOT NULL").all()
    .filter(row=>SCENE_BUILD_JOB_OBJECT_NAMES.has(row.name)||SCENE_CPU_OBJECT_NAMES.has(row.name));
  for(const type of ['trigger','index','table'])for(const row of rows.filter(r=>r.type===type))
    db.exec(`DROP ${type.toUpperCase()} "${row.name}"`);
  db.prepare('UPDATE "_prisma_migrations" SET migration_name=?,checksum=?')
    .run(G7_PREVIOUS_ZONES_BASELINE,G7_PREVIOUS_ZONES_BASELINE_CHECKSUM);
  const release=GREENFIELD_UPGRADE_REGISTRY.releases.find(row=>row.version==='0.58.0');
  if(!release)throw new Error('MISSING_RELEASE');
  assertDeclaredSchema(db as never,release);
}finally{db.close();}
