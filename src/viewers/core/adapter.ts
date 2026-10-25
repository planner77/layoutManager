import type { CadFocusBounds, CadTextIndex } from './text-index';
import type { ViewerFormat } from './selection';
import type {OutlineEntity,OutlineKind} from './outline-geometry';
import type {OutlineResult,GeoJSONOutline} from './outline-compute';
import {type CanvasObjectRef,type CanvasEditCapability,type CanvasSelectionMode} from '../../domain/canvas-object-selection';
import type {GeneratedCommand,Affine2D} from '../../domain/generated-document';
import type {OutlineAssignment} from '../../domain/outline-assignment';
import {outlineGeometryBounds} from '../../domain/outline-tree';
export type SavedOutlineOverlayState = {id:string;visible:boolean;selected:boolean};
export type OutlineInfo = {entityCount:number;unitCode:number|null;warnings:string[];renderedObjectCount?:number;excludedEntityCount?:number;spatialIndexMs?:number;sourceIndexMs?:number;renderAuditMs?:number};
export type SavedOutline = {id:string;createdAt:string;result:OutlineResult;
  outlineTypeId?:string;outlineTypeName?:string;name?:string};
/** Independent E1 edit-model exposure: not a serialized v1/v2 SavedOutline. */
export type GeneratedOutlineObject = Readonly<{
  ref:CanvasObjectRef;savedOutlineId:string;visible:boolean;geometry:GeoJSONOutline;
  baseGeometry:GeoJSONOutline;transform:Affine2D;edited:boolean;dirty:boolean;
  sourceEntityIds:readonly string[];kind:OutlineKind;name:string;outlineTypeId:string|null;
}>;
import { ViewerSource } from './source';
import {heapBytes,observeFrame,type ViewerMetric} from './metrics';
export interface CadViewerAdapter {
  load(source: ArrayBuffer): Promise<{ empty: boolean; entityCount?:number; warning?:string; metrics?: { initializeMs?: number; parseMs?: number } }>;
  fitToView(): void;
  zoomIn(): void;
  zoomOut(): void;
  getLayers?(): string[];
  showLayer?(name: string, visible: boolean): void;
  focusBounds?(bounds: CadFocusBounds): void;
  getOutlineInfo?(): OutlineInfo | null;
  setSelectionMode?(mode:CanvasSelectionMode): void;
  getCanvasObjectSelection?():CanvasObjectRef[];
  clearCanvasObjectSelection?():void;
  isSelectedGeneratedAt?(clientX:number,clientY:number):boolean;
  getGeneratedObjects?():GeneratedOutlineObject[];
  getCanvasEditCapability?():CanvasEditCapability;
  /** Browser-only command entry point, with E2 scope and selection validation. */
  getGeneratedHistory?():{undo:number;redo:number;limit:number};
  executeGeneratedCommand?(command:GeneratedCommand):void;
  stageGeneratedCommand?(command:GeneratedCommand):void;
  commitGeneratedCommand?():boolean;
  cancelGeneratedCommand?():boolean;
  undoGeneratedEdit?():boolean;
  redoGeneratedEdit?():boolean;
  getOutlineSelection?(): OutlineEntity[];
  clearOutlineSelection?(): void;
  previewOutline?(kind: OutlineKind): Promise<OutlineResult>;
  cancelOutlinePreview?(): void;
  confirmOutline?(assignment?:OutlineAssignment): SavedOutline;
  getSavedOutlines?(): SavedOutline[];
  getSavedOutlineStates?(): SavedOutlineOverlayState[];
  setSavedOutlineVisibility?(id:string,visible:boolean):boolean;
  selectSavedOutline?(id:string,additive?:boolean):boolean;
  clearSavedOutlines?(): void;
  dispose(): void;
}
export type ViewerFactory = () => Promise<CadViewerAdapter>;

