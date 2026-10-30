/** Issue #31 P4 foundation: strict, version-bound browser JSON draft parser.
 * Validation is necessary but NOT sufficient for server writes.
 * A future authorized write API MUST reconstruct geometry from immutable
 * server-owned DXF bytes, never trust client-supplied geometry/handles. */
import type {OutlineKind,XY} from '../viewers/core/outline-geometry';
import type {GeoJSONOutline} from '../viewers/core/outline-compute';
import type {SavedOutline,GeneratedOutlineObject} from '../viewers/core/adapter';
import {parseOutlineAssignmentMetadata} from './outline-assignment';
import {sceneScope,validSceneRef,sceneIdentity,type CadSceneObjectRef} from './cad-scene';
export type OutlineDraft={
  id:string;kind:OutlineKind;algorithm:string;
  sourceEntityIds:string[];geometry:GeoJSONOutline;
  tolerance:number;
  outlineTypeId:string|null;outlineTypeName:string|null;name:string|null;
};
export type ParsedOutlineExport={
  schemaVersion:1|2;versionId:string;sourceSha256:string;
  coordinateSystem:'DXF_WCS_XY';unitCode:number|null;outlines:OutlineDraft[];
};
export type ParsedAppOutlineExport=Readonly<{
  schemaVersion:3;versionId:string;sourceSha256:string;
  outlines:readonly {id:string;sceneRef:CadSceneObjectRef;geometry:GeoJSONOutline;geometryBasis:'RENDER_WCS_2D'|'SOURCE_DXF'}[];
}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=/^[0-9a-f]{64}$/i,handle=/^[0-9a-f]+$/i;
const MAX_OUTLINES=100,MAX_RINGS=2000,MAX_COORDINATES=100000;
const isObject=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
function obj(v:unknown,message:string):Record<string,unknown>{
  if(!isObject(v))throw new Error(message);
  return v;
}
function finite(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v);}
function parseGeometry(raw:unknown):GeoJSONOutline{
  const g=obj(raw,'외곽선 geometry 형식이 올바르지 않습니다.');
  if(g.type!=='Polygon'&&g.type!=='MultiPolygon')
    throw new Error('Polygon/MultiPolygon 이외 geometry를 저장할 수 없습니다.');
  if(!Array.isArray(g.coordinates))throw new Error('외곽선 coordinates 배열이 필요합니다.');
  const polyInputs=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  if(polyInputs.length<1||polyInputs.length>MAX_RINGS)throw new Error('Polygon 개수 제한을 벗어났습니다.');
  let ringCount=0,pointCount=0;
  const polygons:XY[][][]=[];
  for(const polygon of polyInputs){
    if(!Array.isArray(polygon)||polygon.length<1)throw new Error('빈 Polygon 또는 잘못된 Ring 배열입니다.');
    const rings:XY[][]=[];
    for(const original of polygon){
      if(!Array.isArray(original)||original.length<4||original.length>MAX_COORDINATES)
        throw new Error('Ring 꼭짓점 개수가 유효하지 않습니다.');
      if(++ringCount>MAX_RINGS)throw new Error('Ring 개수 제한을 초과했습니다.');
      if((pointCount+=original.length)>MAX_COORDINATES)throw new Error('좌표 개수 제한을 초과했습니다.');
      const ring:XY[]=[];
      for(const vertex of original){
        if(!Array.isArray(vertex)||vertex.length!==2||!finite(vertex[0])||
           !finite(vertex[1])||Math.abs(vertex[0])>1e12||Math.abs(vertex[1])>1e12)
          throw new Error('유효하지 않은 WCS XY 좌표입니다.');
        ring.push([vertex[0],vertex[1]]);
      }
      const first=ring[0],last=ring[ring.length-1];
      if(Math.hypot(first[0]-last[0],first[1]-last[1])>1e-8)
        throw new Error('닫히지 않은 Ring을 저장할 수 없습니다.');
      rings.push(ring);
    }
    polygons.push(rings);
  }
  return g.type==='Polygon'?{type:'Polygon',coordinates:polygons[0]}:
    {type:'MultiPolygon',coordinates:polygons};
}
/** Parse only with an explicit server-selected versionId + SHA256 context.
 * Reject transient/other-version references and malformed geometry before any
 * future storage service attempts to recompute/compare the result. */
