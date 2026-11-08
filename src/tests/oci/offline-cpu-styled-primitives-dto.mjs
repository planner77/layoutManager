// Browser-portable, test-only styled candidate boundary. Never a production Scene.
export const STYLED_SCHEMA='offline-cpu-styled-primitives@1';
export const STYLED_BUILDER='node-cpu-styled-primitives@0.1.0+cad-scene-1';
export const STYLED_LIMITS=Object.freeze({sourceBytes:16*1024*1024,pairs:300000,segments:5000,coordinate:1_000_000,serializedBytes:32*1024*1024,chordMm:0.05,floatMm:0.05,tableRecords:256,totalRecords:768});
export const WEIGHTS=new Set([0,5,9,13,15,18,20,25,30,35,40,50,53,60,70,80,90,100,106,120,140,158,200,211]);
const palette=[null,0xff0000,0xffff00,0x00ff00,0x00ffff,0x0000ff,0xff00ff,0xffffff];
const types=new Set(['LINE','CIRCLE','ARC','LWPOLYLINE']);
const symbolPattern=/^[A-Za-z0-9_$-]{1,64}$/;
const fontPattern=/^[A-Za-z0-9_-]{1,64}\.(?:ttf|shx)$/i;
// Conservative canonical hex handles: no zero or leading zero aliases.
const hexPattern=/^[1-9A-Fa-f][A-Fa-f0-9]{0,15}$/;

export class StyledCpuError extends Error{constructor(code){super(code);this.name='StyledCpuError';this.code=code;}}
const reject=(code)=>{throw new StyledCpuError(code);};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const str=(v)=>typeof v==='string';
const symbol=(v)=>str(v)&&symbolPattern.test(v);
const optionalHandle=v=>v===null||str(v)&&hexPattern.test(v);
const key=v=>v.toUpperCase();
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const rgb=(v)=>int(v,0,0xffffff);
const colorIndex=(v,trueColor)=>int(v,1,trueColor===null?7:255)||v===256;
const layerAci=(v,trueColor)=>Number.isSafeInteger(v)&&v!==0&&Math.abs(v)<=(trueColor===null?7:255);

export function resolveStyledPrimitive(declared,layer,header){
  if(!exact(declared,['layer','colorIndex','trueColor','linetype','lineweight','visibility','space','scale'])||!symbol(declared.layer)||!colorIndex(declared.colorIndex,declared.trueColor)||(declared.trueColor!==null&&!rgb(declared.trueColor))||!['BYLAYER','CONTINUOUS'].includes(declared.linetype)||!([-1,-3].includes(declared.lineweight)||WEIGHTS.has(declared.lineweight))||![0,1].includes(declared.visibility)||declared.space!==0||declared.scale!==1)reject('STYLED_DECLARED');
  if(!layer)reject('STYLED_LAYER_REFERENCE');
  const visible=layer.aci>0&&(layer.flags&1)===0&&declared.visibility===0;
  const locked=(layer.flags&4)!==0;
  let rgbValue,colorOrigin;
  if(declared.trueColor!==null){rgbValue=declared.trueColor;colorOrigin='ENTITY_TRUECOLOR';}
  else if(declared.colorIndex!==256){rgbValue=palette[declared.colorIndex];colorOrigin='ENTITY_ACI';}
  else if(layer.trueColor!==null){rgbValue=layer.trueColor;colorOrigin='LAYER_TRUECOLOR';}
  else{rgbValue=palette[Math.abs(layer.aci)];colorOrigin='LAYER_ACI';}
  let weight,weightOrigin;
  if(declared.lineweight>=0){weight=declared.lineweight;weightOrigin='ENTITY';}
  else if(declared.lineweight===-3){weight=header.lwdefault;weightOrigin='DEFAULT';}
  else if(layer.lineweight>=0){weight=layer.lineweight;weightOrigin='LAYER';}
  else{weight=header.lwdefault;weightOrigin='DEFAULT';}
  return {rgb:rgbValue,visible,locked,plot:layer.plot===1,linetype:'CONTINUOUS',weight,weightOrigin,colorOrigin};
}

