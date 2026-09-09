'use client';
import { useState } from 'react';
import { UploadCloud, FileCheck2, ArrowLeft, Download, Copy } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { connectionDiagnostic, diagnosticJson, diagnosticText, interpretUploadResponse, type PublicUploadDiagnostic, type UploadResult } from './diagnostics';

export function UploadForm({ today, maxMb }: { today: string; maxMb: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState<PublicUploadDiagnostic | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [filename, setFilename] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setCopyStatus(''); setResult(null); setBusy(true);
    const form = new FormData(event.currentTarget);
    form.set('makeCurrent', form.get('makeCurrent') === 'on' ? 'true' : 'false');
    try {
      const interpreted = await interpretUploadResponse(await fetch('/api/cad-files', { method: 'POST', body: form }));
      if ('diagnostic' in interpreted) { setError(interpreted.diagnostic); console.error('CAD upload diagnostic', interpreted.diagnostic); }
      else { setResult(interpreted.result); router.refresh(); }
    } catch {
      const diagnostic = connectionDiagnostic(); setError(diagnostic); console.error('CAD upload diagnostic', diagnostic);
    } finally { setBusy(false); }
  }
  async function copyDiagnostic() {
    if (!error) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(diagnosticText(error)); setCopyStatus('진단 정보를 복사했습니다.');
    } catch { setCopyStatus('복사하지 못했습니다. 아래 전체 내용을 직접 선택하거나 JSON으로 저장하세요.'); }
  }
  function saveDiagnostic() {
    if (!error) return;
    const url = URL.createObjectURL(new Blob([diagnosticJson(error)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `cad-upload-diagnostic-${error.occurredAt.replace(/[:.]/g, '-')}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <div className="mx-auto max-w-4xl"><Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/>도면 목록</Link><h1 className="text-2xl font-bold">새 도면 등록</h1><p className="mt-2 mb-7 text-sm text-slate-500">도면 파일과 위치 정보를 등록합니다. 같은 위치의 도면은 새 버전으로 관리됩니다.</p><form onSubmit={submit} className="space-y-7 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><label className="block rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center"><UploadCloud className="mx-auto mb-3 text-teal-700" size={32}/><span className="block text-base">{filename || 'DXF 또는 DWG 파일 선택'}</span><span className="mt-2 block font-normal text-slate-400">최대 {maxMb} MiB · DWG Viewer는 20 MiB 이하 평면 LINE을 지원합니다.</span><input aria-label="CAD 파일" className="mt-5 max-w-full text-sm" type="file" name="file" accept=".dxf,.dwg" required disabled={busy} onChange={e=>setFilename(e.target.files?.[0]?.name ?? '')}/></label><fieldset className="rounded-xl border border-slate-200 p-5"><legend className="px-2 text-sm font-semibold text-slate-700">도면 위치 및 등록 정보</legend><div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{[['businessUnit','사업부','자동화사업부'],['site','사업장','평택사업장'],['building','동','A동'],['floor','층','2층']].map(([key,label,placeholder])=><label key={key}>{label}<input name={key} placeholder={placeholder} maxLength={100} required disabled={busy}/></label>)}<label>등록일<input type="date" name="registeredAt" defaultValue={today} required disabled={busy}/></label></div></fieldset><section className="rounded-xl border border-teal-200 bg-teal-50/40 p-5" aria-labelledby="description-heading"><div className="mb-3"><h2 id="description-heading" className="text-sm font-semibold text-slate-800">도면 설명</h2><p className="mt-1 text-xs text-slate-500">도면의 용도, 구역, 설비 등 검색에 사용할 설명을 입력하세요.</p></div><textarea name="description" maxLength={2000} rows={7} className="min-h-36 w-full resize-y" placeholder="예: A동 2층 자동화 설비 배치도 · 2026년 증설 구역" disabled={busy}/><p className="mt-2 text-xs text-slate-500">최대 2,000자 · 여러 줄 입력 가능</p></section><label className="flex items-start gap-3 rounded-lg bg-teal-50 p-4"><input type="checkbox" name="makeCurrent" defaultChecked disabled={busy} className="mt-1 accent-teal-700"/><span>현재 버전으로 지정<span className="mt-1 block text-xs font-normal text-slate-500">동일 위치의 기존 Current는 자동으로 해제됩니다.</span></span></label>{error && <section role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">{error.summary}</p><p className="mt-2">{error.guidance}</p><details className="mt-3"><summary className="cursor-pointer font-medium">오류 상세 보기</summary><pre aria-label="업로드 오류 진단 전체 내용" tabIndex={0} className="mt-3 max-h-72 select-text overflow-auto whitespace-pre-wrap rounded bg-white p-3 font-mono text-xs text-slate-800">{diagnosticText(error)}</pre><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={copyDiagnostic}><Copy size={15}/>진단 정보 복사</Button><Button type="button" variant="outline" onClick={saveDiagnostic}><Download size={15}/>진단 JSON 저장</Button></div>{copyStatus && <p role="status" className="mt-2 text-xs">{copyStatus}</p>}</details></section>}{result && <div role="status" className="rounded-lg bg-teal-50 p-4 text-sm text-teal-800"><span className="flex items-center gap-2 font-semibold"><FileCheck2 size={18}/>V{result.version} 등록 완료</span>{result.duplicateCount > 0 && <p className="mt-2">동일한 내용의 파일이 있습니다. 새 버전으로 등록했습니다.</p>}{result.description && <p className="mt-2 whitespace-pre-wrap">설명: {result.description}</p>}<p className="mt-2">등록 ID: <span className="font-mono text-xs">{result.id}</span></p><a className="mt-3 inline-block underline" href={`/api/cad-files/${result.id}/content`}>등록한 원본 다운로드</a></div>}<div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><Button variant="outline" asChild><Link href="/">목록으로</Link></Button><Button type="submit" disabled={busy}>{busy ? '등록 중…' : '도면 등록'}</Button></div></form></div>;
}