export class ViewerManager {
  private adapter?: CadViewerAdapter;
  private generation = 0;
  private source: ViewerSource;
  private ownsSource: boolean;
  private activeUrl?: string;
  private pendingIndex?: Promise<CadTextIndex>;
  private cancelIndex?: () => void;
  constructor(private factory: ViewerFactory, source?: ViewerSource, private measurement?:{renderer:string;versionId:string;report:(metric:ViewerMetric)=>void}, private format:ViewerFormat = 'DXF') {this.source=source??new ViewerSource();this.ownsSource=!source;}
  async load(url: string, format: string) {
    this.dispose();
    const generation = this.generation;
    const started=performance.now();
    const metric:ViewerMetric={schemaVersion:1,renderer:this.measurement?.renderer??'unknown',versionId:this.measurement?.versionId??'',timestamp:new Date().toISOString(),result:'error',sourceMode:this.source.state(url),fileBytes:null,entityCount:null,sourceWaitMs:null,initializeMs:null,adapterLoadMs:null,totalMs:0,firstDisplayMs:null,parseMs:null,jsHeapBytes:null,browser:typeof navigator==='undefined'?'unknown':navigator.userAgent,reasons:{parseMs:'Library load combines parsing, preparation and font work; no isolated parse measurement.',entityCount:'Adapter does not expose a retained parsed entity count.',firstDisplayMs:'No non-empty successful draw/frame observed.',jsHeapBytes:'Browser API unavailable; GPU/WASM memory is not measured.'},error:null};
    try {
    if (format !== this.format) throw new Error('이 형식의 Viewer는 아직 제공하지 않습니다.');
    const bytes = await this.source.read(url);
    metric.fileBytes=bytes.byteLength;metric.sourceWaitMs=performance.now()-started;
    if (generation !== this.generation) throw new DOMException('취소됨', 'AbortError');
    const initializing=performance.now();const adapter = await this.factory();
    metric.initializeMs=performance.now()-initializing;
    if (generation !== this.generation) { adapter.dispose(); throw new DOMException('취소됨', 'AbortError'); }
    this.adapter = adapter;
    try {
      const loading=performance.now();const result = await adapter.load(bytes.slice(0));
      metric.adapterLoadMs=performance.now()-loading;
      if (result.metrics?.initializeMs !== undefined) { metric.initializeMs=result.metrics.initializeMs; delete metric.reasons.initializeMs; }
      if (result.metrics?.parseMs !== undefined) { metric.parseMs=result.metrics.parseMs; delete metric.reasons.parseMs; }
      if (generation !== this.generation) throw new DOMException('취소됨','AbortError');
      if(!result.empty && this.measurement && await observeFrame()) {metric.firstDisplayMs=performance.now()-started;delete metric.reasons.firstDisplayMs;}
      if(generation!==this.generation)throw new DOMException('취소됨','AbortError');
      metric.result=result.warning?'partial':result.empty?'empty':'success';
      if(result.warning)metric.reasons.coverage=result.warning;
      metric.entityCount=result.entityCount??null;if(metric.entityCount!==null)delete metric.reasons.entityCount;
      this.activeUrl=url;
      return result;
    }
    catch(error) { if (this.adapter === adapter) { adapter.dispose(); this.adapter = undefined; } throw error; }
    } catch(error) {
      metric.result=generation!==this.generation || (error instanceof DOMException&&error.name==='AbortError')?'cancelled':'error';
      metric.error=metric.result==='cancelled'?'Load cancelled.':'Viewer load failed.';throw error;
    } finally {
      metric.totalMs=performance.now()-started;metric.jsHeapBytes=heapBytes();
      if(metric.jsHeapBytes!==null)metric.reasons.jsHeapBytes='Nonstandard browser JS heap snapshot; may be rounded and excludes GPU/WASM allocations.';
      this.measurement?.report(metric);
    }
  }
  /**
   * Lazy index build: the same immutable source bytes are used by both renderers.
   * Worker is cancelled on version/renderer change; only the active generation may cache results.
   */
  async getTextIndex(): Promise<CadTextIndex> {
    if (this.format !== 'DXF') throw new Error('DWG 내부 텍스트 검색은 현재 지원하지 않습니다.');
    const url = this.activeUrl;
    if (!url || !this.adapter) throw new Error('도면 표시가 완료된 뒤 검색할 수 있습니다.');
    const cached = this.source.getTextIndex(url);
    if (cached) return cached;
    if (this.pendingIndex) return this.pendingIndex;
    const generation = this.generation;
    const pending = this.source.read(url).then(bytes => new Promise<CadTextIndex>((resolve, reject) => {
      const worker = new Worker(new URL('./text-index.worker.ts', import.meta.url), { type: 'module' });
      let complete = false;
      const finish = (error: Error | null, index?: CadTextIndex) => {
        if (complete) return;
        complete = true;
        clearTimeout(timeout);
        worker.terminate();
        if (this.cancelIndex === cancel) this.cancelIndex = undefined;
        if (error) reject(error);
        else resolve(index!);
      };
      const cancel = () => finish(new DOMException('취소됨', 'AbortError'));
      const timeout = setTimeout(() => finish(new Error('DXF 텍스트 검색 준비 시간이 초과되었습니다.')), 60_000);
      this.cancelIndex = cancel;
      worker.onmessage = (event: MessageEvent<{ ok: boolean; index?: CadTextIndex; message?: string }>) => {
        if (event.data.ok && event.data.index) finish(null, event.data.index);
        else finish(new Error(event.data.message || 'DXF 텍스트 검색을 준비하지 못했습니다.'));
      };
      worker.onerror = () => finish(new Error('DXF 텍스트 검색 Worker가 실패했습니다.'));
      const copy = bytes.slice(0);
      try { worker.postMessage({ bytes: copy }, [copy]); }
      catch (error) { finish(error instanceof Error ? error : new Error('Worker 메시지 전달 실패')); }
      if (generation !== this.generation) cancel();
    })).then(index => {
      if (generation !== this.generation || url !== this.activeUrl) throw new DOMException('취소됨', 'AbortError');
      this.source.setTextIndex(url, index);
      return index;
    });
    this.pendingIndex = pending;
    void pending.then(() => { if (this.pendingIndex === pending) this.pendingIndex = undefined; },
      () => { if (this.pendingIndex === pending) this.pendingIndex = undefined; });
    return pending;
  }
  /** Pan+zoom to a validated world-coordinate envelope, never repeat guessed zoom steps. */
  focusBounds(bounds: CadFocusBounds): boolean {
    if (!this.adapter?.focusBounds ||
        !Object.values(bounds).every(Number.isFinite) ||
        bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return false;
    this.adapter.focusBounds(bounds);
    return true;
  }
  fitToView() { this.adapter?.fitToView(); }
  zoomIn() { this.adapter?.zoomIn(); }
  zoomOut() { this.adapter?.zoomOut(); }
  getLayers() { return this.adapter?.getLayers?.() ?? []; }
  showLayer(name:string,visible:boolean) { this.adapter?.showLayer?.(name,visible); }
  getOutlineInfo() { return this.adapter?.getOutlineInfo?.() ?? null; }
  setSelectionMode(mode:CanvasSelectionMode) { this.adapter?.setSelectionMode?.(mode); }
  getCanvasObjectSelection(){return this.adapter?.getCanvasObjectSelection?.()??[];}
  getGeneratedObjects(){return this.adapter?.getGeneratedObjects?.()??[];}
  clearCanvasObjectSelection(){this.adapter?.clearCanvasObjectSelection?.();}
  isSelectedGeneratedAt(clientX:number,clientY:number){return this.adapter?.isSelectedGeneratedAt?.(clientX,clientY)??false;}
  getCanvasEditCapability():CanvasEditCapability{
    return this.adapter?.getCanvasEditCapability?.()??{canSelect:false,canEdit:false,reason:'이 Renderer는 통합 객체 선택을 지원하지 않습니다.'};
  }
  getGeneratedHistory(){return this.adapter?.getGeneratedHistory?.()??{undo:0,redo:0,limit:100};}
  executeGeneratedCommand(command:GeneratedCommand):void{
    if(!this.adapter?.executeGeneratedCommand)throw new Error('생성 객체 편집이 지원되지 않습니다.');
    this.adapter.executeGeneratedCommand(command);
  }
  stageGeneratedCommand(command:GeneratedCommand):void{
    if(!this.adapter?.stageGeneratedCommand)throw new Error('생성 객체 편집이 지원되지 않습니다.');
    this.adapter.stageGeneratedCommand(command);
  }
  commitGeneratedCommand(){return this.adapter?.commitGeneratedCommand?.()??false;}
  cancelGeneratedCommand(){return this.adapter?.cancelGeneratedCommand?.()??false;}
  undoGeneratedEdit(){return this.adapter?.undoGeneratedEdit?.()??false;}
  redoGeneratedEdit(){return this.adapter?.redoGeneratedEdit?.()??false;}
  getOutlineSelection() { return this.adapter?.getOutlineSelection?.() ?? []; }
  clearOutlineSelection() { this.adapter?.clearOutlineSelection?.(); }
  previewOutline(kind:OutlineKind) {
    if(!this.adapter?.previewOutline)throw new Error('이 Viewer는 객체 외곽선을 지원하지 않습니다.');
    return this.adapter.previewOutline(kind);
  }
  cancelOutlinePreview() { this.adapter?.cancelOutlinePreview?.(); }
  confirmOutline(assignment?:OutlineAssignment) { if(!this.adapter?.confirmOutline)throw new Error('미리보기를 먼저 생성해야 합니다.'); return this.adapter.confirmOutline(assignment); }
  getSavedOutlines() { return this.adapter?.getSavedOutlines?.() ?? []; }
  getSavedOutlineStates() { return this.adapter?.getSavedOutlineStates?.() ?? []; }
  setSavedOutlineVisibility(id:string,visible:boolean) {
    return this.adapter?.setSavedOutlineVisibility?.(id,visible) ?? false;
  }
  /** Select a tree row without moving the camera, so E3 stages only that row. */
  selectSavedOutline(id:string):boolean {
    return this.adapter?.selectSavedOutline?.(id) ?? false;
  }
  /** Compute focus only from the confirmed local geometry, never from source DXF layers. */
  focusSavedOutline(id:string,additive=false):boolean {
    const item=this.getSavedOutlines().find(item=>item.id===id);
    if(!item || !this.adapter?.selectSavedOutline)return false;
    const bounds=outlineGeometryBounds(item.result.geometry);
    if(!bounds)return false;
    // U6 callers still use the original one-argument single-selection contract.
    // Only the E1 additive path supplies an explicit second argument.
    const selected=additive?this.adapter.selectSavedOutline(id,true):this.adapter.selectSavedOutline(id);
    if(!selected)return false;
    return this.focusBounds(bounds);
  }
  clearSavedOutlines() { this.adapter?.clearSavedOutlines?.(); }
  dispose() { this.generation++; this.cancelIndex?.(); this.cancelIndex=undefined; this.pendingIndex=undefined; this.activeUrl=undefined; if(this.ownsSource)this.source.dispose(); this.adapter?.dispose(); this.adapter = undefined; }
}
