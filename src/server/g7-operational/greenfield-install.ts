/** #153: one-shot Greenfield schema installation and initial Site seed.
 *
 * Never opens a historical DB or a migration/HOLD target. All DDL is
 * materialized into an EMPTY SQLite file from the reviewed final schema
 * constructed in a transient memory DB; no old rows or migration history
 * are imported. The runtime records exactly one Greenfield baseline marker.
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { closeSync, constants, existsSync, fstatSync, lstatSync,
  openSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { IsolatedDb } from '../g7-staging/g1-store';
import { CAD_BUSINESS_DDL } from '../cad-business/schema-ddl';
import { CAD_ANCHOR_DDL } from '../cad-business/anchor-ddl';
import {CAD_MEMO_FEATURE_DDL} from '../cad-business/memo-feature-ddl';
import { G7_GREENFIELD_BASELINE, G7_GREENFIELD_BASELINE_CHECKSUM,
  G7_DELETE_PASSWORD_TRIGGERS, assertG7GreenfieldSchema } from './greenfield-schema';

type Db = IsolatedDb & { close(): void };
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as new (
  filename: string, options?: {fileMustExist?: boolean; readonly?: boolean},
) => Db;
// The migrator runs with WORKDIR /app/src; path-based resolution avoids
// webpack treating new URL('../../', import.meta.url) as a server asset.
// This module is invoked only by the dedicated one-shot CLI, not by HTTP.
const APP = path.resolve(process.cwd());
const MIGRATIONS = [
  '202609070001_locations','202609090001_description',
  '202609110001_delete_password','202609110002_delete_invariants',
  '202609110003_drawing_name','202610150001_master_hierarchy',
  '202610260002_g7_operational_auth',
  '202610300001_scene_asset',
] as const;
const SCHEMA_QUERY = "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_prisma_migrations' ORDER BY type,name";
const blocked = (): never => {throw new Error('G7_GREENFIELD_SETUP_BLOCKED');};

function ownedDirectory(directory: string): void {
  if (!path.isAbsolute(directory) || realpathSync(directory) !== directory) blocked();
  const s = lstatSync(directory);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid?.() ||
      (s.mode & 0o022) !== 0) blocked();
}
function required(value:string|undefined):string {
  if (typeof value!=='string' || !value) throw new Error('G7_GREENFIELD_SETUP_BLOCKED');
  return value;
}
function target(env: Readonly<Record<string,string|undefined>>) {
  const url=required(env.DATABASE_URL),cadPath=required(env.CAD_STORAGE_PATH);
  if (env.G7_GREENFIELD_MODE !== 'true' ||
      env.G7_AUTH_ENABLED === 'true' || env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true' ||
      env.CAD_STORAGE_BACKEND !== 'local' || !url.startsWith('file:')) blocked();
  const dbPath = url.slice(5);
  const dbParent = path.dirname(dbPath);
  if (!path.isAbsolute(dbPath) || !path.isAbsolute(cadPath) ||
      dbPath === cadPath || dbPath.startsWith(cadPath+path.sep) ||
      cadPath.startsWith(dbParent+path.sep) || dbParent === cadPath) blocked();
  ownedDirectory(dbParent);
  ownedDirectory(cadPath);
  if (existsSync(path.join(dbParent,'g7-runtime-hold.json')) ||
      existsSync(path.join(dbParent,'g7-rehearsal.lock'))) blocked();
  return {dbPath,dbParent,cadPath};
}
function schemaSql(name:string): string {
  // The Scene candidate is intentionally outside the seven-history Prisma
  // migration root. Only a fresh one-row Greenfield baseline consumes it.
  const filename = name === '202610300001_scene_asset'
    ? path.join(APP,'deploy/scene-assets/migration.sql')
    : path.join(APP,'deploy/g7-s3/prisma/migrations',name,'migration.sql');
  return readFileSync(filename,'utf8');
}
function referenceDdl(): {type:string;name:string;sql:string}[] {
  const db = new Sqlite(':memory:');
  try {
    for (const name of MIGRATIONS) db.exec(schemaSql(name));
    // #98/#83: only incorporated in newly created, empty Greenfield baseline.
    for (const row of CAD_BUSINESS_DDL) db.exec(row.sql);
    for (const row of CAD_ANCHOR_DDL) db.exec(row.sql);
    for (const row of CAD_MEMO_FEATURE_DDL) db.exec(row.sql);
    for (const sql of G7_DELETE_PASSWORD_TRIGGERS) db.exec(sql);
    const rows = db.prepare(SCHEMA_QUERY).all() as {type:string;name:string;sql:string}[];
    if (!rows.length || rows.filter(r=>r.type==='trigger' &&
        r.name.startsWith('cad_version_delete_password_')).length !== 2) blocked();
    return rows;
  } finally {db.close();}
}
/** Only an entirely uninitialized DB directory and empty CAD root are accepted.
 * The first create uses O_EXCL: no overwrite even if another operator races.
 */
