import {describe,expect,it} from 'vitest';
import {canvasEditCapability,canvasObjectRef,createGeneratedId,sameCanvasScope} from '../../domain/canvas-object-selection';
import {geometryContainedInBox,geometryHitPoint,geometryIntersectsBox} from '../../domain/generated-hit-test';
import type {GeoJSONOutline} from '../../viewers/core/outline-compute';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'a'.repeat(64)};
const otherScope={...scope,versionId:'123e4567-e89b-42d3-a456-426614174001'};
const id1='123e4567-e89b-42d3-a456-426614174010';
const id2='123e4567-e89b-42d3-a456-426614174011';
const source=canvasObjectRef('SOURCE',scope.versionId+':'+scope.sourceSha256+':A1',scope);
const generated=canvasObjectRef('GENERATED',id1,scope);
const generated2=canvasObjectRef('GENERATED',id2,scope);
const poly:GeoJSONOutline={type:'Polygon',coordinates:[
  [[0,0],[10,0],[10,10],[0,10],[0,0]],
  [[3,3],[7,3],[7,7],[3,7],[3,3]],
]};
const multi:GeoJSONOutline={type:'MultiPolygon',coordinates:[
  poly.coordinates,
  [[[20,20],[25,20],[25,25],[20,25],[20,20]]],
]};
describe('TC-E1-UNIT-001: namespace and edit boundaries',()=>{
  it('separates SOURCE and GENERATED for exactly one Version/SHA',()=>{
    expect(source.origin).toBe('SOURCE');
    expect(generated.origin).toBe('GENERATED');
    expect(sameCanvasScope(generated,scope)).toBe(true);
    expect(sameCanvasScope(generated,otherScope)).toBe(false);
    expect(canvasEditCapability([generated,generated2],scope)).toMatchObject({canEdit:true,canSelect:true});
    for(const refs of [[source],[source,generated],[generated,source,generated2]]){
      expect(canvasEditCapability(refs,scope)).toMatchObject({canSelect:true,canEdit:false});
    }
    expect(canvasEditCapability([],scope)).toMatchObject({canSelect:true,canEdit:false});
  });
  it('denies stale/duplicate/spoofed IDs and invalid source hashes',()=>{
    expect(canvasEditCapability([generated,generated],scope).canEdit).toBe(false);
    expect(canvasEditCapability([generated],otherScope).canSelect).toBe(false);
    expect(canvasEditCapability([generated],{...scope,sourceSha256:'wrong'}).canSelect).toBe(false);
    expect(canvasEditCapability([{...generated,id:'local-1'}],scope).canSelect).toBe(false);
    expect(()=>canvasObjectRef('GENERATED','local-1',scope)).toThrow();
    expect(()=>canvasObjectRef('SOURCE','A1',{...scope,sourceSha256:'wrong'})).toThrow();
  });
  it('uses browser CSPRNG for UUIDv4 on insecure HTTP, never predictable ordinals',()=>{
    const id=createGeneratedId({
      getRandomValues:<T extends ArrayBufferView | null>(array:T):T=>{
        if(array instanceof Uint8Array)array.set(Array.from({length:16},(_,i)=>i));
        return array;
      },
    });
    expect(id).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(canvasObjectRef('GENERATED',id,scope).id).toBe(id);
    expect(()=>createGeneratedId(undefined as unknown as Crypto)).toThrow();
  });
});

describe('TC-E1-UNIT-002: polygon hole, MultiPolygon and crossing/containment',()=>{
  it('allows interior or stroke clicks but excludes hole interiors',()=>{
    expect(geometryHitPoint(poly,[1,1],0.2)).toBe(true);
    expect(geometryHitPoint(poly,[5,5],0.2)).toBe(false);
    expect(geometryHitPoint(poly,[3,5],0.2)).toBe(true);
    expect(geometryHitPoint(poly,[0,5],0.3)).toBe(true);
    expect(geometryHitPoint(poly,[11,11],0.3)).toBe(false);
    expect(geometryHitPoint(multi,[22,22],0.3)).toBe(true);
    expect(geometryHitPoint(multi,[15,15],0.3)).toBe(false);
  });
  it('distinguishes full containment and overlap with disjoint islands and holes',()=>{
    expect(geometryContainedInBox(poly,[-1,-1,11,11])).toBe(true);
    expect(geometryContainedInBox(poly,[1,1,9,9])).toBe(false);
    expect(geometryIntersectsBox(poly,[-1,-1,11,11])).toBe(true);
    expect(geometryIntersectsBox(poly,[4,4,6,6])).toBe(false);
    expect(geometryIntersectsBox(poly,[9,9,12,12])).toBe(true);
    expect(geometryIntersectsBox(poly,[-2,4,2,6])).toBe(true);
    expect(geometryContainedInBox(multi,[-1,-1,11,11])).toBe(false);
    expect(geometryContainedInBox(multi,[-1,-1,26,26])).toBe(true);
    expect(geometryIntersectsBox(multi,[21,21,22,22])).toBe(true);
    expect(geometryIntersectsBox(multi,[13,13,16,16])).toBe(false);
  });
  it('fails closed on degenerate, nonfinite or invalid window coordinates',()=>{
    expect(geometryHitPoint(poly,[NaN,0],1)).toBe(false);
    expect(geometryHitPoint(poly,[0,0],-1)).toBe(false);
    expect(geometryContainedInBox(poly,[0,0,Infinity,4])).toBe(false);
    expect(geometryIntersectsBox(poly,[10,10,0,0])).toBe(false);
    expect(geometryHitPoint({type:'Polygon',coordinates:[]},[0,0],1)).toBe(false);
  });
});
