import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin } from 'lucide-react';
import { CadError } from '@/domain/cad';
import { context } from '@/server/context';
import { CadTable } from '@/features/cad-list/cad-table';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ locationId: string }> }) {
  let location;
  try { location = await context().list.location((await params).locationId); }
  catch(error) { if (error instanceof CadError && [400,404].includes(error.status)) notFound(); throw error; }
  return <section><Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/>도면 목록</Link><div className="mb-7 flex items-center gap-4"><span className="rounded-xl bg-teal-50 p-3 text-teal-700"><MapPin size={26}/></span><div><p className="text-sm text-slate-500">{location.businessUnit} / {location.site}</p><h1 className="mt-1 text-2xl font-bold">{location.building} / {location.floor} · 도면 버전</h1></div></div><p className="mb-4 text-sm text-slate-500">총 {location.versions.length}개 버전 · Current를 변경하면 같은 위치의 기존 Current가 자동 해제됩니다.</p><CadTable items={location.versions} manageCurrent/><p className="mt-4 text-xs text-slate-400">DXF는 도면 보기에서 확인할 수 있습니다. DWG Viewer는 후속 버전에서 제공합니다.</p></section>;
}
