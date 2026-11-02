/** #202 local synthetic SQL measurement; run with npx tsx tests/benchmark/drawing-memo-search-benchmark.ts */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createDb } from '../../server/db';
import { CadListRepository } from '../../server/repositories/cad-list';
import { listQuery } from '../../domain/cad-list';

type Statement = {run:(...values:unknown[])=>unknown;all:(...values:unknown[])=>{detail:string}[]};
type RawDb = {exec:(sql:string)=>void;prepare:(sql:string)=>Statement;transaction:<T>(action:()=>T)=>()=>T;close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>RawDb;
const sha='a'.repeat(64);
const root=mkdtempSync(path.join(tmpdir(),'drawing-memo-benchmark-'));
try {
  for(const distribution of ['distributed','dense'] as const) for(const memoCount of [1_000,10_000,100_000]) {
    const filename=path.join(root,`${distribution}-${memoCount}.sqlite`);
    const raw=new Sqlite(filename);
    raw.exec(`CREATE TABLE BusinessUnit(id TEXT PRIMARY KEY,name TEXT);
      CREATE TABLE Product(id TEXT PRIMARY KEY,business_unit_id TEXT,name TEXT);
      CREATE TABLE CadSite(id TEXT PRIMARY KEY,product_id TEXT,name TEXT,kind TEXT,active INTEGER);
      CREATE TABLE Building(id TEXT PRIMARY KEY,site_id TEXT,name TEXT);
      CREATE TABLE CadLocation(id TEXT PRIMARY KEY,building_id TEXT,name TEXT,current_version_id TEXT);
      CREATE TABLE CadFileVersion(id TEXT PRIMARY KEY,location_id TEXT,version INTEGER,drawing_name TEXT,
        original_filename TEXT,description TEXT,file_format TEXT,file_size INTEGER,sha256 TEXT,
        registered_at TEXT,created_at TEXT);
      CREATE TABLE CadMemo(id TEXT PRIMARY KEY,version_id TEXT,source_sha256 TEXT,title TEXT,
        content TEXT,updated_at TEXT,deleted_at TEXT);
      CREATE INDEX ix_cad_memo_version_live ON CadMemo(version_id,deleted_at);`);
    const addLocation=raw.prepare('INSERT INTO CadLocation VALUES(?,?,?,?)');
    const addVersion=raw.prepare('INSERT INTO CadFileVersion VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const addMemo=raw.prepare('INSERT INTO CadMemo VALUES(?,?,?,?,?,?,?)');
    raw.transaction(()=>{
      raw.exec("INSERT INTO BusinessUnit VALUES('bu','Synthetic'); INSERT INTO Product VALUES('p','bu','Product');");
      for(const site of ['a','b']) {
        raw.prepare('INSERT INTO CadSite VALUES(?,?,?,?,?)').run(site,'p',site,'SITE',1);
        raw.prepare('INSERT INTO Building VALUES(?,?,?)').run('bl-'+site,site,'동');
      }
      const versions=distribution==='dense'?1:memoCount/10;
      const perVersion=memoCount/versions;
      for(let i=0;i<versions;i++) {
        const id='v-'+i,site=i%2?'b':'a',location='l-'+i;
        addLocation.run(location,'bl-'+site,'1층',id);
        addVersion.run(id,location,1,null,'drawing.dxf','점검','DXF',100,sha,'2026-11-02','2026-11-02');
        for(let j=0;j<perVersion;j++) addMemo.run(`m-${i}-${j}`,id,sha,
          j%10<3?'모터 점검':'일반 점검','Synthetic body', '2026-11-02T00:00:00Z',null);
      }
    })();
    if(memoCount===100_000) {
      const plan=raw.prepare(`EXPLAIN QUERY PLAN SELECT v.id FROM CadFileVersion v
        JOIN CadLocation l ON l.id=v.location_id JOIN Building bl ON bl.id=l.building_id
        JOIN CadSite s ON s.id=bl.site_id WHERE s.id IN (?) AND l.current_version_id=v.id
        AND EXISTS(SELECT 1 FROM CadMemo m WHERE m.version_id=v.id
          AND m.source_sha256=v.sha256 AND m.deleted_at IS NULL
          AND instr(lower(m.title),lower(?))>0)`).all('a','모터');
      process.stdout.write(JSON.stringify({distribution,memoCount,explain:plan.map(row=>row.detail)})+'\n');
    }
    raw.close();
    const db=createDb('file:'+filename),repo=new CadListRepository(db);
    try {
      for(const pageSize of [25,100]) {
        const query=listQuery(new URLSearchParams(`memo=모터&pageSize=${pageSize}&current=true`));
        const times:number[]=[];
        for(let n=0;n<4;n++) {
          const start=performance.now();
          const result=await repo.list(query,['a']);
          const ms=performance.now()-start;
          if(n>0)times.push(ms);
          const authorizedVersions=distribution==='dense'?1:memoCount/20;
          const matchesPerVersion=distribution==='dense'?memoCount*3/10:3;
          if(result.total!==authorizedVersions || result.items.length!==Math.min(pageSize,authorizedVersions))
            throw new Error('Unexpected authorized count/page size');
          if(result.items.some(item=>item.memoMatches?.count!==matchesPerVersion || item.memoMatches.previews.length!==3))
            throw new Error('Unexpected bounded previews');
        }
        times.sort((a,b)=>a-b);
        process.stdout.write(JSON.stringify({distribution,memoCount,pageSize,siteIds:['a'],
          authorizedVersions:distribution==='dense'?1:memoCount/20,
          warmMedianMs:Number(times[1].toFixed(1)),warmMs:times.map(t=>Number(t.toFixed(1))),
          sourceGets:0})+'\n');
      }
    } finally { await db.$disconnect(); }
  }
} finally {rmSync(root,{recursive:true,force:true});}
