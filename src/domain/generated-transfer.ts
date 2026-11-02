/** Issue #56 E6: untrusted browser JSON v2; NOT a storage/authorization format. */
import type {CanvasObjectScope} from './canvas-object-selection';
import {createGeneratedId,validCanvasScope} from './canvas-object-selection';
import {GeneratedDocument,applyAffine,validatedGeneratedGeometry,
  type GeneratedRestoreEntry,type Affine2D,type GeneratedRigidOperation} from './generated-document';
import {parseOutlineExport} from './outline-draft';
import {inspectOutlineSnapshot} from './outline-snapshot-marker';
import type {OutlineResult,GeoJSONOutline} from '../viewers/core/outline-compute';

export const GENERATED_TRANSFER_MAX_BYTES=12*1024*1024;
export const GENERATED_TRANSFER_MAX_OPERATIONS=4096;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const row=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))
   throw new Error('JSON 객체 형식이 올바르지 않습니다.');
 return value as Record<string,unknown>;
};
const validDate=(value:unknown)=>typeof value==='string'&&value.length<=40&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)&&
 Number.isFinite(Date.parse(value));
const string=(value:unknown,label:string,max:number)=>{
 if(typeof value!=='string'||value.length>max)
  throw new Error(label+' 문자열이 유효하지 않습니다.');
 return value;
};
const optional=(value:unknown,label:string,max:number):string|null=>
 value===null||value===undefined?null:string(value,label,max);
const finite=(value:unknown,max=1e12):value is number=>
 typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=max;
const strings=(value:unknown,label:string,maxCount:number,maxSize:number):string[]=>{
 if(!Array.isArray(value)||value.length>maxCount)throw new Error(label+' 배열이 너무 큽니다.');
 const entries=value.map(v=>string(v,label,maxSize));
 if(entries.some(v=>!v)||new Set(entries).size!==entries.length)
   throw new Error(label+'에 빈 값 또는 중복이 있습니다.');
 return entries;
};
function operations(input:unknown):GeneratedRigidOperation[]{
 if(!Array.isArray(input)||input.length>GENERATED_TRANSFER_MAX_OPERATIONS)
   throw new Error('브라우저 JSON의 개체별 편집 작업은 최대 4,096개까지 허용됩니다.');
 return input.map((value):GeneratedRigidOperation=>{
   const op=row(value);
   if(op.type==='Translate'&&finite(op.dx)&&finite(op.dy))
     return {type:'Translate',dx:op.dx,dy:op.dy};
   if(op.type==='Rotate'&&finite(op.angleDegrees,360000)&&Array.isArray(op.pivot)&&
      op.pivot.length===2&&finite(op.pivot[0])&&finite(op.pivot[1]))
     return {type:'Rotate',angleDegrees:op.angleDegrees,pivot:[op.pivot[0],op.pivot[1]]};
   throw new Error('허용되지 않은 Rotate/Translate 작업입니다.');
 });
}
const unit=(value:unknown):number|null=>{
 if(value===null)return null;
 if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>24)
   throw new Error('DXF INSUNITS 정보가 유효하지 않습니다.');
 return value;
};
export function buildGeneratedTransfer(doc:GeneratedDocument,unitCode:number|null){
 if(!validCanvasScope(doc.scope))throw new Error('Version/SHA 범위가 유효하지 않습니다.');
 const objects=doc.getObjects().map(entry=>({
   id:entry.ref.id,savedOutlineId:entry.savedOutlineId,origin:'APP_CREATED' as const,
   kind:entry.kind,name:entry.name,outlineTypeId:entry.outlineTypeId,
   outlineTypeName:entry.outlineTypeName,visible:entry.visible,
   baseGeometry:entry.baseGeometry,baseResult:{
     kind:entry.kind,algorithm:entry.baseResult.algorithm,tolerance:entry.baseResult.tolerance,
     sourceEntityIds:entry.baseResult.sourceEntityIds,persistable:entry.baseResult.persistable,
     geometryBasis:entry.baseResult.geometryBasis??null,
     derivedFrom:entry.baseResult.derivedFrom??[],
     warnings:entry.baseResult.warnings,durationMs:entry.baseResult.durationMs,
   },
   transform:entry.transform,transformOperations:entry.transformOperations,
   editedGeometry:applyAffine(entry.baseGeometry,entry.transform),
   provenance:{origin:'APP_CREATED' as const,sourceAttestable:false,editedByUser:entry.edited},
   createdAt:entry.createdAt,editedAt:entry.editedAt,edited:entry.edited,
 }));
 return {format:'cad-generated-objects' as const,schemaVersion:2 as const,
   versionId:doc.scope.versionId,sourceSha256:doc.scope.sourceSha256,
   coordinateSystem:'DXF_WCS_XY' as const,unitCode:unit(unitCode),
   persistence:'BROWSER_EXPORT_ONLY' as const,sourceAttestable:false as const,objects};
}
export type GeneratedTransferParsed=Readonly<{
 entries:readonly GeneratedRestoreEntry[];legacy:boolean;
}>;
/** Parses all rows without touching a live Document. The actual commit occurs in
 * GeneratedDocument.replaceFromImport after independent affine/topology checks. */
