'use client';
import {useMemo,useState,type KeyboardEvent,type ReactNode} from 'react';
import {closeZonePoints,isZoneGeometryMapped,normalizeZoneMetadata,validateZonePolygon,zonesOverlap,type CadZoneDto,type ZoneCategoryDto,type ZoneListDto,type ZoneMetadata,type ZonePoint,type ZonePolygon,type ZoneReference} from '@/domain/cad-zone';
import type {MemoSnapChoice} from '@/domain/memo-session-snap';

type Props={list:ZoneListDto|null;selectedId:string|null;hidden:ReadonlySet<string>;allVisible:boolean;canEdit:boolean;editReason:string|null;
 drawing:boolean;points:readonly ZonePoint[];closed:boolean;notice:string|null;busy:boolean;
 snap:{free:ZonePoint;choices:readonly MemoSnapChoice[];epoch:number;total:number;limited:boolean}|null;onChooseSnap:(key:string|null)=>void;
 onSelect:(id:string)=>void;onFocus:(id:string)=>void;onVisibility:(id:string,visible:boolean)=>void;
 onAllVisibility:(visible:boolean)=>void;onCreateStart:()=>void;onCancel:()=>void;onUndoPoint:()=>void;
 onClosePolygon:()=>void;onAddPoint:(point:ZonePoint)=>void;onEditPoint:(index:number,point:ZonePoint)=>void;
 onReuseOutline:()=>void;onSave:(metadata:ZoneMetadata,polygon?:ZonePolygon)=>Promise<void>;
 onEditGeometry:(zone:CadZoneDto)=>void;drawingExistingId:string|null;
 onDelete:(zone:CadZoneDto)=>Promise<void>;onCategoryCreate:(name:string,sortOrder:number)=>Promise<void>;
 onCategoryPatch:(category:ZoneCategoryDto,name:string,sortOrder:number,active:boolean)=>Promise<void>;
 onCategoryDelete:(category:ZoneCategoryDto)=>Promise<void>;onRefresh:()=>void;onClose:()=>void;
};
const blank:ZoneMetadata={name:'',categoryId:null,description:'',code:'',tags:[],sortOrder:0,parentZoneId:null,references:[]};
const field='w-full rounded border border-slate-400 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700';
const button='rounded border border-slate-400 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50';
function Row({zone,depth,selected,visible,category,onSelect,onFocus,onVisibility,onGroupVisibility,hasChildren,children}:{zone:CadZoneDto;depth:number;selected:boolean;visible:boolean;category:string;onSelect:()=>void;onFocus:()=>void;onVisibility:()=>void;onGroupVisibility:()=>void;hasChildren:boolean;children?:ReactNode}){
 const [expanded,setExpanded]=useState(true);
 const keyboard=(e:KeyboardEvent<HTMLLIElement>)=>{
  const target=e.target instanceof HTMLElement?e.target:null;
  if(!target||target.closest('[data-zone-row]')!==e.currentTarget)return;
  if(target!==e.currentTarget&&target.dataset.testid!=='zone-tree-item')return;
  const rows=[...e.currentTarget.closest('[role="tree"]')!.querySelectorAll<HTMLElement>('[data-zone-row="true"]')].filter(node=>node.getClientRects().length>0);
  const index=rows.indexOf(e.currentTarget);let next:number|null=null;
  if(e.key==='ArrowDown')next=Math.min(rows.length-1,index+1);
  else if(e.key==='ArrowUp')next=Math.max(0,index-1);
  else if(e.key==='Home')next=0;else if(e.key==='End')next=rows.length-1;
  else if(e.key==='ArrowRight'&&hasChildren){setExpanded(true);e.preventDefault();return;}
  else if(e.key==='ArrowLeft'&&hasChildren){setExpanded(false);e.preventDefault();return;}
  else if(e.key==='Enter'&&target===e.currentTarget){onFocus();e.preventDefault();return;}
  else if(e.key===' '&&target===e.currentTarget){onSelect();e.preventDefault();return;}
  if(next!==null){e.preventDefault();e.stopPropagation();rows[next]?.querySelector<HTMLButtonElement>('[data-testid="zone-tree-item"]')?.focus({preventScroll:true});}
 };
 return <li role="treeitem" data-zone-row="true" tabIndex={selected?0:-1} onKeyDown={keyboard} aria-expanded={hasChildren?expanded:undefined} aria-selected={selected} className="border-b border-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700" style={{paddingLeft:Math.min(depth,8)*12}}>
  <div className="flex items-center gap-1 py-1">
   {hasChildren?<button type="button" className={button} aria-label={`${zone.name} ${expanded?'접기':'펼치기'}`} onClick={()=>setExpanded(v=>!v)}>{expanded?'−':'+'}</button>:<span className="w-7"/>}
   <button type="button" className={`${button} min-w-0 flex-1 truncate text-left ${selected?'border-teal-700 bg-teal-50':''}`}
    data-testid="zone-tree-item" onClick={onSelect} onDoubleClick={onFocus}
    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onFocus();}}} title={`${zone.name} · ${category}`}>
    {zone.name}{zone.code?` · ${zone.code}`:''}
   </button>
   <button type="button" className={button} aria-pressed={visible} onClick={onVisibility}>{visible?'숨김':'표시'}</button>
   {hasChildren&&<button type="button" className={button} onClick={onGroupVisibility} title="하위 구역 표시 전환">하위</button>}
  </div>
  {expanded&&hasChildren&&<ul role="group">{children}</ul>}
 </li>;
}
export function CadZonePanel(p:Props){
 const {list}=p;
 const selected=list?.zones.find(z=>z.id===p.selectedId)??null;
 const [search,setSearch]=useState('');
 const [editing,setEditing]=useState(!!p.drawingExistingId);
 const [form,setForm]=useState<ZoneMetadata>(()=>p.drawingExistingId&&selected?{...selected,references:[...selected.references]}:blank);
 const [tags,setTags]=useState(()=>p.drawingExistingId&&selected?selected.tags.join(', '):'');
 const [reference,setReference]=useState<ZoneReference>({label:'',kind:'EQUIPMENT',value:''});
 const [categoryName,setCategoryName]=useState('');
 const [categoryOrder,setCategoryOrder]=useState('0');
 const [categoryEdit,setCategoryEdit]=useState(false);
 const [x,setX]=useState('');const [y,setY]=useState('');
 const [error,setError]=useState<string|null>(null);
 const [collapsedAll,setCollapsedAll]=useState(false);
 const [overlapAcknowledged,setOverlapAcknowledged]=useState(false);
 const beginEdit=()=>{if(!selected)return;setForm({...selected,references:[...selected.references]});setTags(selected.tags.join(', '));setEditing(true);setError(null);};
 const beginCreate=()=>{setForm(blank);setTags('');setEditing(true);setError(null);p.onCreateStart();};
 const appendNumeric=()=>{const point={x:Number(x),y:Number(y)};if(!x.trim()||!y.trim()||!Number.isFinite(point.x)||!Number.isFinite(point.y)){setError('유한한 WCS X/Y 숫자를 입력하세요.');return;}p.onAddPoint(point);setX('');setY('');setError(null);};
 const save=async()=>{try{
  const metadata=normalizeZoneMetadata({...form,tags:tags.split(',').map(s=>s.trim()).filter(Boolean)});
  const polygon=p.drawing?(p.closed?closeZonePoints(p.points):undefined):undefined;
  if(p.drawing&&!polygon)throw new Error('꼭짓점을 지정하고 경계를 명시적으로 닫으세요.');
  if(polygon)validateZonePolygon(polygon);
  if(polygon&&list){
   const siblings=list.zones.filter(z=>z.id!==selected?.id&&z.parentZoneId===metadata.parentZoneId&&
    isZoneGeometryMapped(z,{versionId:list.versionId,sourceSha256:list.sourceSha256,sceneRevision:list.sceneRevision}));
   if(siblings.some(z=>zonesOverlap(polygon,z.geometry!.polygon))&&!overlapAcknowledged){
    setOverlapAcknowledged(true);setError('같은 단계의 구역 경계가 겹칩니다. 의도한 경우 저장을 다시 누르세요.');return;
   }
  }
  await p.onSave(metadata,polygon);setEditing(false);setError(null);
 }catch(e){setError(e instanceof Error?e.message:'구역 저장에 실패했습니다.');}};
 const filtered=useMemo(()=>{
  const q=search.trim().toLocaleLowerCase();
  if(!list)return [];
  if(!q)return list.zones;
  const matching=new Set(list.zones.filter(z=>[
   z.name,z.code,z.description,list.categories.find(c=>c.id===z.categoryId)?.name??'',
   ...z.references.flatMap(r=>[r.label,r.value,r.kind]),...z.tags
  ].some(v=>v.toLocaleLowerCase().includes(q))).map(z=>z.id));
  for(const z of list.zones){if(!matching.has(z.id))continue;let parent=z.parentZoneId;const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);matching.add(parent);parent=list.zones.find(v=>v.id===parent)?.parentZoneId??null;}}
  return list.zones.filter(z=>matching.has(z.id));
 },[list,search]);
 const sort=(a:CadZoneDto,b:CadZoneDto)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id);
 const render=(parent:string|null,depth=0,seen=new Set<string>()):ReactNode=>filtered.filter(z=>z.parentZoneId===parent).sort(sort).map(z=>{
  if(seen.has(z.id))return null;const next=new Set(seen);next.add(z.id);
  const children=render(z.id,depth+1,next);const visible=p.allVisible&&!p.hidden.has(z.id);
  const hasChildren=filtered.some(v=>v.parentZoneId===z.id);
  const descendants=(id:string,seenIds=new Set<string>()):string[]=>{
   if(seenIds.has(id))return [];seenIds.add(id);
   return [id,...filtered.filter(v=>v.parentZoneId===id).flatMap(v=>descendants(v.id,seenIds))];
  };
  return <Row key={z.id+':'+collapsedAll} zone={z} depth={depth} selected={z.id===p.selectedId} visible={visible}
   hasChildren={hasChildren&&!collapsedAll} category={list?.categories.find(c=>c.id===z.categoryId)?.name??'미분류'} onSelect={()=>{if(editing||p.drawing){setError('편집을 저장하거나 취소한 뒤 다른 구역을 선택하세요.');return;}p.onSelect(z.id);}} onFocus={()=>p.onFocus(z.id)}
   onVisibility={()=>p.onVisibility(z.id,!visible)} onGroupVisibility={()=>descendants(z.id).forEach(id=>p.onVisibility(id,!visible))}>{collapsedAll?null:children}</Row>;
 });
 return <aside data-testid="cad-zone-panel" aria-label="구역 목록" className="flex h-full min-h-0 flex-col text-slate-800">
  <div className="flex items-center justify-between border-b px-3 py-2"><strong>구역 목록 ({list?.zones.length??0})</strong><button type="button" className={button} onClick={p.onClose}>구역 목록 닫기</button></div>
  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
   <div className="flex flex-wrap gap-1"><button type="button" className={button} onClick={p.onRefresh}>새로고침</button><button type="button" className={button} onClick={()=>p.onAllVisibility(!p.allVisible)}>{p.allVisible?'전체 숨김':'전체 표시'}</button><button type="button" className={button} onClick={()=>setCollapsedAll(v=>!v)}>{collapsedAll?'전체 펼침':'전체 접기'}</button></div>
   <label className="block text-sm">구역 검색<input data-testid="zone-search" className={field} value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름, 코드, 참조, 카테고리"/></label>
   {list?<ul role="tree" aria-label="층별 구역" className="max-h-52 overflow-auto rounded border border-slate-200"><li role="treeitem" tabIndex={-1} aria-selected={false} aria-expanded={!collapsedAll} className="bg-slate-50 px-2 py-1 font-semibold">층 · {list.locationId}<ul role="group">{render(null)}</ul></li></ul>:<p role="status">구역 목록을 불러오는 중…</p>}
   {selected&&!editing&&<section aria-label="선택 구역 상세" className="space-y-1 rounded border border-slate-200 p-2 text-sm"><h3 className="font-semibold">{selected.name}</h3><p>코드: {selected.code||'없음'} · 카테고리: {list?.categories.find(c=>c.id===selected.categoryId)?.name??'미분류'}</p><p className="whitespace-pre-wrap break-words">{selected.description}</p><p>태그: {selected.tags.join(', ')||'없음'}</p><p>정렬: {selected.sortOrder}</p><p>경계: {selected.geometry?.state??'없음'}{selected.geometry?.reason?` · ${selected.geometry.reason}`:''}</p><ul>{selected.references.map((r,i)=><li key={i}>{r.kind} · {r.label}: {r.value} {r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">링크 열기</a>}</li>)}</ul><div className="flex gap-1"><button type="button" className={button} disabled={!p.canEdit} title={p.editReason??undefined} onClick={beginEdit}>편집</button><button type="button" className={button} disabled={!p.canEdit} title={p.editReason??undefined} onClick={()=>{setForm({...selected,references:[...selected.references]});setTags(selected.tags.join(', '));setEditing(true);p.onEditGeometry(selected);}}>경계 편집/재연결</button><button type="button" className={button} disabled={!p.canEdit||!(list?.canDeleteAny||selected.createdById===list?.actorId)} title={p.editReason??undefined} onClick={()=>{if(window.confirm(`${selected.name} 구역을 삭제하시겠습니까?`))void p.onDelete(selected);}}>삭제</button></div>{p.editReason&&<p className="text-amber-800">{p.editReason}</p>}</section>}
   {(editing||p.drawing)&&<section aria-label="구역 편집" className="space-y-2 rounded border border-teal-300 p-2 text-sm">
    <h3 className="font-semibold">{selected?'구역 편집':'구역 생성'}</h3>
    {(['name','code','description'] as const).map(k=><label key={k} className="block">{{name:'이름',code:'코드',description:'설명'}[k]}{k==='description'?<textarea className={field} value={form[k]} onChange={e=>setForm(v=>({...v,[k]:e.target.value}))}/>:<input className={field} value={form[k]} onChange={e=>setForm(v=>({...v,[k]:e.target.value}))}/>}</label>)}
    <label className="block">카테고리<select className={field} value={form.categoryId??''} onChange={e=>setForm(v=>({...v,categoryId:e.target.value||null}))}><option value="">미분류</option>{list?.categories.filter(c=>c.active||c.id===form.categoryId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="block">상위 구역<select className={field} value={form.parentZoneId??''} onChange={e=>setForm(v=>({...v,parentZoneId:e.target.value||null}))}><option value="">층 바로 아래</option>{list?.zones.filter(z=>z.id!==selected?.id).map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
    <label className="block">태그 (쉼표 구분)<input className={field} value={tags} onChange={e=>setTags(e.target.value)}/></label><label className="block">정렬순서<input className={field} type="number" min="0" max="9999" value={form.sortOrder} onChange={e=>setForm(v=>({...v,sortOrder:Number(e.target.value)}))}/></label>
    <fieldset className="space-y-1 border-t pt-2"><legend>구조화된 참조</legend>{form.references.map((r,i)=><div key={i} className="flex items-center justify-between gap-1"><span>{r.kind} · {r.label}: {r.value}</span><button type="button" className={button} onClick={()=>setForm(v=>({...v,references:v.references.filter((_,j)=>j!==i)}))}>제거</button></div>)}
     <label className="block">종류<select className={field} value={reference.kind} onChange={e=>setReference(v=>({...v,kind:e.target.value as ZoneReference['kind']}))}>{['EQUIPMENT','PROCESS','SYSTEM','DOCUMENT','OTHER'].map(k=><option key={k}>{k}</option>)}</select></label>
     {(['label','value','url'] as const).map(k=><label key={k} className="block">{{label:'표시명',value:'값',url:'HTTP/HTTPS URL (선택)'}[k]}<input className={field} value={reference[k]??''} onChange={e=>setReference(v=>({...v,[k]:e.target.value}))}/></label>)}
     <button type="button" className={button} onClick={()=>{try{const next=normalizeZoneMetadata({...form,references:[...form.references,reference]});setForm(next);setReference({label:'',kind:'EQUIPMENT',value:''});setError(null);}catch(e){setError(e instanceof Error?e.message:'참조를 확인하세요.');}}}>참조 추가</button></fieldset>
    {p.drawing&&<fieldset className="space-y-1 border-t pt-2"><legend>경계 · WCS 꼭짓점 {p.points.length}개 {p.closed?'(닫힘)':'(입력 중)'}</legend><p>도면을 클릭하거나 좌표를 입력하세요. 스냅 후보가 있으면 별도 선택할 수 있습니다.</p><div className="flex gap-1"><input aria-label="WCS X" className={field} value={x} onChange={e=>setX(e.target.value)}/><input aria-label="WCS Y" className={field} value={y} onChange={e=>setY(e.target.value)}/><button type="button" className={button} onClick={appendNumeric}>점 추가</button></div><div className="flex flex-wrap gap-1"><button type="button" className={button} disabled={!p.points.length} onClick={p.onUndoPoint}>마지막 점 취소</button><button type="button" className={button} disabled={p.points.length<3||p.closed} onClick={p.onClosePolygon}>경계 닫기</button><button type="button" className={button} onClick={p.onReuseOutline}>선택 외곽선 재사용</button></div><ol className="max-h-32 overflow-auto">{p.points.map((point,i)=><li key={i} className="flex gap-1 py-0.5"><span>{i+1}.</span><input aria-label={`${i+1}번 X`} className={field} type="number" value={point.x} onChange={e=>p.onEditPoint(i,{x:Number(e.target.value),y:point.y})}/><input aria-label={`${i+1}번 Y`} className={field} type="number" value={point.y} onChange={e=>p.onEditPoint(i,{x:point.x,y:Number(e.target.value)})}/></li>)}</ol></fieldset>}
    {p.snap&&<fieldset className="space-y-1 rounded border border-amber-400 bg-amber-50 p-2"><legend>스냅 후보 선택</legend><p>끝점·꼭짓점 {p.snap.choices.length}개{p.snap.limited?' (조회 상한 적용)':''}. 선 교차점 스냅은 지원하지 않습니다. 후보를 고르거나 자유 좌표를 사용하세요.</p>{p.snap.choices.slice(0,8).map(c=><button key={c.key} type="button" className={`${button} block w-full text-left`} onClick={()=>p.onChooseSnap(c.key)}>{c.kind==='ENDPOINT'?'끝점':'꼭짓점'} · {c.world.x.toFixed(3)}, {c.world.y.toFixed(3)} · {c.distancePx.toFixed(1)}px</button>)}{p.snap.choices.length>8&&<p>가까운 후보 8개만 표시합니다. 확대해서 다시 선택하세요.</p>}<button type="button" className={button} onClick={()=>p.onChooseSnap(null)}>자유 좌표 {p.snap.free.x.toFixed(3)}, {p.snap.free.y.toFixed(3)}</button></fieldset>}
    <div className="flex gap-1"><button type="button" className={button} disabled={p.busy} onClick={()=>void save()}>구역 확인/저장</button><button type="button" className={button} onClick={()=>{setEditing(false);p.onCancel();}}>취소</button></div></section>}
   {!editing&&!p.drawing&&<button type="button" data-testid="zone-create" className={button} disabled={!p.canEdit} title={p.editReason??undefined} onClick={beginCreate}>새 구역 생성</button>}
   {list?.canManageCategories&&<section className="space-y-2 border-t pt-2 text-sm"><button type="button" className={button} onClick={()=>setCategoryEdit(v=>!v)}>카테고리 관리 {categoryEdit?'닫기':'열기'}</button>{categoryEdit&&<><label className="block">새 카테고리 이름<input className={field} value={categoryName} onChange={e=>setCategoryName(e.target.value)}/></label><label className="block">정렬순서<input className={field} type="number" value={categoryOrder} onChange={e=>setCategoryOrder(e.target.value)}/></label><button type="button" className={button} onClick={()=>{void p.onCategoryCreate(categoryName,Number(categoryOrder)).then(()=>setCategoryName('')).catch(e=>setError(e.message));}}>추가</button>{list.categories.map(c=><div key={c.id} className="flex flex-wrap items-center gap-1"><span className="flex-1">{c.name} · {c.active?'사용':'비활성'}</span><button type="button" className={button} onClick={()=>{const name=window.prompt('카테고리 이름',c.name);if(name!==null)void p.onCategoryPatch(c,name,c.sortOrder,c.active).catch(e=>setError(e.message));}}>이름</button><button type="button" className={button} onClick={()=>void p.onCategoryPatch(c,c.name,c.sortOrder,!c.active).catch(e=>setError(e.message))}>{c.active?'비활성':'활성'}</button><button type="button" className={button} onClick={()=>{if(window.confirm('카테고리를 삭제하시겠습니까?'))void p.onCategoryDelete(c).catch(e=>setError(e.message));}}>삭제</button></div>)}</>}</section>}
   {(error||p.notice)&&<p role="alert" className="text-sm text-red-800">{error??p.notice}</p>}
  </div>
 </aside>;
}
