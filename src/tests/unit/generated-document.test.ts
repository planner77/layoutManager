import {describe,expect,it,vi} from 'vitest';
import {
  GeneratedDocument,GENERATED_HISTORY_LIMIT,generatedResult,applyAffine,IDENTITY_2D,
  type GeneratedCommand,
} from '../../domain/generated-document';
import {canvasObjectRef} from '../../domain/canvas-object-selection';
import type {OutlineResult,GeoJSONOutline} from '../../viewers/core/outline-compute';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'a'.repeat(64)};
const uuids=[
  '123e4567-e89b-42d3-a456-426614174010',
  '123e4567-e89b-42d3-a456-426614174011',
  '123e4567-e89b-42d3-a456-426614174012',
];
const polygon:GeoJSONOutline={type:'Polygon',coordinates:[
  [[0,0],[10,0],[10,10],[0,10],[0,0]],
  [[3,3],[3,7],[7,7],[7,3],[3,3]],
]};
const multi:GeoJSONOutline={type:'MultiPolygon',coordinates:[
  polygon.coordinates,
  [[[20,20],[25,20],[25,25],[20,25],[20,20]]],
]};
function result(geometry=polygon):OutlineResult{
  return {kind:'PRECISE',algorithm:'polygon-clipping-union-v1',geometry:structuredClone(geometry),
    tolerance:0.02,sourceEntityIds:['ref/A1','ref/B2'],persistable:true,
    warnings:[],durationMs:2};
}
function prepare(n=2){
  const event=vi.fn();
  const doc=new GeneratedDocument(scope,event);
  for(let i=0;i<n;i++)
    doc.append({id:uuids[i],savedOutlineId:'local-'+(i+1),
      createdAt:'2026-10-25T00:00:00.000Z',
      name:'Outline '+i,outlineTypeId:null,
      result:result(i===1?multi:polygon)});
  const selection=doc.getObjects().map(o=>o.ref);
  return {doc,selection,event};
}
const translate=(ids:readonly string[],dx=3,dy=-5):GeneratedCommand=>({type:'Translate',ids,dx,dy});

