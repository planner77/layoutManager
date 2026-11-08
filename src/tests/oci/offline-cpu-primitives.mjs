// Test-only offline primitive candidate; never wired into production Scene admission.
import {createHash,randomUUID} from 'node:crypto';
import {lstat,open,readFile,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {OFFLINE_BUILDER,OFFLINE_SCHEMA,OFFLINE_LIMITS,OfflineCpuError,validateOfflineCpuPrimitives} from './offline-cpu-primitives-dto.mjs';

const reject=(code)=>{throw new OfflineCpuError(code);};
const coordinate=(n)=>Number.isFinite(n)&&Math.abs(n)<=OFFLINE_LIMITS.coordinate;
const finiteNumber=(text)=>{if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(text.trim()))reject('DXF_NUMBER');const n=Number(text);if(!Number.isFinite(n))reject('DXF_NUMBER');return n;};
const finiteInt=(text)=>{if(!/^[+-]?\d+$/.test(text.trim()))reject('DXF_INTEGER');const n=Number(text);if(!Number.isSafeInteger(n))reject('DXF_INTEGER');return n;};
const precise=(n)=>{if(!coordinate(n))reject('DXF_COORDINATE_LIMIT');const f=Math.fround(n);if(!Number.isFinite(f)||Math.abs(f)>OFFLINE_LIMITS.coordinate)reject('DXF_COORDINATE_LIMIT');return f;};
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const deadline=()=>Date.now()+15_000;
const checkTime=(until)=>{if(Date.now()>until)reject('DXF_TIME_LIMIT');};

