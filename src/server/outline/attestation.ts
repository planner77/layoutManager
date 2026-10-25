/** Issue #31 P4 trust-boundary primitive (NO HTTP write route).
 * Never persist an exported outline without re-opening the exact, immutable
 * server-owned DXF version and recomputing the geometry from verified handles.
 * This module is intentionally not an authorization or storage service.
 */
import {createHash} from 'node:crypto';
import polygonClipping from 'polygon-clipping';
import {CadError} from '@/domain/cad';
import {parseOutlineExport} from '@/domain/outline-draft';
import {computeOutline,type GeoJSONOutline,type OutlineResult} from '@/viewers/core/outline-compute';
import {parseDxfOutlineIndex,type XY} from '@/viewers/core/outline-geometry';

// Matches the viewer's fixed, documented tolerance; a client cannot widen it.
export const OUTLINE_CANONICAL_TOLERANCE=0.02;
type WcsMultiPolygon=XY[][][];
function multiPolygon(geometry:GeoJSONOutline):WcsMultiPolygon{
 return geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
}
function areaRing(ring:XY[]){
 // Use the first vertex as origin: direct shoelace cancellation loses
 // small (yet valid) WCS areas around coordinates such as 1e9.
 const [x,y]=ring[0];
 let twiceArea=0;
 for(let i=1;i+1<ring.length;i++)
   twiceArea+=(ring[i][0]-x)*(ring[i+1][1]-y)-
     (ring[i][1]-y)*(ring[i+1][0]-x);
 return Math.abs(twiceArea/2);
}
function areaMultiPolygon(poly:WcsMultiPolygon) {
 return poly.reduce((sum,rings)=>sum+areaRing(rings[0])-
   rings.slice(1).reduce((n,r)=>n+areaRing(r),0),0);
}
function equalGeometry(expected:GeoJSONOutline,actual:GeoJSONOutline):boolean {
 try {
   const subject=multiPolygon(expected),supplied=multiPolygon(actual);
   const symmetric=polygonClipping.xor(subject,supplied);
   const lost=areaMultiPolygon(symmetric);
   const reference=areaMultiPolygon(subject);
   // Floating point/canonical ring order variations are allowed only when
   // they carry effectively no area. Server output is ALWAYS the canonical one.
   return Number.isFinite(lost)&&Number.isFinite(reference)&&reference>0&&
     lost<=Math.max(1e-8,reference*1e-10);
 }catch {
   return false;
 }
}
export type AttestedOutline={
  sourceEntityIds:string[];
  kind:'CONVEX'|'PRECISE';
  algorithm:string;
  geometry:GeoJSONOutline;
  tolerance:number;
};
export type AttestedOutlineBatch={
  versionId:string; sourceSha256:string; unitCode:number|null;
  outlines:AttestedOutline[];
};
export function attestOutlineDraftAgainstImmutableDxf(
  input:unknown,versionId:string,sourceSha256:string,sourceBytes:Uint8Array,
):AttestedOutlineBatch {
 if(sourceBytes.byteLength===0||sourceBytes.byteLength>100*1024*1024)
   throw new CadError('OUTLINE_SOURCE_SIZE','검증 가능한 도면 크기 제한을 초과했습니다.',413);
 const hash=createHash('sha256').update(sourceBytes).digest('hex');
 if(hash!==sourceSha256.toLowerCase())
   throw new CadError('OUTLINE_SOURCE_CHANGED','기준 도면의 SHA가 일치하지 않습니다.',409);
 let text:string;
 try { text=new TextDecoder('utf-8',{fatal:true}).decode(sourceBytes); }
 catch {throw new CadError('OUTLINE_SOURCE_ENCODING','UTF-8 ASCII DXF만 검증할 수 있습니다.',422);}
 let draft:ReturnType<typeof parseOutlineExport>;
 try { draft=parseOutlineExport(input,versionId,sourceSha256); }
 catch {throw new CadError('OUTLINE_INVALID_EXPORT','외곽선 내보내기 데이터가 유효하지 않습니다.',400);}
 if(!input||typeof input!=='object'||Array.isArray(input)||
   (input as {persistence?:unknown}).persistence!=='BROWSER_EXPORT_ONLY')
   throw new CadError('OUTLINE_EXPORT_ORIGIN','허용되지 않은 외곽선 JSON 형식입니다.',400);
 const index=parseDxfOutlineIndex(text,versionId,sourceSha256);
 if(draft.unitCode!==index.unitCode)
   throw new CadError('OUTLINE_UNITS_MISMATCH','도면 단위가 일치하지 않습니다.',409);
 const entities=new Map(index.entities.filter(e=>e.stable).map(e=>[e.id,e]));
 const outlines:AttestedOutline[]=[];
 for(const item of draft.outlines){
   if(item.tolerance!==OUTLINE_CANONICAL_TOLERANCE)
     throw new CadError('OUTLINE_TOLERANCE_UNSUPPORTED','서버 외곽선 허용 오차와 일치하지 않습니다.',409);
   const selected=item.sourceEntityIds.map(id=>entities.get(id));
   if(selected.some(e=>!e))
     throw new CadError('OUTLINE_UNKNOWN_ENTITY','원본에 없는 Entity 참조입니다.',409);
   let result:OutlineResult;
   try {result=computeOutline(item.kind,selected.filter((e):e is NonNullable<typeof e>=>!!e),OUTLINE_CANONICAL_TOLERANCE);}
   catch {throw new CadError('OUTLINE_UNSUPPORTED_SOURCE','원본 도형을 재계산할 수 없습니다.',422);}
   if(!result.persistable || !equalGeometry(result.geometry,item.geometry))
     throw new CadError('OUTLINE_GEOMETRY_MISMATCH','원본과 외곽선 결과가 일치하지 않습니다.',409);
   outlines.push({kind:result.kind,algorithm:result.algorithm,
     sourceEntityIds:result.sourceEntityIds,geometry:result.geometry,tolerance:result.tolerance});
 }
 return {versionId,sourceSha256:hash,unitCode:index.unitCode,outlines};
}
