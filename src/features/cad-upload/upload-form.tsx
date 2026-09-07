'use client';
import { useState } from 'react';
import { UploadCloud, FileCheck2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
export function UploadForm({ today, maxMb }: { today: string; maxMb: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<{ id: string; version: number; duplicateCount: number } | null>(null);
  const [filename, setFilename] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setResult(null); setBusy(true);
    const form = new FormData(event.currentTarget);
    form.set('makeCurrent', form.get('makeCurrent') === 'on' ? 'true' : 'false');
    try { const response = await fetch('/api/cad-files', { method: 'POST', body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? '파일 등록에 실패했습니다.'); setResult(data); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : '파일 등록에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-3xl"><Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/>도면 목록</Link><h1 className="text-2xl font-bold">새 도면 등록</h1><p className="mt-2 mb-7 text-sm text-slate-500">도면 파일과 위치 정보를 등록합니다. 같은 위치의 도면은 새 버전으로 관리됩니다.</p><form onSubmit={submit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-8"><label className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center"><UploadCloud className="mx-auto mb-3 text-teal-700" size={32}/><span className="block text-base">{filename || 'DXF 또는 DWG 파일 선택'}</span><span className="mt-2 block font-normal text-slate-400">최대 {maxMb} MiB · DWG 렌더링은 다음 버전에서 제공됩니다.</span><input aria-label="CAD 파일" className="mt-5 max-w-full text-sm" type="file" name="file" accept=".dxf,.dwg" required disabled={busy} onChange={e=>setFilename(e.target.files?.[0]?.name ?? '')}/></label><div className="grid grid-cols-2 gap-5">{[['businessUnit','사업부','자동화사업부'],['site','사업장','평택사업장'],['building','동','A동'],['floor','층','2층']].map(([key,label,placeholder])=><label key={key}>{label}<input name={key} placeholder={placeholder} maxLength={100} required disabled={busy}/></label>)}<label>등록일<input type="date" name="registeredAt" defaultValue={today} required disabled={busy}/></label></div><label className="flex items-start gap-3 rounded-lg bg-teal-50 p-4"><input type="checkbox" name="makeCurrent" defaultChecked disabled={busy} className="mt-1 accent-teal-700"/><span>현재 버전으로 지정<span className="mt-1 block text-xs font-normal text-slate-500">동일 위치의 기존 Current는 자동으로 해제됩니다.</span></span></label>{error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}{result && <div role="status" className="rounded-lg bg-teal-50 p-4 text-sm text-teal-800"><span className="flex items-center gap-2 font-semibold"><FileCheck2 size={18}/>V{result.version} 등록 완료</span>{result.duplicateCount > 0 && <p className="mt-2">동일한 내용의 파일이 있습니다. 새 버전으로 등록했습니다.</p>}<p className="mt-2">등록 ID: <span className="font-mono text-xs">{result.id}</span></p><a className="mt-3 inline-block underline" href={`/api/cad-files/${result.id}/content`}>등록한 원본 다운로드</a></div>}<div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><Button variant="outline" asChild><Link href="/">목록으로</Link></Button><Button type="submit" disabled={busy}>{busy ? '등록 중…' : '도면 등록'}</Button></div></form></div>;
}
