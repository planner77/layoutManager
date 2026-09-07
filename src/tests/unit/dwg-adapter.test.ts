import { test, expect, vi, afterEach } from 'vitest';
import { selectRenderer } from '@/viewers/core/selection';
import { ViewerManager } from '@/viewers/core/adapter';
import { startDwgProbe } from '@/viewers/libredwg-web/probe';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test('TC-VIEW-001: DWG never selects DXF even with a forged renderer query', () => {
  for (const renderer of ['dxf-viewer', 'three-dxf-viewer', 'libredwg-web', undefined]) expect(selectRenderer('DWG', renderer)).toBe('libredwg-web');
  expect(selectRenderer('DXF', 'libredwg-web')).toBe('dxf-viewer');
  expect(selectRenderer('DXF', 'three-dxf-viewer')).toBe('three-dxf-viewer');
});
test('TC-DWG-003: cancelled/timeout worker terminates once and rejects instead of hanging', async () => {
  vi.useFakeTimers();
  const terminate = vi.fn();
  vi.stubGlobal('location', { href: 'http://localhost/viewer' });
  vi.stubGlobal('Worker', class { postMessage() {} terminate = terminate; });
  const cancelled = startDwgProbe(new ArrayBuffer(1));
  const rejection = expect(cancelled.promise).rejects.toMatchObject({ name: 'AbortError' });
  cancelled.cancel(); cancelled.cancel(); await rejection; expect(terminate).toHaveBeenCalledTimes(1);
  const timeout = startDwgProbe(new ArrayBuffer(1));
  const failure = expect(timeout.promise).rejects.toThrow('시간 초과');
  await vi.advanceTimersByTimeAsync(60_000); await failure; expect(terminate).toHaveBeenCalledTimes(2);
});
test('TC-VIEW-001/DWG-002: DWG manager rejects DXF and reports unsupported entities as partial', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('bytes')));
  const adapter = { load: vi.fn(async () => ({ empty: true, entityCount: 1, warning: 'CIRCLE 1개 제외' })), dispose: vi.fn(), zoomIn() {}, zoomOut() {}, fitToView() {} };
  const report = vi.fn(), factory = vi.fn(async () => adapter);
  const manager = new ViewerManager(factory, undefined, { renderer: 'libredwg-web', versionId: 'v', report }, 'DWG');
  await expect(manager.load('/file', 'DXF')).rejects.toThrow(); expect(factory).not.toHaveBeenCalled();
  await manager.load('/file', 'DWG');
  expect(report.mock.lastCall?.[0]).toMatchObject({ result: 'partial', entityCount: 1, firstDisplayMs: null, reasons: { coverage: 'CIRCLE 1개 제외' } });
  manager.dispose(); expect(adapter.dispose).toHaveBeenCalledOnce();
});

test('TC-DWG-002: adapter rejects empty, oversized, invalid-header and disposed loads before Worker creation', async () => {
  const { LibreDwgWebAdapter } = await import('@/viewers/libredwg-web/adapter');
  const worker = vi.fn(); vi.stubGlobal('Worker', worker);
  const adapter = new LibreDwgWebAdapter({} as HTMLElement);
  await expect(adapter.load(new ArrayBuffer(0))).rejects.toThrow('20 MiB');
  await expect(adapter.load(new ArrayBuffer(20 * 1024 * 1024 + 1))).rejects.toThrow('20 MiB');
  await expect(adapter.load(new TextEncoder().encode('invalid').buffer)).rejects.toThrow('헤더');
  adapter.dispose();
  await expect(adapter.load(new TextEncoder().encode('AC1015').buffer)).rejects.toMatchObject({ name: 'AbortError' });
  expect(worker).not.toHaveBeenCalled();
});
