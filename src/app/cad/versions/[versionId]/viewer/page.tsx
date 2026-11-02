import { notFound } from 'next/navigation';
import { CadError } from '@/domain/cad';
import { context } from '@/server/context';
import { selectRenderer } from '@/viewers/core/selection';
import { parseMemoLinkId } from '@/viewers/core/link';
import { CadViewer } from '@/features/cad-viewer/viewer';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: {params: Promise<{versionId:string}>;searchParams:Promise<{renderer?:string;source?:string;memo?:string|string[]}>}) {
  const query=await searchParams;const requested=query.renderer;
  let requestedMemoId:string|null=null,memoLinkInvalid=false;
  try{requestedMemoId=parseMemoLinkId(query.memo);}catch{memoLinkInvalid=true;}
  const {versionId} = await params;
  let file;
  try { file = await context().list.version(versionId); }
  catch(error) { if (error instanceof CadError && [400,404].includes(error.status)) notFound(); throw error; }
  const format = file.fileFormat;
  if (format !== 'DXF' && format !== 'DWG') notFound();
  const l = file.location;
  return <CadViewer key={file.id} versionId={file.id} sourceSha256={file.sha256}
    format={format} renderer={selectRenderer(format, requested)} sourceMode={query.source==='build'?'build':'scene-first'}
    requestedMemoId={requestedMemoId} memoLinkInvalid={memoLinkInvalid}
    displayName={file.displayName} originalFilename={file.originalFilename}
    version={file.version} registeredAt={file.registeredAt} fileSize={file.fileSize}
    description={file.description} locationId={l.id}
    locationDescription={`${l.businessUnit} / ${l.product} / [${l.siteKind === 'SITE' ? '사업장' : '법인'}] ${l.site} / ${l.building} / ${l.floor}`}
  />;
}
