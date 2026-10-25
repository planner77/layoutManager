/**
 * Issue #97 / P4-D2. Server-owned, offline-only DXF source + rigid WCS XY
 * transform attestation. This is NOT authentication, storage, CRUD or an API.
 *
 * Existing v1/v2 canonical browser exports remain supported. For an edited
 * outline, result.baseGeometry is the unedited source-derived geometry and
 * result.transformOperations is an ordered sequence of Translate/Rotate steps.
 * result.geometry is a non-authoritative effective-geometry claim. An optional
 * result.transform is ONLY a claim checked against the server-composed matrix.
 * Raw affine matrices alone never authorize an edit.
 */
import {CadError} from '@/domain/cad';
import {parseOutlineExport} from '@/domain/outline-draft';
import {
  attestOutlineDraftAgainstImmutableDxf,OUTLINE_CANONICAL_TOLERANCE,
} from './attestation';
import type {GeoJSONOutline} from '@/viewers/core/outline-compute';
import type {XY} from '@/viewers/core/outline-geometry';

export const OUTLINE_TRANSFORM_STEP_LIMIT=64;
export type ServerAffine2D=readonly [number,number,number,number,number,number];
export type ServerTransformOperation=
 | Readonly<{type:'Translate';dx:number;dy:number}>
 | Readonly<{type:'Rotate';angleDegrees:number;pivot:readonly [number,number]}>;
export type AttestedTransformedOutline={
  clientLocalId:string;
  kind:'CONVEX'|'PRECISE';
  algorithm:string;
  algorithmVersion:string;
  sourceEntityIds:string[];
  // These labels are syntactically checked but not authorized catalog entries.
  outlineTypeId:string|null;
  outlineTypeName:string|null;
  name:string|null;
  baseGeometry:GeoJSONOutline;
  transform:ServerAffine2D;
  effectiveGeometry:GeoJSONOutline;
  tolerance:number;
};
export type AttestedTransformedOutlineBatch={
  schemaVersion:1|2;
  versionId:string;
  sourceSha256:string;
  unitCode:number|null;
  outlines:AttestedTransformedOutline[];
};

const MAX_WCS=1e12;
const MAX_DEGREES=360_000;
const IDENTITY:ServerAffine2D=[1,0,0,1,0,0];
const SHA=/^[a-f0-9]{64}$/i;
const HANDLE=/^[0-9A-F]+$/;
const object=(v:unknown):v is Record<string,unknown>=>
  typeof v==='object' && v!==null && !Array.isArray(v);
