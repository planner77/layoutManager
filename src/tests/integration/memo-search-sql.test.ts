
import { afterEach,beforeEach,describe,expect,test } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb,type Database } from '../../server/db';
import { CadMemoSearchRepository } from '../../server/repositories/cad-memo-search';
import { memoSearchQuery } from '../../domain/cad-memo-search';

type SQLite={exec:(sql:string)=>void;prepare:(sql:string)=>{run:(...args:unknown[])=>unknown};close:()=>void};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string)=>SQLite;
let root:string,db:Database,repo:CadMemoSearchRepository,ids:{
  current:string;old:string;other:string;currentMemo:string;oldMemo:string;hiddenMemo:string;otherMemo:string;
};
const sha='a'.repeat(64);
const parse=(q:string,extra:Record<string,string>={})=>memoSearchQuery(
  new URLSearchParams({target:'memos',q,...extra}));
beforeEach(()=>{
  root=mkdtempSync(path.join(tmpdir(),'memo-search-sql-'));
  const file=path.join(root,'memo.sqlite'),raw=new Sqlite(file);
  raw.exec(`CREATE TABLE BusinessUnit(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE Product(id TEXT PRIMARY KEY,business_unit_id TEXT,name TEXT);
    CREATE TABLE CadSite(id TEXT PRIMARY KEY,product_id TEXT,name TEXT,kind TEXT,active INTEGER);
    CREATE TABLE Building(id TEXT PRIMARY KEY,site_id TEXT,name TEXT);
    CREATE TABLE CadLocation(id TEXT PRIMARY KEY,building_id TEXT,name TEXT,current_version_id TEXT);
    CREATE TABLE CadFileVersion(id TEXT PRIMARY KEY,location_id TEXT,version INTEGER,drawing_name TEXT,
      original_filename TEXT,sha256 TEXT,file_format TEXT);
    CREATE TABLE "User"(id TEXT PRIMARY KEY,login_name TEXT);
    CREATE TABLE CadMemo(id TEXT PRIMARY KEY,version_id TEXT,source_sha256 TEXT,title TEXT,
      content TEXT,created_by_id TEXT,updated_at TEXT,deleted_at TEXT);
    CREATE TABLE CadMemoGroup(id TEXT PRIMARY KEY,version_id TEXT,name TEXT,deleted_at TEXT);
    CREATE TABLE CadMemoFeature(memo_id TEXT PRIMARY KEY,version_id TEXT,source_sha256 TEXT,group_id TEXT,
      visible INTEGER,completion_enabled INTEGER,is_completed INTEGER,schedule_enabled INTEGER,due_date TEXT);`);
  const make=(table:string,cols:string[],values:unknown[])=>{
    const placeholders=cols.map(()=>'?').join(',');
    raw.prepare('INSERT INTO '+table+'('+cols.join(',')+') VALUES('+placeholders+')').run(...values);
  };
  make('BusinessUnit',['id','name'],['bu','자동화']);
  make('Product',['id','business_unit_id','name'],['p','bu','물류']);
  for(const site of ['a','b']){
    make('CadSite',['id','product_id','name','kind','active'],[site,'p','Site '+site,'SITE',1]);
    make('Building',['id','site_id','name'],['building-'+site,site,'동 '+site]);
    make('CadLocation',['id','building_id','name','current_version_id'],
      ['floor-'+site,'building-'+site,'1F',null]);
  }
  ids={old:randomUUID(),current:randomUUID(),other:randomUUID(),
    currentMemo:randomUUID(),oldMemo:randomUUID(),hiddenMemo:randomUUID(),otherMemo:randomUUID()};
  const v=(id:string,location:string,version:number)=>{
    make('CadFileVersion',['id','location_id','version','drawing_name','original_filename','sha256','file_format'],
      [id,location,version,null,'drawing.dxf',sha,'DXF']);
  };
  v(ids.old,'floor-a',1);v(ids.current,'floor-a',2);v(ids.other,'floor-b',1);
  raw.prepare('UPDATE CadLocation SET current_version_id=? WHERE id=?').run(ids.current,'floor-a');
  raw.prepare('UPDATE CadLocation SET current_version_id=? WHERE id=?').run(ids.other,'floor-b');
  make('"User"',['id','login_name'],['user-a','operator_a']);
  make('"User"',['id','login_name'],['user-b','operator_b']);
  const groups={alpha:randomUUID(),beta:randomUUID()};
  make('CadMemoGroup',['id','version_id','name','deleted_at'],[groups.alpha,ids.current,'설비 그룹',null]);
  make('CadMemoGroup',['id','version_id','name','deleted_at'],[groups.beta,ids.old,'과거 그룹',null]);
  const add=(id:string,versionId:string,title:string,content:string,owner:string,group:string|null,
    visible:number,completed:number,due:string|null,deletedAt:string|null=null)=>{
    make('CadMemo',['id','version_id','source_sha256','title','content','created_by_id','updated_at','deleted_at'],
      [id,versionId,sha,title,content,owner,'2026-10-31T00:00:00.000Z',deletedAt]);
    make('CadMemoFeature',['memo_id','version_id','source_sha256','group_id','visible',
      'completion_enabled','is_completed','schedule_enabled','due_date'],
      [id,versionId,sha,group,visible,1,completed,due?1:0,due]);
  };
  add(ids.currentMemo,ids.current,'모터 점검','대문자 MOTOR와 수리 기록','user-a',groups.alpha,1,0,'2026-12-01');
  add(ids.oldMemo,ids.old,'모터 점검','V1 이력','user-b',groups.beta,1,1,'2026-10-01');
  add(ids.hiddenMemo,ids.current,'특수 %_','모터 점검 숨김','user-a',null,0,0,null);
  add(ids.otherMemo,ids.other,'모터 점검','타 사업장 비공개','user-b',null,1,0,null);
  add(randomUUID(),ids.current,'모터 점검 삭제됨','검색 제외','user-a',null,1,0,null,'2026-10-31');
  raw.close();
  db=createDb('file:'+file);
  repo=new CadMemoSearchRepository(db);
});
afterEach(async()=>{await db.$disconnect();rmSync(root,{recursive:true,force:true});});
describe('#90 M7 authorized database-only search',()=>{
  test('Current-only default; explicit old Version only in memo results and scoped count',async()=>{
    const current=await repo.search(parse('모터 점검'),['a'],true);
    expect(current.total).toBe(2);
    expect(current.items.map(x=>x.versionId)).toEqual([ids.current,ids.current]);
    const all=await repo.search(parse('모터 점검',{includePast:'true'}),['a'],true);
    expect(all.total).toBe(3);
    expect(all.items.find(x=>x.versionId===ids.old)?.isCurrent).toBe(false);
    expect(all.items.every(x=>x.site==='Site a')).toBe(true);
    expect(all.items.every(x=>x.snippet.length<=162)).toBe(true);
    expect(all.items.every(x=>!('content' in x))).toBe(true);
  });
  test('literal percent/underscore and SQL-like input do not expand matches; group/author/due filters',async()=>{
    const literal=await repo.search(parse('%_'),['a'],true);
    expect(literal.total).toBe(1);
    expect(literal.items[0].memoId).toBe(ids.hiddenMemo);
    expect(literal.items[0].visible).toBe(false);
    expect((await repo.search(parse("' OR 1=1 --"),['a'],true)).total).toBe(0);
    const group=await repo.search(parse('설비 그룹',{author:'operator_a',dueFrom:'2026-11-01',
      dueTo:'2026-12-31',completion:'progress'}),['a'],true);
    expect(group.items.map(x=>x.memoId)).toEqual([ids.currentMemo]);
    expect((await repo.search(parse('모터',{completion:'completed',includePast:'true'}),['a'],true))
      .items.map(x=>x.memoId)).toEqual([ids.oldMemo]);
  });
  test('no Site scope, empty keywords, disabled feature filters and bare legacy schema',async()=>{
    await expect(repo.search(parse('모터'),[],true)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect((await repo.search(parse(''),['a'],true)).total).toBe(0);
    const legacy=await repo.search(parse('모터'),['a'],false);
    expect(legacy.total).toBe(2);
    expect(legacy.items.every(item=>item.groupName===null)).toBe(true);
    await expect(repo.search(parse('모터',{group:'설비'}),['a'],false))
      .rejects.toMatchObject({code:'MEMO_SEARCH_FEATURE_UNAVAILABLE'});
  });
});
