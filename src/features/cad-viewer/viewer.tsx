'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ViewerManager } from '@/viewers/core/adapter';
import { selectRenderer, type ViewerFormat, type ViewerRenderer } from '@/viewers/core/selection';
import { ViewerSource } from '@/viewers/core/source';
import type {ViewerMetric} from '@/viewers/core/metrics';

export function CadViewer({ versionId, renderer: initialRenderer = 'dxf-viewer', format = 'DXF' }: { versionId: string; renderer?: ViewerRenderer; format?: ViewerFormat }) {
  const [renderer,setRenderer]=useState(selectRenderer(format, initialRenderer));
  const [source]=useState(()=>new ViewerSource());
  const container = useRef<HTMLDivElement>(null), manager = useRef<ViewerManager | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [layers,setLayers] = useState<string[]>([]);
  const [metric,setMetric]=useState<ViewerMetric|null>(null);
  const [state, setState] = useState<{ status: string; ready: boolean; error?: string; warning?:string }>({status:'도면 로딩 중…',ready:false});
  useEffect(()=>()=>source.dispose(),[source,versionId]);
  function choose(value:typeof renderer) {
    setState({status:'도면 로딩 중…',ready:false});setMetric(null);setLayers([]);setRenderer(value);
    const url=new URL(window.location.href);url.searchParams.set('renderer',value);
    window.history.replaceState(null,'',url);
  }
  useEffect(() => {
    let active = true;
    const instance = new ViewerManager(async () => {
      if (renderer === 'libredwg-web') {
        const { LibreDwgWebAdapter } = await import('@/viewers/libredwg-web/adapter');
        if (!active || !container.current) throw new DOMException('취소됨','AbortError');
        return new LibreDwgWebAdapter(container.current);
      }
      if (renderer === 'three-dxf-viewer') {
        const { ThreeDxfViewerAdapter } = await import('@/viewers/three-dxf-viewer/adapter');
        if (!active || !container.current) throw new DOMException('취소됨','AbortError');
        return new ThreeDxfViewerAdapter(container.current);
      }
      const { DxfViewerAdapter } = await import('@/viewers/dxf-viewer/adapter');
      if (!active || !container.current) throw new DOMException('취소됨','AbortError');
      return new DxfViewerAdapter(container.current!);
    },source,{renderer,versionId,report:value=>{if(active)setMetric(value);}},format);
    manager.current = instance;
    instance.load(`/api/cad-files/${versionId}/content`, format).then(result => {
      if (active) {setState({status:result.empty ? '표시할 도형이 없습니다.' : result.warning ? '도면 일부 표시 완료' : '도면 표시 완료',ready:!result.empty,warning:result.warning});setLayers(instance.getLayers());}
    }).catch(error => {
      if (active) setState({status:'표시 실패',ready:false,error:error instanceof Error ? error.message : 'Viewer 초기화에 실패했습니다.'});
    });
    return () => { active = false; instance.dispose(); manager.current = null; };
  }, [versionId,attempt,renderer,source,format]);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3"><span className="mr-auto rounded bg-teal-50 px-3 py-2 text-sm text-teal-800">{renderer}</span>
      {format==='DXF' && (['dxf-viewer','three-dxf-viewer'] as const).map(value=><Button key={value} variant={renderer===value?'default':'outline'} aria-pressed={renderer===value} disabled={renderer===value} onClick={()=>choose(value)}>{value}</Button>)}
      <Button variant="outline" disabled={!state.ready} onClick={()=>manager.current?.zoomIn()}>확대</Button>
      <Button variant="outline" disabled={!state.ready} onClick={()=>manager.current?.zoomOut()}>축소</Button>
      <Button variant="outline" disabled={!state.ready} onClick={()=>manager.current?.fitToView()}>화면 맞춤</Button>
      <Button variant="outline" onClick={()=>{source.dispose();setMetric(null);setLayers([]);setState({status:'도면 로딩 중…',ready:false});setAttempt(v=>v+1);}}>다시 불러오기</Button>
    </div>
    {layers.length>0 && state.ready && <div className="flex flex-wrap gap-4 text-sm" aria-label="Layer 목록">{layers.map(name=><label key={`${attempt}-${name}`}><input type="checkbox" defaultChecked onChange={event=>manager.current?.showLayer(name,event.target.checked)}/>{name}</label>)}</div>}
    <div ref={container} data-testid="cad-canvas" className="h-[65vh] min-h-96 overflow-hidden rounded-xl bg-black" aria-label={`${format} 도면`}/>
    <p role="status" className="text-sm text-slate-600">{state.status}</p>
    {state.warning && <p className="text-sm text-amber-800" data-testid="viewer-coverage">{state.warning}</p>}
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    {metric && <div className="rounded border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center gap-4"><span>전체 {metric.totalMs.toFixed(1)} ms</span><span>도면 처리 {metric.adapterLoadMs?.toFixed(1)??'—'} ms</span><span>첫 화면 관찰 {metric.firstDisplayMs?.toFixed(1)??'—'} ms</span><span>원본 {metric.sourceMode==='memory'?'메모리 재사용':metric.sourceMode==='pending'?'다운로드 공유':'새로 받음'}</span>
      <Button variant="outline" size="sm" onClick={()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(metric,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`cad-metrics-${renderer}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
      }}>측정 JSON 저장</Button></div>
      <p className="mt-2 text-xs text-slate-500">도면 처리는 파싱·글꼴·화면 준비를 포함합니다. 순수 파싱 시간과 GPU 메모리는 별도 측정하지 않습니다.</p>
      <details className="mt-2"><summary className="cursor-pointer text-xs">측정 상세</summary><pre data-testid="viewer-metric" className="mt-2 overflow-auto text-xs">{JSON.stringify(metric,null,2)}</pre></details>
    </div>}
    <p className="text-xs text-slate-500">마우스 드래그로 이동 · 휠로 확대/축소. {format==='DWG'?'DWG는 현재 20 MiB 이하의 평면 LINE만 직접 표시합니다. TEXT/BLOCK/곡선 등은 지원하지 않습니다.':'한글 기본 글꼴을 사용합니다.'} 원본 글꼴·문자 인코딩·일부 Entity·선종·치수에 따라 CAD 원본과 다르게 표시될 수 있습니다.</p>
  </div>;
}
