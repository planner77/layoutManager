import { DxfViewer } from 'dxf-viewer';
import type { CadViewerAdapter } from '../core/adapter';

export class DxfViewerAdapter implements CadViewerAdapter {
  private viewer: DxfViewer;
  private disposed = false;
  private cancel?: () => void;
  constructor(container: HTMLElement) {
    this.viewer = new DxfViewer(container, { autoResize: true, antialias: true });
    if (!this.viewer.HasRenderer()) throw new Error('WebGL Viewer 초기화에 실패했습니다. 브라우저의 하드웨어 가속을 확인해주세요.');
  }
  async load(source: ArrayBuffer) {
    const url = URL.createObjectURL(new Blob([source]));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.viewer.Load({ url, workerFactory: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) }),
        new Promise<never>((_, reject) => {
          this.cancel = () => reject(new DOMException('취소됨', 'AbortError'));
          timer = setTimeout(() => reject(new Error('DXF 처리 시간이 초과되었습니다.')), 120_000);
        }),
      ]);
      if (this.disposed) throw new DOMException('취소됨', 'AbortError');
      return { empty: !this.viewer.GetBounds() };
    } catch(error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new Error('DXF 처리에 실패했습니다. 파일 손상, 미지원 형식 또는 Worker 로드를 확인해주세요.');
    } finally { clearTimeout(timer); this.cancel = undefined; URL.revokeObjectURL(url); }
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
  zoomIn() { this.zoom(0.8); }
  zoomOut() { this.zoom(1.25); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.cancel?.();
    const canvas = this.viewer.GetCanvas(), renderer = this.viewer.GetRenderer();
    this.viewer.Destroy(); renderer.forceContextLoss(); canvas.remove();
  }
}
