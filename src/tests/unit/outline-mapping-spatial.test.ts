import {describe,expect,it} from 'vitest';
import type {OutlineEntity} from '../../viewers/core/outline-geometry';
import {SelectionSpatialIndex,type WorldBox} from '../../viewers/three-dxf-viewer/selection-spatial-index';
import {reconcileRenderCoverage,type RenderObservation} from '../../viewers/three-dxf-viewer/render-coverage';

function entity(handle:string|null,box:WorldBox,layer='0'):OutlineEntity {
  const id=handle??'TEMP';
  return {id,handle,entityType:'LINE',layer,instancePath:[],stable:handle!==null,
    paths:[{points:[[box[0],box[1]],[box[2],box[3]]],closed:false}],bounds:box};
}
const observation=(handle:string,bounds:WorldBox,layer='0'):RenderObservation=>
  ({handle,entityType:'LINE',layer,bounds});

describe('Issue #31 P0 renderer handle reconciliation',()=>{
  it('TC-OUT-MAP-001: maps only genuine rendered top-level source handles',()=>{
    const src=[entity('A1',[0,0,10,10]),entity('B2',[20,20,30,30]),entity(null,[35,35,40,40])];
    const result=reconcileRenderCoverage(src,[observation('a1',[0,0,10,10])]);
    expect(result.mappedSource).toBe(1);
    expect(result.unmappedSource).toBe(2);
    expect(result.selectable.map(e=>e.handle)).toEqual(['A1']);
  });
  it('TC-OUT-MAP-002: accepts a verified 1:N render mapping with combined extents',()=>{
    const src=[entity('AA',[0,0,20,20])];
    const result=reconcileRenderCoverage(src,[
      observation('aa',[0,0,10,10]),observation('AA',[10,10,20,20]),
    ]);
    expect(result.mappedSource).toBe(1);
    expect(result.renderedObjects).toBe(2);
  });
  it('TC-OUT-MAP-004: rejects non-unique or unstable source handle despite matching render',()=>{
    const unstable={...entity('AB',[0,0,10,10]),stable:false};
    const result=reconcileRenderCoverage([unstable],[observation('AB',[0,0,10,10])]);
    expect(result.mappedSource).toBe(0);
    expect(result.unmappedSource).toBe(1);
  });
  it('TC-OUT-MAP-003: rejects type, layer and WCS bounds mismatches',()=>{
    const src=[entity('AA',[0,0,10,10]),entity('BB',[50,50,60,60])];
    const incorrect=[{...observation('AA',[100,0,110,10])},
      {...observation('BB',[50,50,60,60]),layer:'wrong'}];
    const result=reconcileRenderCoverage(src,incorrect);
    expect(result.mappedSource).toBe(0);
    expect(result.boundsMismatch).toBe(2);
  });
});

describe('Issue #31 P5 spatial index',()=>{
  it('TC-OUT-SPATIAL-001: 1000 synthetic entities agree with brute-force bounds selection',()=>{
    const entities=Array.from({length:1000},(_,i)=>entity(i.toString(16).toUpperCase(),
      [(i%50)*10,Math.floor(i/50)*10,(i%50)*10+2,Math.floor(i/50)*10+2]));
    const index=new SelectionSpatialIndex(entities);
    const intersects=(e:OutlineEntity,q:WorldBox)=>e.bounds[0]<=q[2]&&
      e.bounds[2]>=q[0]&&e.bounds[1]<=q[3]&&e.bounds[3]>=q[1];
    for(const q of [[0,0,2,2],[75,75,105,105],[-10,-10,999,999],
       [10.5,20.5,10.7,20.7],[990,990,1000,1000]] as WorldBox[]){
      expect(index.query(q).map(e=>e.id)).toEqual(entities.filter(e=>intersects(e,q)).map(e=>e.id));
    }
    expect(index.query([NaN,0,1,1])).toEqual([]);
    expect(index.assignmentCount).toBeGreaterThan(0);
  });
  it('TC-OUT-SPATIAL-002: a drawing-spanning entity uses bounded overflow',()=>{
    const entities=Array.from({length:1000},(_,i)=>entity(i.toString(16).toUpperCase(),
      [i*2,1,i*2+1,2]));
    entities.push(entity('GIANT',[0,0,10_000,10_000]));
    const index=new SelectionSpatialIndex(entities);
    expect(index.overflowCount).toBeGreaterThanOrEqual(1);
    expect(index.query([9999,9999,10000,10000]).map(e=>e.id)).toContain('GIANT');
    expect(index.query([10001,10001,20000,20000])).toEqual([]);
  });
});
