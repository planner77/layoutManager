/** Issue #31: pure outline computation. Only genuinely closed linework has area.
 * Polygon Union is delegated to polygon-clipping; no guessed concave hulls. */
// polygon-clipping 0.15.7 exposes a DEFAULT export in its ESM build.
 // Named "union" only works via CJS interop and silently breaks Webpack Workers.
import polygonClipping from 'polygon-clipping';
import { convexHull, type XY, type OutlineKind, type OutlineEntity, type OutlinePath } from './outline-geometry';
export type GeoJSONOutline = {type:'Polygon';coordinates:XY[][]} | {type:'MultiPolygon';coordinates:XY[][][]};
export type OutlineResult = {
  kind:OutlineKind; algorithm:string; geometry:GeoJSONOutline;
  sourceEntityIds:string[]; persistable:boolean; warnings:string[];
  tolerance:number; durationMs:number;
};
const EPS=1e-8;
function close(ring:XY[]):XY[] {return [...ring,[...ring[0]] as XY];}
function distance(a:XY,b:XY){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
function signedArea(p:XY[]){return p.reduce((sum,v,i)=>{const n=p[(i+1)%p.length];return sum+v[0]*n[1]-n[0]*v[1];},0)/2;}
function orientation(a:XY,b:XY,c:XY){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function onSegment(a:XY,p:XY,b:XY){
 return Math.abs(orientation(a,p,b))<EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;
}
function intersects(a:XY,b:XY,c:XY,d:XY){
 const u=orientation(a,b,c),v=orientation(a,b,d),w=orientation(c,d,a),x=orientation(c,d,b);
 return (u*v<-EPS&&w*x<-EPS)||onSegment(a,c,b)||onSegment(a,d,b)||onSegment(c,a,d)||onSegment(c,b,d);
}
function normalizeRing(input:XY[],tol:number):XY[] {
 const p=input.map(v=>[v[0],v[1]] as XY);
 if(p.length>1&&distance(p[0],p[p.length-1])<=tol)p.pop();
 const compact=p.filter((v,i)=>i===0||distance(v,p[i-1])>tol/100);
 if(compact.length<3||Math.abs(signedArea(compact))<=EPS)throw new Error('폐곡선에 서로 다른 비공선 꼭짓점 3개 이상이 필요합니다.');
 if(compact.length>5000)throw new Error('단일 폐곡선의 꼭짓점 5,000개 한도를 초과했습니다.');
 for(let i=0;i<compact.length;i++){
   for(let j=i+2;j<compact.length;j++){
     if(i===0&&j===compact.length-1)continue;
     if(intersects(compact[i],compact[(i+1)%compact.length],compact[j],compact[(j+1)%compact.length]))
       throw new Error('자기 교차 또는 중복 선분이 있는 폐곡선입니다.');
   }
 }
 return compact;
}
function boundaryCrosses(inner:XY[],outer:XY[]):boolean {
 // A ring's vertices can all be within a concave polygon while an edge crosses
 // outside of its notch. Crossing contours are not parent/child holes.
 for(let i=0;i<inner.length;i++){
   const a=inner[i],b=inner[(i+1)%inner.length];
   for(let j=0;j<outer.length;j++){
     const c=outer[j],d=outer[(j+1)%outer.length];
     if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-EPS||
        Math.min(a[0],b[0])>Math.max(c[0],d[0])+EPS||
        Math.max(a[1],b[1])<Math.min(c[1],d[1])-EPS||
        Math.min(a[1],b[1])>Math.max(c[1],d[1])+EPS)continue;
     if(intersects(a,b,c,d))return true;
   }
 }
 return false;
}
function pointInside(p:XY,ring:XY[]):boolean {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[i],b=ring[j];
   if(onSegment(a,p,b))return true;
   if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
function chainsToRings(paths:OutlinePath[],tol:number,warnings:string[]) {
 const rings:XY[][]=[],pending:XY[][]=[];
 for(const path of paths){
   if(path.points.length<2)continue;
   if(path.closed||distance(path.points[0],path.points[path.points.length-1])<=tol) {
     try{rings.push(normalizeRing(path.points,tol));}catch(error){warnings.push(String(error));}
   }else pending.push([...path.points]);
 }
 // Join LINE/ARC chains only at matching endpoints. No implicit gap filling.
 while(pending.length){
   let chain=pending.shift()!,found=true,joined=0;
   while(found&&distance(chain[0],chain[chain.length-1])>tol){
     found=false;
     for(let i=0;i<pending.length;i++){
       const item=pending[i],start=chain[chain.length-1];
       if(distance(start,item[0])<=tol||distance(start,item[item.length-1])<=tol){
         if(distance(start,item[0])>tol)item.reverse();
         chain=[...chain,...item.slice(1)];pending.splice(i,1);found=true;joined++;break;
       }
     }
     if(joined>10000)throw new Error('연결 선분 개수가 과도합니다.');
   }
   if(distance(chain[0],chain[chain.length-1])<=tol){
     try{rings.push(normalizeRing(chain,tol));}catch(error){warnings.push(String(error));}
   }else warnings.push('미폐합 LINE/ARC는 면적이 없으므로 정밀 외곽선에서 제외했습니다.');
 }
 return rings;
}
export function computeOutline(kind:OutlineKind,entities:OutlineEntity[],tolerance=0.02):OutlineResult {
 const started=performance.now();
 if(!entities.length)throw new Error('외곽선을 생성하려면 먼저 객체를 선택해야 합니다.');
 if(entities.length>10000)throw new Error('선택 객체가 10,000개를 초과합니다.');
 if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>1000)throw new Error('허용 오차가 올바르지 않습니다.');
 const warnings:string[]=[];
 const allPaths=entities.flatMap(e=>e.paths);
 if(allPaths.reduce((n,p)=>n+p.points.length,0)>100_000)throw new Error('선택한 선분 샘플이 100,000개를 초과했습니다.');
 let geometry:GeoJSONOutline;
 if(kind==='CONVEX'){
   const hull=convexHull(allPaths.flatMap(p=>p.points));
   geometry={type:'Polygon',coordinates:[close(hull)]};
 }else if(kind==='PRECISE'){
   const rings=chainsToRings(allPaths,tolerance,warnings);
   if(!rings.length)throw new Error('유효한 폐곡선이 없습니다. 열려 있는 LINE/ARC와 자기 교차를 확인하세요.');
   // Even-odd nesting: a contained ring is a hole, an island within a hole is an exterior.
   // Intersecting (not nested) exteriors are unioned; ring orientation is not assumed.
   const parents=rings.map((ring,i)=>{
     let parent=-1,area=Infinity;
     for(let j=0;j<rings.length;j++){
       if(i===j||Math.abs(signedArea(rings[j]))<=Math.abs(signedArea(ring))+EPS)continue;
       if(!ring.every(p=>pointInside(p,rings[j])))continue;
       if(boundaryCrosses(ring,rings[j]))continue;
       const a=Math.abs(signedArea(rings[j]));
       if(a<area){area=a;parent=j;}
     }
     return parent;
   });
   const depth=(idx:number)=>{let d=0,p=parents[idx];while(p!==-1){if(++d>rings.length)throw new Error('폐곡선 포함 관계가 순환합니다.');p=parents[p];}return d;};
   const polys:XY[][][]=[];
   for(let i=0;i<rings.length;i++){
     if(depth(i)%2)continue;
     const holes=rings.filter((_,j)=>parents[j]===i && depth(j)%2===1);
     polys.push([close(rings[i]),...holes.map(close)]);
   }
   // polygon-clipping returns MultiPolygon geometry with interior holes preserved.
   const merged=polygonClipping.union(polys[0],...polys.slice(1)) as XY[][][];
   if(!merged.length)throw new Error('정밀 Polygon Union 결과가 비어 있습니다.');
   geometry=merged.length===1?{type:'Polygon',coordinates:merged[0]}:{type:'MultiPolygon',coordinates:merged};
 }else throw new Error('지원하지 않는 외곽선 유형입니다.');
 return {kind,algorithm:kind==='CONVEX'?'monotone-chain-v1':'polygon-clipping-union-v1',
   geometry,sourceEntityIds:entities.map(e=>e.id),persistable:entities.every(e=>e.stable),
   warnings,tolerance,durationMs:performance.now()-started};
}
