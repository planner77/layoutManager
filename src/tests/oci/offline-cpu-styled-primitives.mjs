// Test-only offline primitive candidate; never wired into production Scene admission.
import {createHash,randomUUID} from 'node:crypto';
import {lstat,open,readFile,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {STYLED_BUILDER,STYLED_SCHEMA,STYLED_LIMITS,WEIGHTS,StyledCpuError,resolveStyledPrimitive,validateOfflineCpuStyledPrimitives} from './offline-cpu-styled-primitives-dto.mjs';

const reject=(code)=>{throw new StyledCpuError(code);};
const coordinate=(n)=>Number.isFinite(n)&&Math.abs(n)<=STYLED_LIMITS.coordinate;
const finiteNumber=(text)=>{if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(text.trim()))reject('DXF_NUMBER');const n=Number(text);if(!Number.isFinite(n))reject('DXF_NUMBER');return n;};
const finiteInt=(text)=>{if(!/^[+-]?\d+$/.test(text.trim()))reject('DXF_INTEGER');const n=Number(text);if(!Number.isSafeInteger(n))reject('DXF_INTEGER');return n;};
const precise=(n)=>{if(!coordinate(n))reject('DXF_COORDINATE_LIMIT');const f=Math.fround(n);if(!Number.isFinite(f)||Math.abs(f)>STYLED_LIMITS.coordinate)reject('DXF_COORDINATE_LIMIT');return f;};
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const deadline=()=>Date.now()+15_000;
const checkTime=(until)=>{if(Date.now()>until)reject('DXF_TIME_LIMIT');};

