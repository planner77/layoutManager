import { applyAffine, composeAffine, generatedRigidMatrix, IDENTITY_2D, validatedGeneratedGeometry,
  type Affine2D, type GeneratedRigidOperation } from './generated-document';
import type { GeoJSONOutline } from '@/viewers/core/outline-compute';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const name=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=100&&
  value.trim().normalize('NFC')===value&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
const object=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('서버 snapshot 행이 유효하지 않습니다.');
  return value as Record<string,unknown>;
};
const keys=(row:Record<string,unknown>,allowed:readonly string[])=>{
  if(Object.keys(row).some(key=>!allowed.includes(key)))throw new Error('서버 snapshot에 허용되지 않은 상태가 포함되어 있습니다.');
};

/** Structural transport marker only; never a server proof or a permission. */
export function inspectOutlineSnapshot(
  root:Record<string,unknown>,rows:readonly unknown[],kind:'source'|'generated',
):{marked:boolean;names:string[]}{
  const marked=Object.hasOwn(root,'exportSource');
  if(marked&&root.exportSource!=='SERVER_SNAPSHOT')throw new Error('지원하지 않는 외곽선 snapshot 출처입니다.');
  if(!marked){
    if(rows.some(value=>{const row=object(value);return Object.hasOwn(row,'serverOutlineId')||Object.hasOwn(row,'serverInstanceName');}))
      throw new Error('서버 식별자는 명시적인 읽기 전용 snapshot에서만 허용됩니다.');
    return {marked:false,names:[]};
  }
  if(root.schemaVersion!==2||root.persistence!=='BROWSER_EXPORT_ONLY')
    throw new Error('서버 snapshot은 읽기 전용 v2 교환 형식이어야 합니다.');
  const common=['schemaVersion','versionId','sourceSha256','coordinateSystem','unitCode','persistence','exportSource'];
  keys(root,kind==='source'?[...common,'outlines']:[...common,'format','sourceAttestable','objects']);
  const ids=new Set<string>(),names:string[]=[];
  for(const value of rows){
    const row=object(value);
    keys(row,kind==='source'?['id','createdAt','result','outlineTypeId','outlineTypeName','name','serverOutlineId','serverInstanceName']:
      ['id','savedOutlineId','origin','kind','name','outlineTypeId','outlineTypeName','visible','baseGeometry','baseResult',
        'transform','transformOperations','editedGeometry','provenance','createdAt','editedAt','edited','serverOutlineId']);
    if(kind==='source'){
      const result=object(row.result);
      keys(result,['kind','algorithm','geometry','baseGeometry','transformOperations','sourceEntityIds','persistable','tolerance','warnings','durationMs']);
      keys(object(result.geometry),['type','coordinates']);keys(object(result.baseGeometry),['type','coordinates']);
      if(!Array.isArray(result.transformOperations)||result.transformOperations.length>64)
        throw new Error('서버 Source snapshot 편집 이력이 유효하지 않습니다.');
      let matrix:Affine2D=IDENTITY_2D;
      for(const value of result.transformOperations){const operation=object(value);
        keys(operation,operation.type==='Translate'?['type','dx','dy']:['type','angleDegrees','pivot']);
        matrix=composeAffine(generatedRigidMatrix(operation as unknown as GeneratedRigidOperation),matrix);
      }
      const base=validatedGeneratedGeometry(result.baseGeometry as GeoJSONOutline);
      const effective=validatedGeneratedGeometry(result.geometry as GeoJSONOutline);
      if(JSON.stringify(applyAffine(base,matrix))!==JSON.stringify(effective))
        throw new Error('서버 Source snapshot의 기하와 편집 이력이 일치하지 않습니다.');
    }else{
      keys(object(row.baseResult),['kind','algorithm','tolerance','sourceEntityIds','persistable','geometryBasis','derivedFrom','warnings','durationMs']);
      keys(object(row.provenance),['origin','sourceAttestable','editedByUser']);
      keys(object(row.baseGeometry),['type','coordinates']);keys(object(row.editedGeometry),['type','coordinates']);
      if(Array.isArray(row.transformOperations))for(const value of row.transformOperations){const operation=object(value);
        keys(operation,operation.type==='Translate'?['type','dx','dy']:['type','angleDegrees','pivot']);}
    }
    if(typeof row.serverOutlineId!=='string'||!UUID.test(row.serverOutlineId)||ids.has(row.serverOutlineId))
      throw new Error('서버 snapshot 식별자가 잘못되었거나 중복되었습니다.');
    ids.add(row.serverOutlineId);
    const displayName=kind==='source'?row.serverInstanceName:row.name;
    if(!name(displayName))throw new Error('서버 snapshot 외곽선 이름이 유효하지 않습니다.');
    if(row.outlineTypeId!==null){
      if(typeof row.outlineTypeId!=='string'||!UUID.test(row.outlineTypeId)||!name(row.outlineTypeName)||row.name!==displayName)
        throw new Error('서버 snapshot 업무 타입·이름이 일치하지 않습니다.');
    }else if(row.outlineTypeName!==null||(kind==='source'&&row.name!==null))
      throw new Error('미분류 서버 snapshot 메타데이터가 올바르지 않습니다.');
    if(kind==='generated'&&row.id===row.serverOutlineId)
      throw new Error('서버 UUID를 브라우저 교환 객체 ID로 사용할 수 없습니다.');
    names.push(displayName);
  }
  if(kind==='generated'&&rows.some(value=>ids.has(String(object(value).id))))
    throw new Error('브라우저 교환 ID와 서버 UUID가 겹칩니다.');
  return {marked:true,names};
}
