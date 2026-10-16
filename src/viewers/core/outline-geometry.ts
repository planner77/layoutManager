/** Issue #31: conservative, source-coordinate DXF geometry index.
 * Browser-only outlines never mutate the original CAD file. Unsupported coordinates
 * are diagnosed rather than replaced by screen-space bounds. */
export type XY = [number, number];
export type OutlineKind = 'CONVEX' | 'PRECISE';
export type OutlinePath = { points: XY[]; closed: boolean };
export type OutlineEntity = {
  id: string; handle: string | null; entityType: string; layer: string;
  instancePath: string[]; stable: boolean; paths: OutlinePath[];
  bounds: [number, number, number, number];
};
export type DxfOutlineIndex = {
  versionId: string; sourceSha256: string; unitCode: number | null;
  entities: OutlineEntity[]; warnings: string[];
};
type Pair = { code: number; value: string };
type Raw = { type: string; pairs: Pair[]; index: number; vertices?: Raw[] };
type Block = { base: XY; entities: Raw[] };
type Affine = { a: number; b: number; c: number; d: number; x: number; y: number };
const identity: Affine = {a: 1, b: 0, c: 0, d: 1, x: 0, y: 0};
const EPS = 1e-8;
export const OUTLINE_VERTEX_LIMIT = 100_000;
export function pairValue(raw: Raw, code: number): string | undefined {
  return raw.pairs.find(item => item.code === code)?.value;
}
function numberValue(raw: Raw, code: number, fallback = NaN): number {
  const value = pairValue(raw, code);
  return value === undefined ? fallback : Number(value);
}
function point(raw: Raw, xcode = 10): XY | null {
  const x = numberValue(raw, xcode), y = numberValue(raw, xcode + 10, 0);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}