function error(code:string,message:string,status=400):never {
  throw new CadError(code,message,status);
}
function coordinate(v:unknown):v is number{
  return typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=MAX_WCS;
}
function onlyKeys(o:Record<string,unknown>,keys:readonly string[]):boolean{
  return Object.keys(o).length===keys.length&&Object.keys(o).every(key=>keys.includes(key));
}
function parseOperations(raw:unknown):ServerTransformOperation[]{
  if(raw===undefined)return [];
  if(!Array.isArray(raw)||raw.length>OUTLINE_TRANSFORM_STEP_LIMIT)
    return error('OUTLINE_TRANSFORM_INVALID','이동·회전 단계 형식/개수(최대 64)가 올바르지 않습니다.');
  return raw.map((step:unknown):ServerTransformOperation=>{
    if(!object(step))
      return error('OUTLINE_TRANSFORM_INVALID','이동·회전 단계가 객체가 아닙니다.');
    if(step.type==='Translate'){
      if(!onlyKeys(step,['type','dx','dy'])||
        !coordinate(step.dx)||!coordinate(step.dy))
        return error('OUTLINE_TRANSFORM_INVALID','WCS XY 이동량 또는 속성이 잘못되었습니다.');
      return {type:'Translate',dx:step.dx,dy:step.dy};
    }
    if(step.type==='Rotate'){
      if(!onlyKeys(step,['type','angleDegrees','pivot'])||
         typeof step.angleDegrees!=='number'||
         !Number.isFinite(step.angleDegrees)||Math.abs(step.angleDegrees)>MAX_DEGREES||
         !Array.isArray(step.pivot)||step.pivot.length!==2||
         !coordinate(step.pivot[0])||!coordinate(step.pivot[1]))
        return error('OUTLINE_TRANSFORM_INVALID','회전 각도·pivot 또는 속성이 잘못되었습니다.');
      return {type:'Rotate',angleDegrees:step.angleDegrees,
        pivot:[step.pivot[0],step.pivot[1]]};
    }
    return error('OUTLINE_TRANSFORM_UNSUPPORTED','Translate/Rotate 이외의 변환은 지원하지 않습니다.',422);
  });
}
/** The server implementation is deliberately independent of GeneratedDocument. */
function compose(left:ServerAffine2D,right:ServerAffine2D):ServerAffine2D {
  const [a,b,c,d,e,f]=left,[g,h,i,j,k,l]=right;
  return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];
}
function rigid(m:ServerAffine2D):boolean {
  const [a,b,c,d]=m;
  return [a,b,c,d,m[4],m[5]].every(coordinate) &&
    Math.abs(a*a+b*b-1)<=1e-9 && Math.abs(c*c+d*d-1)<=1e-9 &&
    Math.abs(a*c+b*d)<=1e-9 && Math.abs(a*d-b*c-1)<=1e-9;
}
function fromOperations(operations:readonly ServerTransformOperation[]):ServerAffine2D {
  let matrix:ServerAffine2D=IDENTITY;
  for(const step of operations){
    let left:ServerAffine2D;
    if(step.type==='Translate')left=[1,0,0,1,step.dx,step.dy];
    else {
      const radians=step.angleDegrees*Math.PI/180;
      const c=Math.cos(radians),s=Math.sin(radians);
      const [px,py]=step.pivot;
      left=[c,s,-s,c,px-px*c+py*s,py-px*s-py*c];
    }
    matrix=compose(left,matrix);
    if(!rigid(matrix))
      return error('OUTLINE_TRANSFORM_RANGE','변환 행렬의 정밀도·WCS 범위가 허용되지 않습니다.',422);
  }
  return matrix;
}
function checkClaimedMatrix(raw:unknown,matrix:ServerAffine2D,hasOperations:boolean):void {
  if(raw===undefined)return;
  if(!hasOperations)
    return error('OUTLINE_TRANSFORM_UNSUPPORTED','임의 affine만으로 편집을 승인할 수 없습니다.',422);
  if(!Array.isArray(raw)||raw.length!==6||
     !raw.every(coordinate)||!rigid(raw as unknown as ServerAffine2D))
    return error('OUTLINE_AFFINE_UNSUPPORTED','scale/shear/reflect/Z 또는 잘못된 affine은 허용되지 않습니다.',422);
  for(let i=0;i<6;i++){
    // Float serialization tolerance only; geometry is still recomputed.
    const allowed=Math.max(1e-8,4*Number.EPSILON*Math.abs(matrix[i]));
    if(Math.abs(raw[i]-matrix[i])>allowed)
      return error('OUTLINE_AFFINE_MISMATCH','변환 이력과 affine 값이 일치하지 않습니다.',409);
  }
}
function polygons(g:GeoJSONOutline):XY[][][]{
  return g.type==='Polygon'?[g.coordinates]:g.coordinates;
}
function area(ring:XY[]):number {
  const [x,y]=ring[0];
  let sum=0;
  for(let i=1;i+1<ring.length;i++)
    sum+=(ring[i][0]-x)*(ring[i+1][1]-y)-
         (ring[i][1]-y)*(ring[i+1][0]-x);
  return sum/2;
}
function applyAndVerify(base:GeoJSONOutline,matrix:ServerAffine2D):GeoJSONOutline {
  let vertices=0;
  const transformed=polygons(base).map(polygon=>{
    if(!polygon.length)return error('OUTLINE_BASE_INVALID','비어 있는 Polygon입니다.',422);
    return polygon.map(ring=>{
      if(ring.length<4||(vertices+=ring.length)>100_000)
        return error('OUTLINE_BASE_INVALID','Ring/정점 상한을 벗어났습니다.',422);
      const moved=ring.map(([x,y]):XY=>{
        const p:XY=[
          matrix[0]*x+matrix[2]*y+matrix[4],
          matrix[1]*x+matrix[3]*y+matrix[5],
        ];
        if(!coordinate(p[0])||!coordinate(p[1]))
          return error('OUTLINE_TRANSFORM_RANGE','변환 결과가 WCS 1e12 범위를 초과합니다.',422);
        return p;
      });
      const first=moved[0],last=moved[moved.length-1];
      if(Math.hypot(first[0]-last[0],first[1]-last[1])>1e-8)
        return error('OUTLINE_GEOMETRY_INVALID','변환된 Ring 폐합이 깨졌습니다.',422);
      const before=area(ring),after=area(moved);
      if(!Number.isFinite(before)||!Number.isFinite(after)||
         Math.abs(before)<=1e-14||Math.sign(before)!==Math.sign(after)||
         Math.abs(after-before)>Math.max(1e-7,Math.abs(before)*1e-8))
        return error('OUTLINE_GEOMETRY_INVALID','강체 이동·회전의 Ring 방향/면적 불변 조건에 위배됩니다.',422);
      return moved;
    });
  });
  return base.type==='Polygon'
    ? {type:'Polygon',coordinates:transformed[0]}
    : {type:'MultiPolygon',coordinates:transformed};
}
/** Strict topology and vertex correspondence; altered Hole/ring layout is never trusted. */
function equalEffective(expected:GeoJSONOutline,claim:GeoJSONOutline):boolean{
  if(expected.type!==claim.type)return false;
  const a=polygons(expected),b=polygons(claim);
  if(a.length!==b.length)return false;
  return a.every((polygon,i)=>polygon.length===b[i].length&&
    polygon.every((ring,j)=>ring.length===b[i][j].length&&
      ring.every((p,k)=>p.every((v,axis)=>{
        const actual=b[i][j][k][axis];
        return Math.abs(actual-v)<=Math.max(1e-8,4*Number.EPSILON*Math.abs(v));
      }))));
}
/** Root INSERT handles are stable and include resolved WCS BLOCK geometry.
 * The present DXF source index does not issue nested child instance IDs:
 * non-empty instancePath MUST fail, not be silently discarded.
 */
