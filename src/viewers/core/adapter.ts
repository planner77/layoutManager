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
  private abort?: AbortController;
  constructor(private factory: ViewerFactory) {}
  async load(url: string, format: string) {
    this.dispose();
    const generation = this.generation;
    if (format !== 'DXF') throw new Error('이 형식의 Viewer는 아직 제공하지 않습니다.');
    const abort = this.abort = new AbortController();
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(response.status === 404 ? 'CAD 원본 파일을 찾을 수 없습니다.' : 'CAD 원본을 불러오지 못했습니다.');
    const bytes = await response.arrayBuffer();
    if (generation !== this.generation) throw new DOMException('취소됨', 'AbortError');
    const adapter = await this.factory();
    if (generation !== this.generation) { adapter.dispose(); throw new DOMException('취소됨', 'AbortError'); }
    this.adapter = adapter;
    try {
      const result = await adapter.load(bytes);
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
  dispose() { this.generation++; this.abort?.abort(); this.adapter?.dispose(); this.adapter = undefined; }
}
