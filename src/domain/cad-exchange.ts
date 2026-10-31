import type {GeoJSONOutline} from '../viewers/core/outline-compute';

/** Public, read-only bridge between the viewer and the export coordinator. */
export type ExchangeScope=Readonly<{versionId:string;sourceSha256:string;sourceUnit:string}>;
export type ExchangeOrigin='DXF'|'LOCAL_GENERATED'|'SERVER_OUTLINE';
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
export type ExchangeSnapshot=Readonly<{inventory:ExchangeInventory;selection:ExchangeSelection;primitives:readonly ExchangePrimitive[];generated:readonly ExchangeGeneratedInput[]}>;
export type ExchangeLayerReport=Readonly<{layer:string;accepted:number;excluded:number;reasons:Readonly<Record<string,number>>;styleLoss:Readonly<Record<string,number>>}>;
export type ExchangeReport=Readonly<{included:number;excluded:number;vertices:number;warnings:readonly string[];maxQuantizationError:number;sourceCoverage:'unknown'|'known';styleLoss:Readonly<Record<string,number>>;layers:readonly ExchangeLayerReport[]}>;
export type ExchangeArtifact=Readonly<{bytes:Uint8Array;mime:'model/gltf-binary'|'model/gltf+json';extension:'glb'|'gltf';report:ExchangeReport}>;
export type ExchangeBuildContext=Readonly<{signal?:AbortSignal;onStage?:(stage:'prepare'|'serialize'|'complete')=>void}>;

export const EXCHANGE_LIMITS=Object.freeze({drawables:20_000,vertices:250_000,indices:750_000,generatedPerOrigin:100,estimatedBytes:64*1024*1024,artifactBytes:32*1024*1024});
export const EXCHANGE_UNIT_METRES:Readonly<Record<ExchangeUnit,number>>=Object.freeze({inch:0.0254,foot:0.3048,mm:0.001,cm:0.01,m:1});
export function exchangeSourceUnit(sourceUnit:string):ExchangeUnit|null{
 const match=/^DXF_INSUNITS_(\d+)$/.exec(sourceUnit);
 if(!match)return null;
 const code=Number(match[1]);
 return ({1:'inch',2:'foot',4:'mm',5:'cm',6:'m'} as Record<number,ExchangeUnit>)[code]??null;
}
export function exchangeOptionsFingerprint(snapshot:ExchangeSnapshot,options:ExchangeOptions):string{
 const stableOptions={...options};delete stableOptions.partialAck;
 return JSON.stringify([snapshot.inventory.snapshotToken,snapshot.selection,snapshot.generated,stableOptions]);
}