describe('TC-E2-UNIT-001: immutable WCS document and lossless history',()=>{
  it('preserves UUID/order/base/hole and visibility over two edits, Undo x2, Redo x2',()=>{
    const {doc,selection}=prepare();
    const original=doc.getObjects();
    const ids=selection.map(r=>r.id);
    const base=JSON.stringify(original.map(item=>item.baseGeometry));
    doc.execute(translate(ids),selection);
    doc.execute({type:'Rotate',ids,angleDegrees:90,pivot:[0,0]},selection);
    const edited=doc.getObjects();
    const geom=edited.map(generatedResult);
    expect(edited.map(item=>item.ref.id)).toEqual(ids);
    expect(JSON.stringify(edited.map(item=>item.baseGeometry))).toBe(base);
    expect(geom[0].geometry.type).toBe('Polygon');
    expect(geom[1].geometry.type).toBe('MultiPolygon');
    expect(geom[0].sourceEntityIds).toEqual(['ref/A1','ref/B2']);
    expect(geom[0].geometry.type==='Polygon' && geom[0].geometry.coordinates[1]).toHaveLength(5);
    expect(doc.history()).toMatchObject({undo:2,redo:0});
    expect(doc.undo()).toBe(true);
    expect(doc.undo()).toBe(true);
    expect(doc.getObjects().map(generatedResult).map(item=>item.geometry))
      .toEqual(original.map(generatedResult).map(item=>item.geometry));
    expect(doc.getObjects().every(item=>!item.edited)).toBe(true);
    expect(doc.history()).toMatchObject({undo:0,redo:2});
    expect(doc.redo()).toBe(true);
    expect(doc.redo()).toBe(true);
    expect(doc.getObjects().map(generatedResult).map(item=>item.geometry))
      .toEqual(edited.map(generatedResult).map(item=>item.geometry));
    expect(doc.getObjects().map(item=>item.transform)).toEqual(edited.map(item=>item.transform));
    expect(doc.getObjects().map(item=>item.savedOutlineId)).toEqual(['local-1','local-2']);
  });
  it('detaches and freezes the external geometry; never mutates original DXF state',()=>{
    const external=result();
    const doc=new GeneratedDocument(scope);
    doc.append({id:uuids[0],savedOutlineId:'local-1',
      createdAt:'2026-10-25T00:00:00Z',result:external});
    const before=doc.getObjects()[0].baseGeometry;
    if(external.geometry.type==='Polygon')external.geometry.coordinates[0][0][0]=900;
    expect(before.type==='Polygon' && before.coordinates[0][0]).toEqual([0,0]);
    const fresh=result();
    expect(fresh.geometry.type==='Polygon' && fresh.geometry.coordinates[0][0]).toEqual([0,0]);
    expect(applyAffine(before,IDENTITY_2D)).toEqual(before);
    expect(Object.isFrozen(before)).toBe(true);
    doc.dispose();
    expect(doc.getObjects()).toEqual([]);
    expect(()=>doc.append({id:uuids[1],savedOutlineId:'local-2',
      createdAt:'2026-10-25T00:00:00Z',result:external})).toThrow();
  });
});
describe('TC-E2-UNIT-002: atomic command and hostile scope validation',()=>{
  it('rejects SOURCE, mixed, duplicate, stale, unknown, invisible, NaN/Infinity and bad pivot without partial changes',()=>{
    const {doc,selection}=prepare();
    const refs=selection.map(x=>x.id);
    const baseline=doc.getObjects();
    const source=canvasObjectRef('SOURCE','source:A1',scope);
    const other=canvasObjectRef('GENERATED',uuids[2],{...scope,versionId:uuids[0]});
    const invalid: Array<[GeneratedCommand,typeof selection]> = [
      [translate(refs),[source,...selection]],
      [translate([refs[0]]),[source]],
      [translate(refs),[selection[0],selection[0]]],
      [translate(refs),[other,...selection.slice(1)]],
      [translate([uuids[2],refs[1]]),selection],
      [translate(refs,NaN,0),selection],
      [translate(refs,Infinity,0),selection],
      [translate(refs,1e13,0),selection],
      [{type:'Rotate',ids:refs,angleDegrees:Infinity,pivot:[0,0]},selection],
      [{type:'Rotate',ids:refs,angleDegrees:90,pivot:[Number.NaN,0]},selection],
      [{type:'Rotate',ids:refs,angleDegrees:90,pivot:[0] as unknown as [number,number]},selection],
      [{type:'Delete',ids:[refs[0],refs[0]]},selection],
    ];
    for(const [cmd,select] of invalid){
      expect(()=>doc.execute(cmd,select)).toThrow();
      expect(doc.getObjects()).toEqual(baseline);
      expect(doc.history()).toMatchObject({undo:0,redo:0});
    }
    expect(doc.setVisible('local-1',false)).toBe(true);
    const hidden=doc.getObjects();
    expect(()=>doc.execute(translate(refs),selection)).toThrow();
    expect(doc.getObjects()).toEqual(hidden);
  });
  it('restores multi-delete exact IDs and order and clears future redo on a fresh command',()=>{
    const {doc,selection}=prepare(3);
    const before=doc.getObjects();
    doc.execute({type:'Delete',ids:[selection[0].id,selection[2].id]},
      [selection[0],selection[2]]);
    expect(doc.getObjects().map(o=>o.ref.id)).toEqual([selection[1].id]);
    expect(doc.undo()).toBe(true);
    expect(doc.getObjects()).toEqual(before);
    expect(doc.redo()).toBe(true);
    expect(doc.getObjects().map(o=>o.ref.id)).toEqual([selection[1].id]);
    expect(doc.undo()).toBe(true);
    doc.execute(translate([selection[0].id],2,3),[selection[0]]);
    expect(doc.history().redo).toBe(0);
    expect(doc.redo()).toBe(false);
  });
});
describe('TC-E2-UNIT-003: bounded and isolated history + staged cancellation',()=>{
  it('records a single staged gesture once, rollbacks on ESC/pointercancel, never logs visibility or zoom',()=>{
    const {doc,selection,event}=prepare();
    const cmd=translate(selection.map(r=>r.id),2,3);
    const base=doc.getObjects();
    doc.stage(cmd,selection);
    expect(doc.hasPending).toBe(true);
    expect(doc.history().undo).toBe(0);
    expect(doc.getObjects()).toEqual(base);
    expect(doc.cancelPending()).toBe(true);
    expect(doc.hasPending).toBe(false);
    doc.stage(cmd,selection);
    expect(doc.commitPending(selection)).toBe(true);
    expect(doc.history().undo).toBe(1);
    expect(doc.commitPending(selection)).toBe(false);
    const previous=doc.history().undo;
    expect(doc.setVisible('local-1',false)).toBe(true);
    expect(doc.history().undo).toBe(previous);
    expect(doc.undo()).toBe(true);
    expect(doc.getObjects()[0].visible).toBe(false);
    expect(event).toHaveBeenCalled();
    doc.clear();
    expect(doc.history()).toMatchObject({undo:0,redo:0});
  });
  it('evicts old commands after 100 steps, leaves geometry structural sharing',()=>{
    const {doc,selection}=prepare();
    const initialBase=doc.getObjects()[0].baseGeometry;
    for(let i=0;i<GENERATED_HISTORY_LIMIT+5;i++)
      doc.execute(translate([selection[0].id],1,0),[selection[0]]);
    expect(doc.history().undo).toBe(GENERATED_HISTORY_LIMIT);
    expect(doc.getObjects()[0].baseGeometry).toBe(initialBase);
    for(let i=0;i<GENERATED_HISTORY_LIMIT;i++)expect(doc.undo()).toBe(true);
    expect(doc.undo()).toBe(false);
    // First five entries have been evicted, not the immutable base.
    const reverted=generatedResult(doc.getObjects()[0]).geometry;
    expect(reverted.type==='Polygon' && reverted.coordinates[0][0][0]).toBe(5);
  });
});