function rawPairs(bytes,until){
  if(!(bytes instanceof Uint8Array))reject('DXF_INPUT_TYPE');
  if(bytes.byteLength===0||bytes.byteLength>STYLED_LIMITS.sourceBytes)reject('DXF_BYTE_LIMIT');
  const input=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(input.subarray(0,22).toString('ascii').startsWith('AutoCAD Binary DXF'))reject('DXF_BINARY');
  let pos=0;const pairs=[];
  function line(){if(pos>=input.length)return null;let end=input.indexOf(10,pos);if(end<0)end=input.length;if(end-pos>65536)reject('DXF_LINE_LIMIT');let b=input.subarray(pos,end);pos=end+1;if(b.at(-1)===13)b=b.subarray(0,-1);if(b.includes(0))reject('DXF_NUL');return b;}
  while(true){checkTime(until);const c=line();if(c===null)break;const v=line();if(v===null)reject('DXF_ODD_PAIR');if(pairs.length>=STYLED_LIMITS.pairs)reject('DXF_PAIR_LIMIT');const code=c.toString('latin1').trim();if(!/^\d{1,4}$/.test(code)||Number(code)>1071)reject('DXF_GROUP_CODE');pairs.push([Number(code),v]);}
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
  const sections=new Map();let current=null,pending=false,ended=false,record=null,table=null,tableRecord=null;
  const order=['HEADER','TABLES','ENTITIES'];let next=0,totalTableRecords=0;
  for(const [code,value] of pairs){
    checkTime(until);
    if(ended)reject('DXF_AFTER_EOF');
    if(pending){if(code!==2||value!==order[next]||sections.has(value))reject('DXF_SECTION');current=value;sections.set(value,value==='TABLES'?[]:[]);next++;pending=false;continue;}
    if(code===0){
      if(value==='SECTION'){if(current)reject('DXF_SECTION');pending=true;continue;}
      if(value==='ENDSEC'){if(!current||table)reject('DXF_SECTION');current=null;record=null;continue;}
      if(value==='EOF'){if(current)reject('DXF_SECTION');ended=true;continue;}
      if(current==='TABLES'){
        if(value==='TABLE'){if(table)reject('DXF_TABLE');table={header:[],records:[]};sections.get('TABLES').push(table);tableRecord=null;continue;}
        if(value==='ENDTAB'){if(!table)reject('DXF_TABLE');table=null;tableRecord=null;continue;}
        if(!table||!['LTYPE','LAYER','STYLE'].includes(value))reject('DXF_TABLE_RECORD');
        tableRecord={type:value,fields:[]};table.records.push(tableRecord);
        if(table.records.length>STYLED_LIMITS.tableRecords||++totalTableRecords>STYLED_LIMITS.totalRecords)reject('DXF_TABLE_LIMIT');
        continue;
      }
      if(current!=='ENTITIES')reject('DXF_RECORD');
      if(!['LINE','CIRCLE','ARC','LWPOLYLINE'].includes(value))reject('DXF_UNSUPPORTED_ENTITY');
      record={type:value,fields:[]};sections.get('ENTITIES').push(record);continue;
    }
    if(!current)reject('DXF_SECTION');
    if(current==='ENTITIES'){
      if(!record)reject('DXF_RECORD');record.fields.push([code,value]);
    }else if(current==='TABLES'){
      if(!table)reject('DXF_TABLE');if(tableRecord)tableRecord.fields.push([code,value]);else table.header.push([code,value]);
    }else sections.get('HEADER').push([code,value]);
  }
  if(!ended||pending||current||next!==3)reject('DXF_STRUCTURE');
  return sections;
}
function header(fields,until){
  const specs=new Map([['$ACADVER',1],['$DWGCODEPAGE',3],['$INSUNITS',70],['$LWDISPLAY',290],['$LWDEFAULT',370],['$LTSCALE',40],['$CELTSCALE',40],['$CECOLOR',62],['$CELTYPE',6],['$CELWEIGHT',370],['$CLAYER',8]]);
  const seen=new Map();let key=null;
  for(const [code,value] of fields){
    checkTime(until);
    if(code===9){if(key!==null)reject('DXF_HEADER_FIELD');if(!specs.has(value)||seen.has(value))reject('DXF_HEADER_FIELD');key=value;continue;}
    if(key===null)reject('DXF_HEADER_FIELD');
    if(code!==specs.get(key))reject('DXF_HEADER_FIELD');
    seen.set(key,value);key=null;
  }
  if(key!==null||seen.get('$ACADVER')!=='AC1018'||!['UTF8','UTF-8','ANSI_1252'].includes(seen.get('$DWGCODEPAGE'))||finiteInt(seen.get('$INSUNITS')??'')!==4||finiteInt(seen.get('$LWDISPLAY')??'')!==0)reject('DXF_HEADER');
  const lwdefault=finiteInt(seen.get('$LWDEFAULT')??'');if(!WEIGHTS.has(lwdefault))reject('DXF_HEADER');
  const one=(name)=>!seen.has(name)||finiteNumber(seen.get(name))===1;
  if(!one('$LTSCALE')||!one('$CELTSCALE')||seen.has('$CECOLOR')&&finiteInt(seen.get('$CECOLOR'))!==256||seen.has('$CELTYPE')&&seen.get('$CELTYPE')!=='BYLAYER'||seen.has('$CELWEIGHT')&&finiteInt(seen.get('$CELWEIGHT'))!==-1)reject('DXF_HEADER');
  const clayer=seen.get('$CLAYER')??'0';if(!/^[A-Za-z0-9_$-]{1,64}$/.test(clayer))reject('DXF_HEADER');
  return {acadver:'AC1018',codepage:seen.get('$DWGCODEPAGE'),insunits:4,lwdisplay:0,lwdefault,ltscale:1,celtscale:1,cecolor:256,celtype:'BYLAYER',celweight:-1,clayer};
}
const symbol=/^[A-Za-z0-9_$-]{1,64}$/;
const handle=/^[1-9A-Fa-f][A-Fa-f0-9]{0,15}$/;
function fieldMap(fields,allowed,subclasses,until){
  const map=new Map(),seenClasses=new Set();
  for(const [code,value] of fields){
    checkTime(until);
    if(!allowed.includes(code))reject('DXF_UNSUPPORTED_FIELD');
    if(code===100){if(!subclasses.includes(value)||seenClasses.has(value))reject('DXF_SUBCLASS');seenClasses.add(value);continue;}
    if(map.has(code))reject('DXF_DUPLICATE_FIELD');map.set(code,value);
  }
  if(map.has(5)&&!handle.test(map.get(5))||map.has(330)&&!handle.test(map.get(330)))reject('DXF_HANDLE');
  return map;
}
function required(m,c){if(!m.has(c))reject('DXF_MISSING_FIELD');return m.get(c);}
function parseTables(raw,until){
  const out={ltype:null,layer:null,style:null};
  for(const table of raw){
    checkTime(until);
    const h=fieldMap(table.header,[2,70,100,5],['AcDbSymbolTable'],until);
    const name=required(h,2);if(!['LTYPE','LAYER','STYLE'].includes(name))reject('DXF_TABLE');
    const kind=name.toLowerCase();if(out[kind])reject('DXF_TABLE');
    const capacity=finiteInt(required(h,70));if(capacity<0||capacity>256||table.records.length>capacity)reject('DXF_TABLE_LIMIT');
    const entries=table.records.map((r,i)=>{
      checkTime(until);if(r.type!==name)reject('DXF_TABLE_RECORD');
      const subtype=name==='LTYPE'?'AcDbLinetypeTableRecord':name==='LAYER'?'AcDbLayerTableRecord':'AcDbTextStyleTableRecord';
      const allowed=name==='LTYPE'?[2,70,3,72,73,40,5,330,100]:name==='LAYER'?[2,70,62,420,6,370,290,5,330,100]:[2,70,40,41,50,71,42,3,4,5,330,100];
      const m=fieldMap(r.fields,allowed,['AcDbSymbolTableRecord',subtype],until);
      const recName=required(m,2);if(!symbol.test(recName))reject('DXF_SYMBOL');
      const common={id:`${name==='LTYPE'?'lt':name==='LAYER'?'ly':'st'}${String(i+1).padStart(4,'0')}`,name:recName,handle:m.get(5)??null,owner:m.get(330)??null};
      if(name==='LTYPE')return {...common,flags:finiteInt(required(m,70)),description:required(m,3),alignment:finiteInt(required(m,72)),elementCount:finiteInt(required(m,73)),patternLength:finiteNumber(required(m,40))};
      if(name==='LAYER')return {...common,flags:finiteInt(required(m,70)),aci:finiteInt(required(m,62)),trueColor:m.has(420)?finiteInt(m.get(420)):null,linetype:required(m,6),lineweight:finiteInt(required(m,370)),plot:m.has(290)?finiteInt(m.get(290)):1};
      return {...common,flags:finiteInt(required(m,70)),height:finiteNumber(required(m,40)),width:finiteNumber(required(m,41)),oblique:finiteNumber(required(m,50)),generation:finiteInt(required(m,71)),lastHeight:finiteNumber(required(m,42)),font:required(m,3),bigFont:required(m,4)};
    });
    out[kind]={capacity,handle:h.get(5)??null,records:entries};
  }
  if(!out.ltype||!out.layer)reject('DXF_TABLE');
  return out;
}
function common(fields,type,until){
  const allowed=new Set(type==='LINE'?[10,20,30,11,21,31]:type==='CIRCLE'?[10,20,30,40]:type==='ARC'?[10,20,30,40,50,51]:[90,70,43,38,39,10,20,40,41,42]);
  for(const code of [8,62,420,6,370,60,67,48,210,220,230,39,100])allowed.add(code);
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
  for(const [code,expected] of [[210,0],[220,0],[230,1],[39,0]])if(single.has(code)&&finiteNumber(single.get(code))!==expected)reject('DXF_NORMAL');
  const declared={layer:single.get(8)??'0',colorIndex:single.has(62)?finiteInt(single.get(62)):256,trueColor:single.has(420)?finiteInt(single.get(420)):null,linetype:single.get(6)??'BYLAYER',lineweight:single.has(370)?finiteInt(single.get(370)):-1,visibility:single.has(60)?finiteInt(single.get(60)):0,space:single.has(67)?finiteInt(single.get(67)):0,scale:single.has(48)?finiteNumber(single.get(48)):1};
  return {single,vertices,declared};
}
function n(map,code,required=false){if(!map.has(code)){if(required)reject('DXF_MISSING_FIELD');return 0;}return finiteNumber(map.get(code));}
function checkedPoint(x,y){if(!coordinate(x)||!coordinate(y))reject('DXF_COORDINATE_LIMIT');return [x,y];}
function geometry(record,remaining,until){
  checkTime(until);
  const {single:s,vertices,declared}=common(record.fields,record.type,until);
  if(record.type==='LINE'){
    if(remaining<1)reject('DXF_SEGMENT_LIMIT');
    if(n(s,30)!==0||n(s,31)!==0)reject('DXF_Z');
    const a=checkedPoint(n(s,10,true),n(s,20,true)),b=checkedPoint(n(s,11,true),n(s,21,true));
    if(same(a,b))reject('DXF_DEGENERATE');return {type:'LINE',closed:false,declared,paths:[[a,b]],chordError:0};
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
    const step=2*Math.acos(Math.max(-1,Math.min(1,1-STYLED_LIMITS.chordMm/r)));
    const count=Math.max(record.type==='CIRCLE'?3:1,Math.ceil(sweep/step));
    if(!Number.isSafeInteger(count)||count>remaining)reject('DXF_SEGMENT_LIMIT');
    const path=[];for(let i=0;i<=count;i++){
      checkTime(until);
      const angle=start+sweep*i/count;
      path.push(checkedPoint(c[0]+r*Math.cos(angle),c[1]+r*Math.sin(angle)));
    }
    if(record.type==='CIRCLE')path[count]=path[0];
    return {type:record.type,closed:record.type==='CIRCLE',declared,paths:[path],chordError:r*(1-Math.cos(sweep/(2*count)))};
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
  return {type:'LWPOLYLINE',closed:flag===1,declared,paths:[path],chordError:0};
}
function candidate(bytes){
  const until=deadline(),pairs=rawPairs(bytes,until),encoding=declaredEncoding(pairs,until),decoded=decodePairs(pairs,encoding,until),sections=sectionRecords(decoded,until);
  const h=header(sections.get('HEADER'),until);if(h.codepage!==encoding)reject('DXF_CODEPAGE');
  const tables=parseTables(sections.get('TABLES'),until);
  const layerMap=new Map(tables.layer.records.map(r=>[r.name.toUpperCase(),r]));
  const records=sections.get('ENTITIES');if(records.length===0)reject('DXF_EMPTY');
  let segments=0,visibleCount=0,maxChord=0,maxFloat=0;
  const primitives=records.map((record,index)=>{
    checkTime(until);const shape=geometry(record,STYLED_LIMITS.segments-segments,until),output=[];maxChord=Math.max(maxChord,shape.chordError);
    const resolved=resolveStyledPrimitive(shape.declared,layerMap.get(shape.declared.layer.toUpperCase()),h);
    if(resolved.visible)visibleCount++;
    for(const path of shape.paths){
      if(segments+path.length-1>STYLED_LIMITS.segments)reject('DXF_SEGMENT_LIMIT');
      for(let i=1;i<path.length;i++){
        checkTime(until);const a=path[i-1],b=path[i],af=[precise(a[0]),precise(a[1])],bf=[precise(b[0]),precise(b[1])];
        maxFloat=Math.max(maxFloat,Math.hypot(af[0]-a[0],af[1]-a[1]),Math.hypot(bf[0]-b[0],bf[1]-b[1]));
        if(maxFloat>STYLED_LIMITS.floatMm)reject('DXF_FLOAT_PRECISION');
        if(same(af,bf))reject('DXF_FLOAT_COLLAPSE');output.push([af[0],af[1],0,bf[0],bf[1],0]);segments++;
      }
    }
    return {id:`p${String(index+1).padStart(6,'0')}`,type:shape.type,closed:shape.closed,declared:shape.declared,resolved,segments:output};
  });
  checkTime(until);
  if(maxChord>STYLED_LIMITS.chordMm+1e-12)reject('DXF_CHORD_PRECISION');
  const input=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const result={schema:STYLED_SCHEMA,state:'CANDIDATE',builder:STYLED_BUILDER,source:{sha256:createHash('sha256').update(input).digest('hex'),bytes:input.length},units:'mm',primitiveCount:primitives.length,segmentCount:segments,visiblePrimitiveCount:visibleCount,maxChordErrorMm:maxChord,maxFloatErrorMm:maxFloat,header:h,tables,primitives};
  const serialized=Buffer.byteLength(JSON.stringify(result));if(serialized>STYLED_LIMITS.serializedBytes)reject('DXF_OUTPUT_LIMIT');
  validateOfflineCpuStyledPrimitives(result,result.source);checkTime(until);return result;
}
export function buildOfflineCpuStyledPrimitives(bytes){
  try{return candidate(bytes);}catch(e){if(e instanceof StyledCpuError)throw e;throw new StyledCpuError('DXF_UNSUPPORTED');}
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
export async function saveAndReadbackOfflineCpuStyledPrimitives(bytes,privateDir){
  try{
    const dir=await privateDirectory(privateDir);
    const envelope=buildOfflineCpuStyledPrimitives(bytes),body=Buffer.from(JSON.stringify(envelope));
    if(body.length>STYLED_LIMITS.serializedBytes)reject('DXF_OUTPUT_LIMIT');
    const path=join(dir,`offline-cpu-${randomUUID()}.json`);
    let handle;try{
      handle=await open(path,'wx',0o600);await handle.writeFile(body);await handle.sync();await handle.close();handle=null;
      const directoryHandle=await open(dir,'r');try{await directoryHandle.sync();}finally{await directoryHandle.close();}
      const copied=await readFile(path);const sha256=createHash('sha256').update(body).digest('hex');
      if(copied.length!==body.length||createHash('sha256').update(copied).digest('hex')!==sha256)reject('READBACK_HASH');
      let parsed;try{parsed=JSON.parse(copied.toString('utf8'));}catch{reject('READBACK_JSON');}
      validateOfflineCpuStyledPrimitives(parsed,envelope.source);
      return {envelope:parsed,sha256,byteLength:body.length};
    }finally{if(handle)await handle.close();await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }catch(e){if(e instanceof StyledCpuError)throw e;throw new StyledCpuError('PRIVATE_IO');}
}