function validateTable(table,kind,seenHandles){
  if(!exact(table,['capacity','handle','records'])||!int(table.capacity,0,256)||!optionalHandle(table.handle)||!Array.isArray(table.records)||table.records.length>table.capacity||table.records.length>STYLED_LIMITS.tableRecords)reject('STYLED_TABLE');
  if(table.handle){const h=key(table.handle);if(seenHandles.has(h))reject('STYLED_HANDLE');seenHandles.add(h);}
  const seenNames=new Set();
  for(let i=0;i<table.records.length;i++){
    const r=table.records[i],prefix=kind==='ltype'?'lt':kind==='layer'?'ly':'st';
    const fields=kind==='ltype'?['id','name','flags','description','alignment','elementCount','patternLength','handle','owner']:
      kind==='layer'?['id','name','flags','aci','trueColor','linetype','lineweight','plot','handle','owner']:
      ['id','name','flags','height','width','oblique','generation','lastHeight','font','bigFont','handle','owner'];
    if(!exact(r,fields)||r.id!==`${prefix}${String(i+1).padStart(4,'0')}`||!symbol(r.name)||!optionalHandle(r.handle)||!optionalHandle(r.owner))reject('STYLED_RECORD');
    const name=key(r.name);if(seenNames.has(name))reject('STYLED_NAME_COLLISION');seenNames.add(name);
    if(r.handle){const h=key(r.handle);if(seenHandles.has(h))reject('STYLED_HANDLE');seenHandles.add(h);}
    if(r.owner!==null&&(!table.handle||key(r.owner)!==key(table.handle)))reject('STYLED_OWNER');
    if(kind==='ltype'){
      if(name!=='CONTINUOUS'||![0,64].includes(r.flags)||!str(r.description)||r.description.length>256||!Array.from(r.description).every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)<=126)||r.alignment!==65||r.elementCount!==0||r.patternLength!==0)reject('STYLED_LTYPE');
    }else if(kind==='layer'){
      if((r.flags&~(1|4|64))!==0||!int(r.flags,0,69)||!layerAci(r.aci,r.trueColor)||(r.trueColor!==null&&!rgb(r.trueColor))||!str(r.linetype)||key(r.linetype)!=='CONTINUOUS'||!(WEIGHTS.has(r.lineweight)||r.lineweight===-3)||![0,1].includes(r.plot))reject('STYLED_LAYER');
    }else{
      if(![0,64].includes(r.flags)||r.height!==0||r.width!==1||r.oblique!==0||r.generation!==0||!finite(r.lastHeight,0,1_000_000)||!str(r.font)||!fontPattern.test(r.font)||r.bigFont!=='')reject('STYLED_STYLE');
    }
  }
  return seenNames;
}

