import { beforeEach, afterEach, test, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, type Database } from '../../server/db';
import { CadRepository } from '../../server/repositories/cad';
import { CadListRepository } from '../../server/repositories/cad-list';
import { currentOnlyToggleUrl, listQuery } from '../../domain/cad-list';
import { registration } from '../../domain/cad';

let directory: string, db: Database, repo: CadRepository, lists: CadListRepository;
const input = registration({ businessUnit:'자동화',site:'평택',building:'A동',floor:'2층',registeredAt:'2026-09-07',makeCurrent:true,deletePassword:'1234' });
const file = (name: string, format = 'DXF') => ({ originalFilename:name,fileFormat:format as 'DXF'|'DWG',fileSize:100,sha256:'a'.repeat(64),storagePath:crypto.randomUUID() });
const search = (query = '') => lists.list(listQuery(new URLSearchParams(query)));
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(),'cad-list-')); db = createDb(`file:${directory}/test.sqlite`);
  const sql = await readFile(new URL('../../prisma/migrations/202609070001_locations/migration.sql',import.meta.url),'utf8');
  for (const statement of sql.split(';').filter(s=>s.trim())) await db.$executeRawUnsafe(statement);
  for (const migration of ['202609090001_description','202609110001_delete_password','202609110003_drawing_name']) { const sql=await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`,import.meta.url),'utf8'); for (const statement of sql.split(';').filter(s=>s.trim())) await db.$executeRawUnsafe(statement); }
  repo = new CadRepository(db); lists = new CadListRepository(db);
});
afterEach(async()=>{ await db.$disconnect(); await rm(directory,{recursive:true,force:true}); });

test('TC-LIST-001: registered records and safe metadata appear immediately', async()=>{
  expect((await search()).total).toBe(0);
  const version = await repo.register(input,file('도면.dxf'));
  const result = await search();
  expect(result.total).toBe(1); expect(result.items[0]).toMatchObject({id:version.id,originalFilename:'도면.dxf',isCurrent:true,version:1});
  expect(result.items[0]).not.toHaveProperty('storagePath'); expect(result.items[0]).not.toHaveProperty('sha256');
  expect(()=>JSON.stringify(result)).not.toThrow();
});
test('TC-NAME-002: list, location and viewer DTO resolve default and custom names without exposing override', async()=>{
  const legacy = await repo.register(input,file('legacy.dxf'));
  const custom = await repo.register(registration({...input,drawingName:' 사용자 도면 '}),file('custom-source.dxf'));
  const result = await search();
  expect(result.items.find(row=>row.id===legacy.id)).toMatchObject({displayName:'[자동화][평택][A동][2층]_V1',originalFilename:'legacy.dxf'});
  expect(result.items.find(row=>row.id===custom.id)).toMatchObject({displayName:'사용자 도면',originalFilename:'custom-source.dxf'});
  expect(result.items.every(row=>!('drawingName' in row))).toBe(true);
  expect((await lists.version(custom.id))).toMatchObject({displayName:'사용자 도면',originalFilename:'custom-source.dxf'});
  expect((await lists.location(custom.locationId)).versions.every(row=>!('drawingName' in row))).toBe(true);
  expect((await search('filename=legacy')).items.map(row=>row.id)).toEqual([legacy.id]);
});
test('TC-LIST-002: each location/format filter and combined filters', async()=>{
  await repo.register(input,file('one.dxf'));
  await repo.register({...input,businessUnit:'설비',site:'서울',building:'B동',floor:'1층'},file('two.dwg','DWG'));
  for (const [key,value] of Object.entries({businessUnit:'자동화',site:'평택',building:'A동',floor:'2층',format:'DXF'})) expect((await search(new URLSearchParams({[key]:value}).toString())).total).toBe(1);
  expect((await search('site=평택&format=DWG')).total).toBe(0);
  expect((await lists.options()).site).toEqual(['서울','평택']);
});
test('TC-LIST-007: literal filename search resists wildcard and SQL injection', async()=>{
  await repo.register(input,file("도면_100%.dxf")); await repo.register(input,file('other.dxf'));
  for (const filename of ['%', '_', '도면'.normalize('NFD')]) expect((await search(new URLSearchParams({filename}).toString())).total).toBe(1);
  expect((await search(new URLSearchParams({filename:"' OR 1=1 --"}).toString())).total).toBe(0);
  expect((await search('filename=OTHER')).total).toBe(0);
});
test('TC-DESC-003/004: description is persisted and searched literally with existing filters', async()=>{
  const described = await repo.register(registration({...input, description:'  설비 %_ 설명\r\n두 번째 줄  '}), file('plain.dxf'));
  await repo.register(registration({...input, description:'다른 설명'}), file('other.dxf'));
  const detail = await lists.location(described.locationId);
  expect(detail.versions[1]).toMatchObject({id:described.id, description:'설비 %_ 설명\n두 번째 줄'});
  expect((await search('description=%25_%26')).total).toBe(0);
  expect((await search('description='+encodeURIComponent('설비 %_ 설명'))).items.map(v=>v.id)).toEqual([described.id]);
  expect((await search('description='+encodeURIComponent('설비 %_ 설명')+'&format=DWG')).total).toBe(0);
});
test('TC-LIST-003/004: current filters track replacement and null pointers', async()=>{
  const a = await repo.register(input,file('one.dxf')); const b = await repo.register(input,file('two.dxf'));
  await repo.register({...input,floor:'3층',makeCurrent:false},file('none.dxf'));
  expect((await search('current=true')).items.map(v=>v.id)).toEqual([b.id]);
  expect((await search('current=false')).total).toBe(2);
  await repo.setCurrent(a.locationId,a.id);
  expect((await search('current=true')).items.map(v=>v.id)).toEqual([a.id]);
  const detail = await lists.location(a.locationId);
  expect(detail.versions.map(v=>v.version)).toEqual([2,1]); expect(detail.versions.filter(v=>v.isCurrent)).toHaveLength(1);
  await expect(lists.location(crypto.randomUUID())).rejects.toThrow('찾을 수 없습니다');
});
test('TC-LIST-008: current-only toggle preserves filters and resets pagination', async()=>{
  const query = listQuery(new URLSearchParams('filename=one&description=설명&site=평택&format=DXF&page=7&pageSize=50'));
  const enabled = new URL(currentOnlyToggleUrl(query), 'http://localhost');
  expect(enabled.searchParams.get('filename')).toBe('one');
  expect(enabled.searchParams.get('description')).toBe('설명');
  expect(enabled.searchParams.get('site')).toBe('평택');
  expect(enabled.searchParams.get('format')).toBe('DXF');
  expect(enabled.searchParams.get('pageSize')).toBe('50');
  expect(enabled.searchParams.get('current')).toBe('true');
  expect(enabled.searchParams.get('page')).toBe('1');
  const disabled = new URL(currentOnlyToggleUrl(listQuery(enabled.searchParams)), 'http://localhost');
  expect(disabled.searchParams.has('current')).toBe(false);
  expect(disabled.searchParams.get('filename')).toBe('one');
  expect(disabled.searchParams.get('page')).toBe('1');
});
test('TC-LIST-009: current-only filter combines with existing filters and excludes locations without current', async()=>{
  const matching = await repo.register(input,file('matching-current.dxf'));
  await repo.register({...input,businessUnit:'설비',site:'서울',building:'B동',floor:'1층'},file('other-current.dwg','DWG'));
  await repo.register({...input,floor:'3층',makeCurrent:false},file('without-current.dxf'));
  const result = await search('current=true&filename=matching&site=평택&format=DXF');
  expect(result.items.map(v=>v.id)).toEqual([matching.id]);
  expect((await search('current=true&floor=3층')).total).toBe(0);
  expect((await search('current=true&site=서울&format=DXF')).total).toBe(0);
});
test('TC-LIST-005: pagination is stable and bounded', async()=>{
  for(let i=0;i<3;i++) await repo.register(input,file(`${i}.dxf`));
  const a = await search('pageSize=2'); const b = await search('pageSize=2&page=2');
  expect(a.total).toBe(3); expect(a.items).toHaveLength(2); expect(b.items).toHaveLength(1);
  expect(new Set([...a.items,...b.items].map(v=>v.id)).size).toBe(3);
  expect((await search('pageSize=2&page=3')).items).toEqual([]);
});
test('TC-LIST-006: invalid and duplicate query parameters are rejected', ()=>{
  for(const query of ['page=0','page=-1','page=1.5','pageSize=101','format=exe','current=yes','site=a&site=b','filename=%00']) expect(()=>listQuery(new URLSearchParams(query))).toThrow();
});