describe('TC-E2-UNIT-006: WCS ring area far from the origin',()=>{
  it('confirms a valid unit square near (1e9,1e9)',()=>{
    const x=1e9;
    const far:GeoJSONOutline={type:'Polygon',coordinates:[[
      [x,x],[x+1,x],[x+1,x+1],[x,x+1],[x,x],
    ]]};
    const doc=new GeneratedDocument(scope);
    const item=doc.append({id:uuids[0],savedOutlineId:'local-1',
      createdAt:'2026-10-25T00:00:00Z',result:result(far)});
    expect(generatedResult(item).geometry).toEqual(far);
  });
});
describe('TC-E2-UNIT-007: Undo deletion capacity reservation',()=>{
  it('drops incompatible Undo before appending 60k+60k vertices',()=>{
    const ring=Array.from({length:60_000},(_,i)=>{
      const angle=i*2*Math.PI/60_000;
      return [Math.cos(angle),Math.sin(angle)] as [number,number];
    });
    ring.push([...ring[0]]);
    const shape:GeoJSONOutline={type:'Polygon',coordinates:[ring]};
    const doc=new GeneratedDocument(scope);
    const first=doc.append({id:uuids[0],savedOutlineId:'local-1',
      createdAt:'2026-10-25T00:00:00Z',result:result(shape)});
    doc.execute({type:'Delete',ids:[first.ref.id]},[first.ref]);
    expect(doc.history().undo).toBe(1);
    doc.append({id:uuids[1],savedOutlineId:'local-2',
      createdAt:'2026-10-25T00:00:00Z',result:result(shape)});
    expect(doc.history()).toMatchObject({undo:0,redo:0});
    expect(doc.undo()).toBe(false);
    expect(doc.getObjects()).toHaveLength(1);
    expect(doc.hasIssuedId(first.ref.id)).toBe(true);
    expect(()=>doc.append({id:first.ref.id,savedOutlineId:'local-3',
      createdAt:'2026-10-25T00:00:00Z',result:result()})).toThrow();
  });
  it('does not restore a 101st object after a new append',()=>{
    const doc=new GeneratedDocument(scope);
    for(let i=0;i<100;i++)
      doc.append({id:'123e4567-e89b-42d3-a456-'+i.toString(16).padStart(12,'0'),
        savedOutlineId:'local-'+(i+1),
        createdAt:'2026-10-25T00:00:00Z',result:result()});
    const first=doc.getObjects()[0];
    doc.execute({type:'Delete',ids:[first.ref.id]},[first.ref]);
    doc.append({id:'123e4567-e89b-42d3-a456-000000000064',
      savedOutlineId:'local-101',createdAt:'2026-10-25T00:00:00Z',result:result()});
    expect(doc.getObjects()).toHaveLength(100);
    expect(doc.history().undo).toBe(0);
    expect(doc.undo()).toBe(false);
  });
});
describe('TC-E2-UNIT-008: current-selection commit gate',()=>{
  it('rejects different IDs and SOURCE mixed after staging, then accepts same refs',()=>{
    const {doc,selection}=prepare();
    const a=[selection[0]],b=[selection[1]];
    const cmd=translate([a[0].id],2,3);
    const before=doc.getObjects();
    doc.stage(cmd,a);
    expect(()=>doc.commitPending(b)).toThrow('선택');
    expect(doc.hasPending).toBe(false);
    expect(doc.getObjects()).toEqual(before);
    expect(doc.history().undo).toBe(0);
    doc.stage(cmd,a);
    const source=canvasObjectRef('SOURCE','source:A1',scope);
    expect(()=>doc.commitPending([source,...a])).toThrow('선택');
    expect(doc.getObjects()).toEqual(before);
    doc.stage(cmd,a);
    expect(doc.commitPending(a)).toBe(true);
    expect(doc.history().undo).toBe(1);
  });
});
