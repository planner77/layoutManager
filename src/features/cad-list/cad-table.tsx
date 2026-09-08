import Link from 'next/link';
import { FileText, Download } from 'lucide-react';
import type { CadListItem } from '@/domain/cad-list';
import { CurrentButton } from '@/features/cad-location/current-button';
import { CopyCadLink } from '@/features/cad-link/copy-cad-link';

export function CadTable({ items, manageCurrent = false }: { items: CadListItem[]; manageCurrent?: boolean }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table className="w-full whitespace-nowrap text-left text-sm" aria-label="등록된 도면">
      <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
        <tr>{['도면 파일', '사업부', '사업장', '동 / 층', 'Version', '형식', '등록일', '상태', '작업'].map(label => <th key={label} scope="col" className="px-4 py-4 font-medium">{label}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.map(file => <tr key={file.id} id={`version-${file.id}`} className="hover:bg-slate-50/80 target:bg-teal-50">
          <td className="px-4 py-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-slate-100 p-2 text-slate-500"><FileText size={20}/></span><div><Link href={`/cad/locations/${file.locationId}#version-${file.id}`} className="block max-w-64 truncate font-medium text-slate-800 hover:text-teal-700" title={file.originalFilename}>{file.originalFilename}</Link><span className="block max-w-64 truncate text-xs text-slate-500" title={file.description}>{file.description || '설명 없음'}</span><span className="text-xs text-slate-400">{(file.fileSize / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} KB</span></div></div></td>
          <td className="px-4 py-4">{file.businessUnit}</td><td className="px-4 py-4">{file.site}</td>
          <td className="px-4 py-4">{file.building} / {file.floor}</td><td className="px-4 py-4 font-mono">V{file.version}</td>
          <td className="px-4 py-4"><span className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">{file.fileFormat}</span></td>
          <td className="px-4 py-4 text-slate-500">{file.registeredAt}</td>
          <td className="px-4 py-4">{file.isCurrent ? <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">● Current</span> : <span className="text-xs text-slate-400">이전 버전</span>}</td>
          <td className="px-4 py-4"><div className="flex items-start gap-3">{<Link href={`/cad/versions/${file.id}/viewer`} className="pt-2 text-xs font-medium text-teal-700">도면 보기</Link>}<CopyCadLink versionId={file.id} format={file.fileFormat as 'DXF' | 'DWG'} label={`${file.originalFilename} 도면 링크 복사`}/>{manageCurrent ? !file.isCurrent && <span className="pt-1"><CurrentButton locationId={file.locationId} versionId={file.id}/></span> : <Link href={`/cad/locations/${file.locationId}#version-${file.id}`} className="pt-2 text-xs font-medium text-teal-700 hover:underline">버전 정보</Link>}<a href={`/api/cad-files/${file.id}/content`} className="pt-2 text-slate-400 hover:text-teal-700" aria-label={`${file.originalFilename} 원본 다운로드`}><Download size={17}/></a></div></td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}
