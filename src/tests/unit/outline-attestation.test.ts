import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {CadError} from '../../domain/cad';
import {attestOutlineDraftAgainstImmutableDxf} from '../../server/outline/attestation';
import {parseDxfOutlineIndex} from '../../viewers/core/outline-geometry';
import {computeOutline,type GeoJSONOutline} from '../../viewers/core/outline-compute';

const versionId='11111111-1111-4111-8111-111111111111';
function fixture(){
 const dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','1A','8','0','70','1',
  '10','0','20','0','10','10','20','0','10','10','20','10','10','0','20','10',
  '0','ENDSEC','0','EOF',''].join('\n');
 const bytes=new TextEncoder().encode(dxf);
 const sha=createHash('sha256').update(bytes).digest('hex');
 const source=parseDxfOutlineIndex(dxf,versionId,sha);
 const original=computeOutline('PRECISE',source.entities);
 const input={schemaVersion:1,versionId,sourceSha256:sha,
   coordinateSystem:'DXF_WCS_XY',persistence:'BROWSER_EXPORT_ONLY',
   unitCode:4,outlines:[{id:'local-1',createdAt:'2026-10-16T10:00:00Z',
     result:{...original}}]};
 return {bytes,sha,input};
}
function matches(error:unknown,code:string){
 return error instanceof CadError && error.code===code;
}
describe('Issue #31 immutable DXF P4 attestation (no server writes)',()=>{
 it('TC-OUT-CANON-001: recomputes real source geometry, retaining canonical WCS XY',()=>{
   const f=fixture();
   const out=attestOutlineDraftAgainstImmutableDxf(f.input,versionId,f.sha,f.bytes);
   expect(out.unitCode).toBe(4);
   expect(out.outlines).toHaveLength(1);
   expect(out.outlines[0].kind).toBe('PRECISE');
   expect(out.outlines[0].sourceEntityIds).toEqual([versionId+':'+f.sha+':1A']);
   expect(out.outlines[0].geometry.type).toBe('Polygon');
 });
 it('TC-OUT-CANON-002: tampered coordinates and source bytes cannot pass',()=>{
   const f=fixture();
   const g=f.input.outlines[0].result.geometry as GeoJSONOutline;
   if(g.type!=='Polygon')throw new Error('expected Polygon fixture');
   g.coordinates[0][1][0]=11;
   try{
     attestOutlineDraftAgainstImmutableDxf(f.input,versionId,f.sha,f.bytes);
     throw new Error('Must reject tampered geometry');
   }catch(error){expect(matches(error,'OUTLINE_GEOMETRY_MISMATCH')).toBe(true);}
   const clean=fixture();
   const changed=clean.bytes.slice();
   changed[changed.length-4]^=1;
   try{
     attestOutlineDraftAgainstImmutableDxf(clean.input,versionId,clean.sha,changed);
     throw new Error('Must reject changed CAD bytes');
   }catch(error){expect(matches(error,'OUTLINE_SOURCE_CHANGED')).toBe(true);}
 });
 it('TC-OUT-CANON-003: mismatched SHA/version/units are rejected before storage',()=>{
   const f=fixture();
   expect(()=>attestOutlineDraftAgainstImmutableDxf(f.input,versionId,'b'.repeat(64),f.bytes))
     .toThrowError();
   expect(()=>attestOutlineDraftAgainstImmutableDxf(f.input,'22222222-2222-4222-8222-222222222222',f.sha,f.bytes))
     .toThrowError();
   f.input.unitCode=1;
   try{
     attestOutlineDraftAgainstImmutableDxf(f.input,versionId,f.sha,f.bytes);
     throw new Error('Must reject wrong units');
   }catch(error){expect(matches(error,'OUTLINE_UNITS_MISMATCH')).toBe(true);}
 });
 it('TC-OUT-CANON-005: arbitrary client tolerance cannot turn open linework into an accepted polygon',()=>{
   const sample=fixture();
   sample.input.outlines[0].result.tolerance=1000;
   try{
     attestOutlineDraftAgainstImmutableDxf(sample.input,versionId,sample.sha,sample.bytes);
     throw new Error('Must reject a client-supplied broad endpoint tolerance');
   }catch(error){expect(matches(error,'OUTLINE_TOLERANCE_UNSUPPORTED')).toBe(true);}
 });
 it('TC-OUT-CANON-004: fabricated or duplicate handles cannot be attested',()=>{
   const f=fixture();
   f.input.outlines[0].result.sourceEntityIds=[versionId+':'+f.sha+':AB'];
   try{
     attestOutlineDraftAgainstImmutableDxf(f.input,versionId,f.sha,f.bytes);
     throw new Error('Must reject fabricated source handle');
   }catch(error){expect(matches(error,'OUTLINE_UNKNOWN_ENTITY')).toBe(true);}
 });
});
