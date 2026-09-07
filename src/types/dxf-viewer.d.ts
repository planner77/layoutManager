// Minimal contract verified against dxf-viewer 1.0.48 source.
declare module 'dxf-viewer' {
  export class DxfViewer {
    constructor(container: HTMLElement, options?: { autoResize?: boolean; antialias?: boolean; preserveDrawingBuffer?: boolean });
    static SetupWorker(): void;
    HasRenderer(): boolean;
    Load(options: { url: string; workerFactory?: () => Worker }): Promise<void>;
    GetBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null;
    GetOrigin(): { x: number; y: number };
    GetCamera(): { left: number; right: number; zoom: number; position: { x: number; y: number } };
    GetCanvas(): HTMLCanvasElement;
    GetRenderer(): { forceContextLoss(): void };
    SetView(center: { x: number; y: number }, width: number): void;
    FitView(minX: number, maxX: number, minY: number, maxY: number): void;
    Render(): void;
    Destroy(): void;
  }
}
