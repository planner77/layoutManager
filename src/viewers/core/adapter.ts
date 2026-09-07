import { ViewerSource } from './source';
export interface CadViewerAdapter {
  load(source: ArrayBuffer): Promise<{ empty: boolean }>;
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
  constructor(private factory: ViewerFactory, source?: ViewerSource) {this.source=source??new ViewerSource();this.ownsSource=!source;}
  async load(url: string, format: string) {
    this.dispose();
    const generation = this.generation;
    if (format !== 'DXF') throw new Error('이 형식의 Viewer는 아직 제공하지 않습니다.');
    const bytes = await this.source.read(url);
    if (generation !== this.generation) throw new DOMException('취소됨', 'AbortError');
    const adapter = await this.factory();
    if (generation !== this.generation) { adapter.dispose(); throw new DOMException('취소됨', 'AbortError'); }
    this.adapter = adapter;
    try {
      const result = await adapter.load(bytes.slice(0));
      if (generation !== this.generation) throw new DOMException('취소됨','AbortError');
      return result;
    }
    catch(error) { if (this.adapter === adapter) { adapter.dispose(); this.adapter = undefined; } throw error; }
  }
  fitToView() { this.adapter?.fitToView(); }
  zoomIn() { this.adapter?.zoomIn(); }
  zoomOut() { this.adapter?.zoomOut(); }
  getLayers() { return this.adapter?.getLayers?.() ?? []; }
  showLayer(name:string,visible:boolean) { this.adapter?.showLayer?.(name,visible); }
  dispose() { this.generation++; if(this.ownsSource)this.source.dispose(); this.adapter?.dispose(); this.adapter = undefined; }
}
