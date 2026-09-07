import type { DwgProbeResult } from './primitives';
export function startDwgProbe(bytes: ArrayBuffer) {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let finished = false;
  let reject!: (reason: Error) => void;
  let timer: ReturnType<typeof setTimeout>;
  const stop = () => { clearTimeout(timer); worker.terminate(); finished = true; };
  const promise = new Promise<DwgProbeResult>((resolve, rejectPromise) => {
    reject = rejectPromise;
    timer = setTimeout(() => { stop(); reject(new Error('DWG 처리 시간 초과')); }, 60_000);
    worker.onmessage = ({ data }: MessageEvent<{ result?: DwgProbeResult; error?: string }>) => {
      stop();
      if (data.result) resolve(data.result); else reject(new Error(data.error ?? 'DWG 처리 실패'));
    };
    worker.onerror = () => { stop(); reject(new Error('DWG Worker 초기화 실패')); };
    worker.postMessage({ bytes, assets: new URL('/libredwg/wasm', location.href).href }, [bytes]);
  });
  return { promise, cancel: () => { if (!finished) { stop(); reject(new DOMException('DWG 처리 취소', 'AbortError')); } } };
}