function verifySourceRefs(raw:unknown,ids:readonly string[],versionId:string,sha:string):void{
  if(raw===undefined)return;
  if(!Array.isArray(raw)||raw.length!==ids.length)
    return error('OUTLINE_SOURCE_REF_INVALID','SourceRef 개수가 Entity ID와 다릅니다.',400);
  const prefix=versionId+':'+sha.toLowerCase()+':';
  for(let i=0;i<raw.length;i++){
    const ref:unknown=raw[i];
    if(!object(ref)||
       !onlyKeys(ref,['versionId','sourceSha256','handle','instancePath'])||
       ref.versionId!==versionId||
       typeof ref.sourceSha256!=='string'||!SHA.test(ref.sourceSha256)||
       ref.sourceSha256.toLowerCase()!==sha.toLowerCase()||
       typeof ref.handle!=='string'||!HANDLE.test(ref.handle)||
       prefix+ref.handle!==ids[i]||
       !Array.isArray(ref.instancePath))
      return error('OUTLINE_SOURCE_REF_INVALID','Version/SHA/Stable Handle 참조가 일치하지 않습니다.',409);
    if(ref.instancePath.length!==0)
      return error('OUTLINE_INSTANCE_PATH_UNSUPPORTED','중첩 BLOCK child instancePath는 아직 안정적으로 검증되지 않습니다.',422);
  }
}

