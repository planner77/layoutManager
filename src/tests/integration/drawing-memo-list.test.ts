import { afterEach, beforeEach, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, type Database } from '../../server/db';
import { CadListRepository } from '../../server/repositories/cad-list';
import { drawingListParams, drawingListUrl, listQuery } from '../../domain/cad-list';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

type RawDb = { exec: (sql: string) => void; prepare: (sql: string) => { run: (...values: unknown[]) => unknown }; close: () => void };
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as new (file: string) => RawDb;
let directory: string, db: Database, repo: CadListRepository;
let versions: string[], memos: string[];
const sha = 'a'.repeat(64);
const q = (value: string) => drawingListParams(new URLSearchParams(value)).query;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'drawing-memo-list-'));
  const file = path.join(directory, 'fixture.sqlite');
  const raw = new Sqlite(file);
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
    CREATE INDEX ix_memo_version_live ON CadMemo(version_id,deleted_at);`);
  const add = (table: string, cols: string[], values: unknown[]) => raw.prepare(
    `INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
  ).run(...values);
  add('BusinessUnit', ['id','name'], ['bu','자동화']);
  add('Product', ['id','business_unit_id','name'], ['p','bu','제품']);
  for (const site of ['a','b']) {
    add('CadSite', ['id','product_id','name','kind','active'], [site,'p',site,'SITE',1]);
    add('Building', ['id','site_id','name'], ['bl-'+site,site,'동']);
    add('CadLocation', ['id','building_id','name','current_version_id'], ['l-'+site,'bl-'+site,'1층',null]);
  }
  versions = [randomUUID(), randomUUID(), randomUUID()];
  for (const [index,id] of versions.entries()) add('CadFileVersion',
    ['id','location_id','version','drawing_name','original_filename','description','file_format','file_size','sha256','registered_at','created_at'],
    [id,index===2?'l-b':'l-a',index===0?1:2,null,'도면.dxf','점검', 'DXF',100,sha,'2026-11-02','2026-11-02']);
  raw.prepare('UPDATE CadLocation SET current_version_id=? WHERE id=?').run(versions[1], 'l-a');
  raw.prepare('UPDATE CadLocation SET current_version_id=? WHERE id=?').run(versions[2], 'l-b');
  memos = Array.from({length: 8}, () => randomUUID());
  const memo = (id: string, versionId: string, title: string, content: string,
    sourceSha = sha, deletedAt: string | null = null) => add('CadMemo',
    ['id','version_id','source_sha256','title','content','updated_at','deleted_at'],
    [id,versionId,sourceSha,title,content,'2026-11-02T00:00:00Z',deletedAt]);
  memo(memos[0],versions[0],'모터 점검','한글 본문');
  memo(memos[1],versions[1],'모터 점검','정상');
  memo(memos[2],versions[1],'숨김','모터 본문');
  memo(memos[3],versions[1],'모터 %_','특수');
  memo(memos[4],versions[1],'모터 추가','서버');
  memo(memos[5],versions[1],'모터 삭제','제외',sha,'2026-11-02');
  memo(memos[6],versions[1],'모터 이전 SHA','제외','b'.repeat(64));
  memo(memos[7],versions[2],'모터 타 Site','비공개');
  raw.close();
  db = createDb('file:'+file);
  repo = new CadListRepository(db);
});
afterEach(async () => { await db.$disconnect(); rmSync(directory, {recursive:true,force:true}); });

test('#202 memo title/body is ANDed with drawing filters; count is unique Versions and previews are bounded', async () => {
  await expect(repo.list(q('memo=모터'), [])).rejects.toMatchObject({code:'ACCESS_DENIED'});
  const current = await repo.list(q('memo=모터&description=점검&site=a'), ['a']);
  expect(current.total).toBe(1);
  expect(current.items.map(item => item.id)).toEqual([versions[1]]);
  expect(current.items[0].memoMatches?.count).toBe(4);
  expect(current.items[0].memoMatches?.previews).toHaveLength(3);
  expect(current.items[0].memoMatches?.previews.every(p => p.snippet.length <= 162)).toBe(true);
  expect(current.items[0].memoMatches?.previews.every(p => !('content' in p))).toBe(true);
  const all = await repo.list(q('memo=모터&versions=all&description=점검'), ['a']);
  expect(all.total).toBe(2);
  expect(new Set(all.items.map(item => item.id)).size).toBe(2);
  expect(all.items.every(item => item.site === 'a')).toBe(true);
  expect((await repo.list(q('memo=모터&format=DWG'), ['a'])).total).toBe(0);
  expect((await repo.list(q('memo=모터&site=b'), ['a'])).total).toBe(0);
});

test('#202 literal Unicode/specials, URL state and blank memo preserve legacy listing', async () => {
  expect((await repo.list(q('memo=%25_'), ['a'])).items[0].memoMatches?.count).toBe(1);
  expect((await repo.list(q('memo=%27%20OR%201%3D1--'), ['a'])).total).toBe(0);
  expect((await repo.list(q('memo=%E1%84%86%E1%85%A9%E1%84%90%E1%85%A5'), ['a'])).total).toBe(1);
  const query = q('memo=모터&versions=all&site=a&page=2&pageSize=1');
  const next = drawingListUrl(query,3,'all');
  expect(drawingListParams(new URL(next,'http://localhost').searchParams).query.memo).toBe('모터');
  expect(next).toContain('versions=all');
  expect((await repo.list(q('memo=&versions=all'))).total).toBe(3);
  for (const invalid of ['memo=a&memo=b','memo='+encodeURIComponent('a'.repeat(101)), 'memo=%C2%80'])
    expect(() => listQuery(new URLSearchParams(invalid))).toThrow();
});

test('#202 matched page makes a fixed three SELECTs regardless of page size', async () => {
  const statements:string[]=[];
  const instrumented=new PrismaClient({adapter:new PrismaBetterSqlite3({url:'file:'+path.join(directory,'fixture.sqlite')}),
    log:[{emit:'event',level:'query'}]});
  instrumented.$on('query',event=>{
    if(/^(SELECT|WITH)\b/i.test(event.query.trim())) statements.push(event.query);
  });
  try {
    const listing=new CadListRepository(instrumented as unknown as Database);
    await listing.list(q('memo=모터&versions=all&pageSize=1'),['a']);
    const first=statements.length;
    statements.length=0;
    await listing.list(q('memo=모터&versions=all&pageSize=2'),['a']);
    expect(first).toBe(3);
    expect(statements).toHaveLength(3);
    expect(statements.filter(sql=>sql.includes('ROW_NUMBER()'))).toHaveLength(1);
  } finally { await instrumented.$disconnect(); }
});
