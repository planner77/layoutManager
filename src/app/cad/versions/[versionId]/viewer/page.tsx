import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CadError } from '@/domain/cad';
import { context } from '@/server/context';
import { CadViewer } from '@/features/cad-viewer/viewer';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: {params: Promise<{versionId:string}>;searchParams:Promise<{renderer?:string}>}) {
  const renderer=(await searchParams).renderer==='three-dxf-viewer'?'three-dxf-viewer':'dxf-viewer';
  const {versionId} = await params;
  let file;
  try { file = await context().list.version(versionId); }
  catch(error) { if (error instanceof CadError && [400,404].includes(error.status)) notFound(); throw error; }
  const l = file.location;
  return <section><Link className="text-sm text-teal-700" href={`/cad/locations/${l.id}`}>← 버전 목록</Link><h1 className="mb-2 mt-4 text-xl font-bold">{file.originalFilename} · V{file.version}</h1><p className="mb-6 text-sm text-slate-500">{l.businessUnit} / {l.site} / {l.building} / {l.floor} · {file.registeredAt} · {(file.fileSize/1024/1024).toFixed(2)} MB</p>{file.fileFormat==='DXF' ? <CadViewer key={file.id} versionId={file.id} renderer={renderer}/> : <p role="status">DWG Viewer는 후속 버전에서 제공합니다. 현재 원본 다운로드와 버전 관리를 사용할 수 있습니다.</p>}</section>;
}
