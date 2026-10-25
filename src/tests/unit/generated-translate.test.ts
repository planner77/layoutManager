import {describe,expect,it,vi} from 'vitest';
import {
  parseWcsTranslation,selectedTranslationIds,validTranslationPreview,
} from '../../domain/generated-translate';
import {geometryHitBoundary,geometryHitPoint,geometryContainedInBox} from '../../domain/generated-hit-test';
import {outlineGeometryBounds} from '../../domain/outline-tree';
import {GeneratedDocument,generatedResult} from '../../domain/generated-document';
import {canvasObjectRef} from '../../domain/canvas-object-selection';
import type {GeneratedOutlineObject} from '../../viewers/core/adapter';
import type {OutlineResult,GeoJSONOutline} from '../../viewers/core/outline-compute';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'a'.repeat(64)};
const uuids=[
  '123e4567-e89b-42d3-a456-426614174010',
  '123e4567-e89b-42d3-a456-426614174011',
];
const polygon:GeoJSONOutline={type:'Polygon',coordinates:[
  [[10,20],[20,20],[20,30],[10,30],[10,20]],
  [[12,22],[12,24],[14,24],[14,22],[12,22]],
]};
const multi:GeoJSONOutline={type:'MultiPolygon',coordinates:[
  polygon.coordinates,
  [[[40,60],[50,60],[50,70],[40,70],[40,60]]],
]};
function result(geometry:GeoJSONOutline):OutlineResult{
  return {kind:'PRECISE',algorithm:'polygon-clipping-union-v1',geometry:structuredClone(geometry),
    tolerance:0.02,sourceEntityIds:['source:A1'],persistable:true,
    warnings:[],durationMs:1};
}
function fixture(){
  const changed=vi.fn(),doc=new GeneratedDocument(scope,changed);
  for(let i=0;i<2;i++)doc.append({
    id:uuids[i],savedOutlineId:'local-'+(i+1),
    createdAt:'2026-10-25T00:00:00Z',name:'part '+i,
    outlineTypeId:null,result:result(i===0?polygon:multi),
  });
  const selection=doc.getObjects().map(item=>item.ref);
  const objects=():GeneratedOutlineObject[]=>doc.getObjects().map(item=>({
    ref:item.ref,savedOutlineId:item.savedOutlineId,visible:item.visible,
    geometry:generatedResult(item).geometry,baseGeometry:item.baseGeometry,
    transform:item.transform,edited:item.edited,dirty:item.dirty,
    sourceEntityIds:[...item.baseResult.sourceEntityIds],kind:item.kind,
    name:item.name,outlineTypeId:item.outlineTypeId,
  }));
  return {doc,selection,objects,changed};
}
describe('Issue #54 E4 numeric WCS and fail-closed preflight',()=>{
  it('TC-E4-UNIT-001 parses strict WCS deltas, rejects NaN/Infinity/empty/zero/oversize',()=>{
    expect(parseWcsTranslation(' +3.0 ',' -5e0 ')).toEqual({dx:3,dy:-5});
    expect(parseWcsTranslation('.5','0')).toEqual({dx:0.5,dy:0});
    for(const [x,y] of [
      ['','1'],[' ','1'],['NaN','3'],['Infinity','0'],['0','0'],
      ['1,000','2'],['3 px','2'],['1e309','1'],['1e13','0'],['5','1e13'],
    ])expect(()=>parseWcsTranslation(x,y)).toThrow();
    expect(validTranslationPreview(3,-5,{minX:10,minY:20,maxX:20,maxY:30})).toBe(true);
    expect(validTranslationPreview(20,0,{minX:1e12-10,minY:0,maxX:1e12-1,maxY:20})).toBe(false);
    expect(validTranslationPreview(Number.NaN,0,{minX:0,minY:0,maxX:10,maxY:10})).toBe(false);
  });
  it('TC-E4-UNIT-002 moves multiple Polygon/MultiPolygon/Hole by one affine command with source metadata intact',()=>{
    const {doc,selection,objects}=fixture(),ids=selectedTranslationIds(selection,objects(),scope);
    const baseline=doc.getObjects();
    const baseResult=baseline.map(generatedResult);
    doc.execute({type:'Translate',ids,dx:3,dy:-5},selection);
    expect(doc.history()).toMatchObject({undo:1,redo:0});
    const moved=doc.getObjects().map(generatedResult);
    expect(moved[0].geometry.type).toBe('Polygon');
    if(moved[0].geometry.type==='Polygon'){
      expect(moved[0].geometry.coordinates[0][0]).toEqual([13,15]);
      expect(moved[0].geometry.coordinates[1][0]).toEqual([15,17]);
      expect(moved[0].geometry.coordinates[1][4]).toEqual([15,17]);
      expect(geometryHitBoundary(moved[0].geometry,[13,20],0.2)).toBe(true);
      expect(geometryHitBoundary(moved[0].geometry,[18,20],0.2)).toBe(false);
      expect(geometryHitPoint(moved[0].geometry,[13,20],0.2)).toBe(true);
      expect(geometryContainedInBox(moved[0].geometry,[12,14,24,26])).toBe(true);
      expect(outlineGeometryBounds(moved[0].geometry)).toMatchObject({
        minX:13,minY:15,maxX:23,maxY:25,
      });
    }
    expect(moved[1].geometry.type).toBe('MultiPolygon');
    if(moved[1].geometry.type==='MultiPolygon'){
      expect(moved[1].geometry.coordinates[0][1][0]).toEqual([15,17]);
      expect(moved[1].geometry.coordinates[1][0][0]).toEqual([43,55]);
    }
    expect(doc.getObjects().map(item=>item.baseGeometry)).toEqual(baseline.map(item=>item.baseGeometry));
    expect(doc.getObjects().map(item=>item.ref.id)).toEqual(uuids);
    expect(moved.map(item=>item.sourceEntityIds)).toEqual(baseResult.map(item=>item.sourceEntityIds));
    expect(moved.map(item=>item.kind)).toEqual(baseResult.map(item=>item.kind));
    expect(doc.undo()).toBe(true);
    expect(doc.getObjects().map(generatedResult).map(item=>item.geometry))
      .toEqual(baseResult.map(item=>item.geometry));
    expect(doc.redo()).toBe(true);
    expect(doc.getObjects().map(generatedResult).map(item=>item.geometry))
      .toEqual(moved.map(item=>item.geometry));
  });
  it('TC-E4-UNIT-003 aborts SOURCE/mixed/duplicate/stale/missing/hidden/invalid without any group partial mutation',()=>{
    const {doc,selection,objects}=fixture();
    const base=doc.getObjects(),history=doc.history();
    const source=canvasObjectRef('SOURCE','handle:A1',scope);
    expect(()=>selectedTranslationIds([source,...selection],objects(),scope)).toThrow(/읽기 전용/);
    expect(()=>selectedTranslationIds([selection[0],selection[0]],objects(),scope)).toThrow(/중복/);
    expect(()=>selectedTranslationIds(
      [canvasObjectRef('GENERATED',uuids[0],{...scope,sourceSha256:'b'.repeat(64)})],
      objects(),scope)).toThrow();
    expect(()=>selectedTranslationIds([selection[0]],objects().slice(1),scope)).toThrow();
    expect(()=>doc.execute({type:'Translate',ids:uuids,dx:1e12,dy:2},selection)).toThrow();
    expect(()=>doc.execute({type:'Translate',ids:uuids,dx:Number.POSITIVE_INFINITY,dy:0},selection)).toThrow();
    expect(doc.getObjects()).toEqual(base);
    expect(doc.history()).toEqual(history);
    doc.setVisible('local-2',false);
    expect(()=>selectedTranslationIds(selection,objects(),scope)).toThrow(/숨김/);
  });
  it('TC-E4-UNIT-004 stages ghost-only gesture, ESC/cancel leaves history empty, pointerup commits one step',()=>{
    const {doc,selection,objects}=fixture(),ids=selectedTranslationIds(selection,objects(),scope);
    const base=doc.getObjects();
    doc.stage({type:'Translate',ids,dx:0,dy:0},selection);
    expect(doc.getObjects()).toEqual(base);expect(doc.history().undo).toBe(0);
    expect(doc.cancelPending()).toBe(true);
    expect(doc.getObjects()).toEqual(base);
    doc.stage({type:'Translate',ids,dx:3,dy:-5},selection);
    expect(doc.commitPending(selection)).toBe(true);
    expect(doc.history().undo).toBe(1);
    expect(doc.commitPending(selection)).toBe(false);
    expect(doc.undo()).toBe(true);
    expect(doc.getObjects()).toEqual(base);
    // A change in selection while stage is pending must never edit a different row.
    doc.stage({type:'Translate',ids,dx:1,dy:2},selection);
    expect(()=>doc.commitPending([selection[0]])).toThrow();
    expect(doc.history().undo).toBe(0);
    expect(doc.hasPending).toBe(false);
  });
});
