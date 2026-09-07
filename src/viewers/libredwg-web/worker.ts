import { linePrimitives, type DwgProbeResult } from './primitives';
self.onmessage = async ({ data }: MessageEvent<{ bytes: ArrayBuffer; assets: string }>) => {
  let stage = 'WASM 초기화';
  try {
    const started = performance.now();
    // Keep upstream ESM intact: its guarded node:module import must not enter Webpack.
    const { createModule, LibreDwg } = await import(/* webpackIgnore: true */ `${data.assets}/../dist/libredwg-web.js`) as typeof import('@mlightcad/libredwg-web');
    const raw = await createModule({ locateFile: (name: string) => `${data.assets}/${name}` });
    const lib = LibreDwg.createByWasmInstance(raw);
    const initMs = performance.now() - started;
    let pointer = 0;
    let result: DwgProbeResult | undefined;
    const filename = '/probe.dwg';
    try {
      stage = 'DWG 파싱';
      raw.FS.writeFile(filename, new Uint8Array(data.bytes));
      const parseStart = performance.now();
      const read = raw.dwg_read_file(filename) as { data: number; error: number };
      pointer = read.data;
      const parseMs = performance.now() - parseStart;
      // Conservative probe: non-zero parser flags are not silently called success.
      if (read.error !== 0 || !pointer) throw new Error('Parser flags');
      stage = 'DWG 객체 추출';
      const convertStart = performance.now();
      const db = lib.convert(pointer);
      result = { ...linePrimitives(db.entities), initMs, parseMs, convertMs: performance.now() - convertStart, freed: false, temporaryFileRemoved: false };
    } finally {
      if (raw.FS.analyzePath(filename, false).exists) raw.FS.unlink(filename);
      if (result) result.temporaryFileRemoved = !raw.FS.analyzePath(filename, false).exists;
      // Free the original Dwg_Data pointer, never the converted JS database.
      if (pointer) raw.dwg_free(pointer);
      if (result) result.freed = true;
    }
    self.postMessage({ result });
  } catch {
    self.postMessage({ error: `${stage} 실패: 지원 가능한 정상 DWG인지 확인해주세요.` });
  }
};
