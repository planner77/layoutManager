import type { CadFocusBounds } from '../core/text-index';
import { DxfViewer } from 'dxf-viewer';
import type { CadViewerAdapter } from '../core/adapter';

export class DxfViewerAdapter implements CadViewerAdapter {
  private viewer: DxfViewer;
  private disposed = false;
  private cancel?: () => void;
  constructor(container: HTMLElement) {
    const existingCanvases=new Set(container.querySelectorAll('canvas'));
    try {
      this.viewer = new DxfViewer(container, { autoResize: true, antialias: true });
      if (!this.viewer.HasRenderer()) throw new Error('WebGL Viewer 초기화에 실패했습니다. 브라우저의 하드웨어 가속을 확인해주세요.');
    } catch(error) {
      const viewer=(this as unknown as {viewer?:DxfViewer}).viewer;
      try { viewer?.Destroy(); } catch { /* Construction may have stopped before renderer setup. */ }
      for(const canvas of container.querySelectorAll('canvas')) if(!existingCanvases.has(canvas))canvas.remove();
      throw error;
    }
  }
  async load(source: ArrayBuffer) {
    const url = URL.createObjectURL(new Blob([source]));
    let operation:Promise<unknown>|null=null;
    try {
      operation=this.viewer.Load({ url, fonts: [new URL('/fonts/NanumGothic-Regular.ttf', location.href).href], workerFactory: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) });
      await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          this.cancel = () => reject(new DOMException('취소됨', 'AbortError'));
        }),
      ]);
      if (this.disposed) throw new DOMException('취소됨', 'AbortError');
      return { empty: !this.viewer.GetBounds() };
    } catch(error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new Error('DXF 처리에 실패했습니다. 파일 손상, 미지원 형식 또는 Worker 로드를 확인해주세요.');
    } finally { this.cancel = undefined; URL.revokeObjectURL(url); }
  }
  fitToView() {
    const b = this.viewer.GetBounds(), o = this.viewer.GetOrigin();
    if (b) { this.viewer.FitView(b.minX-o.x,b.maxX-o.x,b.minY-o.y,b.maxY-o.y); this.viewer.Render(); }
  }
  private zoom(factor: number) {
    const camera = this.viewer.GetCamera();
    const width = (camera.right-camera.left)/camera.zoom*factor;
    if (Number.isFinite(width) && width > 1e-8 && width < 1e15) {
      this.viewer.SetView({x:camera.position.x,y:camera.position.y},width); this.viewer.Render();
    }
  }
  focusBounds(bounds: CadFocusBounds) {
    const origin = this.viewer.GetOrigin();
    const canvas = this.viewer.GetCanvas();
    const aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
    const width = Math.max(bounds.maxX - bounds.minX, (bounds.maxY - bounds.minY) * aspect) * 1.15;
    const x = (bounds.minX + bounds.maxX) / 2 - origin.x;
    const y = (bounds.minY + bounds.maxY) / 2 - origin.y;
    if (Number.isFinite(width) && width > 1e-8 && width < 1e15 &&
        Number.isFinite(x) && Number.isFinite(y)) {
      this.viewer.SetView({ x, y }, width);
      this.viewer.Render();
    }
  }
  zoomIn() { this.zoom(0.8); }
  zoomOut() { this.zoom(1.25); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.cancel?.();
    const canvas = this.viewer.GetCanvas(), renderer = this.viewer.GetRenderer();
    this.viewer.Destroy(); renderer.forceContextLoss(); canvas.remove();
  }
}
