import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CadError } from '@/domain/cad';
import { context } from '@/server/context';
import { selectRenderer } from '@/viewers/core/selection';
import { CadViewer } from '@/features/cad-viewer/viewer';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: {params: Promise<{versionId:string}>;searchParams:Promise<{renderer?:string}>}) {
  const requested=(await searchParams).renderer;
  const {versionId} = await params;
  let file;
  try { file = await context().list.version(versionId); }
  catch(error) { if (error instanceof CadError && [400,404].includes(error.status)) notFound(); throw error; }
  const format = file.fileFormat;
  if (format !== 'DXF' && format !== 'DWG') notFound();
  const l = file.location;
  return <section><Link className="text-sm text-teal-700" href={`/cad/locations/${l.id}`}>← 버전 목록</Link><h1 className="mb-2 mt-4 text-xl font-bold">{file.originalFilename} · V{file.version}</h1><p className="mb-6 text-sm text-slate-500">{l.businessUnit} / {l.site} / {l.building} / {l.floor} · {file.registeredAt} · {(file.fileSize/1024/1024).toFixed(2)} MB</p>{file.description && <p className="mb-5 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-700" aria-label="도면 설명">{file.description}</p>}<CadViewer key={file.id} versionId={file.id} format={format} renderer={selectRenderer(format,requested)}/></section>;
}
