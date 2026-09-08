import type { CadViewerAdapter } from '../core/adapter';
import { startDwgProbe } from './probe';
import { showLines } from './line-view';
export class LibreDwgWebAdapter implements CadViewerAdapter {
  private run?: ReturnType<typeof startDwgProbe>;
  private view?: ReturnType<typeof showLines>;
  private disposed = false;
  constructor(private container: HTMLElement) {}
  async load(source: ArrayBuffer) {
    if (this.disposed) throw new DOMException('취소됨', 'AbortError');
    this.run?.cancel(); this.view?.dispose(); this.view = undefined;
    if (!source.byteLength || source.byteLength > 20 * 1024 * 1024) throw new Error('DWG Viewer는 현재 0보다 크고 20 MiB 이하인 파일만 처리합니다.');
    const signature = new TextDecoder().decode(source.slice(0, 6));
    if (!/^AC10\d{2}$/.test(signature)) throw new Error('지원하지 않거나 손상된 DWG 헤더입니다.');
    this.run = startDwgProbe(source);
    const result = await this.run.promise;
    if (this.disposed) throw new DOMException('취소됨', 'AbortError');
    if (result.positions.length) this.view = showLines(this.container, result.positions);
    const skipped = Object.entries(result.skipped);
    return {
      empty: result.positions.length === 0,
      entityCount: result.entityCount,
      metrics: { initializeMs: result.initMs, parseMs: result.parseMs },
      warning: skipped.length ? `표시 제외: ${skipped.map(([type, count]) => `${type} ${count}개`).join(', ')}. 현재 평면 LINE만 지원합니다.` : undefined,
    };
  }
  fitToView() { this.view?.fitToView(); }
  zoomIn() { this.view?.zoom(); }
  zoomOut() { this.view?.zoomOut(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.run?.cancel(); this.run = undefined;
    this.view?.dispose(); this.view = undefined;
  }
}
