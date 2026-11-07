// Offline byte inventory. No DXF value, name, coordinate, handle or path is serialized.
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';

export const LIMITS=Object.freeze({bytes:32*1024*1024,pairs:2_000_000,lineBytes:64*1024,sections:32,entities:500_000,blocks:50_000,depth:64,wallMs:15_000});
const knownSections=new Set(['HEADER','CLASSES','TABLES','BLOCKS','ENTITIES','OBJECTS','THUMBNAILIMAGE']);
const categories=Object.freeze({LINE:'LINE',LWPOLYLINE:'POLYLINE',POLYLINE:'POLYLINE',VERTEX:'POLYLINE',SEQEND:'POLYLINE',CIRCLE:'CURVE',ARC:'CURVE',ELLIPSE:'CURVE',SPLINE:'CURVE',INSERT:'BLOCK_REF',TEXT:'TEXT',MTEXT:'TEXT',ATTRIB:'TEXT',ATTDEF:'TEXT',HATCH:'FILL',SOLID:'FILL',TRACE:'FILL','3DFACE':'SURFACE',POINT:'POINT',DIMENSION:'DIMENSION',LEADER:'ANNOTATION',IMAGE:'EXTERNAL',XLINE:'LINE',RAY:'LINE',VIEWPORT:'VIEWPORT',ACAD_PROXY_ENTITY:'PROXY',OLE2FRAME:'EXTERNAL',MLINE:'LINE',MULTILEADER:'ANNOTATION',REGION:'SURFACE','3DSOLID':'SURFACE',BODY:'SURFACE',WIPEOUT:'FILL'});
const approvedCodepages=new Set(['UTF-8','UTF8','ANSI_1252','ANSI_949','ANSI_932','ANSI_936','ANSI_950','ANSI_1251']);
const numeric=(b)=>{const s=b.toString('latin1').trim();return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):null;};
const ascii=(b)=>{if(b.some(x=>x>127||x<32))return null;return b.toString('ascii').trim();};
function fail(code){throw Object.assign(new Error(code),{code});}

