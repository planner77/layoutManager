// Browser-portable, test-only DTO boundary. No production Scene or READY admission.
export const OFFLINE_SCHEMA='offline-cpu-primitives@1';
export const OFFLINE_BUILDER='node-cpu-primitives@0.1.0+cad-scene-1';
export const OFFLINE_CPU_PRIMITIVES_BUILDER=OFFLINE_BUILDER;
export const OFFLINE_LIMITS=Object.freeze({sourceBytes:16*1024*1024,pairs:300000,segments:5000,coordinate:1_000_000,serializedBytes:32*1024*1024,chordMm:0.05,floatMm:0.05});
const types=new Set(['LINE','CIRCLE','ARC','LWPOLYLINE']);

export class OfflineCpuError extends Error{
  constructor(code){super(code);this.name='OfflineCpuError';this.code=code;}
}
const reject=(code)=>{throw new OfflineCpuError(code);};
const plain=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const hex64=(v)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

export function validateOfflineCpuPrimitives(value,expectedSource){
  if(!exact(value,['schema','state','builder','source','units','primitiveCount','segmentCount','maxChordErrorMm','maxFloatErrorMm','primitives']))reject('OFFLINE_DTO_SHAPE');
  if(value.schema!==OFFLINE_SCHEMA||value.state!=='CANDIDATE'||value.builder!==OFFLINE_BUILDER||value.units!=='mm')reject('OFFLINE_DTO_IDENTITY');
  if(!exact(value.source,['sha256','bytes'])||!hex64(value.source.sha256)||!integer(value.source.bytes,1,OFFLINE_LIMITS.sourceBytes))reject('OFFLINE_DTO_SOURCE');
  if(expectedSource&&(value.source.sha256!==expectedSource.sha256||value.source.bytes!==expectedSource.bytes))reject('OFFLINE_DTO_SOURCE');
  if(!integer(value.primitiveCount,1,OFFLINE_LIMITS.segments)||!integer(value.segmentCount,1,OFFLINE_LIMITS.segments)||!Array.isArray(value.primitives)||value.primitives.length!==value.primitiveCount)reject('OFFLINE_DTO_COUNT');
  if(typeof value.maxChordErrorMm!=='number'||!Number.isFinite(value.maxChordErrorMm)||value.maxChordErrorMm<0||value.maxChordErrorMm>OFFLINE_LIMITS.chordMm||typeof value.maxFloatErrorMm!=='number'||!Number.isFinite(value.maxFloatErrorMm)||value.maxFloatErrorMm<0||value.maxFloatErrorMm>OFFLINE_LIMITS.floatMm)reject('OFFLINE_DTO_PRECISION');
  let count=0;
  for(let i=0;i<value.primitives.length;i++){
    const p=value.primitives[i];
    if(!exact(p,['id','type','closed','segments'])||p.id!==`p${String(i+1).padStart(6,'0')}`||!types.has(p.type)||typeof p.closed!=='boolean'||!Array.isArray(p.segments)||p.segments.length<1)reject('OFFLINE_DTO_PRIMITIVE');
    if((p.type==='LINE'&&(p.closed||p.segments.length!==1))||(p.type==='CIRCLE'&&(!p.closed||p.segments.length<3))||(p.type==='ARC'&&p.closed)||(p.type==='LWPOLYLINE'&&p.closed&&p.segments.length<3))reject('OFFLINE_DTO_PRIMITIVE');
    let previous=null;
    for(const s of p.segments){
      if(!Array.isArray(s)||s.length!==6)reject('OFFLINE_DTO_SEGMENT');
      for(let j=0;j<6;j++)if(typeof s[j]!=='number'||!Number.isFinite(s[j])||Math.fround(s[j])!==s[j]||Math.abs(s[j])>OFFLINE_LIMITS.coordinate||(j%3===2&&s[j]!==0))reject('OFFLINE_DTO_VERTEX');
      if(s[0]===s[3]&&s[1]===s[4])reject('OFFLINE_DTO_COLLAPSE');
      if(previous&&(previous[3]!==s[0]||previous[4]!==s[1]))reject('OFFLINE_DTO_CONTINUITY');
      previous=s;
      if(++count>OFFLINE_LIMITS.segments)reject('OFFLINE_DTO_COUNT');
    }
    const returnsToStart=p.segments[0][0]===previous[3]&&p.segments[0][1]===previous[4];
    if(returnsToStart!==p.closed)reject('OFFLINE_DTO_CONTINUITY');
  }
  if(count!==value.segmentCount)reject('OFFLINE_DTO_COUNT');
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>OFFLINE_LIMITS.serializedBytes)reject('OFFLINE_DTO_SIZE');
  return value;
}

export function restoreOfflineCpuPrimitives(value,expectedSource){
  validateOfflineCpuPrimitives(value,expectedSource);
  return {segments:value.primitives.map(p=>({id:p.id,type:p.type,positions:Float32Array.from(p.segments.flat())})),segmentCount:value.segmentCount};
}
