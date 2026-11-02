import {describe,expect,it} from 'vitest';
import {GeneratedDocument,generatedResult} from '../../domain/generated-document';
import {parseWcsRotation,selectedRotation,dragRotationDegrees} from '../../domain/generated-rotate';
import {canvasObjectRef} from '../../domain/canvas-object-selection';
import type {OutlineResult,GeoJSONOutline} from '../../viewers/core/outline-compute';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'a'.repeat(64)};
const first='123e4567-e89b-42d3-a456-426614174010';
const second='123e4567-e89b-42d3-a456-426614174011';
const shape:GeoJSONOutline={type:'Polygon',coordinates:[[[10,0],[20,0],[20,10],[10,10],[10,0]],
 [[12,2],[12,8],[18,8],[18,2],[12,2]]]};
const multi:GeoJSONOutline={type:'MultiPolygon',coordinates:[shape.coordinates,
 [[[30,20],[40,20],[40,30],[30,30],[30,20]]]]};
function result(geometry:GeoJSONOutline):OutlineResult{
 return {kind:'PRECISE',algorithm:'polygon-clipping-union-v1',geometry:structuredClone(geometry),
  sourceEntityIds:['stable/A1'],persistable:true,tolerance:0.02,warnings:[],durationMs:1};
}
function document(){
 const doc=new GeneratedDocument(scope);
 const date='2026-10-31T00:00:00.000Z';
 doc.append({id:first,savedOutlineId:'local-1',createdAt:date,result:result(shape)});
 doc.append({id:second,savedOutlineId:'local-2',createdAt:date,result:result(multi)});
 return doc;
}
describe('Issue #55 E5: WCS XY CCW rotation',()=>{
 it('E5-AC1 rotates by +90, -90, 180, 360 around origin without screen Y inversion',()=>{
  const doc=document();const selection=[doc.getObjects()[0].ref];
  const entry=doc.getObjects()[0];const at=()=>generatedResult(doc.getObjects()[0]).geometry;
  const point=()=>{const geo=at();return geo.type==='Polygon'?geo.coordinates[0][0]:[NaN,NaN];};
  const baseline=JSON.stringify(entry.baseGeometry);
  doc.execute({type:'Rotate',ids:[first],angleDegrees:90,pivot:[0,0]},selection);
  expect(point()[0]).toBeCloseTo(0,8);expect(point()[1]).toBeCloseTo(10,8);
  expect(doc.undo()).toBe(true);
  doc.execute({type:'Rotate',ids:[first],angleDegrees:-90,pivot:[0,0]},selection);
  expect(point()[0]).toBeCloseTo(0,8);expect(point()[1]).toBeCloseTo(-10,8);
  expect(doc.undo()).toBe(true);
  doc.execute({type:'Rotate',ids:[first],angleDegrees:180,pivot:[0,0]},selection);
  expect(point()[0]).toBeCloseTo(-10,8);expect(point()[1]).toBeCloseTo(0,8);
  expect(doc.undo()).toBe(true);
  doc.execute({type:'Rotate',ids:[first],angleDegrees:360,pivot:[0,0]},selection);
  expect(point()[0]).toBeCloseTo(10,8);expect(point()[1]).toBeCloseTo(0,8);
  expect(JSON.stringify(doc.getObjects()[0].baseGeometry)).toBe(baseline);
  expect(doc.getObjects()[0].transformOperations).toHaveLength(1);
 });
 it('E5-AC2 common bbox pivot applies to group with Hole+MultiPolygon, one Undo',()=>{
  const doc=document(),selection=doc.getObjects().map(o=>o.ref);
  const selected=selectedRotation(selection,doc.getObjects().map(o=>({
   ref:o.ref,savedOutlineId:o.savedOutlineId,visible:o.visible,geometry:generatedResult(o).geometry,
   baseGeometry:o.baseGeometry,transform:o.transform,edited:o.edited,dirty:o.dirty,
   sourceEntityIds:o.baseResult.sourceEntityIds,kind:o.kind,name:o.name,outlineTypeId:o.outlineTypeId,
  })),scope);
  expect(selected.ids).toEqual([first,second]);
  expect(selected.pivot).toEqual([25,15]);
  const before=doc.getObjects().map(x=>JSON.stringify(generatedResult(x).geometry));
  doc.stage({type:'Rotate',ids:selected.ids,angleDegrees:90,pivot:selected.pivot},selection);
  expect(doc.history().undo).toBe(0);
  expect(doc.commitPending(selection)).toBe(true);
  expect(doc.history()).toMatchObject({undo:1,redo:0});
  const after=doc.getObjects();
  expect(generatedResult(after[0]).geometry.type).toBe('Polygon');
  expect(generatedResult(after[1]).geometry.type).toBe('MultiPolygon');
  const hole=generatedResult(after[0]).geometry;
  expect(hole.type==='Polygon'?hole.coordinates[1]:[]).toHaveLength(5);
  expect(doc.undo()).toBe(true);
  expect(doc.getObjects().map(x=>JSON.stringify(generatedResult(x).geometry))).toEqual(before);
  expect(doc.redo()).toBe(true);
  expect(doc.history().undo).toBe(1);
 });
 it('E5-AC3 selection/Source/stale and invalid numeric preflight refuse atomically',()=>{
  const doc=document(),selection=doc.getObjects().map(x=>x.ref);
  const before=JSON.stringify(doc.getObjects());
  const source=canvasObjectRef('SOURCE','DXF:A1',scope);
  expect(()=>doc.execute({type:'Rotate',ids:[first,second],angleDegrees:90,pivot:[0,0]},
   [selection[0],source])).toThrow();
  expect(()=>doc.execute({type:'Rotate',ids:[first,second],angleDegrees:Infinity,pivot:[0,0]},
   selection)).toThrow();
  expect(()=>doc.execute({type:'Rotate',ids:[first,second],angleDegrees:1e9,pivot:[0,0]},
   selection)).toThrow();
  for(const value of ['NaN','Infinity','1e20','1,5','', '  '])
    expect(()=>parseWcsRotation(value,'0','0')).toThrow();
  expect(()=>parseWcsRotation('30','Infinity','0')).toThrow();
  expect(JSON.stringify(doc.getObjects())).toBe(before);
  expect(doc.history().undo).toBe(0);
  doc.stage({type:'Rotate',ids:[first,second],angleDegrees:90,pivot:[0,0]},selection);
  expect(doc.cancelPending()).toBe(true);
  expect(doc.history().undo).toBe(0);
  expect(JSON.stringify(doc.getObjects())).toBe(before);
 });
 it('E5-AC4 drag angle is measured in WCS and never screen Y-down',()=>{
  expect(dragRotationDegrees([10,0],[0,10],[0,0])).toBeCloseTo(90,8);
  expect(dragRotationDegrees([10,0],[0,-10],[0,0])).toBeCloseTo(-90,8);
  expect(()=>dragRotationDegrees([0,0],[10,0],[0,0])).toThrow();
  expect(parseWcsRotation('+90','-3','2e1')).toEqual({angleDegrees:90,pivot:[-3,20]});
 });
});