export function inventoryDxf(input,limits=LIMITS){
  if(!Buffer.isBuffer(input))fail('INPUT_TYPE');
  if(input.length>limits.bytes)fail('BYTE_LIMIT');
  if(input.subarray(0,22).toString('ascii').startsWith('AutoCAD Binary DXF'))fail('BINARY_DXF');
  const start=Date.now();let offset=0,pairs=0,section=null,pendingSection=false,ended=false,record=null,table=null,headerVar=null;
  const sections=new Set(), entityTypes=new Map(),entityCategories=new Map(),blockEdges=new Map(),blockNames=new Set(),insertRefs=new Set();
  const sectionTypes={ENTITIES:new Map(),BLOCKS:new Map()};const sectionCounts={ENTITIES:0,BLOCKS:0};
  let currentBlock=null,blockCount=0,entityCount=0,layerRecords=0,styleRecords=0;
  const flags={nonAsciiValue:false,layerReference:false,styleReference:false,extrusion:false,zCoordinate:false,thickness:false,blockReference:false,text:false,nonAsciiText:false,nonFiniteCoordinate:false,unknownEntity:false,unknownSection:false};
  const declarations={acadver:[],codepage:[],insunits:[]};
  function line(){
    if(offset>=input.length)return null;
    let end=input.indexOf(10,offset);if(end<0)end=input.length;
    if(end-offset>limits.lineBytes)fail('LINE_LIMIT');
    let b=input.subarray(offset,end);offset=end+1;if(b.at(-1)===13)b=b.subarray(0,b.length-1);
    if(b.includes(0))fail('NUL_BYTE');return b;
  }
  function finishRecord(){
    if(!record)return;
    const {type,fields,inSection}=record;
    if(inSection==='ENTITIES'||(inSection==='BLOCKS'&&type!=='BLOCK'&&type!=='ENDBLK')){
      if(++entityCount>limits.entities)fail('ENTITY_LIMIT');
      const knownType=Object.hasOwn(categories,type);
      const safeType=knownType?type:'OTHER';
      entityTypes.set(safeType,(entityTypes.get(safeType)||0)+1);
      sectionCounts[inSection]++;
      sectionTypes[inSection].set(safeType,(sectionTypes[inSection].get(safeType)||0)+1);
      const cat=knownType?categories[type]:'UNKNOWN';entityCategories.set(cat,(entityCategories.get(cat)||0)+1);
      if(cat==='UNKNOWN')flags.unknownEntity=true;
    }
    if(inSection==='BLOCKS'&&type==='BLOCK'){
      if(++blockCount>limits.blocks)fail('BLOCK_LIMIT');
      const name=fields.find(([c])=>c===2)?.[1].toString('hex');
      if(!name)fail('BLOCK_NAME_MISSING');if(currentBlock)fail('NESTED_BLOCK');if(blockNames.has(name))fail('DUPLICATE_BLOCK');currentBlock=name;blockNames.add(name);blockEdges.set(name,[]);
    }else if(inSection==='BLOCKS'&&type==='ENDBLK'){if(!currentBlock)fail('ENDBLK_WITHOUT_BLOCK');currentBlock=null;}
    if(type==='INSERT'){
      flags.blockReference=true;
      const ref=fields.find(([c])=>c===2)?.[1].toString('hex');
      if(!ref)fail('INSERT_NAME_MISSING');insertRefs.add(ref);if(currentBlock)blockEdges.get(currentBlock)?.push(ref);
    }
    if(inSection==='TABLES'&&type==='TABLE')table=ascii(fields.find(([c])=>c===2)?.[1]||Buffer.alloc(0));
    if(inSection==='TABLES'&&type==='ENDTAB')table=null;
    if(inSection==='TABLES'&&table==='LAYER'&&type==='LAYER')layerRecords++;
    if(inSection==='TABLES'&&table==='STYLE'&&type==='STYLE')styleRecords++;
    for(const [code,value] of fields){
      if(code===8)flags.layerReference=true;
      if(code===7)flags.styleReference=true;
      if(code>=210&&code<=230)flags.extrusion=true;
      if(code===38||code===39)flags.thickness=true;
      if(code>=30&&code<=39){const n=numeric(value);if(n===null)flags.nonFiniteCoordinate=true;else if(n!==0)flags.zCoordinate=true;}
      if((code>=10&&code<=29||code>=40&&code<=59)&&numeric(value)===null)flags.nonFiniteCoordinate=true;
      if(['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(type)&&[1,3,4].includes(code)){flags.text=true;if(value.some(x=>x>127))flags.nonAsciiText=true;}
    }
    record=null;
  }
  while(true){
    if(Date.now()-start>limits.wallMs)fail('TIME_LIMIT');
    const codeLine=line();if(codeLine===null)break;
    const value=line();if(value===null)fail('ODD_GROUP_PAIR');
    if(++pairs>limits.pairs)fail('PAIR_LIMIT');
    const codeText=codeLine.toString('latin1').trim();
    if(!/^\d{1,4}$/.test(codeText))fail('INVALID_GROUP_CODE');
    const code=Number(codeText);if(code>1071)fail('INVALID_GROUP_CODE');
    if(value.some(x=>x>127))flags.nonAsciiValue=true;
    if(ended)fail('AFTER_EOF');
    if(pendingSection){
      if(code!==2)fail('SECTION_NAME_MISSING');
      const name=ascii(value);if(!name)fail('SECTION_NAME_INVALID');
      if(sections.has(name))fail('DUPLICATE_SECTION');
      if(sections.size>=limits.sections)fail('SECTION_LIMIT');
      sections.add(name);if(!knownSections.has(name))flags.unknownSection=true;
      section=name;pendingSection=false;continue;
    }
    if(code===0){
      const type=ascii(value);if(!type)fail('RECORD_TYPE_INVALID');
      finishRecord();headerVar=null;
      if(type==='SECTION'){if(section)fail('NESTED_SECTION');pendingSection=true;continue;}
      if(type==='ENDSEC'){if(!section)fail('ENDSEC_WITHOUT_SECTION');if(currentBlock)fail('UNCLOSED_BLOCK');section=null;table=null;continue;}
      if(type==='EOF'){if(section)fail('UNCLOSED_SECTION');ended=true;continue;}
      if(!section)fail('RECORD_OUTSIDE_SECTION');
      record={type,fields:[],inSection:section};continue;
    }
    if(!section)fail('VALUE_OUTSIDE_SECTION');
    if(section==='HEADER'&&code===9){headerVar=ascii(value);continue;}
    if(section==='HEADER'&&headerVar){
      const key=headerVar==='$ACADVER'?'acadver':headerVar==='$DWGCODEPAGE'?'codepage':headerVar==='$INSUNITS'?'insunits':null;
      if(key&&[1,3,70].includes(code))declarations[key].push(key==='insunits'?numeric(value):ascii(value));
    }
    if(record)record.fields.push([code,value]);
  }
  finishRecord();if(!ended)fail('MISSING_EOF');if(pendingSection||section)fail('UNCLOSED_SECTION');
  const distinct=(a)=>[...new Set(a.map(x=>JSON.stringify(x)))];
  for(const a of Object.values(declarations))if(distinct(a).length>1)fail('ENCODING_OR_HEADER_CONFLICT');
  const codepage=declarations.codepage[0]??null;
  const utf8Declared=codepage==='UTF-8'||codepage==='UTF8';
  if(utf8Declared){try{new TextDecoder('utf-8',{fatal:true}).decode(input);}catch{fail('ENCODING_CONFLICT');}}
  // No automatic charset choice: declared legacy codepage is metadata only.
  const encoding=codepage===null?'UNKNOWN':utf8Declared?'UTF8_DECLARED':approvedCodepages.has(codepage)?'LEGACY_DECLARED':'UNSUPPORTED_DECLARATION';
  let maxBlockDepth=0,blockCycle=false,missingBlockReference=[...insertRefs].some(ref=>!blockNames.has(ref));
  const visiting=new Set(),memo=new Map();function depth(name,d){if(Date.now()-start>limits.wallMs)fail('TIME_LIMIT');if(d>limits.depth)fail('BLOCK_DEPTH_LIMIT');if(!blockNames.has(name)){missingBlockReference=true;return 0;}if(visiting.has(name)){blockCycle=true;return 0;}if(memo.has(name)){const cached=memo.get(name);if(d+cached-1>limits.depth)fail('BLOCK_DEPTH_LIMIT');return cached;}visiting.add(name);let n=1;for(const ref of blockEdges.get(name)||[])n=Math.max(n,1+depth(ref,d+1));visiting.delete(name);memo.set(name,n);return n;}
  for(const name of blockNames)maxBlockDepth=Math.max(maxBlockDepth,depth(name,1));
  const ordered=(m)=>Object.fromEntries([...m].sort(([a],[b])=>a.localeCompare(b)));
  const acadver=declarations.acadver[0];
  return {schema:'dxf-capability-inventory@1',source:{sha256:createHash('sha256').update(input).digest('hex'),bytes:input.length},structure:{pairs,sections:[...sections].map(s=>knownSections.has(s)?s:'OTHER'),entityCount,bySection:{ENTITIES:{count:sectionCounts.ENTITIES,types:ordered(sectionTypes.ENTITIES)},BLOCKS:{count:sectionCounts.BLOCKS,types:ordered(sectionTypes.BLOCKS)}},blockCount,maxBlockDepth,blockCycle,missingBlockReference,layerRecords,styleRecords},declarations:{acadver:acadver&&/^AC\d{4}$/.test(acadver)?acadver:null,codepage:approvedCodepages.has(codepage)?codepage:null,insunits:declarations.insunits[0]??null,encoding},entityTypes:ordered(entityTypes),entityCategories:ordered(entityCategories),flags,support:'INVENTORY_ONLY'};
}

if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){
  try{const path=process.argv[2];const s=await stat(path);if(!s.isFile())fail('INPUT_TYPE');if(s.size>LIMITS.bytes)fail('BYTE_LIMIT');const b=await readFile(path);process.stdout.write(JSON.stringify(inventoryDxf(b))+'\n');}
  catch(e){process.stderr.write(JSON.stringify({error:e.code||'INVENTORY_FAILED'})+'\n');process.exitCode=1;}
}
