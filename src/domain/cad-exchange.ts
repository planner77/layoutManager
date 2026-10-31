import type {GeoJSONOutline} from '../viewers/core/outline-compute';
import type {MemoSettings} from './memo-schedule';
import {dateOnly} from './memo-schedule';
import {normalizeMemoText} from './cad-memo';

/** Public, read-only bridge between the viewer and the export coordinator. */
export type ExchangeScope=Readonly<{versionId:string;sourceSha256:string;sourceUnit:string}>;
export type ExchangeOrigin='DXF'|'LOCAL_GENERATED'|'SERVER_OUTLINE'|'LOCAL_MEMO'|'SERVER_MEMO';
export type ExchangeObject=Readonly<{key:string;origin:ExchangeOrigin;layer:string;name:string;estimatedVertices:number;estimatedExpandedVertices?:number;estimatedIndices?:number;supported:boolean;reason?:string}>;
export type ExchangeInventory=Readonly<{scope:ExchangeScope;snapshotToken:string;layers:readonly string[];objects:readonly ExchangeObject[];warnings:readonly string[];sourceCoverage:'unknown'|'known';sourceEntityCount:number|null}>;
export type ExchangeSelection=Readonly<{
 dxf:Readonly<{enabled:boolean;mode:'all'|'layers';layers:readonly string[]}>;
 generated:Readonly<{enabled:boolean;mode:'all'|'selected';keys:readonly string[]}>;
 memos:Readonly<{enabled:boolean;mode:'all'|'selected';ids:readonly string[]}>;
}>;
export type ExchangeUnit='inch'|'foot'|'mm'|'cm'|'m';
export type ExchangeOptions=Readonly<{
 format:'glb'|'gltf';unit:'auto'|ExchangeUnit;
 origin:Readonly<{mode:'auto'}|{mode:'custom';x:number;y:number;z:number}>;
 filenameBase:string;
 memoTextHeightMetres?:number;
 /** Exact fingerprint returned by exchangeOptionsFingerprint(snapshot, options). */
 partialAck?:string;
}>;
export type ExchangeMaterial=Readonly<{color:number;opacity:number;vertexColors:boolean;styleLoss:readonly string[]}>;
export type ExchangePrimitive=Readonly<{
 key:string;origin:ExchangeOrigin;layer:string;name:string;
 kind:'Line'|'LineLoop'|'LineSegments'|'Mesh'|'Points';
 /** World-space DXF WCS triples, retained as JS doubles until origin subtraction. */
 positions:readonly number[];indices:readonly number[]|null;
 colors?:readonly number[];normals?:readonly number[];uvs?:readonly number[];
 material:ExchangeMaterial;
}>;
export type ExchangeGeneratedInput=Readonly<{key:string;origin:'LOCAL_GENERATED'|'SERVER_OUTLINE';name:string;geometry:GeoJSONOutline;revision?:number;outlineTypeId?:string|null;outlineTypeName?:string|null;kind?:'CONVEX'|'PRECISE'}>;
export type ExchangeMemoInput=Readonly<{
 key:string;id:string;origin:'LOCAL_MEMO'|'SERVER_MEMO';revision:number|null;
 title:string;content:string;anchorWcs:Readonly<{x:number;y:number;z:0}>;
 anchorMode:'CANONICAL'|'SESSION'|'BROKEN';broken:boolean;settings:MemoSettings;
}>;
export type ExchangeSnapshot=Readonly<{inventory:ExchangeInventory;selection:ExchangeSelection;primitives:readonly ExchangePrimitive[];generated:readonly ExchangeGeneratedInput[];memos?:readonly ExchangeMemoInput[]}>;
export type ExchangeLayerReport=Readonly<{layer:string;accepted:number;excluded:number;reasons:Readonly<Record<string,number>>;styleLoss:Readonly<Record<string,number>>}>;
export type ExchangeReport=Readonly<{included:number;excluded:number;vertices:number;warnings:readonly string[];maxQuantizationError:number;sourceCoverage:'unknown'|'known';styleLoss:Readonly<Record<string,number>>;layers:readonly ExchangeLayerReport[]}>;
export type ExchangeArtifact=Readonly<{bytes:Uint8Array;mime:'model/gltf-binary'|'model/gltf+json';extension:'glb'|'gltf';report:ExchangeReport}>;
export type ExchangeBuildContext=Readonly<{signal?:AbortSignal;onStage?:(stage:'prepare'|'font'|'rasterize'|'serialize'|'complete')=>void}>;

