'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {Button} from '@/components/ui/button';
import {exchangeSourceUnit,type ExchangeOptions,type ExchangeSelection,type ExchangeUnit} from '@/domain/cad-exchange';
import {exchangeFilename,useCadExchange} from './use-cad-exchange';

type Controller=ReturnType<typeof useCadExchange>;
const PAGE=100;
const units:readonly {value:ExchangeUnit;label:string}[]=[
  {value:'inch',label:'inch (0.0254m)'},{value:'foot',label:'international foot (0.3048m)'},
  {value:'mm',label:'mm (0.001m)'},{value:'cm',label:'cm (0.01m)'},{value:'m',label:'m (1m)'},
];
const reasonLabels:Record<string,string>={
  UNSUPPORTED_RENDER_TYPE:'지원하지 않는 렌더 객체',UNSUPPORTED_GEOMETRY:'지원하지 않는 형상',
  UNSUPPORTED_MATERIAL:'지원하지 않는 재질',UNSUPPORTED_TEXTURE:'텍스처 포함',
  NONPLANAR_GEOMETRY:'비평면 형상',INVALID_POSITION:'유효하지 않은 좌표',
  INVALID_WORLD_POSITION:'유효하지 않은 WCS 좌표',INVALID_INDEX:'유효하지 않은 인덱스',
  INVALID_ATTRIBUTE:'유효하지 않은 색·법선·UV',INVALID_DRAW_RANGE:'유효하지 않은 그리기 범위',
  INVALID_MATERIAL_GROUP:'유효하지 않은 재질 그룹',AMBIGUOUS_MATERIAL_GROUP:'재질 그룹 불명',
  OVERLAPPING_MATERIAL_GROUP:'겹친 재질 그룹',INVALID_PRIMITIVE_ARITY:'선·삼각형 정점 수 불일치',
  INDEX_BUDGET:'인덱스 한도 초과',GROUP_BUDGET:'재질 그룹 한도 초과',MISSING_BASELINE:'원본 기준 행렬 없음',
  LINE_DASH:'점선 패턴',LINE_WIDTH:'선 굵기',POINT_SIZE:'점 크기',
};
const describe=(code:string)=>reasonLabels[code]??code;
function CheckRow({checked,disabled=false,onChange,children,testId}:{checked:boolean;disabled?:boolean;onChange:(checked:boolean)=>void;children:React.ReactNode;testId?:string}){
  return <label className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-slate-50">
    <input data-testid={testId} type="checkbox" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)}
      className="h-5 w-5 shrink-0 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600" />
    <span className="min-w-0 break-words">{children}</span>
  </label>;
}

