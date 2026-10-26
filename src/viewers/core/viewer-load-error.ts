export type ViewerLoadStage = 'source' | 'adapter-init' | 'adapter-load';
export class ViewerLoadError extends Error {
  constructor(public readonly stage: ViewerLoadStage, public readonly reasonCode: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ViewerLoadError';
  }
}
export function isViewerCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
