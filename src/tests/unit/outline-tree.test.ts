import { describe, expect, it } from 'vitest';
import { buildOutlineTree, outlineGeometryBounds } from '../../domain/outline-tree';
import type { SavedOutline } from '../../viewers/core/adapter';

function saved(id: string, kind: 'CONVEX' | 'PRECISE', type?: {id:string;name:string}): SavedOutline {
  return {
    id, createdAt: '2026-10-25T00:00:00Z',
    ...(type ? { outlineTypeId: type.id, outlineTypeName: type.name, name: id + '-custom' } : {}),
    result: {
      kind, algorithm: 'monotone-chain-v1', tolerance: 0.02,
      persistable: true, sourceEntityIds: ['ref'], warnings: [], durationMs: 1,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] },
    },
  };
}
const typeA = {id:'123e4567-e89b-42d3-a456-426614174000',name:'조립'};
const typeB = {id:'123e4567-e89b-42d3-a456-426614174001',name:'검사'};

describe('TC-U6-UNIT-001: type-keyed session tree projection', () => {
  it('includes two catalogue types, immutable IDs and a legacy group, preserving old names on missing catalogue types', () => {
    const outlines = [saved('local-1', 'CONVEX', typeA), saved('local-2', 'PRECISE', typeA), saved('local-3', 'PRECISE')];
    const groups = buildOutlineTree(outlines, [
      {id:'local-1',visible:false,selected:true},{id:'local-2',visible:true,selected:false},
      {id:'local-3',visible:true,selected:false},
    ], [{...typeA,name:'조립 변경'},typeB]);
    expect(groups.map(g=>[g.id,g.name,g.items.length])).toEqual([
      [typeA.id,'조립 변경',2],[typeB.id,'검사',0],['legacy','미분류 (legacy)',1],
    ]);
    expect(groups[0].items[0]).toMatchObject({name:'local-1-custom',visible:false,selected:true});
    expect(groups[2].items[0]).toMatchObject({legacy:true,kind:'PRECISE'});
    expect(buildOutlineTree([saved('local-9','CONVEX',typeA)],[],[])[0].name).toBe(typeA.name);
  });
  it('has an empty state with no catalogue or confirmed outlines', () => {
    expect(buildOutlineTree([], [], [])).toEqual([]);
  });
});

describe('TC-U6-UNIT-002: safe Polygon / MultiPolygon WCS focus', () => {
  it('includes disjoint islands and inner rings without using source layer bounds', () => {
    expect(outlineGeometryBounds({type:'MultiPolygon',coordinates:[
      [[[0,0],[8,0],[8,8],[0,0]],[[2,2],[2,3],[3,3],[2,2]]],
      [[[100,200],[110,200],[110,220],[100,200]]],
    ]})).toEqual({minX:0,minY:0,maxX:110,maxY:220});
  });
  it('rejects empty, degenerate, nonfinite and out-of-range shapes', () => {
    expect(outlineGeometryBounds({type:'Polygon',coordinates:[]})).toBeNull();
    expect(outlineGeometryBounds({type:'Polygon',coordinates:[[[0,0],[1,0],[2,0],[0,0]]]})).toBeNull();
    expect(outlineGeometryBounds({type:'Polygon',coordinates:[[[0,0],[1,0],[1,Infinity],[0,0]]]})).toBeNull();
    expect(outlineGeometryBounds({type:'Polygon',coordinates:[[[0,0],[1e13,0],[1e13,1],[0,0]]]})).toBeNull();
  });
});