/**
 * Accept canonical v1/v2 or their explicit D2 transform extension.
 * Never use client baseGeometry, claimed transform or result.geometry as output.
 * D3 must separately enforce authenticated permission, Site/Version Scope, CAS,
 * active OutlineType and atomic audit BEFORE any persistence.
 */
export function attestTransformedOutlineDraftAgainstImmutableDxf(
  input:unknown,versionId:string,sourceSha256:string,sourceBytes:Uint8Array,
):AttestedTransformedOutlineBatch {
  let parsed:ReturnType<typeof parseOutlineExport>;
  try {parsed=parseOutlineExport(input,versionId,sourceSha256);}
  catch {return error('OUTLINE_INVALID_EXPORT','외곽선 JSON v1/v2 형식이 유효하지 않습니다.');}
  if(!object(input)||!Array.isArray(input.outlines))
    return error('OUTLINE_INVALID_EXPORT','외곽선 JSON 객체가 필요합니다.');
  const rawRows=input.outlines as unknown[];
  const operations:ServerTransformOperation[][]=[];
  const sanitizedRows=rawRows.map((raw,index)=>{
    if(!object(raw)||!object(raw.result))
      return error('OUTLINE_INVALID_EXPORT','외곽선 result가 유효하지 않습니다.');
    const result=raw.result;
    for(const key of ['matrix','affine','effectiveGeometry','scale','shear','reflect','z']){
      if(key in result)
        return error('OUTLINE_TRANSFORM_UNSUPPORTED','허용되지 않는 편집 속성입니다.',422);
    }
    const steps=parseOperations(result.transformOperations);
    if(steps.length>0 && result.baseGeometry===undefined)
      return error('OUTLINE_BASE_REQUIRED','편집 시 원본 baseGeometry가 필요합니다.');
    if(result.transform!==undefined&&result.transformOperations===undefined)
      return error('OUTLINE_TRANSFORM_UNSUPPORTED','이력 없는 raw affine은 허용되지 않습니다.',422);
    if(result.algorithmVersion!==undefined&&result.algorithmVersion!==parsed.outlines[index].algorithm)
      return error('OUTLINE_ALGORITHM_MISMATCH','지원하지 않는 알고리즘 버전입니다.',409);
    operations.push(steps);
    // Reuse the existing SHA/handle/tolerance/canonical attestation unchanged.
    // It compares this untrusted base claim with independently parsed source.
    return {...raw,result:{...result,geometry:result.baseGeometry??result.geometry}};
  });
  const canonical=attestOutlineDraftAgainstImmutableDxf(
    {...input,outlines:sanitizedRows},versionId,sourceSha256,sourceBytes,
  );
  const outlines=canonical.outlines.map((base,index):AttestedTransformedOutline=>{
    const original=rawRows[index] as Record<string,unknown>;
    const result=original.result as Record<string,unknown>;
    verifySourceRefs(result.sourceEntityRefs,base.sourceEntityIds,versionId,sourceSha256);
    const matrix=fromOperations(operations[index]);
    checkClaimedMatrix(result.transform,matrix,result.transformOperations!==undefined);
    const effective=applyAndVerify(base.geometry,matrix);
    if(!equalEffective(effective,parsed.outlines[index].geometry))
      return error('OUTLINE_GEOMETRY_MISMATCH','편집 좌표와 서버 재계산 결과가 다릅니다.',409);
    const meta=parsed.outlines[index];
    return {
      clientLocalId:meta.id,kind:base.kind,algorithm:base.algorithm,
      algorithmVersion:base.algorithm,
      sourceEntityIds:[...base.sourceEntityIds],outlineTypeId:meta.outlineTypeId,
      outlineTypeName:meta.outlineTypeName,name:meta.name,
      baseGeometry:base.geometry,transform:matrix,effectiveGeometry:effective,
      tolerance:OUTLINE_CANONICAL_TOLERANCE,
    };
  });
  return {...canonical,schemaVersion:parsed.schemaVersion,outlines};
}
