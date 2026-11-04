/** #225/B2-A: bounded, standalone Node CPU DXF conversion candidate.
 * This intentionally supports an extremely narrow 2D LINE subset. It MUST NOT
 * be wired to Job READY or SceneRepository publish until provenance, background
 * authorization, an isolated worker and deployment gates are implemented.
 * No WebGLRenderer, browser DOM or three-dxf-viewer runtime is used.
 */
import * as THREE from 'three';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sceneSha256} from '../../domain/scene-digest';
import {cpuSceneScope,type SceneManifest} from '../../domain/cad-scene';
import {validateStoredScenePayload} from '../../domain/scene-payload';
import {type SceneBuildErrorCode} from '../../domain/scene-build-job';
import {tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {serializeSourceScene} from '../../viewers/three-dxf-viewer/scene-serialization';

export const CPU_LINE_LIMITS=Object.freeze({
  sourceBytes:16*1024*1024,pairs:300_000,lines:5_000,coordinate:1_000_000,
});
export class CpuLineCandidateError extends Error{
  constructor(readonly code:SceneBuildErrorCode){super(code);this.name='CpuLineCandidateError';}
}
type Pair=Readonly<{code:number;value:string}>;
type Line2D=Readonly<{start:readonly[number,number];end:readonly[number,number]}>;
export type CpuLineParse=Readonly<{lines:readonly Line2D[];sourceUnit:'DXF_INSUNITS_4'}>;
const malformed=():never=>{throw new CpuLineCandidateError('SCENE_DXF_PARSE_FAILED');};
const unsupported=():never=>{throw new CpuLineCandidateError('SCENE_CONVERTER_UNAVAILABLE');};
const entityCodes=new Set([5,8,10,20,30,11,21,31,62,6,370,100,330,210,220,230]);
function pairsFromSource(bytes:Uint8Array):Pair[]{
  if(bytes.length===0||bytes.length>CPU_LINE_LIMITS.sourceBytes)
    throw new CpuLineCandidateError('SCENE_ASSET_TOO_LARGE');
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{return malformed();}
  if(text.includes('\0'))return malformed();
  const lines=text.replace(/\r\n?/g,'\n').split('\n');
  if(lines.at(-1)==='')lines.pop();
  if(lines.length%2!==0||lines.length<8||lines.length/2>CPU_LINE_LIMITS.pairs)return malformed();
  const result:Pair[]=[];
  for(let i=0;i<lines.length;i+=2){
    if(!/^\s*\d{1,4}\s*$/.test(lines[i]))return malformed();
    const code=Number(lines[i].trim());
    if(code>1071)return malformed();
    result.push({code,value:lines[i+1].trim()});
  }
  return result;
}
function coordinates(fields:Map<number,string>,code:number):number{
  const raw=fields.get(code);
  if(raw===undefined||raw.length===0)return malformed();
  const result=Number(raw);
  if(!Number.isFinite(result)||Math.abs(result)>CPU_LINE_LIMITS.coordinate)return malformed();
  return result;
}
function parseLine(groups:readonly Pair[],usedHandles:Set<string>):Line2D{
  const fields=new Map<number,string>();
  for(const item of groups){
    if(!entityCodes.has(item.code))return unsupported();
    if(item.code===100){
      if(item.value!=='AcDbEntity'&&item.value!=='AcDbLine')return unsupported();
      continue;
    }
    if(fields.has(item.code))return malformed();
    fields.set(item.code,item.value);
  }
  if(fields.get(8)!==undefined&&fields.get(8)!=='0')return unsupported();
  const color=fields.get(62);
  if(color!==undefined&&color!=='7'&&color!=='256')return unsupported();
  const linetype=fields.get(6);
  if(linetype!==undefined&&linetype!=='CONTINUOUS'&&linetype!=='BYLAYER')return unsupported();
  const weight=fields.get(370);
  if(weight!==undefined&&weight!=='-1'&&weight!=='-3')return unsupported();
  const extrusion:[number,number,number]=[
    fields.has(210)?coordinates(fields,210):0,
    fields.has(220)?coordinates(fields,220):0,
    fields.has(230)?coordinates(fields,230):1,
  ];
  if(extrusion[0]!==0||extrusion[1]!==0||extrusion[2]!==1)return unsupported();
  if((fields.has(30)&&coordinates(fields,30)!==0)||
     (fields.has(31)&&coordinates(fields,31)!==0))return unsupported();
  const handle=fields.get(5);
  if(handle!==undefined){
    if(!/^[0-9A-Fa-f]{1,16}$/.test(handle)||usedHandles.has(handle.toUpperCase()))return malformed();
    usedHandles.add(handle.toUpperCase());
  }
  const start:[number,number]=[coordinates(fields,10),coordinates(fields,20)];
  const end:[number,number]=[coordinates(fields,11),coordinates(fields,21)];
  if(start[0]===end[0]&&start[1]===end[1])return malformed();
  return {start,end};
}

/** Parse only HEADER($INSUNITS=4) + ENTITIES(LINE). No silent omissions.
 * TABLES/BLOCKS/OBJECTS, TEXT, INSERT, arbitrary layer color or 3D data are
 * explicitly unsupported, not "ignored until later".
 */
export function parseCpuLineOnlyDxf(bytes:Uint8Array):CpuLineParse{
  const pairs=pairsFromSource(bytes);
  let section='',waiting=false,headerVar='',sawHeader=false,sawEntities=false,eof=false,unit:number|undefined;
  let current:Pair[]|null=null;
  const lines:Line2D[]=[],handles=new Set<string>();
  const finish=()=>{
    if(current===null)return;
    if(lines.length>=CPU_LINE_LIMITS.lines)
      throw new CpuLineCandidateError('SCENE_ASSET_TOO_LARGE');
    lines.push(parseLine(current,handles));current=null;
  };
  for(const p of pairs){
    if(eof)return malformed();
    if(waiting){
      if(p.code!==2||!(p.value==='HEADER'||p.value==='ENTITIES'))return unsupported();
      if(p.value==='HEADER'){if(sawHeader)return malformed();sawHeader=true;}
      else {if(sawEntities)return malformed();sawEntities=true;}
      section=p.value;waiting=false;continue;
    }
    if(p.code===0){
      if(section==='ENTITIES')finish();
      if(p.value==='SECTION'){
        if(section!=='')return malformed();waiting=true;
      }else if(p.value==='ENDSEC'){
        if(section==='')return malformed();section='';headerVar='';
      }else if(p.value==='EOF'){
        if(section!==''||waiting)return malformed();eof=true;
      }else if(section==='ENTITIES'&&p.value==='LINE'){
        current=[];
      }else return unsupported();
      continue;
    }
    if(section==='HEADER'){
      if(p.code===9){
        headerVar=p.value;
        if(headerVar!=='$INSUNITS'&&headerVar!=='$ACADVER')return unsupported();
      }else if(headerVar==='$INSUNITS'&&p.code===70){
        if(unit!==undefined)return malformed();
        unit=Number(p.value);
        if(unit!==4)return unsupported();
      }else if(headerVar==='$ACADVER'&&p.code===1){
        if(!/^AC10\d{2}$/.test(p.value))return malformed();
      }else return unsupported();
    }else if(section==='ENTITIES'){
      if(current===null)return malformed();
      current.push(p);
    }else return malformed();
  }
  if(!eof||waiting||section!==''||!sawHeader||!sawEntities||unit!==4||lines.length===0)
    return malformed();
  return {lines,sourceUnit:'DXF_INSUNITS_4'};
}
export type CpuLineCandidate=Readonly<{
  bytes:Uint8Array;manifest:SceneManifest;lineCount:number;readbackVerified:true;
}>;
/** Candidate conversion + an actual private tempfile readback.
 * This offline candidate uses the versioned CPU identity. Existing B1 Job
 * enqueue still uses the browser Builder; no actual publish/READY is wired.
 */
export async function buildCpuLineCandidate(input:Readonly<{
  source:Uint8Array;versionId:string;sourceSha256:string;
}>):Promise<CpuLineCandidate>{
  if(sceneSha256(input.source)!==input.sourceSha256)
    throw new CpuLineCandidateError('SCENE_SOURCE_DIGEST_MISMATCH');
  const parsed=parseCpuLineOnlyDxf(input.source);
  const root=new THREE.Group();root.name='DXF_CPU_LINE_CANDIDATE';
  try{
    for(let i=0;i<parsed.lines.length;i++){
      const item=parsed.lines[i];
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([
        item.start[0],item.start[1],0,item.end[0],item.end[1],0,
      ],3));
      const segment=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xffffff}));
      segment.name='DXF_LINE_'+String(i+1);
      segment.userData.cadLayer='0';
      root.add(segment);
    }
    const scope=cpuSceneScope(input.versionId,input.sourceSha256,parsed.sourceUnit);
    const asset=tagImportedTree(root,scope);
    const candidate=await serializeSourceScene(root,asset,'CUSTOM_DTO');
    validateStoredScenePayload(candidate.bytes,candidate.manifest);
    const work=await mkdtemp(join(tmpdir(),'g7-cpu-line-proof-'));
    try{
      const file=join(work,'candidate.dto');
      await writeFile(file,candidate.bytes,{flag:'wx',mode:0o600});
      const readback=await readFile(file);
      if(sceneSha256(readback)!==candidate.manifest.sha256||
         readback.length!==candidate.bytes.length)
        throw new CpuLineCandidateError('SCENE_VALIDATE_FAILED');
      validateStoredScenePayload(readback,candidate.manifest);
      return {bytes:Uint8Array.from(readback),manifest:candidate.manifest,
        lineCount:parsed.lines.length,readbackVerified:true};
    }finally{await rm(work,{recursive:true,force:true});}
  }finally{
    root.traverse(node=>{
      const obj=node as THREE.Line;
      obj.geometry?.dispose();
      const material=obj.material;
      if(Array.isArray(material))material.forEach(m=>m.dispose());
      else material?.dispose();
    });
  }
}