export function parseOutlineExport(
  input:unknown,expectedVersionId:string,expectedSourceSha256:string,
):ParsedOutlineExport {
  if(!uuid.test(expectedVersionId)||!sha.test(expectedSourceSha256))
    throw new Error('검증된 도면 Version/SHA 정보가 없습니다.');
  const root=obj(input,'외곽선 JSON 객체가 필요합니다.');
  if((root.schemaVersion!==1&&root.schemaVersion!==2)||root.coordinateSystem!=='DXF_WCS_XY')
    throw new Error('외곽선 JSON 스키마/좌표계를 지원하지 않습니다.');
  if(root.versionId!==expectedVersionId||typeof root.sourceSha256!=='string'||
     root.sourceSha256.toLowerCase()!==expectedSourceSha256.toLowerCase())
    throw new Error('다른 Version 또는 SHA의 외곽선을 반영할 수 없습니다.');
  if(root.unitCode!==null&&
     (!Number.isInteger(root.unitCode)||typeof root.unitCode!=='number'||root.unitCode<0||root.unitCode>24))
    throw new Error('잘못된 INSUNITS 값입니다.');
  if(!Array.isArray(root.outlines)||root.outlines.length<1||root.outlines.length>MAX_OUTLINES)
    throw new Error('외곽선 개수 제한(1~100)을 확인해주세요.');
  const drafts:OutlineDraft[]=[];
  const ids=new Set<string>(),prefix=expectedVersionId+':'+expectedSourceSha256.toLowerCase()+':';
  for(const raw of root.outlines){
    const item=obj(raw,'외곽선 행은 객체여야 합니다.');
    if(typeof item.id!=='string'||!/^local-[1-9]\d*$/.test(item.id)||ids.has(item.id))
      throw new Error('임시 외곽선 ID가 잘못되었거나 중복되었습니다.');
    ids.add(item.id);
    const result=obj(item.result,'외곽선 result가 필요합니다.');
    if(result.kind!=='CONVEX'&&result.kind!=='PRECISE')
      throw new Error('외곽선 종류를 확인해주세요.');
    const kind=result.kind;
    const algorithm=kind==='CONVEX'?'monotone-chain-v1':'polygon-clipping-union-v1';
    if(result.algorithm!==algorithm||result.persistable!==true)
      throw new Error('미검증 알고리즘 또는 임시 Entity 참조입니다.');
    if(!Array.isArray(result.sourceEntityIds)||result.sourceEntityIds.length<1||
       result.sourceEntityIds.length>10000)throw new Error('원본 Entity 참조 개수가 올바르지 않습니다.');
    const sourceEntityIds=result.sourceEntityIds.map((v:unknown)=>{
      if(typeof v!=='string'||!v.startsWith(prefix)||!handle.test(v.slice(prefix.length))||
         v.slice(prefix.length)!==v.slice(prefix.length).toUpperCase())
        throw new Error('다른 Version 또는 불안정한 Entity Handle입니다.');
      return v;
    });
    if(new Set(sourceEntityIds).size!==sourceEntityIds.length)
      throw new Error('중복 EntityRef가 있습니다.');
    const geometry=parseGeometry(result.geometry);
    if(kind==='CONVEX'&&(geometry.type!=='Polygon'||geometry.coordinates.length!==1))
      throw new Error('볼록 외곽선은 단일 Polygon의 외부 Ring만 허용합니다.');
    if(!finite(result.tolerance)||result.tolerance<=0||result.tolerance>1000)
      throw new Error('외곽선 허용 오차를 확인해주세요.');
    const assignment=root.schemaVersion===2?parseOutlineAssignmentMetadata(item):null;
    drafts.push({id:item.id,kind,algorithm,sourceEntityIds,geometry,tolerance:result.tolerance,
      outlineTypeId:assignment?.outlineTypeId??null,outlineTypeName:assignment?.outlineTypeName??null,
      name:assignment?.name??null});
  }
  return {schemaVersion:root.schemaVersion as 1|2,versionId:expectedVersionId,
    sourceSha256:expectedSourceSha256.toLowerCase(),
    coordinateSystem:'DXF_WCS_XY',unitCode:root.unitCode as number|null,outlines:drafts};
}

