'use client';
import {useEffect,useState} from 'react';
import {isZoneGeometryMapped,type CadZoneDto,type ZonePoint} from '@/domain/cad-zone';
import type {ViewerManager} from '@/viewers/core/adapter';

export function CadZoneOverlay({zones,scope,hidden,allVisible,selectedId,points,closed,getManager,viewRevision}:{
 zones:readonly CadZoneDto[];scope:{versionId:string;sourceSha256:string;sceneRevision:number|null};
 hidden:ReadonlySet<string>;allVisible:boolean;selectedId:string|null;points:readonly ZonePoint[];closed:boolean;
 getManager:()=>ViewerManager|null;viewRevision:number;
}){
 const [paths,setPaths]=useState<{id:string;path:string;selected:boolean}[]>([]);
 const [draft,setDraft]=useState('');
 const {versionId,sourceSha256,sceneRevision}=scope;
 useEffect(()=>{const frame=requestAnimationFrame(()=>{
  const manager=getManager();if(!manager){setPaths([]);setDraft('');return;}
  const project=(values:readonly (readonly number[])[],close:boolean)=>{
   let path='';for(const xy of values){const p=manager.projectWcsToCanvas({x:xy[0],y:xy[1]});
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return '';
    path+=(path?' L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2);
   }return path+(close?' Z':'');
  };
  setPaths(allVisible?zones.filter(z=>!hidden.has(z.id)&&isZoneGeometryMapped(z,{versionId,sourceSha256,sceneRevision})).map(z=>({
   id:z.id,path:project(z.geometry!.polygon.coordinates[0],true),selected:z.id===selectedId,
  })).filter(p=>p.path):[]);
  setDraft(points.length?project(points.map(p=>[p.x,p.y]),closed):'');
 });return()=>cancelAnimationFrame(frame);},[zones,versionId,sourceSha256,sceneRevision,hidden,allVisible,selectedId,points,closed,getManager,viewRevision]);
 return <svg aria-label="구역 경계 오버레이" role="img" className="pointer-events-none absolute inset-0 z-[12] h-full w-full overflow-hidden">
  {paths.map(p=><path key={p.id} data-testid="cad-zone-path" data-zone-id={p.id} d={p.path}
    stroke={p.selected?'#f59e0b':'#14b8a6'} strokeWidth={p.selected?3:2}
    fill={p.selected?'#f59e0b':'#14b8a6'} fillOpacity={p.selected?0.2:0.09} fillRule="evenodd"/>)}
  {draft&&<path data-testid="cad-zone-draft-path" d={draft} stroke="#fde047" strokeWidth="2" strokeDasharray={closed?'':'6 4'} fill={closed?'#fde047':'none'} fillOpacity="0.16"/>}
  {points.map((point,i)=>{const projected=getManager()?.projectWcsToCanvas(point);return projected&&Number.isFinite(projected.x)&&Number.isFinite(projected.y)?<circle key={i} cx={projected.x} cy={projected.y} r="4" fill="#fde047" stroke="#111827"/>:null;})}
 </svg>;
}
