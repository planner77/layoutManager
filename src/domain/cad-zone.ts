/** #196: semantic floor zones, independent from outline types and memo anchors. */
import polygonClipping from 'polygon-clipping';

export type ZonePoint = Readonly<{x:number;y:number}>;
export type ZonePolygon = {type:'Polygon';coordinates:[number,number][][]};
export type ZoneBounds = {minX:number;minY:number;maxX:number;maxY:number};
export const ZONE_MAX_POINTS=512;
export const ZONE_MAX_COUNT=200;
export const ZONE_COORDINATE_LIMIT=1e12;
export const ZONE_REFERENCE_KINDS=['EQUIPMENT','PROCESS','SYSTEM','DOCUMENT','OTHER'] as const;
export type ZoneReference = {label:string;kind:typeof ZONE_REFERENCE_KINDS[number];value:string;url?:string};
export type ZoneMetadata = {
 name:string;categoryId:string|null;description:string;code:string;tags:string[];sortOrder:number;
 parentZoneId:string|null;references:ZoneReference[];
};
export type ZoneGeometryDto = {
 versionId:string;sourceSha256:string;sceneRevision:number;polygon:ZonePolygon;
 state:'MAPPED'|'UNMAPPED';revision:number;bounds:ZoneBounds;area:number;reason?:string;
};
export type CadZoneDto = ZoneMetadata & {
 id:string;locationId:string;siteId:string;revision:number;createdById:string;updatedById:string;
 createdAt:string;updatedAt:string;geometry:ZoneGeometryDto|null;
};
export type ZoneCategoryDto = {id:string;name:string;revision:number;active:boolean;sortOrder:number};
export type ZoneListDto = {
 zones:CadZoneDto[];categories:ZoneCategoryDto[];actorId:string;canEdit:boolean;canDeleteAny:boolean;
 canManageCategories:boolean;locationId:string;siteId:string;versionId:string;sourceSha256:string;
 sceneRevision:number|null;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const controls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const invalid=(message:string):never=>{throw new Error(message);};
const record=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('구역 입력 형식을 확인하세요.');
 return value as Record<string,unknown>;
};
function text(value:unknown,max:number,required=false,multiline=false):string{
 if(typeof value!=='string')invalid('구역 텍스트 입력을 확인하세요.');
 const s=(value as string).replace(/\r\n?/g,'\n').normalize('NFC').trim();
 if(s.length>max||(required&&!s)||controls.test(s)||(!multiline&&/[\n\t]/u.test(s)))
  invalid(`구역 텍스트는 ${required?'1~':''}${max}자 ${multiline?'':'한 줄 '}일반 텍스트여야 합니다.`);
 return s;
}
export const zoneNameKey=(name:string)=>name.normalize('NFC').trim().toLowerCase();
function optionalId(value:unknown):string|null{
 if(value===null||value===undefined)return null;
 if(typeof value!=='string'||!uuid.test(value))invalid('유효한 구역·카테고리 ID를 선택하세요.');
 return value as string;
}
export function normalizeZoneReferences(input:unknown):ZoneReference[]{
 if(!Array.isArray(input)||input.length>20)invalid('참조 정보는 최대 20개입니다.');
 return (input as unknown[]).map(value=>{
  const r=record(value);
  if(Object.keys(r).some(k=>!['label','kind','value','url'].includes(k)))invalid('지원하지 않는 참조 필드입니다.');
  if(!ZONE_REFERENCE_KINDS.includes(r.kind as ZoneReference['kind']))invalid('참조 종류를 선택하세요.');
  const result:ZoneReference={label:text(r.label,100,true),kind:r.kind as ZoneReference['kind'],value:text(r.value,500,true)};
  if(r.url!==undefined&&r.url!==''){
   const raw=text(r.url,2048,true);
   let u:URL;
   try{u=new URL(raw);}catch{invalid('참조 URL은 HTTP/HTTPS 주소여야 합니다.');}
   if(!['http:','https:'].includes(u!.protocol)||u!.username||u!.password||!u!.hostname||
      /[\s\\]/u.test(raw)||u!.search||u!.hash)
    invalid('참조 URL은 인증정보·query·fragment 없는 HTTP/HTTPS 주소여야 합니다.');
   result.url=u!.href;
  }
  return result;
 });
}
export function normalizeZoneMetadata(input:unknown):ZoneMetadata{
 const b=record(input);
 const tags=b.tags??[];
 if(!Array.isArray(tags)||tags.length>20)invalid('태그는 최대 20개입니다.');
 const normalizedTags=(tags as unknown[]).map(t=>text(t,50,true));
 if(new Set(normalizedTags.map(zoneNameKey)).size!==normalizedTags.length)invalid('중복 태그를 제거하세요.');
 const sortOrder=b.sortOrder??0;
 if(!Number.isSafeInteger(sortOrder)||(sortOrder as number)<0||(sortOrder as number)>9999)
  invalid('정렬순서는 0~9999 정수여야 합니다.');
 return {name:text(b.name,100,true),categoryId:optionalId(b.categoryId),description:text(b.description??'',2000,false,true),
  code:text(b.code??'',100),tags:normalizedTags,sortOrder:sortOrder as number,parentZoneId:optionalId(b.parentZoneId),
  references:normalizeZoneReferences(b.references??[])};
}
const eq=(a:readonly number[],b:readonly number[])=>a[0]===b[0]&&a[1]===b[1];
const cross=(a:readonly number[],b:readonly number[],c:readonly number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const sign=(n:number)=>n===0?0:n>0?1:-1;
function onSegment(a:readonly number[],p:readonly number[],b:readonly number[]){
 return cross(a,b,p)===0&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&
  p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
}
function segmentsIntersect(a:readonly number[],b:readonly number[],c:readonly number[],d:readonly number[]){
 const abC=sign(cross(a,b,c)),abD=sign(cross(a,b,d)),cdA=sign(cross(c,d,a)),cdB=sign(cross(c,d,b));
 return (abC*abD<0&&cdA*cdB<0)||onSegment(a,c,b)||onSegment(a,d,b)||onSegment(c,a,d)||onSegment(c,b,d);
}
export function zoneRingArea(ring:readonly (readonly number[])[]):number{
 if(!ring.length)return 0;
 const [x,y]=ring[0];let twice=0;
 for(let i=1;i+1<ring.length;i++)twice+=(ring[i][0]-x)*(ring[i+1][1]-y)-(ring[i][1]-y)*(ring[i+1][0]-x);
 return Math.abs(twice)/2;
}
/** Closed explicitly; holes and multipolygons are never flattened or repaired. */
export function validateZonePolygon(input:unknown):{polygon:ZonePolygon;bounds:ZoneBounds;area:number}{
 const p=record(input);
 if(p.type!=='Polygon'||!Array.isArray(p.coordinates)||p.coordinates.length!==1)
  invalid('구역 경계는 단순 Polygon만 지원합니다. Hole/MultiPolygon은 지원하지 않습니다.');
 const values=(p.coordinates as unknown[])[0];
 if(!Array.isArray(values)||values.length<4||values.length>ZONE_MAX_POINTS+1)
  invalid(`닫힌 경계에 3~${ZONE_MAX_POINTS}개의 꼭짓점이 필요합니다.`);
 const ring:[number,number][]=(values as unknown[]).map(value=>{
  if(!Array.isArray(value)||value.length!==2||value.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>ZONE_COORDINATE_LIMIT))
   return invalid('WCS XY는 유한하고 절대값 1e12 이하여야 합니다.');
  return [value[0],value[1]] as [number,number];
 });
 if(!eq(ring[0],ring[ring.length-1]))invalid('경계를 명시적으로 닫은 뒤 저장하세요.');
 const vertices=ring.slice(0,-1),keys=new Set(vertices.map(p=>JSON.stringify(p)));
 if(keys.size!==vertices.length)invalid('경계의 중복 꼭짓점·길이 0인 변을 제거하세요.');
 for(let i=0;i<vertices.length;i++){
  const prev=ring[(i+vertices.length-1)%vertices.length],at=ring[i],next=ring[i+1];
  if(cross(prev,at,next)===0&&((prev[0]-at[0])*(next[0]-at[0])+(prev[1]-at[1])*(next[1]-at[1]))>0)
   invalid('경계가 같은 변을 되짚고 있습니다.');
  for(let j=i+1;j<vertices.length;j++){
   if(j===i+1||(i===0&&j===vertices.length-1))continue;
   if(segmentsIntersect(ring[i],ring[i+1],ring[j],ring[j+1]))invalid('자기교차·자기접촉 경계는 저장할 수 없습니다.');
  }
 }
 const area=zoneRingArea(ring);
 if(!Number.isFinite(area)||area<=0)invalid('면적이 0인 경계는 저장할 수 없습니다.');
 const xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]);
 return {polygon:{type:'Polygon',coordinates:[ring]},area,
  bounds:{minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)}};
}
export function closeZonePoints(points:readonly ZonePoint[]):ZonePolygon{
 if(points.length<3)invalid('꼭짓점을 세 개 이상 지정하세요.');
 const ring=points.map(p=>[p.x,p.y] as [number,number]);
 if(!eq(ring[0],ring[ring.length-1]))ring.push([...ring[0]]);
 return validateZonePolygon({type:'Polygon',coordinates:[ring]}).polygon;
}
export function zoneTolerance(...polygons:ZonePolygon[]):number{
 let max=1;
 for(const p of polygons)for(const xy of p.coordinates[0])max=Math.max(max,Math.abs(xy[0]),Math.abs(xy[1]));
 return Math.max(1e-7,32*Number.EPSILON*max);
}
function boundaryDistance(p:readonly number[],ring:readonly (readonly number[])[]){
 let min=Infinity;
 for(let i=0;i+1<ring.length;i++){
  const a=ring[i],b=ring[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  min=Math.min(min,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));
 }
 return min;
}
/** Difference checks the whole area, including edges crossing a concave parent. */
export function zoneContainsPolygon(parentInput:ZonePolygon,childInput:ZonePolygon):boolean{
 const parent=validateZonePolygon(parentInput).polygon,child=validateZonePolygon(childInput).polygon;
 const tolerance=zoneTolerance(parent,child);
 const outside=polygonClipping.difference(child.coordinates,parent.coordinates);
 for(const polygon of outside){
  // Any exterior vertex/midpoint beyond the numeric boundary tolerance is real escape.
  for(const ring of polygon)for(let i=0;i+1<ring.length;i++){
   for(const p of [ring[i],[(ring[i][0]+ring[i+1][0])/2,(ring[i][1]+ring[i+1][1])/2]])
    if(boundaryDistance(p,parent.coordinates[0])>tolerance)return false;
  }
 }
 return true;
}
export function zonesOverlap(a:ZonePolygon,b:ZonePolygon):boolean{
 const left=validateZonePolygon(a).polygon,right=validateZonePolygon(b).polygon;
 return polygonClipping.intersection(left.coordinates,right.coordinates).some(poly=>
  zoneRingArea(poly[0])-poly.slice(1).reduce((sum,ring)=>sum+zoneRingArea(ring),0)>0);
}
export function assertZoneParent(zones:readonly Pick<CadZoneDto,'id'|'locationId'|'parentZoneId'>[],id:string,parentId:string|null):void{
 if(parentId===null)return;
 const own=zones.find(z=>z.id===id),seen=new Set([id]);let current:string|null=parentId;
 while(current!==null){
  if(seen.has(current))invalid('자기 자신 또는 하위 구역을 부모로 지정할 수 없습니다.');
  seen.add(current);
  const parent=zones.find(z=>z.id===current);
  if(!parent||(own&&parent.locationId!==own.locationId))invalid('같은 층의 유효한 상위 구역을 선택하세요.');
  current=parent!.parentZoneId;
 }
}
export function isZoneGeometryMapped(zone:CadZoneDto,scope:{versionId:string;sourceSha256:string;sceneRevision:number|null}):boolean{
 const g=zone.geometry;
 return !!g&&g.state==='MAPPED'&&g.versionId===scope.versionId&&g.sourceSha256===scope.sourceSha256&&
  scope.sceneRevision!==null&&g.sceneRevision===scope.sceneRevision;
}