export function validateOfflineCpuStyledPrimitives(value,expectedSource){
  if(!exact(value,['schema','state','builder','source','units','primitiveCount','segmentCount','visiblePrimitiveCount','maxChordErrorMm','maxFloatErrorMm','header','tables','primitives']))reject('STYLED_DTO_SHAPE');
  if(value.schema!==STYLED_SCHEMA||value.state!=='CANDIDATE'||value.builder!==STYLED_BUILDER||value.units!=='mm')reject('STYLED_IDENTITY');
  if(!exact(value.source,['sha256','bytes'])||!str(value.source.sha256)||!/^[a-f0-9]{64}$/.test(value.source.sha256)||!int(value.source.bytes,1,STYLED_LIMITS.sourceBytes))reject('STYLED_SOURCE');
  if(expectedSource&&(value.source.sha256!==expectedSource.sha256||value.source.bytes!==expectedSource.bytes))reject('STYLED_SOURCE');
  const h=value.header;
  if(!exact(h,['acadver','codepage','insunits','lwdisplay','lwdefault','ltscale','celtscale','cecolor','celtype','celweight','clayer'])||h.acadver!=='AC1018'||!['UTF8','UTF-8','ANSI_1252'].includes(h.codepage)||h.insunits!==4||h.lwdisplay!==0||!WEIGHTS.has(h.lwdefault)||h.ltscale!==1||h.celtscale!==1||h.cecolor!==256||h.celtype!=='BYLAYER'||h.celweight!==-1||!symbol(h.clayer))reject('STYLED_HEADER');
  if(!exact(value.tables,['ltype','layer','style'])||value.tables.style!==null&&!plain(value.tables.style))reject('STYLED_TABLE');
  const handles=new Set();const ltypes=validateTable(value.tables.ltype,'ltype',handles);const layers=validateTable(value.tables.layer,'layer',handles);
  if(value.tables.style!==null)validateTable(value.tables.style,'style',handles);
  if(value.tables.ltype.records.length!==1||!ltypes.has('CONTINUOUS')||!layers.has('0')||!layers.has(key(h.clayer))||value.tables.ltype.records.length+value.tables.layer.records.length+(value.tables.style?.records.length??0)>STYLED_LIMITS.totalRecords)reject('STYLED_TABLE');
  if(!int(value.primitiveCount,1,STYLED_LIMITS.segments)||!int(value.segmentCount,1,STYLED_LIMITS.segments)||!int(value.visiblePrimitiveCount,0,value.primitiveCount)||!Array.isArray(value.primitives)||value.primitives.length!==value.primitiveCount)reject('STYLED_COUNT');
  if(!finite(value.maxChordErrorMm,0,STYLED_LIMITS.chordMm)||!finite(value.maxFloatErrorMm,0,STYLED_LIMITS.floatMm))reject('STYLED_PRECISION');
  const layerMap=new Map(value.tables.layer.records.map(r=>[key(r.name),r]));let total=0,visibleCount=0;
  for(let i=0;i<value.primitives.length;i++){
    const p=value.primitives[i];
    if(!exact(p,['id','type','closed','declared','resolved','segments'])||p.id!==`p${String(i+1).padStart(6,'0')}`||!types.has(p.type)||typeof p.closed!=='boolean'||!Array.isArray(p.segments)||p.segments.length<1)reject('STYLED_PRIMITIVE');
    if((p.type==='LINE'&&(p.closed||p.segments.length!==1))||(p.type==='CIRCLE'&&(!p.closed||p.segments.length<3))||(p.type==='ARC'&&p.closed)||(p.type==='LWPOLYLINE'&&p.closed&&p.segments.length<3))reject('STYLED_PRIMITIVE');
    const declared=p.declared;const layer=plain(declared)&&str(declared.layer)?layerMap.get(key(declared.layer)):null;
    const resolved=resolveStyledPrimitive(declared,layer,h);
    if(!exact(p.resolved,['rgb','visible','locked','plot','linetype','weight','weightOrigin','colorOrigin'])||Object.keys(resolved).some(k=>p.resolved[k]!==resolved[k]))reject('STYLED_RESOLUTION');
    if(resolved.visible)visibleCount++;
    let previous=null;
    for(const s of p.segments){
      if(!Array.isArray(s)||s.length!==6)reject('STYLED_SEGMENT');
      for(let j=0;j<6;j++)if(!finite(s[j],-STYLED_LIMITS.coordinate,STYLED_LIMITS.coordinate)||Math.fround(s[j])!==s[j]||(j%3===2&&s[j]!==0))reject('STYLED_VERTEX');
      if(s[0]===s[3]&&s[1]===s[4])reject('STYLED_COLLAPSE');
      if(previous&&(previous[3]!==s[0]||previous[4]!==s[1]))reject('STYLED_CONTINUITY');
      previous=s;if(++total>STYLED_LIMITS.segments)reject('STYLED_COUNT');
    }
    if((p.segments[0][0]===previous[3]&&p.segments[0][1]===previous[4])!==p.closed)reject('STYLED_CONTINUITY');
  }
  if(total!==value.segmentCount||visibleCount!==value.visiblePrimitiveCount)reject('STYLED_COUNT');
  if(new TextEncoder().encode(JSON.stringify(value)).byteLength>STYLED_LIMITS.serializedBytes)reject('STYLED_SIZE');
  return value;
}
export function restoreOfflineCpuStyledPrimitives(value,expectedSource){
  validateOfflineCpuStyledPrimitives(value,expectedSource);
  return {segments:value.primitives.map(p=>({id:p.id,type:p.type,positions:Float32Array.from(p.segments.flat()),rgb:p.resolved.rgb,visible:p.resolved.visible,locked:p.resolved.locked,plot:p.resolved.plot,weight:p.resolved.weight})),segmentCount:value.segmentCount,visiblePrimitiveCount:value.visiblePrimitiveCount};
}