/** Form and preview only. The hook owns permission checks, immutable job and download. */
export function CadExchangeDialog({controller,defaultFilename}:{controller:Controller;defaultFilename:string}){
  const [format,setFormat]=useState<'glb'|'gltf'>('glb');
  const [filenameBase,setFilenameBase]=useState(defaultFilename);
  const [sourceEnabled,setSourceEnabled]=useState(true);
  const [sourceMode,setSourceMode]=useState<'all'|'layers'>('all');
  const [chosenLayers,setChosenLayers]=useState<string[]>([]);
  const [layerSearch,setLayerSearch]=useState(''),[layerPage,setLayerPage]=useState(0);
  const [generatedEnabled,setGeneratedEnabled]=useState(false);
  const [generatedMode,setGeneratedMode]=useState<'all'|'selected'>('all');
  const [chosenKeys,setChosenKeys]=useState<string[]>([]);
  const [objectSearch,setObjectSearch]=useState(''),[objectPage,setObjectPage]=useState(0);
  const [unit,setUnit]=useState<'auto'|ExchangeUnit>('auto');
  const [originMode,setOriginMode]=useState<'auto'|'custom'>('auto');
  const [origin,setOrigin]=useState({x:'0',y:'0',z:'0'});
  const [acknowledged,setAcknowledged]=useState(false);
  const [includeAllServer,setIncludeAllServer]=useState(false);
  const [memosEnabled,setMemosEnabled]=useState(false),[memoMode,setMemoMode]=useState<'all'|'selected'>('all');
  const [chosenMemoKeys,setChosenMemoKeys]=useState<string[]>([]),[memoSearch,setMemoSearch]=useState('');
  const [includeAllServerMemos,setIncludeAllServerMemos]=useState(false);
  const [memoHeight,setMemoHeight]=useState('0.1'),[manualMemoHeight,setManualMemoHeight]=useState(false);
  const [privateAvailability,setPrivateAvailability]=useState({outlines:false,memos:false});
  const wasOpen=useRef(false);
  const busy=controller.busy||controller.loading;
  const inventory=controller.data?.inventory;
  const sourceObjects=useMemo(()=>inventory?.objects.filter(item=>item.origin==='DXF')??[],[inventory]);
  const layerCounts=useMemo(()=>{
    const counts=new Map<string,number>();for(const item of sourceObjects)counts.set(item.layer,(counts.get(item.layer)??0)+1);return counts;
  },[sourceObjects]);
  const generatedObjects=useMemo(()=>inventory?.objects.filter(item=>item.origin==='LOCAL_GENERATED'||item.origin==='SERVER_OUTLINE')??[],[inventory]);
  const localCount=generatedObjects.filter(item=>item.origin==='LOCAL_GENERATED').length;
  const serverCount=generatedObjects.filter(item=>item.origin==='SERVER_OUTLINE').length;
  const memoObjects=useMemo(()=>inventory?.objects.filter(item=>item.origin==='LOCAL_MEMO'||item.origin==='SERVER_MEMO')??[],[inventory]);
  const filteredMemos=useMemo(()=>memoObjects.filter(item=>(item.name+' '+item.key).toLocaleLowerCase().includes(memoSearch.toLocaleLowerCase())),[memoObjects,memoSearch]);
  const autoUnit=exchangeSourceUnit(inventory?.scope.sourceUnit??'UNSPECIFIED');

  useEffect(()=>{
    if(controller.opened&&!wasOpen.current){
      setFormat('glb');setFilenameBase(defaultFilename);setSourceEnabled(true);setSourceMode('all');setChosenLayers([]);
      setLayerSearch('');setLayerPage(0);setGeneratedEnabled(false);setGeneratedMode('all');setChosenKeys([]);
      setObjectSearch('');setObjectPage(0);setUnit('auto');setOriginMode('auto');setOrigin({x:'0',y:'0',z:'0'});
      setAcknowledged(false);setIncludeAllServer(false);
      setMemosEnabled(false);setMemoMode('all');setChosenMemoKeys([]);setMemoSearch('');setIncludeAllServerMemos(false);
      setMemoHeight('0.1');setManualMemoHeight(false);
    }
    wasOpen.current=controller.opened;
  },[controller.opened,defaultFilename]);
  const outlineAvailable=controller.data?.serverAvailable??false,memoAvailable=controller.data?.memoServerAvailable??false;
  // Adjust this form's private selection before rendering revoked rows. The
  // coordinator already invalidates its prepared artifact when a group fails.
  if(privateAvailability.outlines!==outlineAvailable||privateAvailability.memos!==memoAvailable){
    setPrivateAvailability({outlines:outlineAvailable,memos:memoAvailable});setAcknowledged(false);
    if(!outlineAvailable){setChosenKeys(keys=>keys.filter(key=>key.startsWith('local:')));setIncludeAllServer(false);}
    if(!memoAvailable){setChosenMemoKeys(keys=>keys.filter(key=>key.startsWith('memo-local:')));setIncludeAllServerMemos(false);}
  }
  const invalidate=()=>{controller.invalidate();setAcknowledged(false);};
  const filteredLayers=useMemo(()=>inventory?.layers.filter(name=>name.toLocaleLowerCase().includes(layerSearch.toLocaleLowerCase()))??[],[inventory,layerSearch]);
  const filteredObjects=useMemo(()=>generatedObjects.filter(item=>
    (item.name+' '+item.key).toLocaleLowerCase().includes(objectSearch.toLocaleLowerCase())),[generatedObjects,objectSearch]);
  const validGeneratedKeys=new Set(generatedObjects.map(item=>item.key));
  const effectiveKeys=(includeAllServer&&controller.data?.serverAvailable
    ?[...new Set([...chosenKeys,...generatedObjects.filter(item=>item.origin==='SERVER_OUTLINE').map(item=>item.key)])]:chosenKeys)
    .filter(key=>validGeneratedKeys.has(key));
  const validMemoKeys=new Set(memoObjects.map(item=>item.key));
  const effectiveMemoKeys=(includeAllServerMemos&&controller.data?.memoServerAvailable
    ?[...new Set([...chosenMemoKeys,...memoObjects.filter(item=>item.origin==='SERVER_MEMO').map(item=>item.key)])]:chosenMemoKeys)
    .filter(key=>validMemoKeys.has(key));
  const selectedSourceCount=sourceEnabled?sourceObjects.filter(item=>sourceMode==='all'||chosenLayers.includes(item.layer)).length:0;
  const selectedGeneratedCount=generatedEnabled?generatedObjects.filter(item=>generatedMode==='all'||effectiveKeys.includes(item.key)).length:0;
  const effectiveGeneratedEnabled=generatedEnabled&&(generatedMode==='all'?generatedObjects.length>0:effectiveKeys.length>0);
  const selectedMemoCount=memosEnabled?memoObjects.filter(item=>memoMode==='all'||effectiveMemoKeys.includes(item.key)).length:0;
  const effectiveMemosEnabled=memosEnabled&&selectedMemoCount>0;
  const displayedMemoHeight=manualMemoHeight?memoHeight:String(controller.prepared?.memoTextHeightMetres??0.1);
  const validMemoHeight=!effectiveMemosEnabled||!manualMemoHeight||memoHeight.trim()!==''&&Number.isFinite(Number(memoHeight))&&Number(memoHeight)>=0.001&&Number(memoHeight)<=10;
  const validOrigin=originMode==='auto'||Object.values(origin).every(value=>value.trim()!==''&&Number.isFinite(Number(value))&&Math.abs(Number(value))<=1e12);
  const validUnit=unit!=='auto'||!!autoUnit;
  const canReview=!!inventory&&!busy&&validOrigin&&validUnit&&validMemoHeight&&(selectedSourceCount+selectedGeneratedCount+selectedMemoCount)>0&&
    (!sourceEnabled||sourceMode==='all'||chosenLayers.length>0);
  const previewFilename=exchangeFilename(filenameBase,format);
  const prepare=()=>{
    if(!canReview)return;
    const selection:ExchangeSelection={
      dxf:{enabled:sourceEnabled,mode:sourceMode,layers:sourceMode==='layers'?chosenLayers:[]},
      generated:{enabled:effectiveGeneratedEnabled,mode:generatedMode,keys:generatedMode==='selected'?effectiveKeys:[]},
      memos:{enabled:effectiveMemosEnabled,mode:memoMode,ids:effectiveMemosEnabled&&memoMode==='selected'?effectiveMemoKeys:[]},
    };
    const options:ExchangeOptions={format,unit,origin:originMode==='auto'?{mode:'auto'}:
      {mode:'custom',x:Number(origin.x),y:Number(origin.y),z:Number(origin.z)},filenameBase,
      ...(effectiveMemosEnabled&&manualMemoHeight?{memoTextHeightMetres:Number(memoHeight)}:{})};
    setAcknowledged(false);void controller.prepare(selection,options);
  };
  const toggleServer=async(checked:boolean)=>{
    invalidate();
    if(checked){const loaded=await controller.loadServer();if(loaded){
      const formerlyIncludedLocal=!generatedEnabled?[]:generatedMode==='all'
        ?generatedObjects.filter(item=>item.origin==='LOCAL_GENERATED').map(item=>item.key):chosenKeys.filter(key=>key.startsWith('local:'));
      setChosenKeys(formerlyIncludedLocal);
      setIncludeAllServer(true);setGeneratedEnabled(true);setGeneratedMode('selected');
    }}else{setIncludeAllServer(false);controller.excludeServer();setChosenKeys(previous=>previous.filter(key=>!key.startsWith('server:')));
      if(generatedMode==='selected'&&!chosenKeys.some(key=>key.startsWith('local:')))setGeneratedEnabled(false);}
  };
  const toggleServerMemos=async(checked:boolean)=>{
    invalidate();
    if(checked){const loaded=await controller.loadServerMemos();if(loaded){
      const includedLocal=!memosEnabled?[]:memoMode==='all'?memoObjects.filter(item=>item.origin==='LOCAL_MEMO').map(item=>item.key):effectiveMemoKeys.filter(key=>key.startsWith('memo-local:'));
      setChosenMemoKeys(includedLocal);setIncludeAllServerMemos(true);setMemosEnabled(true);setMemoMode('selected');
    }}else{setIncludeAllServerMemos(false);controller.excludeServerMemos();setChosenMemoKeys(keys=>keys.filter(key=>key.startsWith('memo-local:')));
      if(memoMode==='selected'&&!effectiveMemoKeys.some(key=>key.startsWith('memo-local:')))setMemosEnabled(false);}
  };
  if(!controller.opened)return null;
  return <Dialog.Root open onOpenChange={open=>{if(!open)controller.close();}}>
    <Dialog.Overlay data-testid="cad-exchange-overlay" className="fixed inset-0 z-[130] bg-slate-950/70" />
    <Dialog.Content data-testid="cad-exchange-dialog" data-canvas-edit-escape-layer="dialog"
      onEscapeKeyDown={event=>{event.preventDefault();controller.close();}}
      onCloseAutoFocus={event=>{event.preventDefault();requestAnimationFrame(()=>{
        if(document.querySelector('[data-testid="cad-exchange-dialog"]'))return;
        const target=document.querySelector<HTMLElement>('[data-viewer-group="drawing"]')??document.querySelector<HTMLElement>('[data-testid="cad-viewer-shell"]');
        target?.focus({preventScroll:true});
      });}}
      className="fixed left-1/2 top-1/2 z-[131] flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-900 shadow-2xl focus:outline-none">
      <header className="shrink-0 border-b border-slate-200 px-3 py-3 sm:px-5">
        <Dialog.Title className="text-lg font-semibold">GLB / glTF 내보내기</Dialog.Title>
        <Dialog.Description className="mt-1 text-sm text-slate-600">현재 도면의 표시 렌더 형상을 읽기 전용 교환 파일로 만듭니다. 원본 DXF와 편집 상태는 변경되지 않습니다.</Dialog.Description>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4 sm:px-5">
        {controller.loading&&<p role="status" className="rounded-md bg-teal-50 p-3 text-sm text-teal-900">{controller.stage||'도면 범위를 확인하는 중입니다.'}</p>}
        {controller.error&&<div role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{controller.error}</div>}
        {!inventory&&!controller.loading&&<p className="text-sm text-slate-600">도면 정보를 불러올 수 없습니다. 새로 조회하세요.</p>}
        {inventory&&<>
          <fieldset disabled={busy} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 font-semibold">원본 DXF</legend>
            <CheckRow checked={sourceEnabled} onChange={value=>{invalidate();setSourceEnabled(value);}} testId="cad-exchange-source-enable">
              원본 기준 형상 포함 · 렌더 객체 {sourceObjects.length}개
            </CheckRow>
            <p className="pl-2 text-xs text-slate-600">화면에서 숨긴 레이어도 명시적으로 선택하면 포함됩니다. 임시 이동·회전·숨김 작업은 포함하지 않습니다. 원본 Entity 총수와 미렌더 항목은 확인 불가입니다.</p>
            {sourceEnabled&&<div className="space-y-2 pl-2">
              <div className="flex flex-wrap gap-2 text-sm">
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="exchange-source-mode" checked={sourceMode==='all'} onChange={()=>{invalidate();setSourceMode('all');}} />전체 렌더 레이어</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="exchange-source-mode" checked={sourceMode==='layers'} onChange={()=>{invalidate();setSourceMode('layers');}} />레이어 선택</label>
              </div>
              {sourceMode==='layers'&&<>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="search" aria-label="렌더 레이어 검색" value={layerSearch} onChange={event=>{setLayerSearch(event.target.value);setLayerPage(0);}}
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-600" placeholder="렌더 레이어 검색" />
                  <Button type="button" variant="outline" className="min-h-11" onClick={()=>{invalidate();setChosenLayers([...inventory.layers]);}}>전체 선택</Button>
                  <Button type="button" variant="outline" className="min-h-11" onClick={()=>{invalidate();setChosenLayers([]);}}>전체 해제</Button>
                </div>
                <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200">
                  {filteredLayers.slice(layerPage*PAGE,(layerPage+1)*PAGE).map(name=><CheckRow key={name} checked={chosenLayers.includes(name)} onChange={checked=>{
                    invalidate();setChosenLayers(previous=>checked?[...new Set([...previous,name])]:previous.filter(value=>value!==name));
                  }}>{name} · 렌더 객체 {layerCounts.get(name)??0}개</CheckRow>)}
                  {!filteredLayers.length&&<p className="p-3 text-sm text-slate-500">일치하는 레이어가 없습니다.</p>}
                </div>
                {filteredLayers.length>PAGE&&<div className="flex items-center justify-between text-sm"><Button type="button" variant="outline" className="min-h-11" disabled={layerPage===0} onClick={()=>setLayerPage(page=>page-1)}>이전</Button><span>{layerPage+1} / {Math.ceil(filteredLayers.length/PAGE)}</span><Button type="button" variant="outline" className="min-h-11" disabled={(layerPage+1)*PAGE>=filteredLayers.length} onClick={()=>setLayerPage(page=>page+1)}>다음</Button></div>}
              </>}
            </div>}
          </fieldset>
          <fieldset disabled={busy} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 font-semibold">추가 외곽선</legend>
            <CheckRow checked={generatedEnabled} onChange={checked=>{invalidate();setGeneratedEnabled(checked);}} testId="cad-exchange-generated-enable">
              확정된 추가 개체 포함 · 브라우저 {localCount}개 / 서버 {serverCount}개
            </CheckRow>
            <CheckRow checked={!!controller.data?.serverAvailable} disabled={!controller.data?.canLoadServer&&!controller.data?.serverAvailable}
              onChange={value=>{void toggleServer(value);}} testId="cad-exchange-server-enable">
              서버 외곽선 조회 후 포함 {controller.data?.serverReason&&<span className="text-slate-500">· {controller.data.serverReason}</span>}
            </CheckRow>
            {generatedEnabled&&<div className="space-y-2 pl-2">
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="exchange-generated-mode" checked={generatedMode==='all'} onChange={()=>{invalidate();setGeneratedMode('all');}} />전체 확정 개체</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="exchange-generated-mode" checked={generatedMode==='selected'} onChange={()=>{invalidate();setGeneratedMode('selected');}} />개체 선택</label>
              </div>
              {generatedMode==='selected'&&<>
                <input type="search" aria-label="추가 개체 검색" value={objectSearch} onChange={event=>{setObjectSearch(event.target.value);setObjectPage(0);}}
                  className="min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-600" placeholder="추가 개체 검색" />
                <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200">
                  {filteredObjects.slice(objectPage*PAGE,(objectPage+1)*PAGE).map(item=><CheckRow key={item.key} checked={effectiveKeys.includes(item.key)} onChange={checked=>{
                    invalidate();setIncludeAllServer(false);setChosenKeys(checked?[...new Set([...effectiveKeys,item.key])]:effectiveKeys.filter(key=>key!==item.key));
                  }}><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{item.origin==='LOCAL_GENERATED'?'브라우저':'서버'}</span>{item.name.slice(0,100)}</CheckRow>)}
                  {!filteredObjects.length&&<p className="p-3 text-sm text-slate-500">확정 개체가 없습니다.</p>}
                </div>
                {filteredObjects.length>PAGE&&<div className="flex items-center justify-between text-sm"><Button type="button" variant="outline" className="min-h-11" disabled={objectPage===0} onClick={()=>setObjectPage(page=>page-1)}>이전</Button><span>{objectPage+1} / {Math.ceil(filteredObjects.length/PAGE)}</span><Button type="button" variant="outline" className="min-h-11" disabled={(objectPage+1)*PAGE>=filteredObjects.length} onClick={()=>setObjectPage(page=>page+1)}>다음</Button></div>}
              </>}
            </div>}
          </fieldset>
          <fieldset disabled={busy} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 font-semibold">메모</legend>
            <CheckRow checked={memosEnabled} onChange={checked=>{invalidate();setMemosEnabled(checked);}} testId="cad-exchange-memos-enable">
              메모 포함 · 브라우저 {memoObjects.filter(item=>item.origin==='LOCAL_MEMO').length}개 · 서버 {memoObjects.filter(item=>item.origin==='SERVER_MEMO').length}개
            </CheckRow>
            <CheckRow checked={controller.data?.memoServerAvailable??false} disabled={!controller.data?.canLoadMemos}
              onChange={checked=>void toggleServerMemos(checked)} testId="cad-exchange-server-memos-enable">권한 있는 서버 메모 조회·포함</CheckRow>
            {controller.data?.memoServerReason&&<p className="pl-2 text-xs text-slate-600">{controller.data.memoServerReason}</p>}
            <p className="pl-2 text-xs text-slate-600">숨긴 메모도 명시적으로 포함할 수 있습니다. 제목·본문은 한글 텍스처와 핀·연결선으로 표시하며, 화면의 라벨 간격 대신 지정한 글자 높이에 비례해 배치합니다.</p>
            {memosEnabled&&<div className="space-y-2 pl-2">
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="exchange-memo-mode" checked={memoMode==='all'} onChange={()=>{invalidate();setMemoMode('all');}} />전체 메모</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="exchange-memo-mode" checked={memoMode==='selected'} onChange={()=>{invalidate();setMemoMode('selected');}} />메모 선택</label>
              </div>
              {memoMode==='selected'&&<>
                <div className="flex flex-wrap gap-2">
                  <input type="search" aria-label="내보낼 메모 검색" value={memoSearch} onChange={event=>setMemoSearch(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm" />
                  <Button type="button" variant="outline" className="min-h-11" onClick={()=>{invalidate();setIncludeAllServerMemos(false);setChosenMemoKeys(memoObjects.map(item=>item.key));}}>메모 전체 선택</Button>
                  <Button type="button" variant="outline" className="min-h-11" onClick={()=>{invalidate();setIncludeAllServerMemos(false);setChosenMemoKeys([]);}}>메모 전체 해제</Button>
                </div>
                <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200">
                  {filteredMemos.map(item=><CheckRow key={item.key} checked={effectiveMemoKeys.includes(item.key)} onChange={checked=>{
                    invalidate();setIncludeAllServerMemos(false);setChosenMemoKeys(checked?[...new Set([...effectiveMemoKeys,item.key])]:effectiveMemoKeys.filter(key=>key!==item.key));
                  }}><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{item.origin==='LOCAL_MEMO'?'브라우저 메모':'서버 메모'}</span>{item.name}</CheckRow>)}
                  {!filteredMemos.length&&<p className="p-3 text-sm text-slate-600">포함할 메모가 없습니다.</p>}
                </div>
              </>}
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 space-y-1 text-sm">메모 글자 높이 (m)
                  <input type="number" step="any" min="0.001" max="10" value={displayedMemoHeight} onChange={event=>{invalidate();setMemoHeight(event.target.value);setManualMemoHeight(true);}}
                    className="min-h-11 w-full rounded-md border border-slate-300 px-3" data-testid="cad-exchange-memo-height" />
                </label>
                <Button type="button" variant="outline" className="min-h-11" onClick={()=>{invalidate();setManualMemoHeight(false);}}>글자 높이 자동</Button>
              </div>
              <p className="text-xs text-slate-600">{manualMemoHeight?'직접 지정한 값을 유지합니다.':controller.prepared?.memoTextHeightMetres!==undefined?'선택한 형상 크기로 계산한 자동 높이입니다.':'자동 임시값 0.1m · 포함 범위 확인 시 선택한 형상 크기로 계산합니다.'}</p>
              {!validMemoHeight&&<p role="alert" className="text-sm text-rose-800">메모 글자 높이는 0.001~10m의 유한한 수치로 입력하세요.</p>}
            </div>}
          </fieldset>
          <fieldset disabled={busy} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
            <legend className="px-1 font-semibold">파일과 좌표</legend>
            <label className="space-y-1 text-sm">형식<select value={format} onChange={event=>{invalidate();setFormat(event.target.value as 'glb'|'gltf');}} className="min-h-11 w-full rounded-md border border-slate-300 px-3"><option value="glb">GLB (.glb)</option><option value="gltf">단일 embedded glTF (.gltf)</option></select></label>
            <label className="space-y-1 text-sm">파일 이름<input value={filenameBase} maxLength={120} onChange={event=>{invalidate();setFilenameBase(event.target.value);}} className="min-h-11 w-full rounded-md border border-slate-300 px-3" /></label>
            <label className="space-y-1 text-sm">원본 단위<select value={unit} onChange={event=>{invalidate();setUnit(event.target.value as 'auto'|ExchangeUnit);}} className="min-h-11 w-full rounded-md border border-slate-300 px-3">
              <option value="auto">자동 감지 {autoUnit?`(${autoUnit})`:'(확인 불가 · 수동 선택 필요)'}</option>{units.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
            </select></label>
            <label className="space-y-1 text-sm">원점<select value={originMode} onChange={event=>{invalidate();setOriginMode(event.target.value as 'auto'|'custom');}} className="min-h-11 w-full rounded-md border border-slate-300 px-3"><option value="auto">선택 형상 중심</option><option value="custom">직접 입력 (원본 WCS)</option></select></label>
            {originMode==='custom'&&<div className="grid grid-cols-3 gap-2 sm:col-span-2">{(['x','y','z'] as const).map(axis=><label key={axis} className="space-y-1 text-sm">{axis.toUpperCase()}<input type="number" step="any" value={origin[axis]} onChange={event=>{invalidate();setOrigin(previous=>({...previous,[axis]:event.target.value}));}} className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-2" /></label>)}</div>}
            <p className="text-xs text-slate-600 sm:col-span-2">예상 파일명: {previewFilename} · 원본 단위 {inventory.scope.sourceUnit} → 미터 · XY 평면 → glTF XZ 평면</p>
            <p className="text-xs text-amber-900 sm:col-span-2">정밀도 수치는 현재 렌더 형상 대비 추가 변환 오차입니다. 렌더러가 이미 잃은 원본 CAD 정밀도는 복구할 수 없습니다.</p>
            {!validUnit&&<p role="alert" className="text-sm text-amber-800 sm:col-span-2">원본 단위가 0·미상·미지원 값입니다. inch, foot, mm, cm, m 중 하나를 명시하세요.</p>}
            {!validOrigin&&<p role="alert" className="text-sm text-rose-800 sm:col-span-2">원점 X/Y/Z에 유한한 WCS 수치를 입력하세요.</p>}
          </fieldset>
          {controller.prepared&&<section data-testid="cad-exchange-preview" className="space-y-2 rounded-lg border border-teal-300 bg-teal-50 p-3 text-sm">
            <h3 className="font-semibold">포함 범위 확인 결과</h3>
            <p>지원 산출 개체 {controller.prepared.included}개 · 추가 개체 {controller.prepared.generated}개 · 메모 {controller.prepared.memos}개 · 제외 {controller.prepared.preview.excluded}개</p>
            {controller.prepared.memos>0&&<p>메모 글자 높이 {controller.prepared.memoTextHeightMetres}m · 연결이 끊긴 메모는 마지막 확인 위치를 사용합니다.</p>}
            <div className="max-h-44 overflow-y-auto rounded border border-teal-200 bg-white">
              {controller.prepared.preview.layers.map(row=><div key={row.layer} className="border-b border-slate-100 px-2 py-2 last:border-0">
                <strong>{row.layer}</strong> · 렌더 객체 포함 {row.accepted} / 제외 {row.excluded}
                {Object.entries(row.reasons).map(([code,count])=><span key={code} className="ml-2 text-amber-800">{describe(code)} {count}</span>)}
                {Object.entries(row.styleLoss).map(([code,count])=><span key={code} className="ml-2 text-amber-800">{describe(code)} 손실 {count}</span>)}
              </div>)}
            </div>
            {sourceEnabled&&inventory.warnings.map((warning,index)=><p key={index} className="text-amber-900">{warning}</p>)}
            {controller.prepared.preview.partial&&<CheckRow checked={acknowledged} disabled={busy} onChange={setAcknowledged} testId="cad-exchange-partial-ack">현재 선택의 제외·확인 불가 형상과 스타일 손실을 확인했습니다. 부분 산출 파일을 받겠습니다.</CheckRow>}
          </section>}
          {controller.result&&<div role="status" className="rounded-md border border-teal-300 bg-teal-50 p-3 text-sm text-teal-950">
            <strong>다운로드 시작:</strong> {controller.result.filename} · 포함 {controller.result.report.included}개 / 제외 {controller.result.report.excluded}개.
          </div>}
        </>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-3 py-3 sm:px-5">
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={()=>void controller.open()}>새로 조회</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={controller.close}>취소 / 닫기</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={!canReview} onClick={prepare} data-testid="cad-exchange-review">포함 범위 확인</Button>
        <Button type="button" className="min-h-11" disabled={busy||!controller.prepared||controller.prepared.included===0||controller.prepared.preview.partial&&!acknowledged}
          onClick={()=>void controller.download(acknowledged)} data-testid="cad-exchange-download">파일 다운로드</Button>
      </footer>
    </Dialog.Content>
  </Dialog.Root>;
}
