import type { ViewerFormat } from './selection';
import { ViewerSource } from './source';
import {heapBytes,observeFrame,type ViewerMetric} from './metrics';
export interface CadViewerAdapter {
  load(source: ArrayBuffer): Promise<{ empty: boolean; entityCount?:number; warning?:string; metrics?: { initializeMs?: number; parseMs?: number } }>;
  fitToView(): void;
  zoomIn(): void;
  zoomOut(): void;
  getLayers?(): string[];
  showLayer?(name: string, visible: boolean): void;
  dispose(): void;
}
export type ViewerFactory = () => Promise<CadViewerAdapter>;

export class ViewerManager {
  private adapter?: CadViewerAdapter;
  private generation = 0;
  private source: ViewerSource;
  private ownsSource: boolean;
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
  fitToView() { this.adapter?.fitToView(); }
  zoomIn() { this.adapter?.zoomIn(); }
  zoomOut() { this.adapter?.zoomOut(); }
  getLayers() { return this.adapter?.getLayers?.() ?? []; }
  showLayer(name:string,visible:boolean) { this.adapter?.showLayer?.(name,visible); }
  dispose() { this.generation++; if(this.ownsSource)this.source.dispose(); this.adapter?.dispose(); this.adapter = undefined; }
}
