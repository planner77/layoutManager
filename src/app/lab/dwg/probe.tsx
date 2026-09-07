'use client';
import { useEffect, useRef, useState } from 'react';
import { startDwgProbe } from '@/viewers/libredwg-web/probe';
import { showLines } from '@/viewers/libredwg-web/line-view';
import type { DwgProbeResult } from '@/viewers/libredwg-web/primitives';
import { Button } from '@/components/ui/button';
export function DwgProbe() {
  const container = useRef<HTMLDivElement>(null);
  const run = useRef<ReturnType<typeof startDwgProbe> | null>(null);
  const view = useRef<ReturnType<typeof showLines> | null>(null);
  const generation = useRef(0);
  const [status, setStatus] = useState('DWG 파일을 선택하세요.');
  const [result, setResult] = useState<DwgProbeResult | null>(null);
  const clear = () => { generation.current++; run.current?.cancel(); run.current = null; view.current?.dispose(); view.current = null; };
  useEffect(() => () => clear(), []);
  async function load(file?: File) {
    clear(); setResult(null);
    if (!file) { setStatus('DWG 파일을 선택하세요.'); return; }
    if (!/\.dwg$/i.test(file.name) || file.size === 0 || file.size > 20 * 1024 * 1024) { setStatus('0보다 크고 20 MiB 이하인 DWG 파일이 필요합니다.'); return; }
    const current = generation.current;
    setStatus('DWG 처리 중…');
    try {
      const bytes = await file.arrayBuffer();
      if (current !== generation.current) return;
      run.current = startDwgProbe(bytes);
      const parsed = await run.current.promise;
      if (current !== generation.current) return;
      view.current = showLines(container.current!, parsed.positions);
      setResult(parsed);
      setStatus(parsed.positions.length ? 'LINE 표시 완료 (실험)' : '표시 가능한 LINE이 없습니다.');
    } catch (error) { if (current === generation.current) setStatus(error instanceof Error ? error.message : 'DWG 처리 실패'); }
  }
  return <div className="space-y-4"><p>로컬 DWG를 브라우저에서만 읽습니다. 서버에 등록하지 않습니다. 평면 LINE만 표시하며 나머지 Entity는 아래 제외 내역을 확인하세요.</p><input type="file" accept=".dwg" aria-label="실험 DWG 파일" onChange={event => void load(event.target.files?.[0])}/><div className="flex gap-3"><Button onClick={() => view.current?.zoom()} disabled={!result?.positions.length}>확대</Button><Button variant="outline" onClick={() => { clear(); setResult(null); setStatus('해제 완료'); }}>해제</Button></div><p role="status">{status}</p><div ref={container} className="h-[500px] bg-black"/>{result && <pre data-testid="dwg-probe-result" className="overflow-auto text-xs">{JSON.stringify({ ...result, positions: undefined, lineCount: result.positions.length / 6 }, null, 2)}</pre>}</div>;
}