/** Browser-only APP_CREATED envelope. Never accepted by the strict source parser/server gate. */
export function parseAppOutlineExport(input:unknown,expectedVersionId:string,expectedSourceSha256:string):ParsedAppOutlineExport{
  if(!uuid.test(expectedVersionId)||!sha.test(expectedSourceSha256))throw new Error('Version/SHA 범위가 유효하지 않습니다.');
  const root=obj(input,'APP_CREATED JSON 객체가 필요합니다.');
  if(root.schemaVersion!==3||root.geometryBasis!=='RENDER_WCS_2D'||root.sourceAttestable!==false||
     root.persistence!=='BROWSER_EXPORT_ONLY'||root.coordinateSystem!=='DXF_WCS_XY'||
     root.versionId!==expectedVersionId||root.sourceSha256!==expectedSourceSha256||
     !Array.isArray(root.outlines)||root.outlines.length<1||root.outlines.length>MAX_OUTLINES)
    throw new Error('APP_CREATED 렌더 JSON 스키마 또는 범위가 유효하지 않습니다.');
  if(root.unitCode!==null&&(!Number.isInteger(root.unitCode)||typeof root.unitCode!=='number'||
     root.unitCode<0||root.unitCode>24))throw new Error('APP_CREATED INSUNITS 값이 유효하지 않습니다.');
  const envelopeScope=sceneScope(expectedVersionId,expectedSourceSha256,
    root.unitCode===null?'UNSPECIFIED':'DXF_INSUNITS_'+root.unitCode);
  const ids=new Set<string>(),sceneIds=new Set<string>();
  const outlines=root.outlines.map(raw=>{
    const row=obj(raw,'APP_CREATED 행이 유효하지 않습니다.');
    const ref=obj(row.sceneRef,'APP_CREATED Scene ref가 없습니다.');
    const scope=envelopeScope;
    if(!validSceneRef(ref,scope)||ref.origin!=='APP_CREATED'||row.origin!=='APP_CREATED'||
       !uuid.test(String(ref.id))||ref.id!==row.objectId||
       typeof row.id!=='string'||!/^local-[1-9]\d*$/.test(row.id)||ids.has(row.id)||sceneIds.has(String(ref.id)))
      throw new Error('APP_CREATED ID/Origin이 유효하지 않습니다.');
    ids.add(row.id);sceneIds.add(String(ref.id));
    const result=obj(row.result,'APP_CREATED geometry가 없습니다.');
    const basis:'RENDER_WCS_2D'|'SOURCE_DXF'|null=result.geometryBasis==='RENDER_WCS_2D'?'RENDER_WCS_2D':
      result.geometryBasis===undefined?'SOURCE_DXF':null;
    if(!basis||result.persistable!==(basis==='SOURCE_DXF')||!Array.isArray(result.sourceEntityIds)||
       (basis==='RENDER_WCS_2D'&&result.sourceEntityIds.length!==0))
      throw new Error('렌더 결과를 원본 출처로 승격할 수 없습니다.');
    if(basis==='RENDER_WCS_2D'){
      if(result.derivedFrom!==undefined&&(!Array.isArray(result.derivedFrom)||result.derivedFrom.length>10000||
         result.derivedFrom.some(id=>typeof id!=='string'||!validSceneRef({
           ...scope,sceneId:sceneIdentity(scope),origin:'DXF_IMPORTED',id,
         },scope))))throw new Error('렌더 파생 Scene 참조가 유효하지 않습니다.');
    }else{
      const prefix=expectedVersionId+':'+expectedSourceSha256+':';
      if(!result.sourceEntityIds.length||result.sourceEntityIds.length>10000||
         result.sourceEntityIds.some(id=>typeof id!=='string'||!id.startsWith(prefix)||
           !handle.test(id.slice(prefix.length))||id.slice(prefix.length)!==id.slice(prefix.length).toUpperCase())||
         new Set(result.sourceEntityIds).size!==result.sourceEntityIds.length)
        throw new Error('원본 Handle 출처가 유효하지 않습니다.');
    }
    return {id:row.id,sceneRef:ref as CadSceneObjectRef,geometry:parseGeometry(result.geometry),geometryBasis:basis};
  });
  return {schemaVersion:3,versionId:expectedVersionId,sourceSha256:expectedSourceSha256,outlines};
}


