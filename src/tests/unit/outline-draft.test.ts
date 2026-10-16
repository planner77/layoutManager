import {describe,expect,it} from 'vitest';
import {parseOutlineExport} from '../../domain/outline-draft';
const versionId='11111111-1111-4111-8111-111111111111';
const another='22222222-2222-4222-8222-222222222222';
const sha='a'.repeat(64),ref=versionId+':'+sha+':1A';
function payload(){
  return {
    schemaVersion:1,versionId,sourceSha256:sha,coordinateSystem:'DXF_WCS_XY',
    unitCode:4,persistence:'BROWSER_EXPORT_ONLY',
    outlines:[{
      id:'local-1',createdAt:'2026-10-16T08:00:00.000Z',
      result:{kind:'CONVEX',algorithm:'monotone-chain-v1',
        geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,0]]]},
        sourceEntityIds:[ref],persistable:true,tolerance:0.02,warnings:[],durationMs:2.1},
    }],
  };
}
describe('Issue #31 P4 non-persistent import validation',()=>{
  it('TC-OUT-DRAFT-001: validates a matching WCS version-bound stable draft',()=>{
    const result=parseOutlineExport(payload(),versionId,sha);
    expect(result.versionId).toBe(versionId);
    expect(result.outlines[0].sourceEntityIds).toEqual([ref]);
    expect(result.outlines[0].kind).toBe('CONVEX');
  });
  it('TC-OUT-DRAFT-002: blocks cross-version and wrong-SHA JSON',()=>{
    expect(()=>parseOutlineExport(payload(),another,sha)).toThrow(/Version/);
    expect(()=>parseOutlineExport(payload(),versionId,'b'.repeat(64))).toThrow(/SHA/);
  });
  it('TC-OUT-DRAFT-003: refuses transient, wrong-version and duplicate entity refs',()=>{
    const data=payload();
    data.outlines[0].result.sourceEntityIds=[versionId+':TEMP:4'];
    expect(()=>parseOutlineExport(data,versionId,sha)).toThrow(/Handle/);
    data.outlines[0].result.sourceEntityIds=[another+':'+sha+':1A'];
    expect(()=>parseOutlineExport(data,versionId,sha)).toThrow(/Version/);
    data.outlines[0].result.sourceEntityIds=[ref,ref];
    expect(()=>parseOutlineExport(data,versionId,sha)).toThrow(/중복/);
  });
  it('TC-OUT-DRAFT-004: never treats unsafe geometry or unsupported algorithms as persistent',()=>{
    const data=payload();
    data.outlines[0].result.geometry.coordinates[0][3]=[Infinity,1];
    expect(()=>parseOutlineExport(data,versionId,sha)).toThrow(/좌표/);
    const unclosed=payload();
    unclosed.outlines[0].result.geometry.coordinates[0][3]=[1,1];
    expect(()=>parseOutlineExport(unclosed,versionId,sha)).toThrow(/닫히지/);
    const temporary=payload();
    temporary.outlines[0].result.persistable=false;
    expect(()=>parseOutlineExport(temporary,versionId,sha)).toThrow(/임시/);
    const wrong=payload();
    wrong.outlines[0].result.algorithm='concave-hull-guess';
    expect(()=>parseOutlineExport(wrong,versionId,sha)).toThrow(/알고리즘/);
  });
});