export function initializeGreenfield(env:Readonly<Record<string,string|undefined>>) {
  if (env.G7_GREENFIELD_INSTALL_ACK !== 'CREATE_EMPTY_G7_DATABASE') blocked();
  const t=target(env);
  if (readdirSync(t.dbParent).length || readdirSync(t.cadPath).length) blocked();
  const objects=referenceDdl();
  const fd=openSync(t.dbPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {
    const s=fstatSync(fd);
    if (!s.isFile() || s.uid!==process.getuid?.() || (s.mode&0o077)!==0 || s.nlink!==1) blocked();
  }finally{closeSync(fd);}
  const db=new Sqlite(t.dbPath,{fileMustExist:true});
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    try {
      db.exec('CREATE TABLE "_prisma_migrations"("id" TEXT NOT NULL PRIMARY KEY,"checksum" TEXT NOT NULL,"finished_at" TEXT,"migration_name" TEXT NOT NULL,"logs" TEXT,"rolled_back_at" TEXT,"started_at" TEXT NOT NULL,"applied_steps_count" INTEGER NOT NULL DEFAULT 0)');
      // Tables before secondary indexes and triggers. The SQL is the final
      // sqlite_master DDL of an EMPTY reviewed reference, not a row migration.
      for (const type of ['table','index','trigger']) {
        for (const row of objects.filter(r=>r.type===type)) db.exec(row.sql);
      }
      const now=new Date().toISOString();
      db.prepare('INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count) VALUES(?,?,?,?,NULL,NULL,?,1)')
        .run(randomUUID(),G7_GREENFIELD_BASELINE_CHECKSUM,now,G7_GREENFIELD_BASELINE,now);
      assertG7GreenfieldSchema(db);
      db.exec('COMMIT');
    }catch{db.exec('ROLLBACK');throw new Error('G7_GREENFIELD_INSTALL_FAILED');}
    return {state:'G7_GREENFIELD_SCHEMA_READY' as const,mode:'INITIAL_INSTALL' as const};
  } finally {db.close();}
}
function readPrivateJson(filename: string): unknown {
  if (!path.isAbsolute(filename) || realpathSync(filename)!==filename) blocked();
  const parent=path.dirname(filename); ownedDirectory(parent);
  const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const s=fstatSync(fd);
    if (!s.isFile() || s.uid!==process.getuid?.() || (s.mode&0o077)!==0 ||
        s.nlink!==1 || s.size<2 || s.size>16384) blocked();
    const bytes=readFileSync(fd);
    if(bytes.length!==s.size) blocked();
    return JSON.parse(bytes.toString('utf8'));
  } finally {closeSync(fd);}
}
type Seed = {businessUnit:string;product:string;sites:{name:string;building:string;floor:string}[]};
function seedInput(raw:unknown):Seed {
  if (!raw || typeof raw!=='object' || Array.isArray(raw) ||
      Object.keys(raw).sort().join()!=='businessUnit,product,sites') blocked();
  const v=raw as Record<string,unknown>;
  function validatedTitle(value:unknown):string {
    if(typeof value!=='string' || value.length===0 || value.length>100 ||
       value.trim()!==value || /[\x00-\x1f]/.test(value))
      throw new Error('G7_GREENFIELD_SETUP_BLOCKED');
    return value;
  }
  const businessUnit=validatedTitle(v.businessUnit);
  const product=validatedTitle(v.product);
  // Explicitly turn untrusted JSON into an array before reading its items.
  const sites:unknown[]=Array.isArray(v.sites) ? v.sites : blocked();
  if (!sites.length || sites.length>100) blocked();
  const names=new Set<string>();
  const checkedSites:Seed['sites']=[];
  for(const item of sites){
    if (!item || typeof item!=='object' || Array.isArray(item)) blocked();
    const x=item as Record<string,unknown>;
    if(Object.keys(x).sort().join()!=='building,floor,name') blocked();
    const name=validatedTitle(x.name);
    const building=validatedTitle(x.building);
    const floor=validatedTitle(x.floor);
    if(names.has(name)) blocked();
    names.add(name);
    checkedSites.push({name,building,floor});
  }
  return {businessUnit,product,sites:checkedSites};
}
/** Seed initial hierarchy *once*, before signed Auth and first Admin creation.
 * Subsequent master changes go through the authenticated API.
 */
export function seedGreenfieldSites(env:Readonly<Record<string,string|undefined>>) {
  if (env.G7_GREENFIELD_SEED_ACK!=='SEED_EMPTY_GREENFIELD') blocked();
  const seedFile=required(env.G7_GREENFIELD_SEED_FILE);
  const t=target(env);
  const input=seedInput(readPrivateJson(seedFile));
  const db=new Sqlite(t.dbPath,{fileMustExist:true});
  try {
    assertG7GreenfieldSchema(db);
    for (const table of ['BusinessUnit','Product','CadSite','Building','CadLocation',
      'CadFileVersion','User','AuditEvent']) {
      if ((db.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get() as {n:number}).n!==0) blocked();
    }
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    try {
      const bu=randomUUID(),product=randomUUID();
      db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run(bu,input.businessUnit);
      db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run(product,bu,input.product);
      const ids:string[]=[];
      for(const site of input.sites){
        const siteId=randomUUID(),building=randomUUID(),floor=randomUUID();
        db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
          .run(siteId,product,site.name,'SITE');
        db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run(building,siteId,site.building);
        db.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)').run(floor,building,site.floor);
        ids.push(siteId);
      }
      assertG7GreenfieldSchema(db);
      db.exec('COMMIT');
      return {state:'G7_GREENFIELD_SITES_SEEDED' as const,siteIds:ids.sort()};
    }catch{db.exec('ROLLBACK');throw new Error('G7_GREENFIELD_SEED_FAILED');}
  } finally {db.close();}
}