function apply(t: Affine, p: XY): XY {
  return [t.a*p[0] + t.c*p[1] + t.x, t.b*p[0] + t.d*p[1] + t.y];
}
function multiply(u: Affine, v: Affine): Affine {
  return {
    a:u.a*v.a+u.c*v.b, b:u.b*v.a+u.d*v.b,
    c:u.a*v.c+u.c*v.d, d:u.b*v.c+u.d*v.d,
    x:u.a*v.x+u.c*v.y+u.x, y:u.b*v.x+u.d*v.y+u.y,
  };
}
function readPairs(text: string): Pair[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 2_000_000) throw new Error('DXF 그룹 개수 제한을 초과했습니다.');
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) throw new Error('DXF 그룹 코드 형식이 올바르지 않습니다.');
    pairs.push({code, value: lines[i+1].trim()});
  }
  return pairs;
}
function records(pairs: Pair[]): Raw[] {
  const result: Raw[] = [];
  let active: Raw | null = null;
  for (const pair of pairs) {
    if (pair.code === 0) {
      active = {type:pair.value.toUpperCase(), pairs:[], index:result.length};
      result.push(active);
    } else if (active) active.pairs.push(pair);
  }
  return result;
}
function extrusionSupported(raw: Raw) {
  const x=numberValue(raw,210,0), y=numberValue(raw,220,0), z=numberValue(raw,230,1);
  return Math.abs(x)<EPS && Math.abs(y)<EPS && Math.abs(z-1)<EPS;
}
function createPaths(raw: Raw, tolerance: number): OutlinePath[] {
  if (!extrusionSupported(raw)) throw new Error('비표준 OCS(Extrusion)는 2D WCS 변환 검증 전까지 제외합니다.');
  if (raw.type === 'LINE') {
    const p=point(raw,10), q=point(raw,11);
    if (!p || !q) throw new Error('LINE 좌표가 유효하지 않습니다.');
    return [{points:[p,q],closed:false}];
  }
  if (raw.type === 'LWPOLYLINE' || raw.type === 'POLYLINE') {
    if (raw.type === 'POLYLINE' && (numberValue(raw,70,0) & (8 | 16 | 64))) throw new Error('3D/mesh POLYLINE은 지원하지 않습니다.');
    const vertices: XY[] = [];
    if (raw.type === 'POLYLINE') {
      for (const vertex of raw.vertices ?? []) {
        const p=point(vertex);
        if (!p) throw new Error('POLYLINE 꼭짓점이 유효하지 않습니다.');
        if (Math.abs(numberValue(vertex,42,0))>EPS) throw new Error('Bulge 원호 POLYLINE은 현재 미지원입니다.');
        vertices.push(p);
      }
    } else {
      let vx: number | undefined;
      for (const {code,value} of raw.pairs) {
        if (code === 10) { vx=Number(value); }
        if (code === 42 && Math.abs(Number(value))>EPS) throw new Error('Bulge 원호 LWPOLYLINE은 현재 미지원입니다.');
        if (code === 20) {
          const y=Number(value);
          if (vx === undefined || !Number.isFinite(vx) || !Number.isFinite(y)) throw new Error('LWPOLYLINE 꼭짓점이 유효하지 않습니다.');
          vertices.push([vx,y]);vx=undefined;
        }
      }
    }
    if (vertices.length < 2) throw new Error('POLYLINE 꼭짓점이 2개 미만입니다.');
    return [{points:vertices,closed:Boolean(numberValue(raw,70,0)&1)}];
  }
  if (raw.type === 'CIRCLE' || raw.type === 'ARC') {
    const center=point(raw), radius=numberValue(raw,40);
    if (!center || !Number.isFinite(radius) || radius<=0) throw new Error('CIRCLE/ARC 중심 또는 반경이 유효하지 않습니다.');
    const full=raw.type==='CIRCLE', start=full?0:numberValue(raw,50)*Math.PI/180;
    const end=full?2*Math.PI:numberValue(raw,51)*Math.PI/180;
    if (!Number.isFinite(start)||!Number.isFinite(end)) throw new Error('ARC 각도가 유효하지 않습니다.');
    const span=full?2*Math.PI:((end-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
    if (!full && span<EPS) throw new Error('ARC 시작/종료 각도가 같습니다.');
    const step=2*Math.acos(Math.max(-1,Math.min(1,1-tolerance/radius)));
    const count=Math.min(512,Math.max(8,Math.ceil(span/Math.max(step,1e-5))));
    const vertices:XY[]=[];
    for(let i=0;i<(full?count:count+1);i++) {
      const a=start+span*i/count;
      vertices.push([center[0]+radius*Math.cos(a),center[1]+radius*Math.sin(a)]);
    }
    return [{points:vertices,closed:full}];
  }
  throw new Error(raw.type+' Entity는 외곽선 대상으로 검증되지 않았습니다.');
}
function buildIndex(pairs: Pair[]) {
  const all=records(pairs), blocks=new Map<string,Block>(), entities:Raw[]=[];
  const counts=new Map<string,number>();
  let section='', block:Block|null=null, polyline:Raw|null=null, unitCode:number|null=null;
  for(let k=0;k<pairs.length;k++) {
    if(pairs[k].code===9 && pairs[k].value==='$INSUNITS') {
      const v=pairs[k+1];if(v?.code===70 && Number.isInteger(Number(v.value)))unitCode=Number(v.value);
    }
  }
  for(const raw of all) {
    const h=pairValue(raw,5);
    if (h) counts.set(h.toUpperCase(),(counts.get(h.toUpperCase())??0)+1);
    if(raw.type==='SECTION'){section=pairValue(raw,2)?.toUpperCase()??'';polyline=null;continue;}
    if(raw.type==='ENDSEC'){section='';block=null;polyline=null;continue;}
    if(section==='BLOCKS' && raw.type==='BLOCK') {
      const name=pairValue(raw,2);
      if(name){block={base:point(raw)??[0,0],entities:[]};blocks.set(name,block);}else block=null;
      continue;
    }
    if(raw.type==='ENDBLK'){block=null;polyline=null;continue;}
    if(section!=='ENTITIES' && section!=='BLOCKS')continue;
    const destination=section==='BLOCKS'?block?.entities:entities;
    if(!destination)continue;
    if(raw.type==='VERTEX' && polyline){polyline.vertices?.push(raw);continue;}
    if(raw.type==='SEQEND'){polyline=null;continue;}
    if(raw.type==='POLYLINE'){raw.vertices=[];polyline=raw;} else polyline=null;
    destination.push(raw);
  }
  return {blocks,entities,counts,unitCode};
}
function bounds(paths: OutlinePath[]): [number,number,number,number] {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const path of paths) for(const [x,y] of path.points) {
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  return [minX,minY,maxX,maxY];
}
function handleIsStable(raw: Raw, counts: Map<string,number>) {
  const handle=pairValue(raw,5);
  return !!handle && /^[0-9a-f]+$/i.test(handle) && counts.get(handle.toUpperCase())===1;
}
export function parseDxfOutlineIndex(text:string,versionId:string,sourceSha256:string,tolerance=0.02):DxfOutlineIndex {
  if(!text.includes('SECTION') || !text.includes('EOF'))throw new Error('올바른 ASCII DXF가 아닙니다.');
  const {blocks,entities:source,counts,unitCode}=buildIndex(readPairs(text));
  const entities:OutlineEntity[]=[],warnings:string[]=[];
  const goodHash=/^[a-f0-9]{64}$/i.test(sourceSha256);
  const warn=(raw:Raw,message:string)=>{if(warnings.length<200)warnings.push(raw.type+' #'+raw.index+': '+message);};
  function transformed(raw:Raw,t:Affine,stack:string[],depth:number):OutlinePath[] {
    if(depth>12) throw new Error('BLOCK 재귀 깊이가 초과되었습니다.');
    if(raw.type!=='INSERT') {
      return createPaths(raw,tolerance).map(path=>({closed:path.closed,points:path.points.map(p=>apply(t,p))}));
    }
    if(!extrusionSupported(raw))throw new Error('비표준 OCS INSERT는 지원하지 않습니다.');
    const name=pairValue(raw,2),block=name&&blocks.get(name);
    if(!name || !block)throw new Error('INSERT 블록 정의를 찾을 수 없습니다.');
    if(stack.includes(name))throw new Error('재귀 순환 BLOCK을 지원하지 않습니다.');
    if(numberValue(raw,70,1)!==1 || numberValue(raw,71,1)!==1)throw new Error('배열 INSERT는 지원하지 않습니다.');
    const position=point(raw);if(!position)throw new Error('INSERT 삽입점이 유효하지 않습니다.');
    const sx=numberValue(raw,41,1),sy=numberValue(raw,42,1),angle=numberValue(raw,50,0)*Math.PI/180;
    if(![sx,sy,angle].every(Number.isFinite)||Math.abs(sx)<EPS||Math.abs(sy)<EPS)throw new Error('INSERT 변환이 유효하지 않습니다.');
    const c=Math.cos(angle),s=Math.sin(angle);
    const local:Affine={a:c*sx,b:s*sx,c:-s*sy,d:c*sy,x:position[0],y:position[1]};
    local.x-=local.a*block.base[0]+local.c*block.base[1];
    local.y-=local.b*block.base[0]+local.d*block.base[1];
    const nested=multiply(t,local);
    const paths:OutlinePath[]=[];
    for(const child of block.entities) {
      try {paths.push(...transformed(child,nested,[...stack,name],depth+1));}
      catch(error){warn(child,error instanceof Error?error.message:String(error));}
    }
    if(!paths.length)throw new Error('INSERT 내부에 지원되는 도형이 없습니다.');
    return paths;
  }
  for(const raw of source) {
    if(entities.length>=OUTLINE_VERTEX_LIMIT)throw new Error('분석 가능한 Entity 개수 제한을 초과했습니다.');
    try {
      const paths=transformed(raw,identity,[],0);
      if(!paths.length || paths.some(p=>p.points.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y))))throw new Error('유효한 2D 경로가 없습니다.');
      const handle=pairValue(raw,5)??null,stable=goodHash&&handleIsStable(raw,counts);
      const id=stable?versionId+':'+sourceSha256.toLowerCase()+':'+handle!.toUpperCase():versionId+':TEMP:'+raw.index;
      const layer=pairValue(raw,8)??'0';
      entities.push({id,handle,entityType:raw.type,layer,instancePath:[],stable,paths,bounds:bounds(paths)});
      if(!stable)warn(raw,'Handle 또는 SHA가 안정적이지 않아 JSON 참조를 영속화할 수 없습니다.');

    } catch(error) {warn(raw,error instanceof Error?error.message:String(error));}
  }
  return {versionId,sourceSha256,unitCode,entities,warnings};
}
export function geometryBounds(entities:OutlineEntity[]):[number,number,number,number]|null {
  if(!entities.length)return null;
  return entities.reduce<[number,number,number,number]>((box,e)=>[
    Math.min(box[0],e.bounds[0]),Math.min(box[1],e.bounds[1]),
    Math.max(box[2],e.bounds[2]),Math.max(box[3],e.bounds[3]),
  ],[Infinity,Infinity,-Infinity,-Infinity]);
}
export function convexHull(points:XY[]):XY[] {
  const clean=[...new Map(points.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>[p[0]+','+p[1],p])).values()]
    .sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
  if(clean.length<3)throw new Error('볼록 외곽선은 서로 다른 좌표 3개 이상이 필요합니다.');
  const cross=(o:XY,a:XY,b:XY)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower:XY[]=[],upper:XY[]=[];
  for(const p of clean){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
  for(let i=clean.length-1;i>=0;i--){const p=clean[i];while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
  const result=[...lower.slice(0,-1),...upper.slice(0,-1)];
  if(result.length<3)throw new Error('모든 좌표가 공선이며 면적이 없는 외곽선입니다.');
  return result;
}
