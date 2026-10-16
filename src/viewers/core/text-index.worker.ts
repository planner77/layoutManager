/// <reference lib="webworker" />
import { extractDxfText } from './text-index';

self.onmessage = (event: MessageEvent<{ bytes: ArrayBuffer }>) => {
  try {
    self.postMessage({ ok: true, index: extractDxfText(event.data.bytes) });
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : 'DXF 텍스트 파싱에 실패했습니다.' });
  }
};
