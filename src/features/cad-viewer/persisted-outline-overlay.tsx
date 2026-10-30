'use client';
import { useEffect,useRef,useState } from 'react';
import type { ViewerManager } from '@/viewers/core/adapter';
import type { StoredOutline } from './persisted-outline-client';
export function PersistedOutlineOverlay({outlines,hidden,getManager,viewRevision}:{
 outlines:readonly StoredOutline[];hidden:ReadonlySet<string>;getManager:()=>ViewerManager|null;viewRevision:number;
}){
 const root=useRef<HTMLDivElement>(null);
 const [paths,setPaths]=useState<{id:string;d:string}[]>([]);
 useEffect(()=>{
  const frame=requestAnimationFrame(()=>{
   const manager=getManager(),element=root.current;
   if(!manager||!element){setPaths([]);return;}
   const next:{id:string;d:string}[]=[];
   for(const outline of outlines){
    if(hidden.has(outline.id))continue;
    const polygons=outline.geometry.type==='Polygon'?[outline.geometry.coordinates]:
      outline.geometry.coordinates;
    let d='',valid=true;
    for(const rings of polygons){
     for(const ring of rings){
      let segment='';
      for(const coord of ring){
       const p=manager.projectWcsToCanvas({x:coord[0],y:coord[1]});
       if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)){valid=false;break;}
       segment+=(segment?' L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2);
      }
      if(!valid)break;
      d+=segment+' Z ';
     }
     if(!valid)break;
    }
    if(valid&&d)next.push({id:outline.id,d});
   }
   setPaths(next);
  });
  return ()=>cancelAnimationFrame(frame);
 },[outlines,hidden,getManager,viewRevision]);
 return <div ref={root} aria-label="서버 저장 외곽선 레이어"
   className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
   <svg width="100%" height="100%" className="pointer-events-none" role="img" aria-label="영속 외곽선">
    {paths.map(p=><path key={p.id} d={p.d} stroke="#22d3ee" strokeWidth="2"
      fill="#22d3ee" fillOpacity="0.08" fillRule="evenodd" />)}
   </svg>
 </div>;
}
