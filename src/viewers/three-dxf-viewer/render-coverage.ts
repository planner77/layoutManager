/** Conservative source ↔ rendered Object3D mapping audit.
 * A top-level source entity is selectable only when a rendered object carries
 * the same handle/type/layer and compatible WCS XY bounds. A 1:N mapping is OK. */
import type {OutlineEntity} from '../core/outline-geometry';
export type Bounds2D=[number,number,number,number];
export type RenderObservation={handle:string;entityType:string;layer?:string;bounds:Bounds2D|null};
export type RenderCoverage={
  selectable:OutlineEntity[];mappedSource:number;unmappedSource:number;
  boundsMismatch:number;renderedObjects:number;warnings:string[];
};
function comparable(a:Bounds2D,b:Bounds2D,kind:string){
  const span=Math.max(a[2]-a[0],a[3]-a[1],1);
  const allowance=kind==='ARC'||kind==='CIRCLE'?Math.max(.1,span*.01):Math.max(.02,span*1e-4);
  return a.every((v,i)=>Math.abs(v-b[i])<=allowance);
}
export function reconcileRenderCoverage(
  source:readonly OutlineEntity[],observations:readonly RenderObservation[],
):RenderCoverage {
  const byHandle=new Map<string,RenderObservation[]>();
  for(const observation of observations){
    if(!/^[0-9A-F]+$/i.test(observation.handle))continue;
    const id=observation.handle.toUpperCase();
    const existing=byHandle.get(id)??[];
    existing.push(observation);byHandle.set(id,existing);
  }
  const selectable:OutlineEntity[]=[];
  let unmappedSource=0,boundsMismatch=0;
  for(const entity of source){
    // Duplicate/missing handles or a missing SHA are not uniquely attributable:
    // even matching rendered geometry cannot establish a stable source identity.
    if(!entity.stable){unmappedSource++;continue;}
    const observed=entity.handle?byHandle.get(entity.handle.toUpperCase()):undefined;
    if(!observed?.length){unmappedSource++;continue;}
    const shapes=observed.filter(o=>o.entityType===entity.entityType&&
      (!o.layer||o.layer===entity.layer)&&o.bounds!==null);
    // Multiple display objects can represent a single DXF handle; compare the
    // union of their extents, never require any one fragment to cover all.
    const merged=shapes.reduce<Bounds2D>((box,o)=>[
      Math.min(box[0],o.bounds![0]),Math.min(box[1],o.bounds![1]),
      Math.max(box[2],o.bounds![2]),Math.max(box[3],o.bounds![3]),
    ],[Infinity,Infinity,-Infinity,-Infinity]);
    if(!shapes.length||!comparable(entity.bounds,merged,entity.entityType)){
      boundsMismatch++;continue;
    }
    selectable.push(entity);
  }
  const warnings:string[]=[];
  if(unmappedSource)warnings.push(`${unmappedSource}개 원본 Entity는 렌더 객체 Handle이 없어 선택 대상에서 제외했습니다.`);
  if(boundsMismatch)warnings.push(`${boundsMismatch}개 Entity는 렌더 유형·레이어·WCS 좌표 불일치로 선택 대상에서 제외했습니다.`);
  return {selectable,mappedSource:selectable.length,unmappedSource,boundsMismatch,
    renderedObjects:observations.length,warnings};
}
