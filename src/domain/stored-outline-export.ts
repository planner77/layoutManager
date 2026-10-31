import type { StoredOutlineDto } from './typed-outline';
import { createGeneratedId } from './canvas-object-selection';
import { parseOutlineExport } from './outline-draft';
import { parseGeneratedTransfer, GENERATED_TRANSFER_MAX_BYTES } from './generated-transfer';
import { validatedGeneratedGeometry } from './generated-document';

type Context=Readonly<{versionId:string;sourceSha256:string;unitCode:number|null}>;
function checkedRows(rows:readonly StoredOutlineDto[],context:Context,mode:StoredOutlineDto['validationMode']){
  if(!rows.length||rows.length>100||new Set(rows.map(row=>row.id)).size!==rows.length)
    throw new Error('내보낼 서버 외곽선은 중복 없이 1~100개여야 합니다.');
  let vertices=0;
  for(const row of rows){
    if(row.versionId!==context.versionId||row.sourceSha256!==context.sourceSha256||row.validationMode!==mode||
      row.outlineTypeId!==(row.outlineType?.id??null))throw new Error('다른 도면·기하 기준의 외곽선을 함께 내보낼 수 없습니다.');
    const geometry=validatedGeneratedGeometry(row.geometry);
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
    for(const polygon of polygons)for(const ring of polygon)vertices+=ring.length;
  }
  if(vertices>100_000)throw new Error('내보낼 꼭짓점이 100,000개를 넘습니다. 트리에서 더 적은 외곽선을 선택하세요.');
}
function checkedSize(value:unknown){
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>GENERATED_TRANSFER_MAX_BYTES)
    throw new Error('서버 snapshot이 12 MiB를 넘습니다. 트리에서 더 적은 외곽선을 선택하세요.');
}
const envelope=(context:Context)=>({versionId:context.versionId,sourceSha256:context.sourceSha256,
  coordinateSystem:'DXF_WCS_XY' as const,unitCode:context.unitCode,persistence:'BROWSER_EXPORT_ONLY' as const,
  exportSource:'SERVER_SNAPSHOT' as const});

/** Display names are a read/export-time snapshot. No creation receipt is exported. */
export function buildStoredSourceExport(rows:readonly StoredOutlineDto[],context:Context){
  checkedRows(rows,context,'SOURCE_CANONICAL');
  const value={...envelope(context),schemaVersion:2 as const,outlines:rows.map((row,index)=>({
    id:'local-'+(index+1),serverOutlineId:row.id,serverInstanceName:row.name,createdAt:row.createdAt,
    outlineTypeId:row.outlineTypeId,outlineTypeName:row.outlineType?.name??null,
    name:row.outlineTypeId?row.name:null,
    result:{kind:row.kind,algorithm:row.kind==='CONVEX'?'monotone-chain-v1':'polygon-clipping-union-v1',
      geometry:structuredClone(row.geometry),baseGeometry:structuredClone(row.baseGeometry),
      transformOperations:structuredClone(row.operations),sourceEntityIds:[...row.sourceRefs],
      persistable:true,tolerance:0.02,warnings:[],durationMs:0},
  }))};
  checkedSize(value);parseOutlineExport(value,context.versionId,context.sourceSha256);
  return value;
}

/** A flat, non-attestable WCS snapshot; prior server edit history is not reconstructed. */
export function buildStoredAppExport(rows:readonly StoredOutlineDto[],context:Context,
  hidden:ReadonlySet<string>=new Set(),newId:()=>string=createGeneratedId){
  checkedRows(rows,context,'APP_CREATED');
  const serverIds=new Set(rows.map(row=>row.id)),transportIds=new Set<string>();
  const value={...envelope(context),format:'cad-generated-objects' as const,schemaVersion:2 as const,
    sourceAttestable:false as const,objects:rows.map((row,index)=>{
      let id='';for(let attempt=0;attempt<4;attempt++){id=newId();if(!serverIds.has(id)&&!transportIds.has(id))break;}
      if(serverIds.has(id)||transportIds.has(id))throw new Error('독립적인 브라우저 교환 ID를 만들지 못했습니다.');
      transportIds.add(id);
      return {id,serverOutlineId:row.id,savedOutlineId:'local-'+(index+1),origin:'APP_CREATED' as const,
        kind:row.kind,name:row.name,outlineTypeId:row.outlineTypeId,outlineTypeName:row.outlineType?.name??null,
        visible:!hidden.has(row.id),baseGeometry:structuredClone(row.geometry),
        baseResult:{kind:row.kind,algorithm:'server-wcs-snapshot-v1',tolerance:0.02,
          sourceEntityIds:[],persistable:false,geometryBasis:'RENDER_WCS_2D' as const,derivedFrom:[],
          warnings:['서버 조회 시점의 독립 WCS snapshot입니다. 원본 검증 자료나 편집 이력이 아닙니다.'],durationMs:0},
        transform:[1,0,0,1,0,0],transformOperations:[],editedGeometry:structuredClone(row.geometry),
        provenance:{origin:'APP_CREATED' as const,sourceAttestable:false as const,editedByUser:false},
        createdAt:row.createdAt,editedAt:null,edited:false};
    })};
  checkedSize(value);parseGeneratedTransfer(value,context,context.unitCode);
  return value;
}
