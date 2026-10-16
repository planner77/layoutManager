import {describe,expect,it} from 'vitest';
import polygonClipping from 'polygon-clipping';
import {hasFatalModuleDiagnostic} from '../../scripts/build-diagnostics.mjs';
import {computeOutline} from '../../viewers/core/outline-compute';
import type {OutlineEntity} from '../../viewers/core/outline-geometry';

const square=(handle:string, x0:number, x1:number):OutlineEntity=>({
  id:handle,handle,entityType:'LWPOLYLINE',layer:'0',stable:true,
  instancePath:[],bounds:[x0,0,x1,10],
  paths:[{closed:true,points:[[x0,0],[x1,0],[x1,10],[x0,10]]}],
});

describe('Issue #31 polygon-clipping production compatibility',()=>{
  it('TC-OUT-EXPORT-001: ESM default export exposes the real union operation',()=>{
    // v0.15.7 ESM exports {default}, not a named "union". Webpack resolves
    // the ESM entry while Vitest/node may otherwise hide this mismatch via CJS.
    expect(typeof polygonClipping.union).toBe('function');
    const result=polygonClipping.union(
      [[[0,0],[5,0],[5,5],[0,5],[0,0]]],
      [[[3,0],[8,0],[8,5],[3,5],[3,0]]],
    );
    expect(result).toHaveLength(1);
    expect(result[0][0].length).toBeGreaterThan(4);
  });
  it('TC-OUT-EXPORT-002: PRECISE runs union and retains correct intersecting area',()=>{
    const actual=computeOutline('PRECISE',[square('1A',0,5),square('1B',3,8)]);
    expect(actual.kind).toBe('PRECISE');
    expect(actual.algorithm).toBe('polygon-clipping-union-v1');
    expect(actual.geometry.type).toBe('Polygon');
    if(actual.geometry.type!=='Polygon')return;
    const ring=actual.geometry.coordinates[0];
    const signed=ring.slice(0,-1).reduce((sum,p,i)=>{
      const q=ring[i+1];return sum+p[0]*q[1]-q[0]*p[1];
    },0)/2;
    expect(Math.abs(signed)).toBeCloseTo(80,5);
  });
  it('TC-OUT-EXPORT-003: build diagnostics reject missing module exports even with exit 0',()=>{
    expect(hasFatalModuleDiagnostic("Attempted import error: 'union' is not exported from 'polygon-clipping'")).toBe(true);
    expect(hasFatalModuleDiagnostic("export 'union' was not found in 'polygon-clipping'")).toBe(true);
    expect(hasFatalModuleDiagnostic("Module not found: Can't resolve 'worker'")).toBe(true);
    expect(hasFatalModuleDiagnostic("\u001b[31mAttempted import error:\u001b[0m missing")).toBe(true);
    expect(hasFatalModuleDiagnostic('Compiled with warnings\nDeprecated API notice\nCompiled successfully')).toBe(false);
  });
});