export const EXCHANGE_LIMITS=Object.freeze({drawables:20_000,vertices:250_000,indices:750_000,generatedPerOrigin:100,memos:100,texturePixels:8_388_608,estimatedBytes:64*1024*1024,artifactBytes:32*1024*1024});
export const EXCHANGE_UNIT_METRES:Readonly<Record<ExchangeUnit,number>>=Object.freeze({inch:0.0254,foot:0.3048,mm:0.001,cm:0.01,m:1});
export function exchangeSourceUnit(sourceUnit:string):ExchangeUnit|null{
 const match=/^DXF_INSUNITS_(\d+)$/.exec(sourceUnit);
 if(!match)return null;
 const code=Number(match[1]);
 return ({1:'inch',2:'foot',4:'mm',5:'cm',6:'m'} as Record<number,ExchangeUnit>)[code]??null;
}
export function exchangeOptionsFingerprint(snapshot:ExchangeSnapshot,options:ExchangeOptions):string{
 const stableOptions={...options};delete stableOptions.partialAck;
 return JSON.stringify([snapshot.inventory.snapshotToken,snapshot.selection,snapshot.generated,snapshot.memos??[],stableOptions]);
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Pure preflight. The caller supplies only selected, freshly proven Memo DTOs. */
export function selectedExchangeMemos(snapshot:ExchangeSnapshot,options?:ExchangeOptions):readonly ExchangeMemoInput[]{
 const items=snapshot.memos??[],choice=snapshot.selection.memos;
 if(items.length>EXCHANGE_LIMITS.memos||new Set(choice.ids).size!==choice.ids.length||
   !choice.enabled&&(items.length>0||choice.ids.length>0)||
   choice.enabled&&choice.mode==='selected'&&!choice.ids.length||
   choice.mode==='all'&&choice.ids.length>0)throw new Error('메모 내보내기 선택이 변경되었습니다.');
 if(!choice.enabled)return [];
 if(!options||!Number.isFinite(options.memoTextHeightMetres)||
   options.memoTextHeightMetres!<.001||options.memoTextHeightMetres!>10)
   throw new Error('메모 글자 높이는 0.001~10m 사이여야 합니다.');
 const all=new Map(snapshot.inventory.objects.filter(o=>o.supported&&
   (o.origin==='LOCAL_MEMO'||o.origin==='SERVER_MEMO')).map(o=>[o.key,o] as const));
 const selected=new Set(choice.ids),seen=new Set<string>();
 for(const memo of items){
  const prefix=memo.origin==='LOCAL_MEMO'?'memo-local:':'memo-server:';
  if(!UUID.test(memo.id)||memo.key!==prefix+memo.id||seen.has(memo.key)||
    !all.has(memo.key)||all.get(memo.key)?.origin!==memo.origin||
    choice.mode==='selected'&&!selected.has(memo.key)||
    memo.origin==='LOCAL_MEMO'&&memo.revision!==null||
    memo.origin==='SERVER_MEMO'&&(!Number.isSafeInteger(memo.revision)||memo.revision===null||memo.revision<0)||
    !memo.anchorWcs||memo.anchorWcs.z!==0||
    !Number.isFinite(memo.anchorWcs.x)||!Number.isFinite(memo.anchorWcs.y)||
    Math.abs(memo.anchorWcs.x)>1e12||Math.abs(memo.anchorWcs.y)>1e12||
    !['CANONICAL','SESSION','BROKEN'].includes(memo.anchorMode)||
    memo.broken!==(memo.anchorMode==='BROKEN'))throw new Error('메모 스냅샷이 변경되었거나 유효하지 않습니다.');
  const text=normalizeMemoText(memo.title,memo.content);
  if(text.title!==memo.title||text.content!==memo.content)throw new Error('메모 원문을 그대로 내보낼 수 없습니다.');
  memoExportSettings(memo.settings);seen.add(memo.key);
 }
 if(choice.mode==='all'&&[...all.keys()].some(k=>!seen.has(k))||
   choice.mode==='selected'&&choice.ids.some(k=>!seen.has(k)))
   throw new Error('선택된 메모가 누락되었습니다.');
 return items;
}
/** Whitelist active schedule/completion fields; never spread raw Memo DTO. */
export function memoExportSettings(settings:MemoSettings){
 if(!settings||typeof settings.scheduleEnabled!=='boolean'||typeof settings.completionEnabled!=='boolean'||
   typeof settings.isCompleted!=='boolean'||
   !settings.scheduleEnabled&&(settings.startDate!==null||settings.dueDate!==null)||
   !settings.completionEnabled&&(settings.isCompleted||settings.completedAt!==null))
   throw new Error('메모 일정·완료 설정이 유효하지 않습니다.');
 const start=settings.scheduleEnabled?dateOnly(settings.startDate):null;
 const due=settings.scheduleEnabled?dateOnly(settings.dueDate):null;
 if(start&&due&&start>due)throw new Error('메모 일정 범위가 유효하지 않습니다.');
 if(settings.completionEnabled&&settings.isCompleted&&
   (typeof settings.completedAt!=='string'||!Number.isFinite(Date.parse(settings.completedAt))))
   throw new Error('메모 완료 시각이 유효하지 않습니다.');
 return {scheduleEnabled:settings.scheduleEnabled,
   ...(settings.scheduleEnabled?{startDate:start,dueDate:due}:{}),
   completionEnabled:settings.completionEnabled,
   ...(settings.completionEnabled?{isCompleted:settings.isCompleted,
     ...(settings.isCompleted?{completedAt:settings.completedAt}:{})}:{})};
}