/**
 * U5: preserve U3's untyped v1 export byte shape. Mixed/typed local sessions
 * export explicit v2 metadata; v1 parser and source/handle checks remain intact.
 * This function produces a browser DOWNLOAD, not a server-side write.
 */
export function buildOutlineExport(
  versionId:string,sourceSha256:string,unitCode:number|null,outlines:readonly SavedOutline[],
) {
  if(!uuid.test(versionId)||!sha.test(sourceSha256))
    throw new Error('검증된 Version/SHA 정보가 없어 JSON을 내보낼 수 없습니다.');
  const shared={versionId,sourceSha256,
    coordinateSystem:'DXF_WCS_XY' as const,unitCode,persistence:'BROWSER_EXPORT_ONLY' as const};
  if(outlines.some(o=>o.result.geometryBasis==='RENDER_WCS_2D')){
    return {schemaVersion:3 as const,...shared,geometryBasis:'RENDER_WCS_2D' as const,
      sourceAttestable:false as const,outlines:outlines.map(o=>{
        if(!o.sceneRef||o.sceneRef.origin!=='APP_CREATED'||o.sceneRef.versionId!==versionId||
           o.sceneRef.sourceSha256!==sourceSha256)
          throw new Error('APP_CREATED Scene 참조가 없는 결과는 내보낼 수 없습니다.');
        return {...o,origin:'APP_CREATED' as const,objectId:o.sceneRef.id};
      })};
  }
  if(!outlines.some(o=>o.outlineTypeId!==undefined))
    return {schemaVersion:1 as const,...shared,outlines:outlines.map(({sceneRef,...o})=>{void sceneRef;return o;})};
  const typed=outlines.map(o=>{
    const assignment=parseOutlineAssignmentMetadata({
      outlineTypeId:o.outlineTypeId??null,outlineTypeName:o.outlineTypeName??null,name:o.name??null,
    });
    const {sceneRef,...legacy}=o;void sceneRef;
    return {...legacy,outlineTypeId:assignment?.outlineTypeId??null,
      outlineTypeName:assignment?.outlineTypeName??null,name:assignment?.name??null};
  });
  return {schemaVersion:2 as const,...shared,outlines:typed};
}

/** #98 P2: package the immutable Source base and exact allowlisted edit
 * history for #97's independent server DXF canonical re-attestation.
 * An affine matrix alone is never a source-authorization proof.
 */
export function buildServerSourceOutlineExport(
 versionId:string,sourceSha256:string,unitCode:number|null,
 saved:SavedOutline,generated:GeneratedOutlineObject|undefined,
){
 const draft=buildOutlineExport(versionId,sourceSha256,unitCode,[saved]);
 if(draft.schemaVersion===3 || saved.result.geometryBasis==='RENDER_WCS_2D')
  throw new Error('렌더 WCS 외곽선은 원본 인증 JSON으로 저장할 수 없습니다.');
 if(!generated || generated.savedOutlineId!==saved.id ||
    !generated.transformOperations || generated.transformOperations.length>64 ||
    generated.edited && generated.transformOperations.length===0)
  throw new Error('원본 외곽선의 편집 이력을 확인할 수 없습니다.');
 return {...draft,outlines:[{...draft.outlines[0],result:{
  ...draft.outlines[0].result,baseGeometry:generated.baseGeometry,
  transformOperations:generated.transformOperations.map(op=>op.type==='Translate'
    ? {...op} : {...op,pivot:[...op.pivot]}),
 }}]};
}
