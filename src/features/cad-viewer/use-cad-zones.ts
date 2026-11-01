'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {closeZonePoints,isZoneGeometryMapped,type CadZoneDto,type ZoneCategoryDto,type ZoneListDto,type ZoneMetadata,type ZonePoint,type ZonePolygon} from '@/domain/cad-zone';
import {collectMemoSnapCandidates,currentMemoSnapChoice,type MemoSnapChoice} from '@/domain/memo-session-snap';
import type {ViewerManager} from '@/viewers/core/adapter';
import {createZone,createZoneCategory,deleteZone,deleteZoneCategory,patchZone,patchZoneCategory,readZones,ZoneRequestError} from './cad-zone-client';
import {createPreviewUuid} from './preview-uuid';

export function useCadZones({versionId,sourceSha256,renderer,format,ready,loading,attempt,getManager,getCanvas,getViewEpoch}:{
 versionId:string;sourceSha256:string;renderer:string;format:string;ready:boolean;loading:boolean;attempt:number;
 getManager:()=>ViewerManager|null;getCanvas:()=>HTMLDivElement|null;getViewEpoch:()=>number;
}){
 const [list,setList]=useState<ZoneListDto|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [loadingList,setLoadingList]=useState(false);
 const [busy,setBusy]=useState(false);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [hidden,setHidden]=useState<ReadonlySet<string>>(()=>new Set());
 const [allVisible,setAllVisible]=useState(true);
 const [drawing,setDrawing]=useState(false);
 const [drawingExistingId,setDrawingExistingId]=useState<string|null>(null);
 const [points,setPoints]=useState<ZonePoint[]>([]);
 const [closed,setClosed]=useState(false);
 const [snap,setSnap]=useState<{free:ZonePoint;choices:readonly MemoSnapChoice[];epoch:number;total:number;limited:boolean}|null>(null);
 const saveKey=useRef<{body:string;key:string}|null>(null);
 const requestEpoch=useRef(0);
 const lifecycleEpoch=useRef(0);
 const actorId=useRef<string|null>(null);
 const readSupported=/^[0-9a-f]{64}$/i.test(sourceSha256);
 const supported=format==='DXF'&&renderer==='three-dxf-viewer'&&ready&&!loading&&readSupported;
 const sceneRevision=getManager()?.getSceneRevision()??null;
 const exactScene=!!list&&sceneRevision!==null&&list.sceneRevision===sceneRevision&&
  list.versionId===versionId&&list.sourceSha256===sourceSha256;
 const readUnavailable=!readSupported?'검증된 Version/SHA가 필요합니다.':
  !list?error??'구역 조회 권한을 확인하는 중입니다.':null;
 const unavailable=!supported?'구역 생성·편집은 Scene이 준비된 DXF three-dxf-viewer에서만 사용할 수 있습니다.':
  !list?error??'구역 권한과 Scene을 확인하는 중입니다.':
  !exactScene?'현재 Version/SHA/Scene 개정과 구역 자료가 일치하지 않습니다. Scene 저장 후 다시 조회하세요.':null;
 const canCreate=unavailable===null&&!!list?.canEdit;
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const token=++requestEpoch.current;setLoadingList(true);setError(null);
  try{const data=await readZones(versionId,signal);if(token!==requestEpoch.current)return false;
   if(data.versionId!==versionId||data.sourceSha256!==sourceSha256)throw new Error('구역 목록의 Version/SHA가 현재 도면과 다릅니다.');
   if(actorId.current&&actorId.current!==data.actorId){
    setSelectedId(null);setDrawing(false);setDrawingExistingId(null);setPoints([]);setClosed(false);
    setSnap(null);setHidden(new Set());setBusy(false);saveKey.current=null;lifecycleEpoch.current+=1;
   }
   actorId.current=data.actorId;
   setList(data);setSelectedId(id=>data.zones.some(z=>z.id===id)?id:null);return true;
  }catch(e){if(signal?.aborted||token!==requestEpoch.current)return false;
   actorId.current=null;setList(null);setHidden(new Set());setSelectedId(null);setDrawing(false);setPoints([]);setSnap(null);
   setError(e instanceof Error?e.message:'구역 목록을 읽지 못했습니다.');return false;
  }finally{if(token===requestEpoch.current)setLoadingList(false);}
 },[versionId,sourceSha256]);
 useEffect(()=>{
  const controller=new AbortController();
  // A renderer/reload switch invalidates all session-only visibility and drafts.
  const frame=requestAnimationFrame(()=>{setList(null);setSelectedId(null);setHidden(new Set());setAllVisible(true);
   setDrawing(false);setDrawingExistingId(null);setPoints([]);setClosed(false);setSnap(null);setBusy(false);setError(null);
   if(readSupported)void refresh(controller.signal);
  });
  return()=>{cancelAnimationFrame(frame);controller.abort();requestEpoch.current+=1;lifecycleEpoch.current+=1;actorId.current=null;};
 },[versionId,sourceSha256,renderer,format,attempt,readSupported,refresh]);
 const addPoint=(point:ZonePoint)=>{if(!drawing||closed)return;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.abs(point.x)>1e12||Math.abs(point.y)>1e12){setError('유효한 WCS XY 좌표를 입력하세요.');return;}
  setPoints(v=>v.length>=512?v:[...v,point]);setError(null);saveKey.current=null;
 };
 const start=()=>{if(!canCreate)return;setSelectedId(null);setDrawingExistingId(null);setDrawing(true);setPoints([]);setClosed(false);setSnap(null);setError(null);saveKey.current=null;};
 const editGeometry=(zone:CadZoneDto)=>{if(!canCreate)return;setSelectedId(zone.id);setDrawingExistingId(zone.id);setDrawing(true);
  const mapped=isZoneGeometryMapped(zone,{versionId,sourceSha256,sceneRevision});
  setPoints(mapped?zone.geometry!.polygon.coordinates[0].slice(0,-1).map(([x,y])=>({x,y})):[]);
  setClosed(mapped);setSnap(null);setError(mapped?null:'현재 Scene과 연결되지 않은 경계입니다. 새 WCS 꼭짓점을 지정하세요.');saveKey.current=null;
 };
 const cancel=()=>{setDrawing(false);setDrawingExistingId(null);setPoints([]);setClosed(false);setSnap(null);saveKey.current=null;};
 const chooseSnap=(key:string|null)=>{if(!snap)return;
  if(snap.epoch!==getViewEpoch()){setError('화면이 변경되었습니다. 스냅 후보를 다시 지정하세요.');setSnap(null);return;}
  const choice=key?snap.choices.find(c=>c.key===key):null;
  if(choice&&!currentMemoSnapChoice({versionId,sourceSha256},choice,getManager()?.getMemoSnapTargets(true)??[])){
   setError('스냅 대상이 변경되었습니다. 좌표를 다시 선택하세요.');setSnap(null);return;
  }
  addPoint(choice?.world??snap.free);setSnap(null);};
 const closePolygon=()=>{try{closeZonePoints(points);setClosed(true);setError(null);}catch(e){setClosed(false);setError(e instanceof Error?e.message:'구역 경계를 닫지 못했습니다.');}};
 const canvasPoint=(clientX:number,clientY:number)=>{
  if(!drawing||closed||!canCreate)return;
  const manager=getManager(),canvas=getCanvas(),world=manager?.clientToWcs(clientX,clientY),rect=canvas?.getBoundingClientRect();
  if(!manager||!world||!rect){setError('현재 도면에서 WCS 좌표를 확인하지 못했습니다.');return;}
  const candidates=collectMemoSnapCandidates({versionId,sourceSha256},world,manager.getMemoSnapTargets(true),point=>{
   const xy=manager.projectWcsToCanvas(point);
   return xy&&xy.x>=0&&xy.y>=0&&xy.x<=rect.width&&xy.y<=rect.height?xy:null;
  },12);
  const found=candidates.candidates.filter(c=>c.kind==='ENDPOINT'||c.kind==='VERTEX');
  if(found.length)setSnap({free:world,choices:found,epoch:getViewEpoch(),total:candidates.total,limited:candidates.limited});else addPoint(world);
 };
 const assertActor=async(expected:string,manageCategories=false)=>{
  const current=await readZones(versionId);
  if(current.actorId!==expected||current.versionId!==versionId||current.sourceSha256!==sourceSha256||
     current.sceneRevision!==sceneRevision||!(manageCategories?current.canManageCategories:current.canEdit)){
   actorId.current=null;setList(null);setSelectedId(null);setDrawing(false);setDrawingExistingId(null);
   setPoints([]);setClosed(false);setSnap(null);setHidden(new Set());setBusy(false);saveKey.current=null;
   lifecycleEpoch.current+=1;setError('계정 또는 Scene 상태가 변경되었습니다. 구역을 다시 조회하세요.');
   throw new Error('계정 또는 Scene 상태가 변경되었습니다. 구역을 다시 조회하세요.');
  }
 };
 const save=async(metadata:ZoneMetadata,polygon?:ZonePolygon)=>{
  if(!list||!list.canEdit)throw new Error('구역 쓰기 권한을 확인하세요.');
  const epoch=lifecycleEpoch.current;setBusy(true);try{
   await assertActor(list.actorId);
   if(epoch!==lifecycleEpoch.current)return;
   const selected=list.zones.find(z=>z.id===(drawingExistingId??selectedId));
   const mapping=polygon?{sourceSha256,sceneRevision:sceneRevision!,polygon}:undefined;
   const body=JSON.stringify({metadata,mapping});
   if(!saveKey.current||saveKey.current.body!==body)saveKey.current={body,key:createPreviewUuid()};
   const zone=selected?await patchZone(versionId,selected,metadata,mapping):await createZone(versionId,metadata,mapping,saveKey.current.key);
   if(epoch!==lifecycleEpoch.current)return;
   if(await refresh()){setSelectedId(zone.id);cancel();setError(null);}
  }catch(e){if(epoch!==lifecycleEpoch.current)return;
   if(e instanceof ZoneRequestError&&(e.status===401||e.status===403)){setList(null);setSelectedId(null);cancel();}
   setError(e instanceof Error?e.message:'구역 저장에 실패했습니다.');throw e;}
  finally{if(epoch===lifecycleEpoch.current)setBusy(false);}
 };
 const mutationFailure=(e:unknown)=>{if(e instanceof ZoneRequestError&&(e.status===401||e.status===403)){
  actorId.current=null;setList(null);setSelectedId(null);cancel();setHidden(new Set());
 }setError(e instanceof Error?e.message:'구역 요청에 실패했습니다.');};
 const remove=async(zone:CadZoneDto)=>{const epoch=lifecycleEpoch.current;setBusy(true);try{if(!list)throw new Error('구역 목록을 다시 조회하세요.');await assertActor(list.actorId);if(epoch!==lifecycleEpoch.current)return;await deleteZone(versionId,zone);if(epoch!==lifecycleEpoch.current)return;if(await refresh())setSelectedId(null);}catch(e){if(epoch===lifecycleEpoch.current)mutationFailure(e);}finally{if(epoch===lifecycleEpoch.current)setBusy(false);}};
 const categoryCreate=async(name:string,order:number)=>{const epoch=lifecycleEpoch.current;setBusy(true);try{if(!list)throw new Error('구역 목록을 다시 조회하세요.');await assertActor(list.actorId,true);if(epoch===lifecycleEpoch.current){await createZoneCategory(versionId,name,order);await refresh();}}catch(e){if(epoch===lifecycleEpoch.current)mutationFailure(e);throw e;}finally{if(epoch===lifecycleEpoch.current)setBusy(false);}};
 const categoryPatch=async(category:ZoneCategoryDto,name:string,order:number,active:boolean)=>{const epoch=lifecycleEpoch.current;setBusy(true);try{if(!list)throw new Error('구역 목록을 다시 조회하세요.');await assertActor(list.actorId,true);if(epoch===lifecycleEpoch.current){await patchZoneCategory(versionId,category,name,order,active);await refresh();}}catch(e){if(epoch===lifecycleEpoch.current)mutationFailure(e);throw e;}finally{if(epoch===lifecycleEpoch.current)setBusy(false);}};
 const categoryDelete=async(category:ZoneCategoryDto)=>{const epoch=lifecycleEpoch.current;setBusy(true);try{if(!list)throw new Error('구역 목록을 다시 조회하세요.');await assertActor(list.actorId,true);if(epoch===lifecycleEpoch.current){await deleteZoneCategory(versionId,category);await refresh();}}catch(e){if(epoch===lifecycleEpoch.current)mutationFailure(e);throw e;}finally{if(epoch===lifecycleEpoch.current)setBusy(false);}};
 const focus=(id:string)=>{
  const zone=list?.zones.find(z=>z.id===id);if(!zone)return;
  if(format!=='DXF'||renderer!=='three-dxf-viewer'||!ready||loading){setError('현재 Viewer에서는 구역 경계로 이동할 수 없습니다. DXF three-dxf-viewer에서 여세요.');return;}
  if(!isZoneGeometryMapped(zone,{versionId,sourceSha256,sceneRevision})){setError(zone.geometry?.reason||'현재 도면과 연결되지 않은 구역이라 이동할 수 없습니다.');return;}
  setHidden(v=>{const next=new Set(v);next.delete(id);return next;});setAllVisible(true);
  if(!getManager()?.focusBounds(zone.geometry!.bounds))setError('구역 경계가 유효하지 않아 이동할 수 없습니다.');
  else setError(null);
 };
 const invalidateMappings=()=>{requestEpoch.current+=1;setList(null);setSelectedId(null);cancel();setHidden(new Set());
  setError('초기화로 현재 구역 매핑이 무효화되었습니다. 목록을 다시 조회하세요.');};
 const reportError=(message:string|null)=>setError(message);
 return {list,error,loadingList,busy,selectedId,setSelectedId,hidden,setHidden,allVisible,setAllVisible,
  drawing,drawingExistingId,points,setPoints,closed,setClosed,closePolygon,snap,chooseSnap,addPoint,start,editGeometry,cancel,canvasPoint,save,remove,
  categoryCreate,categoryPatch,categoryDelete,focus,refresh,invalidateMappings,reportError,readUnavailable,unavailable,canCreate,sceneRevision,exactScene};
}
