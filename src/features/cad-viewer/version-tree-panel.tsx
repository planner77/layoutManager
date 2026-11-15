'use client';
import {useEffect,useMemo,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import {Folder,FolderOpen,FileStack,MapPinned,Eye,EyeOff} from 'lucide-react';
import {filteredVersionTree,mergeVersionTreeTypes,projectVersionTree,subtreeObjects,type TreeNode} from '@/domain/version-tree';
import type {useVersionTree} from './use-version-tree';
const field='min-h-10 w-full rounded border border-slate-400 bg-white px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700';
const button='min-h-9 rounded border border-slate-400 bg-white px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50';
function revealFocusedRow(viewport:HTMLDivElement,body:HTMLDivElement){
 const active=document.activeElement;
 if(!viewport.isConnected||!body.isConnected||!body.contains(viewport)||!active||!viewport.contains(active))return;
 const row=active.closest<HTMLElement>('[role="treeitem"]');
 if(!row||row.closest('[role="tree"]')!==viewport)return;
 // An expanded branch contains its descendants; reveal only its own header.
 const header=row.querySelector(':scope > [role="group"]')?row.firstElementChild:row;
 if(!header)return;
 const style=getComputedStyle(row);
 const margin=style.outlineStyle==='none'?0:Math.max(0,parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset));
 // Two owned scrollports only. Re-measure after the inner scroll and include
 // the existing focus outline; the panel body can clip the mobile Tree edge.
 for(const port of [viewport,body]){
  const bounds=header.getBoundingClientRect(),box=port.getBoundingClientRect();
  const top=box.top+port.clientTop+margin,bottom=box.top+port.clientTop+port.clientHeight-margin;
  const delta=bounds.top<top?bounds.top-top:bounds.bottom>bottom?bounds.bottom-bottom:0;
  if(delta)port.scrollTop+=delta>0?Math.ceil(delta):Math.floor(delta);
 }
}
type Props={tree:ReturnType<typeof useVersionTree>;versionId:string;versionLabel:string;sourceSha256:string;
 initialKind:'ALL'|'OUTLINE'|'ZONE';focusAvailable:boolean;types:readonly {id:string;name:string}[];
 drafts:readonly {id:string;name:string;kind:string;outlineTypeId?:string;outlineTypeName?:string;visible:boolean;selected:boolean}[];
 selectedOutlineIds:ReadonlySet<string>;hiddenOutlineIds:ReadonlySet<string>;
 selectedZoneId:string|null;hiddenZoneIds:ReadonlySet<string>;allZonesVisible:boolean;
 zoneReady:boolean;zoneLoading:boolean;zoneError:string|null;onRetryZones:()=>void;
 onSelect:(kind:'OUTLINE'|'ZONE'|'DRAFT',id:string,additive?:boolean)=>void;
 onFocus:(kind:'OUTLINE'|'ZONE'|'DRAFT',id:string,additive?:boolean)=>void;
 onVisibility:(kind:'OUTLINE'|'ZONE'|'DRAFT',id:string,visible:boolean)=>void;
 canDeleteOutline:boolean;canDeleteDraft:boolean;onDeleteOutline:(kind:'OUTLINE'|'DRAFT',id:string)=>void;
 zoneDetail?:ReactNode;outlineActions?:ReactNode;onCreateZone?:()=>void;canCreateZone:boolean;zoneCreateReason?:string;onClose:()=>void;};