function rawPairs(bytes,until){
  if(!(bytes instanceof Uint8Array))reject('DXF_INPUT_TYPE');
  if(bytes.byteLength===0||bytes.byteLength>OFFLINE_LIMITS.sourceBytes)reject('DXF_BYTE_LIMIT');
  const input=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(input.subarray(0,22).toString('ascii').startsWith('AutoCAD Binary DXF'))reject('DXF_BINARY');
  let pos=0;const pairs=[];
  function line(){if(pos>=input.length)return null;let end=input.indexOf(10,pos);if(end<0)end=input.length;if(end-pos>65536)reject('DXF_LINE_LIMIT');let b=input.subarray(pos,end);pos=end+1;if(b.at(-1)===13)b=b.subarray(0,-1);if(b.includes(0))reject('DXF_NUL');return b;}
  while(true){checkTime(until);const c=line();if(c===null)break;const v=line();if(v===null)reject('DXF_ODD_PAIR');if(pairs.length>=OFFLINE_LIMITS.pairs)reject('DXF_PAIR_LIMIT');const code=c.toString('latin1').trim();if(!/^\d{1,4}$/.test(code)||Number(code)>1071)reject('DXF_GROUP_CODE');pairs.push([Number(code),v]);}
  return pairs;
}
function declaredEncoding(pairs,until){
  let section=null,pending=false,name=null,codepage=null,seen=false;
  for(const [code,raw] of pairs){
    checkTime(until);
    if(code===0){const v=raw.toString('latin1').trim();if(v==='SECTION'){pending=true;name=null;continue;}if(v==='ENDSEC'){section=null;name=null;continue;}if(v==='EOF')break;}
    if(pending){if(code!==2)reject('DXF_SECTION');section=raw.toString('latin1').trim();pending=false;continue;}
    if(section==='HEADER'){
      if(code===9){name=raw.toString('latin1').trim();continue;}
      if(name==='$DWGCODEPAGE'){
        if(code!==3||seen)reject('DXF_CODEPAGE');
        codepage=raw.toString('latin1').trim();seen=true;name=null;
      }
    }
  }
  if(!seen||!['UTF8','UTF-8','ANSI_1252'].includes(codepage))reject('DXF_CODEPAGE');
  return codepage;
}
function decodePairs(pairs,codepage,until){
  const utf8=codepage==='UTF8'||codepage==='UTF-8';
  const decoder=new TextDecoder(utf8?'utf-8':'windows-1252',{fatal:true});
  return pairs.map(([code,raw])=>{
    checkTime(until);
    if(!utf8&&raw.some(b=>[0x81,0x8d,0x8f,0x90,0x9d].includes(b)))reject('DXF_ENCODING');
    let value;try{value=decoder.decode(raw);}catch{reject('DXF_ENCODING');}
    if(value.includes('\uFFFD'))reject('DXF_ENCODING');
    return [code,value];
  });
}
function sectionRecords(pairs,until){
  const sections=new Map();let current=null,pending=false,ended=false,record=null;
  for(const [code,value] of pairs){
    checkTime(until);
    if(ended)reject('DXF_AFTER_EOF');
    if(pending){if(code!==2||!['HEADER','ENTITIES'].includes(value)||sections.has(value))reject('DXF_SECTION');current=value;sections.set(value,[]);pending=false;continue;}
    if(code===0){
      if(value==='SECTION'){if(current)reject('DXF_SECTION');pending=true;continue;}
      if(value==='ENDSEC'){if(!current)reject('DXF_SECTION');current=null;record=null;continue;}
      if(value==='EOF'){if(current)reject('DXF_SECTION');ended=true;continue;}
      if(current!=='ENTITIES')reject('DXF_RECORD');
      if(!['LINE','CIRCLE','ARC','LWPOLYLINE'].includes(value))reject('DXF_UNSUPPORTED_ENTITY');
      record={type:value,fields:[]};sections.get('ENTITIES').push(record);continue;
    }
    if(!current)reject('DXF_SECTION');
    if(current==='ENTITIES'){
      if(!record)reject('DXF_RECORD');record.fields.push([code,value]);
    }else sections.get('HEADER').push([code,value]);
  }
  if(!ended||pending||current||!sections.has('HEADER')||!sections.has('ENTITIES'))reject('DXF_STRUCTURE');
  return sections;
}
function header(fields,until){
  const seen=new Map();let key=null;
  for(const [code,value] of fields){
    checkTime(until);
    if(code===9){if(key!==null)reject('DXF_HEADER_FIELD');if(!['$ACADVER','$DWGCODEPAGE','$INSUNITS'].includes(value)||seen.has(value))reject('DXF_HEADER_FIELD');key=value;continue;}
    if(key===null)reject('DXF_HEADER_FIELD');
    const expected=key==='$ACADVER'?1:key==='$DWGCODEPAGE'?3:70;
    if(code!==expected)reject('DXF_HEADER_FIELD');
    seen.set(key,value);key=null;
  }
  if(key!==null||seen.size!==3||!/^AC\d{4}$/.test(seen.get('$ACADVER'))||!['UTF8','UTF-8','ANSI_1252'].includes(seen.get('$DWGCODEPAGE'))||finiteInt(seen.get('$INSUNITS'))!==4)reject('DXF_HEADER');
  return seen;
}
function common(fields,type,until){
  const allowed=new Set(type==='LINE'?[10,20,30,11,21,31]:type==='CIRCLE'?[10,20,30,40]:type==='ARC'?[10,20,30,40,50,51]:[90,70,43,38,39,10,20,40,41,42]);
  for(const code of [8,62,6,370,210,220,230,39,100])allowed.add(code);
  const single=new Map(),vertices=[];let vertex=null;const subclasses=new Set();
  for(const [code,value] of fields){
    checkTime(until);
    if(!allowed.has(code))reject('DXF_UNSUPPORTED_FIELD');
    if(code===100){const expected=new Set(['AcDbEntity',type==='LINE'?'AcDbLine':type==='CIRCLE'?'AcDbCircle':type==='ARC'?'AcDbCircle':'AcDbPolyline',...(type==='ARC'?['AcDbArc']:[])]);if(!expected.has(value)||subclasses.has(value))reject('DXF_SUBCLASS');subclasses.add(value);continue;}
    if(type==='LWPOLYLINE'&&code===10){vertex={x:finiteNumber(value)};vertices.push(vertex);continue;}
    if(type==='LWPOLYLINE'&&[20,40,41,42].includes(code)){
      if(!vertex||Object.hasOwn(vertex,code))reject('DXF_VERTEX_FIELD');vertex[code]=finiteNumber(value);continue;
    }
    if(single.has(code))reject('DXF_DUPLICATE_FIELD');
    single.set(code,value);
  }
  if(single.has(8)&&single.get(8)!=='0')reject('DXF_LAYER');
  if(single.has(62)&&![7,256].includes(finiteInt(single.get(62))))reject('DXF_STYLE');
  if(single.has(6)&&!['CONTINUOUS','BYLAYER'].includes(single.get(6)))reject('DXF_STYLE');
  if(single.has(370)&&![-1,-3].includes(finiteInt(single.get(370))))reject('DXF_STYLE');
  for(const [code,expected] of [[210,0],[220,0],[230,1],[39,0]])if(single.has(code)&&finiteNumber(single.get(code))!==expected)reject('DXF_NORMAL');
  return {single,vertices};
}
function n(map,code,required=false){if(!map.has(code)){if(required)reject('DXF_MISSING_FIELD');return 0;}return finiteNumber(map.get(code));}
function checkedPoint(x,y){if(!coordinate(x)||!coordinate(y))reject('DXF_COORDINATE_LIMIT');return [x,y];}
function geometry(record,remaining,until){
  checkTime(until);
  const {single:s,vertices}=common(record.fields,record.type,until);
  if(record.type==='LINE'){
    if(remaining<1)reject('DXF_SEGMENT_LIMIT');
    if(n(s,30)!==0||n(s,31)!==0)reject('DXF_Z');
    const a=checkedPoint(n(s,10,true),n(s,20,true)),b=checkedPoint(n(s,11,true),n(s,21,true));
    if(same(a,b))reject('DXF_DEGENERATE');return {type:'LINE',closed:false,paths:[[a,b]],chordError:0};
  }
  if(record.type==='CIRCLE'||record.type==='ARC'){
    if(n(s,30)!==0)reject('DXF_Z');const c=checkedPoint(n(s,10,true),n(s,20,true)),r=n(s,40,true);
    if(!(r>0)||!coordinate(c[0]-r)||!coordinate(c[0]+r)||!coordinate(c[1]-r)||!coordinate(c[1]+r))reject('DXF_RADIUS');
    let start=0,sweep=2*Math.PI;
    if(record.type==='ARC'){
      const degA=n(s,50,true),degB=n(s,51,true);if(degA<0||degA>360||degB<0||degB>360)reject('DXF_ANGLE');
      const a=((degA%360)+360)%360,b=((degB%360)+360)%360;
      const sweepDeg=(b-a+360)%360;if(sweepDeg===0)reject('DXF_ANGLE');start=a*Math.PI/180;sweep=sweepDeg*Math.PI/180;
    }
    const step=2*Math.acos(Math.max(-1,Math.min(1,1-OFFLINE_LIMITS.chordMm/r)));
    const count=Math.max(record.type==='CIRCLE'?3:1,Math.ceil(sweep/step));
    if(!Number.isSafeInteger(count)||count>remaining)reject('DXF_SEGMENT_LIMIT');
    const path=[];for(let i=0;i<=count;i++){
      checkTime(until);
      const angle=start+sweep*i/count;
      path.push(checkedPoint(c[0]+r*Math.cos(angle),c[1]+r*Math.sin(angle)));
    }
    if(record.type==='CIRCLE')path[count]=path[0];
    return {type:record.type,closed:record.type==='CIRCLE',paths:[path],chordError:r*(1-Math.cos(sweep/(2*count)))};
  }
  const count=finiteInt(s.get(90)??'');const flag=s.has(70)?finiteInt(s.get(70)):0;
  if(![0,1].includes(flag)||count!==vertices.length||count<(flag===1?3:2))reject('DXF_POLYLINE');
  if(count-1+flag>remaining)reject('DXF_SEGMENT_LIMIT');
  for(const code of [38,39,43])if(s.has(code)&&n(s,code)!==0)reject('DXF_POLYLINE');
  const path=vertices.map(v=>{
    checkTime(until);
    if(!Object.hasOwn(v,20))reject('DXF_VERTEX_FIELD');
    for(const code of [40,41,42])if(Object.hasOwn(v,code)&&v[code]!==0)reject('DXF_POLYLINE');
    return checkedPoint(v.x,v[20]);
  });
  for(let i=1;i<path.length;i++)if(same(path[i-1],path[i]))reject('DXF_DEGENERATE');
  if(same(path[0],path.at(-1)))reject('DXF_DEGENERATE');
  if(flag===1)path.push(path[0]);
  return {type:'LWPOLYLINE',closed:flag===1,paths:[path],chordError:0};
}
function candidate(bytes){
  const until=deadline(),pairs=rawPairs(bytes,until),encoding=declaredEncoding(pairs,until),decoded=decodePairs(pairs,encoding,until),sections=sectionRecords(decoded,until);
  const h=header(sections.get('HEADER'),until);if(h.get('$DWGCODEPAGE')!==encoding)reject('DXF_CODEPAGE');
  const records=sections.get('ENTITIES');if(records.length===0)reject('DXF_EMPTY');
  let segments=0,maxChord=0,maxFloat=0;
  const primitives=records.map((record,index)=>{
    checkTime(until);const shape=geometry(record,OFFLINE_LIMITS.segments-segments,until),output=[];maxChord=Math.max(maxChord,shape.chordError);
    for(const path of shape.paths){
      if(segments+path.length-1>OFFLINE_LIMITS.segments)reject('DXF_SEGMENT_LIMIT');
      for(let i=1;i<path.length;i++){
        checkTime(until);const a=path[i-1],b=path[i],af=[precise(a[0]),precise(a[1])],bf=[precise(b[0]),precise(b[1])];
        maxFloat=Math.max(maxFloat,Math.hypot(af[0]-a[0],af[1]-a[1]),Math.hypot(bf[0]-b[0],bf[1]-b[1]));
        if(maxFloat>OFFLINE_LIMITS.floatMm)reject('DXF_FLOAT_PRECISION');
        if(same(af,bf))reject('DXF_FLOAT_COLLAPSE');output.push([af[0],af[1],0,bf[0],bf[1],0]);segments++;
      }
    }
    return {id:`p${String(index+1).padStart(6,'0')}`,type:shape.type,closed:shape.closed,segments:output};
  });
  checkTime(until);
  if(maxChord>OFFLINE_LIMITS.chordMm+1e-12)reject('DXF_CHORD_PRECISION');
  const input=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const result={schema:OFFLINE_SCHEMA,state:'CANDIDATE',builder:OFFLINE_BUILDER,source:{sha256:createHash('sha256').update(input).digest('hex'),bytes:input.length},units:'mm',primitiveCount:primitives.length,segmentCount:segments,maxChordErrorMm:maxChord,maxFloatErrorMm:maxFloat,primitives};
  const serialized=Buffer.byteLength(JSON.stringify(result));if(serialized>OFFLINE_LIMITS.serializedBytes)reject('DXF_OUTPUT_LIMIT');
  validateOfflineCpuPrimitives(result,result.source);checkTime(until);return result;
}
export function buildOfflineCpuPrimitives(bytes){
  try{return candidate(bytes);}catch(e){if(e instanceof OfflineCpuError)throw e;throw new OfflineCpuError('DXF_UNSUPPORTED');}
}
async function privateDirectory(path){
  const full=resolve(path);let cursor=full;
  while(true){
    const s=await lstat(cursor);if(s.isSymbolicLink())reject('PRIVATE_DIR');
    if(cursor===full&&(!s.isDirectory()||(s.mode&0o077)!==0||(typeof process.getuid==='function'&&s.uid!==process.getuid())))reject('PRIVATE_DIR');
    const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
  return full;
}
export async function saveAndReadbackOfflineCpuPrimitives(bytes,privateDir){
  try{
    const dir=await privateDirectory(privateDir);
    const envelope=buildOfflineCpuPrimitives(bytes),body=Buffer.from(JSON.stringify(envelope));
    if(body.length>OFFLINE_LIMITS.serializedBytes)reject('DXF_OUTPUT_LIMIT');
    const path=join(dir,`offline-cpu-${randomUUID()}.json`);
    let handle;try{
      handle=await open(path,'wx',0o600);await handle.writeFile(body);await handle.sync();await handle.close();handle=null;
      const directoryHandle=await open(dir,'r');try{await directoryHandle.sync();}finally{await directoryHandle.close();}
      const copied=await readFile(path);const sha256=createHash('sha256').update(body).digest('hex');
      if(copied.length!==body.length||createHash('sha256').update(copied).digest('hex')!==sha256)reject('READBACK_HASH');
      let parsed;try{parsed=JSON.parse(copied.toString('utf8'));}catch{reject('READBACK_JSON');}
      validateOfflineCpuPrimitives(parsed,envelope.source);
      return {envelope:parsed,sha256,byteLength:body.length};
    }finally{if(handle)await handle.close();await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }catch(e){if(e instanceof OfflineCpuError)throw e;throw new OfflineCpuError('PRIVATE_IO');}
}
