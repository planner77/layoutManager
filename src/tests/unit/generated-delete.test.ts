import {describe,expect,it} from 'vitest';
import {canvasObjectRef} from '../../domain/canvas-object-selection';
import {GeneratedDocument,generatedResult} from '../../domain/generated-document';
import {
  prepareGeneratedDelete,assertGeneratedDeleteCurrent,
} from '../../domain/generated-delete';
import type {GeneratedOutlineObject} from '../../viewers/core/adapter';
import type {GeoJSONOutline,OutlineResult} from '../../viewers/core/outline-compute';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'a'.repeat(64)};
const ids=[
  '123e4567-e89b-42d3-a456-426614174010',
  '123e4567-e89b-42d3-a456-426614174011',
  '123e4567-e89b-42d3-a456-426614174012',
  '123e4567-e89b-42d3-a456-426614174013',
];
const geo:GeoJSONOutline={type:'Polygon',coordinates:[
  [[0,0],[100,0],[100,100],[0,100],[0,0]],
  [[10,10],[10,20],[20,20],[20,10],[10,10]],
]};
function outline():OutlineResult{
  return {kind:'PRECISE',algorithm:'polygon-clipping-union-v1',
    geometry:structuredClone(geo),tolerance:0.02,
    sourceEntityIds:['source/A1'],persistable:true,warnings:[],durationMs:1};
}
function fixture(n=3){
  const doc=new GeneratedDocument(scope);
  for(let i=0;i<n;i++){
    doc.append({id:ids[i],savedOutlineId:'local-'+(i+1),
      createdAt:'2026-10-25T00:00:00Z',name:'생성 '+(i+1),
      result:outline()});
  }
  const objects=():GeneratedOutlineObject[]=>
    doc.getObjects().map(entry=>({
      ref:entry.ref,savedOutlineId:entry.savedOutlineId,
      visible:entry.visible,geometry:generatedResult(entry).geometry,
      baseGeometry:entry.baseGeometry,transform:entry.transform,
      edited:entry.edited,dirty:entry.dirty,
      sourceEntityIds:entry.baseResult.sourceEntityIds,
      kind:entry.kind,name:entry.name,outlineTypeId:entry.outlineTypeId,
    }));
  return {doc,objects};
}
describe('Issue #53 / E3 generated deletion',()=>{
  it('TC-E3-UNIT-001: remove one of three, restore original metadata/geometry/id/order and redo',()=>{
    const {doc,objects}=fixture();
    const before=doc.getObjects();
    const req=prepareGeneratedDelete([before[1].ref],objects(),scope);
    expect(req.targets.map(t=>[t.savedOutlineId,t.name])).toEqual([['local-2','생성 2']]);
    assertGeneratedDeleteCurrent(req,[before[1].ref],objects(),scope);
    doc.execute({type:'Delete',ids:req.targets.map(t=>t.id)},[before[1].ref]);
    expect(doc.getObjects().map(x=>x.ref.id)).toEqual([ids[0],ids[2]]);
    expect(doc.history()).toMatchObject({undo:1,redo:0});
    expect(doc.undo()).toBe(true);
    expect(doc.getObjects()).toEqual(before);
    expect(doc.redo()).toBe(true);
    expect(doc.getObjects().map(x=>x.ref.id)).toEqual([ids[0],ids[2]]);
  });
  it('TC-E3-UNIT-002: atomic double deletion/Undo/Redo and fresh ID without collision',()=>{
    const {doc,objects}=fixture();
    const before=doc.getObjects(),selection=[before[0].ref,before[2].ref];
    const intent=prepareGeneratedDelete(selection,objects(),scope);
    // Confirmation cancellation does not touch the document.
    expect(doc.getObjects()).toEqual(before);
    expect(doc.history().undo).toBe(0);
    assertGeneratedDeleteCurrent(intent,selection,objects(),scope);
    doc.execute({type:'Delete',ids:intent.targets.map(t=>t.id)},selection);
    expect(doc.getObjects().map(item=>item.savedOutlineId)).toEqual(['local-2']);
    expect(doc.undo()).toBe(true);
    expect(doc.getObjects()).toEqual(before);
    expect(doc.redo()).toBe(true);
    expect(doc.hasIssuedId(ids[0])).toBe(true);
    expect(()=>doc.append({id:ids[0],savedOutlineId:'local-4',
      createdAt:'2026-10-25T00:00:00Z',result:outline()})).toThrow();
    doc.append({id:ids[3],savedOutlineId:'local-4',
      createdAt:'2026-10-25T00:00:00Z',result:outline()});
    expect(doc.getObjects().map(x=>x.ref.id)).toEqual([ids[1],ids[3]]);
    expect(doc.history().redo).toBe(0);
  });
  it('TC-E3-UNIT-003: SOURCE, mixed, wrong Version, invalid and duplicate IDs fail closed',()=>{
    const {doc,objects}=fixture();
    const originals=doc.getObjects();
    const source=canvasObjectRef('SOURCE','source/A1',scope);
    for(const selection of [
      [source],[source,originals[0].ref],
      [originals[0].ref,originals[0].ref],
      [canvasObjectRef('GENERATED',ids[3],scope)],
      [{...originals[0].ref,versionId:'foreign'}],
    ]){
      expect(()=>prepareGeneratedDelete(selection,objects(),scope)).toThrow();
      expect(doc.getObjects()).toEqual(originals);
      expect(doc.history().undo).toBe(0);
    }
    const request=prepareGeneratedDelete([originals[0].ref],objects(),scope);
    expect(()=>assertGeneratedDeleteCurrent(request,[originals[1].ref],objects(),scope)).toThrow();
    expect(()=>assertGeneratedDeleteCurrent(request,[originals[0].ref],objects(),
      {...scope,versionId:'foreign'})).toThrow();
    const hidden=objects().map(o=>o.ref.id===ids[0]?{...o,visible:false}:o);
    expect(()=>assertGeneratedDeleteCurrent(request,[originals[0].ref],hidden,scope)).toThrow();
    expect(doc.getObjects()).toEqual(originals);
    expect(doc.history().undo).toBe(0);
  });
  it('TC-E3-UNIT-004: no duplicate or stale target accepted after live document change',()=>{
    const {doc,objects}=fixture();
    const request=prepareGeneratedDelete([doc.getObjects()[0].ref],objects(),scope);
    const fake=objects().map(o=>o.ref.id===ids[0]?{...o,savedOutlineId:'local-99'}:o);
    expect(()=>assertGeneratedDeleteCurrent(request,[doc.getObjects()[0].ref],fake,scope)).toThrow();
    const renamed=objects().map(o=>o.ref.id===ids[0]?{...o,name:'확인 후 바뀐 이름'}:o);
    expect(()=>assertGeneratedDeleteCurrent(request,[doc.getObjects()[0].ref],renamed,scope)).toThrow();
    doc.setVisible('local-1',false);
    expect(()=>assertGeneratedDeleteCurrent(request,[doc.getObjects()[0].ref],objects(),scope)).toThrow();
  });
});
