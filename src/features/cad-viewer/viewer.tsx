'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ViewerManager } from '@/viewers/core/adapter';

export function CadViewer({ versionId, renderer = 'dxf-viewer' }: { versionId: string; renderer?: 'dxf-viewer'|'three-dxf-viewer' }) {
  const container = useRef<HTMLDivElement>(null), manager = useRef<ViewerManager | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [layers,setLayers] = useState<string[]>([]);
  const [state, setState] = useState<{ status: string; ready: boolean; error?: string }>({status:'도면 로딩 중…',ready:false});
  useEffect(() => {
    let active = true;
    const instance = new ViewerManager(async () => {
      if (renderer === 'three-dxf-viewer') {
        const { ThreeDxfViewerAdapter } = await import('@/viewers/three-dxf-viewer/adapter');
        if (!active || !container.current) throw new DOMException('취소됨','AbortError');
        return new ThreeDxfViewerAdapter(container.current);
      }
      const { DxfViewerAdapter } = await import('@/viewers/dxf-viewer/adapter');
      if (!active || !container.current) throw new DOMException('취소됨','AbortError');
      return new DxfViewerAdapter(container.current!);
    });
    manager.current = instance;
    instance.load(`/api/cad-files/${versionId}/content`, 'DXF').then(result => {
      if (active) {setState({status:result.empty ? '표시할 도형이 없습니다.' : '도면 표시 완료',ready:!result.empty});setLayers(instance.getLayers());}
    }).catch(error => {
      if (active) setState({status:'표시 실패',ready:false,error:error instanceof Error ? error.message : 'Viewer 초기화에 실패했습니다.'});
    });
    return () => { active = false; instance.dispose(); manager.current = null; };
  }, [versionId,attempt,renderer]);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3"><span className="mr-auto rounded bg-teal-50 px-3 py-2 text-sm text-teal-800">{renderer}</span>
      <a className="text-sm text-teal-700 underline" href={`?renderer=${renderer==='dxf-viewer'?'three-dxf-viewer':'dxf-viewer'}`}>{renderer==='dxf-viewer'?'three-dxf-viewer':'dxf-viewer'}로 열기</a>
      <Button variant="outline" disabled={!state.ready} onClick={()=>manager.current?.zoomIn()}>확대</Button>
      <Button variant="outline" disabled={!state.ready} onClick={()=>manager.current?.zoomOut()}>축소</Button>
      <Button variant="outline" disabled={!state.ready} onClick={()=>manager.current?.fitToView()}>화면 맞춤</Button>
      <Button variant="outline" onClick={()=>{setState({status:'도면 로딩 중…',ready:false});setAttempt(v=>v+1);}}>다시 불러오기</Button>
    </div>
    {layers.length>0 && state.ready && <div className="flex flex-wrap gap-4 text-sm" aria-label="Layer 목록">{layers.map(name=><label key={`${attempt}-${name}`}><input type="checkbox" defaultChecked onChange={event=>manager.current?.showLayer(name,event.target.checked)}/>{name}</label>)}</div>}
    <div ref={container} data-testid="cad-canvas" className="h-[65vh] min-h-96 overflow-hidden rounded-xl bg-black" aria-label="DXF 도면"/>
    <p role="status" className="text-sm text-slate-600">{state.status}</p>
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    <p className="text-xs text-slate-500">마우스 드래그로 이동 · 휠로 확대/축소. 한글 기본 글꼴을 사용합니다. 원본 글꼴·문자 인코딩·일부 Entity·선종·치수에 따라 CAD 원본과 다르게 표시될 수 있습니다.</p>
  </div>;
}