export function VersionTreePanel(p:Props){
 const [query,setQuery]=useState(''),[kind,setKind]=useState<Props['initialKind']>(p.initialKind);
 const [expanded,setExpanded]=useState<Set<string>|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [form,setForm]=useState<'create'|'folder'|'membership'|null>(null),[name,setName]=useState(''),[sortOrder,setSortOrder]=useState('0'),[parentId,setParentId]=useState(''),[confirmDelete,setConfirmDelete]=useState(false);
 const [notice,setNotice]=useState<string|null>(null),[focusKey,setFocusKey]=useState<string|null>(null);
 const refs=useRef(new Map<string,HTMLDivElement>());
 const viewportRef=useRef<HTMLDivElement>(null);
 const bodyRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const viewport=viewportRef.current,body=bodyRef.current;
  if(!viewport||!body||typeof ResizeObserver==='undefined')return;
  // Late detail tools and responsive layout may shrink the list after End.
  // Never move focus, external scrollports, or a selected-but-unfocused row.
  const observer=new ResizeObserver(()=>revealFocusedRow(viewport,body));
  observer.observe(viewport);observer.observe(body);
  return()=>observer.disconnect();
 },[]);
 const data=p.tree.data&&p.tree.data.versionId===p.versionId&&p.tree.data.sourceSha256===p.sourceSha256?p.tree.data:null;
 const roots=useMemo(()=>projectVersionTree({folders:data?.folders??[],memberships:data?.memberships??[],outlines:data?.outlines??[],zones:data?.zones??[],categories:data?.categories??[],
  types:mergeVersionTreeTypes(p.types,data?.types??[]),drafts:p.drafts}),[data,p.types,p.drafts]);
 const filtered=useMemo(()=>filteredVersionTree(roots,query,kind),[roots,query,kind]);
 const folderList=data?.folders??[];
 const selectedNode=useMemo(()=>{const find=(nodes:readonly TreeNode[]):TreeNode|undefined=>{for(const n of nodes){if(n.key===selected)return n;const match=find(n.children);if(match)return match;}return undefined;};return find(roots);},[roots,selected]);
 const visible=useMemo(()=>{const result:TreeNode[]=[];const visit=(nodes:readonly TreeNode[])=>{for(const n of nodes){result.push(n);if(expanded===null||expanded.has(n.key))visit(n.children);}};visit(filtered.roots);return result;},[filtered,expanded]);
 const effectiveFocusKey=visible.some(node=>node.key===focusKey)?focusKey:visible[0]?.key??null;
 const open=(node:TreeNode)=>expanded===null||expanded.has(node.key);
 const fullNode=(key:string):TreeNode|undefined=>{const find=(nodes:readonly TreeNode[]):TreeNode|undefined=>{for(const n of nodes){if(n.key===key)return n;const child=find(n.children);if(child)return child;}return undefined;};return find(roots);};
 const toggle=(node:TreeNode)=>setExpanded(previous=>{const next=previous===null?new Set(visible.filter(n=>n.children.length).map(n=>n.key)):new Set(previous);if(next.has(node.key))next.delete(node.key);else next.add(node.key);return next;});
 const focus=(key:string)=>{setFocusKey(key);refs.current.get(key)?.focus({preventScroll:true});if(viewportRef.current&&bodyRef.current)revealFocusedRow(viewportRef.current,bodyRef.current);};
 const handleKey=(event:KeyboardEvent<HTMLDivElement>,node:TreeNode)=>{
  if(event.target!==event.currentTarget)return;
  const index=visible.findIndex(n=>n.key===node.key);let target:TreeNode|undefined;
  if(event.key==='ArrowDown')target=visible[Math.min(index+1,visible.length-1)];
  else if(event.key==='ArrowUp')target=visible[Math.max(0,index-1)];
  else if(event.key==='Home')target=visible[0];else if(event.key==='End')target=visible.at(-1);
  else if(event.key==='ArrowRight'&&node.children.length){if(!open(node))toggle(node);else target=visible[index+1];}
  else if(event.key==='ArrowLeft'){if(node.children.length&&open(node))toggle(node);else target=visible.find(n=>n.children.includes(node));}
  else if(event.key==='Enter'){if(node.kind==='FOLDER'||node.kind==='UNCLASSIFIED')toggle(node);else if(!p.focusAvailable||node.kind==='ZONE'&&(!p.zoneReady||data?.zones.find(z=>z.id===node.id)?.geometryState!=='MAPPED')){}else p.onFocus(node.kind,node.id,event.ctrlKey||event.metaKey);}
  else if(event.key===' '){selectNode(node,event.ctrlKey||event.metaKey);}
  else return;
  event.preventDefault();event.stopPropagation();if(target)focus(target.key);
 };
 const selectNode=(node:TreeNode,additive=false)=>{if(node.kind==='ZONE'&&!p.zoneReady)return;
  setSelected(node.key);setConfirmDelete(false);setForm(null);
  if(node.kind==='OUTLINE'||node.kind==='ZONE'||node.kind==='DRAFT')p.onSelect(node.kind,node.id,additive);
 };
 const visibleObject=(node:TreeNode)=>node.kind==='OUTLINE'?!p.hiddenOutlineIds.has(node.id):node.kind==='ZONE'?p.allZonesVisible&&!p.hiddenZoneIds.has(node.id):p.drafts.find(d=>d.id===node.id)?.visible??true;
 const objectsFor=(node:TreeNode)=>subtreeObjects(fullNode(node.key)??node);
 const visibility=(node:TreeNode)=>{const objects=objectsFor(node);if(!p.zoneReady&&objects.some(o=>o.kind==='ZONE'))return;
  const next=!objects.every(o=>visibleObject({...node,kind:o.kind,id:o.id}));for(const o of objects)p.onVisibility(o.kind,o.id,next);};
 const folderRevision=(id:string|null)=>id?folderList.find(f=>f.id===id)?.revision??null:null;
 const save=async()=>{if(!data||!data.canEdit||p.tree.busy)return;
  try{
   if(form==='create')await p.tree.mutate('POST',{name,parentFolderId:parentId||null,expectedParentRevision:folderRevision(parentId||null),sortOrder:Number(sortOrder)});
   else if(form==='folder'&&selectedNode?.kind==='FOLDER')await p.tree.mutate('PATCH',{target:'folder',folderId:selectedNode.id,expectedRevision:selectedNode.revision,
    name,parentFolderId:parentId||null,expectedParentRevision:folderRevision(parentId||null),sortOrder:Number(sortOrder)});
   else if(form==='membership'&&selectedNode&&(selectedNode.kind==='OUTLINE'||selectedNode.kind==='ZONE'))await p.tree.mutate('PATCH',{target:'membership',kind:selectedNode.kind,objectId:selectedNode.id,
    folderId:parentId||null,expectedRevision:selectedNode.revision??0,expectedFolderRevision:folderRevision(parentId||null),sortOrder:Number(sortOrder)});
   setForm(null);setNotice(null);
  }catch(error){setNotice(error instanceof Error?error.message:'변경에 실패했습니다.');}
 };
 const remove=async()=>{if(selectedNode?.kind!=='FOLDER'||!data)return;
  try{await p.tree.mutate('DELETE',{target:'folder',folderId:selectedNode.id,expectedRevision:selectedNode.revision});setSelected(null);setConfirmDelete(false);setNotice(null);}
  catch(error){setNotice(error instanceof Error?error.message:'폴더를 삭제하지 못했습니다.');}
 };
 const beginFolder=(mode:'create'|'folder')=>{setForm(mode);setName(mode==='folder'&&selectedNode?selectedNode.name:'');setSortOrder(String(mode==='folder'&&selectedNode?selectedNode.sortOrder:0));setParentId(mode==='folder'&&selectedNode?folderList.find(f=>f.id===selectedNode.id)?.parentFolderId??'':selectedNode?.kind==='FOLDER'?selectedNode.id:'');setConfirmDelete(false);};
 const beginMembership=()=>{if(!selectedNode)return;const m=data?.memberships.find(x=>x.kind===selectedNode.kind&&x.objectId===selectedNode.id);setForm('membership');setParentId(m?.folderId??'');setSortOrder(String(m?.sortOrder??0));};
 const render=(nodes:readonly TreeNode[],depth=1):ReactNode=>nodes.map(node=>{
  const branch=node.children.length>0||node.kind==='FOLDER'||node.kind==='UNCLASSIFIED';const isOpen=open(node),isSelected=node.kind==='OUTLINE'?p.selectedOutlineIds.has(node.id):node.kind==='ZONE'?p.selectedZoneId===node.id:node.kind==='DRAFT'?!!p.drafts.find(d=>d.id===node.id)?.selected:selected===node.key;
  const leaf=node.kind==='OUTLINE'||node.kind==='ZONE'||node.kind==='DRAFT';
  const branchObjects=objectsFor(node);
  const visibleNow=leaf?visibleObject(node):branchObjects.length>0&&branchObjects.every(o=>visibleObject({...node,kind:o.kind,id:o.id}));
  const zoneState=node.kind==='ZONE'?data?.zones.find(z=>z.id===node.id)?.geometryState:null;
  return <div key={node.key} role="treeitem" data-tree-node={node.key} data-testid={node.kind==='OUTLINE'||node.kind==='DRAFT'?'outline-tree-item':node.kind==='ZONE'?'zone-tree-item':node.kind==='UNCLASSIFIED'?'outline-tree-group':undefined} data-persistence={node.kind==='DRAFT'?'session':node.kind==='OUTLINE'?'server':undefined} data-outline-id={node.kind==='DRAFT'||node.kind==='OUTLINE'?node.id:undefined} aria-level={depth} aria-selected={isSelected} aria-disabled={node.kind==='ZONE'&&!p.zoneReady||undefined} aria-expanded={branch?isOpen:undefined}
   tabIndex={effectiveFocusKey===node.key?0:-1} ref={el=>{if(el)refs.current.set(node.key,el);else refs.current.delete(node.key);}}
   onFocus={event=>{event.stopPropagation();if(event.target===event.currentTarget)setFocusKey(node.key);}} onKeyDown={event=>handleKey(event,node)} onClick={event=>{event.stopPropagation();selectNode(node,event.ctrlKey||event.metaKey);}} onDoubleClick={event=>{event.stopPropagation();if((event.target as HTMLElement).closest('button,input,select,textarea,a'))return;if(node.kind==='FOLDER'||node.kind==='UNCLASSIFIED')toggle(node);else if(p.focusAvailable&&(node.kind==='OUTLINE'||node.kind==='DRAFT'||node.kind==='ZONE'&&p.zoneReady&&zoneState==='MAPPED'))p.onFocus(node.kind,node.id,event.ctrlKey||event.metaKey);}}
   className={'rounded px-1 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 '+(isSelected?'bg-teal-100':'hover:bg-slate-100')}>
   <div className="flex min-w-0 items-center gap-1" style={{paddingLeft:Math.min(depth-1,7)*10}}>
    {branch?<button type="button" className={button} aria-label={`${node.name} ${isOpen?'접기':'펼치기'}`} onClick={event=>{event.stopPropagation();toggle(node);}}>{isOpen?'−':'+'}</button>:<span className="w-7 shrink-0"/>}
    {node.kind==='FOLDER'||node.kind==='UNCLASSIFIED'?(isOpen?<FolderOpen size={15} aria-hidden="true"/>:<Folder size={15} aria-hidden="true"/>):node.kind==='ZONE'?<MapPinned size={15} aria-hidden="true"/>:<FileStack size={15} aria-hidden="true"/>}
    <span className="min-w-0 flex-1 truncate text-xs" title={[...node.path,node.name].join(' / ')}><span className="font-medium">{node.name}</span> {node.code&&<span>· {node.code}</span>}
     <span className="block truncate text-[11px] text-slate-600">{node.kind==='FOLDER'||node.kind==='UNCLASSIFIED'?'폴더':node.kind==='ZONE'?`구역 · ${node.categoryName??'카테고리 없음'}`:node.kind==='DRAFT'?`임시 외곽선 · ${node.typeName??'타입 없음'}`:`외곽선 · ${node.typeName??'타입 없음'}`}{node.kind==='ZONE'&&!p.zoneReady?' · 상세 조회 중 · 선택 불가':node.kind==='ZONE'&&zoneState!=='MAPPED'?' · 미연결 · 확대 불가':!p.focusAvailable?' · 확대 불가':''}</span></span>
    {branch&&<span className="text-[11px] text-slate-600">{branchObjects.length}</span>}
    {(node.kind==='OUTLINE'||node.kind==='DRAFT')&&<button type="button" className={button} disabled={!visibleNow||!(node.kind==='OUTLINE'?p.canDeleteOutline:p.canDeleteDraft)}
     aria-label={`${node.name} 삭제`} onClick={event=>{event.stopPropagation();p.onDeleteOutline(node.kind as 'OUTLINE'|'DRAFT',node.id);}}>삭제</button>}
    {(leaf||branch)&&<button type="button" className={button} disabled={!branchObjects.length||!p.zoneReady&&branchObjects.some(o=>o.kind==='ZONE')} aria-label={`${node.name} ${visibleNow?'숨기기':'표시'}`} aria-pressed={visibleNow}
     onClick={event=>{event.stopPropagation();visibility(node);}}>{visibleNow?<EyeOff size={15} aria-hidden="true"/>:<Eye size={15} aria-hidden="true"/>}</button>}
   </div>
   {isOpen&&branch&&<div role="group">{render(node.children,depth+1)}</div>}
  </div>;
 });
 const forbiddenFolderIds=new Set<string>();
 if(form==='folder'&&selectedNode?.kind==='FOLDER'){const collect=(n:TreeNode)=>{if(n.kind==='FOLDER')forbiddenFolderIds.add(n.id);for(const c of n.children)collect(c);};collect(selectedNode);}
 const accessible=data&&p.tree.mode==='active';
 return <aside data-testid="version-tree-panel" aria-label="외곽선·구역" className="flex h-full min-h-0 flex-col text-slate-800">
  <header className="flex shrink-0 items-center justify-between border-b px-3 py-2"><strong className="min-w-0 truncate text-sm">외곽선·구역 <span className="font-normal text-slate-600" title={p.versionLabel}>{p.versionLabel}</span></strong><button type="button" className={button+' shrink-0 whitespace-nowrap'} onClick={p.onClose}>닫기</button></header>
  <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
   <div className="flex flex-wrap gap-1"><button type="button" className={button} aria-pressed={kind==='ALL'} onClick={()=>setKind('ALL')}>전체</button><button type="button" className={button} aria-pressed={kind==='OUTLINE'} onClick={()=>setKind('OUTLINE')}>외곽선</button><button type="button" className={button} aria-pressed={kind==='ZONE'} onClick={()=>setKind('ZONE')}>구역</button></div>
   <label className="text-xs">이름·코드·타입·카테고리 검색<input className={field} value={query} onChange={e=>setQuery(e.target.value)} data-testid="version-tree-search"/></label>
   <div className="flex items-center gap-1 text-xs"><span role="status" className="flex-1">{accessible?`${filtered.count}개 · 미분류 ${subtreeObjects(roots.at(-1)!).length}개`:p.tree.mode==='off'?'운영 모드 OFF · 임시 외곽선만 표시':p.tree.loading?'트리를 조회하는 중…':'트리를 조회할 수 없습니다.'}</span>
    <button type="button" className={button} onClick={()=>setExpanded(null)}>펼침</button><button type="button" className={button} onClick={()=>setExpanded(new Set())}>접기</button>
    <button type="button" className={button} disabled={p.tree.loading||p.tree.mode==='off'} onClick={()=>{if(data&&!p.zoneReady)p.onRetryZones();else p.tree.retry();}}>다시 시도</button></div>
   {!!data?.zones.length&&!p.zoneReady&&<p role="status" className="text-xs text-amber-800">{p.zoneError?`구역 상세 조회 실패: ${p.zoneError} · 다시 시도하세요.`:p.zoneLoading?'구역 상세를 조회하는 중입니다.':'구역 상세를 준비하는 중입니다.'}</p>}
   {(p.tree.error||notice)&&<p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">{notice??p.tree.error}</p>}
   {p.tree.mode==='blocked'&&<p role="status" className="text-xs">트리 구성을 확인해야 합니다.</p>}
   <div ref={viewportRef} role="tree" aria-label="Version 외곽선·구역 계층" data-testid="version-tree-items" className="min-h-32 max-h-[42vh] overflow-auto rounded border border-slate-200 p-1">
    {render(filtered.roots)}{filtered.roots.length===0&&<p className="p-2 text-xs">조건에 맞는 객체가 없습니다.</p>}
   </div>
   {selectedNode&&<p className="text-xs text-slate-600">경로: {[...selectedNode.path,selectedNode.name].join(' / ')}</p>}
   {accessible&&data.canEdit&&<section aria-label="트리 분류 편집" className="space-y-2 border-t pt-2 text-xs">
    <div className="flex flex-wrap gap-1"><button type="button" className={button} onClick={()=>beginFolder('create')}>폴더 추가</button>
     {selectedNode?.kind==='FOLDER'&&<><button type="button" className={button} onClick={()=>beginFolder('folder')}>폴더 편집</button><button type="button" className={button} onClick={()=>setConfirmDelete(true)}>폴더 삭제</button></>}
     {(selectedNode?.kind==='OUTLINE'||selectedNode?.kind==='ZONE'&&!data.zones.find(z=>z.id===selectedNode.id)?.parentZoneId)&&<button type="button" className={button} onClick={beginMembership}>분류 이동</button>}
     {p.onCreateZone&&<button type="button" className={button} disabled={!p.canCreateZone} title={p.zoneCreateReason} onClick={p.onCreateZone}>구역 생성</button>}
    </div>
    {confirmDelete&&selectedNode?.kind==='FOLDER'&&<div className="rounded border border-amber-400 p-2"><p>빈 폴더 {selectedNode.name}을 삭제하시겠습니까?</p><button type="button" className={button} disabled={p.tree.busy} onClick={()=>void remove()}>삭제 확인</button><button type="button" className={button} onClick={()=>setConfirmDelete(false)}>취소</button></div>}
    {form&&<div className="space-y-2 rounded border border-teal-300 p-2">
      {form!=='membership'&&<label className="block">폴더 이름<input className={field} value={name} onChange={event=>setName(event.target.value)}/></label>}
      <label className="block">{form==='membership'?'대상 폴더':'상위 폴더'}<select className={field} value={parentId} onChange={event=>setParentId(event.target.value)}><option value="">{form==='membership'?'미분류':'Version 루트'}</option>
       {folderList.filter(f=>form!=='folder'||!forbiddenFolderIds.has(f.id)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label className="block">정렬 순서<input className={field} type="number" min="0" max="9999" value={sortOrder} onChange={event=>setSortOrder(event.target.value)}/></label>
      <button type="button" className={button} disabled={p.tree.busy} onClick={()=>void save()}>저장</button><button type="button" className={button} onClick={()=>setForm(null)}>취소</button>
     </div>}
   </section>}
   {p.outlineActions&&<div className="border-t pt-2">{p.outlineActions}</div>}
   {p.zoneDetail&&<div className="min-h-40 max-h-96 overflow-auto border-t pt-2">{p.zoneDetail}</div>}
  </div>
 </aside>;
}