export function parseGeneratedTransfer(input:unknown,scope:CanvasObjectScope,
 expectedUnitCode:number|null):GeneratedTransferParsed{
 if(!validCanvasScope(scope))throw new Error('검증된 Version/SHA 범위가 필요합니다.');
 const serialized=JSON.stringify(input);
 if(typeof serialized!=='string')throw new Error('생성 개체 JSON 객체가 필요합니다.');
 if(new TextEncoder().encode(serialized).byteLength>GENERATED_TRANSFER_MAX_BYTES)
   throw new Error('생성 개체 JSON 파일이 12 MiB를 초과합니다.');
 const root=row(input);
 if(root.versionId!==scope.versionId||
    typeof root.sourceSha256!=='string'||
    root.sourceSha256.toLowerCase()!==scope.sourceSha256.toLowerCase()||
    root.coordinateSystem!=='DXF_WCS_XY'||unit(root.unitCode)!==unit(expectedUnitCode))
   throw new Error('다른 Version/SHA 또는 DXF 단위의 JSON은 적용할 수 없습니다.');
 if(root.schemaVersion===1||(root.schemaVersion===2&&Array.isArray(root.outlines))){
   // #31 v1 and U5 typed v2: Source-only legacy, no UUID or transform.
   // Existing parser requires exact Source/Handle validation; never invent a type.
   const legacy=parseOutlineExport(input,scope.versionId,scope.sourceSha256);
   const rawRows=root.outlines as unknown[];
   const snapshot=inspectOutlineSnapshot(root,rawRows,'source');
   const now=new Date().toISOString();
   const restored=legacy.outlines.map((item,i)=>{
     const original=row(rawRows[i]),createdAt=validDate(original.createdAt)?original.createdAt as string:now;
     return {id:snapshot.marked?'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'):createGeneratedId(),savedOutlineId:item.id,createdAt,editedAt:null,
       name:snapshot.marked?snapshot.names[i]:item.name??'',outlineTypeId:item.outlineTypeId,
       outlineTypeName:item.outlineTypeName,
       baseResult:{kind:item.kind,algorithm:item.algorithm,geometry:item.geometry,
         tolerance:item.tolerance,sourceEntityIds:item.sourceEntityIds,persistable:true,
         warnings:[],durationMs:0},
       transform:[1,0,0,1,0,0] as Affine2D,transformOperations:[],
       visible:true,edited:false};
   });
   if(snapshot.marked)new GeneratedDocument(scope).replaceFromImport(restored);
   return {legacy:true,entries:snapshot.marked?restored.map(entry=>({...entry,id:createGeneratedId()})):restored};
 }
 if(root.format!=='cad-generated-objects'||root.schemaVersion!==2||
    root.persistence!=='BROWSER_EXPORT_ONLY'||root.sourceAttestable!==false||
    !Array.isArray(root.objects)||root.objects.length>100)
   throw new Error('생성 개체 JSON v2 형식이 유효하지 않습니다.');
 const snapshot=inspectOutlineSnapshot(root,root.objects,'generated');
 const ids=new Set<string>(),ordinals=new Set<string>();
 let count=0;
 const entries=root.objects.map(inputRow=>{
   const object=row(inputRow),base=row(object.baseResult),provenance=row(object.provenance);
   if(object.origin!=='APP_CREATED'||provenance.origin!=='APP_CREATED'||
      provenance.sourceAttestable!==false||provenance.editedByUser!==object.edited)
     throw new Error('생성 개체 Origin/Provenance 주장이 유효하지 않습니다.');
   const id=string(object.id,'UUID',36),savedOutlineId=string(object.savedOutlineId,'로컬 ID',24);
   if(!UUID.test(id)||ids.has(id)||!/^local-[1-9]\d{0,12}$/.test(savedOutlineId)||
       ordinals.has(savedOutlineId))
     throw new Error('중복 또는 잘못된 생성 ID입니다.');
   ids.add(id);ordinals.add(savedOutlineId);
   if((object.kind!=='CONVEX'&&object.kind!=='PRECISE')||base.kind!==object.kind||
      typeof base.algorithm!=='string'||base.algorithm.length>100||
      !finite(base.tolerance,1000)||base.tolerance<=0||
      typeof base.persistable!=='boolean'||
      !finite(base.durationMs,1e9)||base.durationMs<0||
      (base.geometryBasis!==null&&base.geometryBasis!=='RENDER_WCS_2D')||
      typeof object.visible!=='boolean'||typeof object.edited!=='boolean')
     throw new Error('생성 외곽선 Kind/Algorithm/Geometry Basis가 유효하지 않습니다.');
   const sourceEntityIds=strings(base.sourceEntityIds,'Source 참조',10000,250);
   const derivedFrom=strings(base.derivedFrom,'파생 Scene 참조',10000,250);
   const warnings=Array.isArray(base.warnings)&&base.warnings.length<=50?
     base.warnings.map(v=>string(v,'경고',500)):(()=>{throw new Error('경고 개수가 너무 많습니다.');})();
   if(base.geometryBasis==='RENDER_WCS_2D'&&(base.persistable!==false||sourceEntityIds.length>0)||
      base.geometryBasis===null&&!sourceEntityIds.length)
     throw new Error('렌더 결과를 원본 Source로 승격할 수 없습니다.');
   const geometry=validatedGeneratedGeometry(object.baseGeometry as GeoJSONOutline);
   const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
   count+=polygons.reduce((total,poly)=>total+poly.reduce((n,ring)=>n+ring.length,0),0);
   if(count>100000)throw new Error('문서 꼭짓점 100,000개 상한을 초과했습니다.');
   const opList=operations(object.transformOperations);
   if(!Array.isArray(object.transform)||object.transform.length!==6||
      !object.transform.every(v=>finite(v,4e12)))
     throw new Error('2D Affine 변환이 유효하지 않습니다.');
   const matrix=object.transform as unknown as Affine2D;
   // Geometry is NEVER accepted on trust. It must match the reconstructed edit.
   const recomputed=applyAffine(geometry,matrix);
   validatedGeneratedGeometry(recomputed);
   if(JSON.stringify(recomputed)!==JSON.stringify(object.editedGeometry))
     throw new Error('JSON 편집 Geometry와 WCS 변환 결과가 다릅니다.');
   if(!validDate(object.createdAt)||
      (object.editedAt!==null&&!validDate(object.editedAt)))
     throw new Error('생성·편집 시간이 유효하지 않습니다.');
   return {id,savedOutlineId,name:string(object.name,'이름',100),
     outlineTypeId:optional(object.outlineTypeId,'업무 타입 ID',128),
     outlineTypeName:optional(object.outlineTypeName,'업무 타입명',100),
     visible:object.visible,edited:object.edited,
     createdAt:object.createdAt as string,editedAt:object.editedAt as string|null,
     baseResult:{kind:object.kind,algorithm:base.algorithm,geometry,
       tolerance:base.tolerance,sourceEntityIds,persistable:base.persistable,
       ...(base.geometryBasis==='RENDER_WCS_2D'?{geometryBasis:'RENDER_WCS_2D' as const,derivedFrom}:{}),
       warnings,durationMs:base.durationMs} as OutlineResult,
     transform:[...matrix] as unknown as Affine2D,transformOperations:opList};
 });
 if(snapshot.marked)new GeneratedDocument(scope).replaceFromImport(entries);
 return {legacy:false,entries:snapshot.marked?entries.map((entry,index)=>({
   ...entry,id:createGeneratedId(),savedOutlineId:'local-'+(index+1),
 })):entries};
}
