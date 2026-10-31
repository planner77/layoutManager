import {describe,expect,it} from 'vitest';
import {GeneratedDocument,generatedResult} from '../../domain/generated-document';
import {buildGeneratedTransfer,parseGeneratedTransfer,GENERATED_TRANSFER_MAX_BYTES} from '../../domain/generated-transfer';
import {buildOutlineExport} from '../../domain/outline-draft';
import type {OutlineResult,GeoJSONOutline} from '../../viewers/core/outline-compute';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'a'.repeat(64)};
const uuids=['123e4567-e89b-42d3-a456-426614174010',
 '123e4567-e89b-42d3-a456-426614174011','123e4567-e89b-42d3-a456-426614174012'];
const geom:GeoJSONOutline={type:'Polygon',coordinates:[
 [[0,0],[10,0],[10,10],[0,10],[0,0]],
 [[3,3],[3,7],[7,7],[7,3],[3,3]],
]};
const multi:GeoJSONOutline={type:'MultiPolygon',coordinates:[
 geom.coordinates,[[[20,20],[25,20],[25,25],[20,25],[20,20]]],
]};
function result(geometry:GeoJSONOutline,render=false):OutlineResult{
 return {kind:'PRECISE',algorithm:'polygon-clipping-union-v1',
  geometry:structuredClone(geometry),sourceEntityIds:render?[]:['stable/A1'],
  ...(render?{geometryBasis:'RENDER_WCS_2D' as const,derivedFrom:['imported-x']}:{}),
  persistable:!render,tolerance:0.02,warnings:[],durationMs:1};
}
function prepare(count=3){
 const doc=new GeneratedDocument(scope);
 for(let i=0;i<count;i++)
  doc.append({id:uuids[i],savedOutlineId:'local-'+(i+1),
   createdAt:'2026-10-31T00:00:00.000Z',
   name:'장비 #'+(i+1),outlineTypeId:null,
   result:result(i===1?multi:geom,i===2)});
 return doc;
}
function copy<T>(o:T):T{return JSON.parse(JSON.stringify(o)) as T;}
describe('Issue #56 E6: browser-only, fail-closed JSON round-trip',()=>{
 it('E6-AC1 three create, move, rotate, delete one, visibility, restore two + no Undo history',()=>{
  const doc=prepare(),refs=doc.getObjects().map(item=>item.ref);
  doc.execute({type:'Translate',ids:[uuids[0],uuids[1]],dx:3,dy:-5},refs.slice(0,2));
  doc.execute({type:'Rotate',ids:[uuids[0],uuids[1]],angleDegrees:90,pivot:[5,5]},refs.slice(0,2));
  doc.execute({type:'Delete',ids:[uuids[2]]},[refs[2]]);
  doc.setVisible('local-2',false);
  const original=buildGeneratedTransfer(doc,4);
  expect(original.objects).toHaveLength(2);
  expect(original.objects[0].origin).toBe('APP_CREATED');
  expect(original.sourceAttestable).toBe(false);
  const parsed=parseGeneratedTransfer(copy(original),scope,4);
  expect(parsed.legacy).toBe(false);
  const fresh=prepare(1);
  fresh.replaceFromImport(parsed.entries);
  expect(fresh.history()).toMatchObject({undo:0,redo:0});
  expect(fresh.getObjects().map(o=>o.ref.id)).toEqual([uuids[0],uuids[1]]);
  expect(fresh.getObjects()[1].visible).toBe(false);
  expect(fresh.getObjects().map(generatedResult)).toEqual(doc.getObjects().map(generatedResult));
  expect(buildGeneratedTransfer(fresh,4).objects.map(o=>o.editedGeometry))
    .toEqual(original.objects.map(o=>o.editedGeometry));
 });
 it('E6-AC2 existing #31 v1 source-only JSON remains parseable as unclassified legacy',()=>{
  const source=scope.versionId+':'+scope.sourceSha256+':A1';
  const legacy=buildOutlineExport(scope.versionId,scope.sourceSha256,4,[{
   id:'local-1',createdAt:'2026-10-31T00:00:00.000Z',
   result:{...result(geom),sourceEntityIds:[source]},
  }]);
  expect(legacy.schemaVersion).toBe(1);
  const parsed=parseGeneratedTransfer(copy(legacy),scope,4);
  expect(parsed.legacy).toBe(true);
  expect(parsed.entries[0]).toMatchObject({savedOutlineId:'local-1',
   outlineTypeId:null,outlineTypeName:null,edited:false});
  expect(parsed.entries[0].transform).toEqual([1,0,0,1,0,0]);
  const fresh=prepare(0);fresh.replaceFromImport(parsed.entries);
  expect(fresh.getObjects()[0].ref.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(fresh.history().undo).toBe(0);
 });
 it('E6-AC3 mismatch, tampered source, duplicate UUID, invalid transform/geometry and oversize reject',()=>{
  const doc=prepare(2),raw=buildGeneratedTransfer(doc,4);
  const reject=(edit:(input:ReturnType<typeof buildGeneratedTransfer>)=>void)=>{
   const input=copy(raw);edit(input);expect(()=>parseGeneratedTransfer(input,scope,4)).toThrow();
  };
  reject(v=>{(v as {versionId:string}).versionId='another-version';});
  reject(v=>{(v as {sourceSha256:string}).sourceSha256='b'.repeat(64);});
  expect(()=>parseGeneratedTransfer(raw,scope,1)).toThrow();
  reject(v=>{(v as {sourceAttestable:boolean}).sourceAttestable=true;});
  reject(v=>{(v.objects[0] as {id:string}).id=raw.objects[1].id;});
  reject(v=>{(v.objects[0] as {origin:string}).origin='DXF_IMPORTED';});
  reject(v=>{(v.objects[0] as {editedGeometry:GeoJSONOutline}).editedGeometry={type:'Polygon',
     coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]};});
  reject(v=>{(v.objects[0] as {transform:number[]}).transform=[1,0,0,1,NaN,0];});
  reject(v=>{(v.objects[0] as {baseGeometry:GeoJSONOutline}).baseGeometry={type:'Polygon',
     coordinates:[[[0,0],[10,0],[10,10],[0,10],[1,1]]]};});
  expect(()=>parseGeneratedTransfer('a'.repeat(GENERATED_TRANSFER_MAX_BYTES+1),scope,4)).toThrow();
 });
 it('E6-AC4 atomic failed replace preserves live Document and Undo history; empty allowed',()=>{
  const target=prepare(1),refs=target.getObjects().map(o=>o.ref);
  target.execute({type:'Translate',ids:[uuids[0]],dx:1,dy:2},refs);
  const old=JSON.stringify(target.getObjects()),history=target.history();
  const parsed=parseGeneratedTransfer(buildGeneratedTransfer(prepare(2),4),scope,4);
  const malicious=parsed.entries.map((o,i)=>i===1?{...o,id:uuids[0]}:o);
  expect(()=>target.replaceFromImport(malicious)).toThrow();
  expect(JSON.stringify(target.getObjects())).toBe(old);
  expect(target.history()).toEqual(history);
  const blank=prepare(0),exported=buildGeneratedTransfer(blank,null);
  expect(exported.objects).toHaveLength(0);
  const restored=parseGeneratedTransfer(exported,scope,null);
  target.replaceFromImport(restored.entries);
  expect(target.getObjects()).toHaveLength(0);
  expect(target.history().undo).toBe(0);
 });
});
