import type { OutlineResult } from '@/viewers/core/outline-compute';
import type { AuthorizedOutlineCatalog, StoredOutlineCreateDto } from './typed-outline';
import { normalizeOutlineInstanceName } from './outline-assignment';
import { parseOutlineExport } from './outline-draft';
import { validatedGeneratedGeometry } from './generated-document';

export type TypedOutlineContext = Readonly<{
  actorId: string; versionId: string; sourceSha256: string; unitCode: number | null;
}>;

/** A frozen submission claim; only the server can authorize and attest it. */
export function buildTypedOutlineRequest(
  preview: OutlineResult,
  catalog: AuthorizedOutlineCatalog,
  context: TypedOutlineContext,
  typeId: string,
  rawName: string,
  ordinal: number,
): StoredOutlineCreateDto {
  if (!catalog.canCreate || catalog.catalogScope !== 'GLOBAL' ||
      catalog.actorId !== context.actorId || catalog.versionId !== context.versionId ||
      catalog.sourceSha256 !== context.sourceSha256 ||
      !Number.isSafeInteger(catalog.sceneRevision) || catalog.sceneRevision === null || catalog.sceneRevision < 0)
    throw new Error('현재 도면의 로그인·쓰기 권한과 저장된 Scene을 다시 확인하세요.');
  const choice = catalog.items.find(item => item.id === typeId && item.active);
  if (!choice) throw new Error('현재 목록의 활성 업무 타입을 선택하세요.');
  const name = normalizeOutlineInstanceName(rawName, ordinal);
  const snapshot = structuredClone(preview);
  const geometry = validatedGeneratedGeometry(snapshot.geometry);
  const common = {
    sourceSha256: context.sourceSha256, expectedSceneRevision: catalog.sceneRevision,
    name, kind: snapshot.kind, outlineTypeId: choice.id,
  };
  if (snapshot.geometryBasis === 'RENDER_WCS_2D') {
    if (snapshot.persistable || snapshot.sourceEntityIds.length)
      throw new Error('렌더 결과를 원본 출처로 사용할 수 없습니다.');
    return { ...common, mode: 'APP_CREATED', geometry, derivedFrom: [...(snapshot.derivedFrom ?? [])] };
  }
  if (!snapshot.persistable) throw new Error('정밀 원본 외곽선의 안정된 Entity 참조를 확인하세요.');
  const sourceExport = {
    schemaVersion: 2, versionId: context.versionId, sourceSha256: context.sourceSha256,
    coordinateSystem: 'DXF_WCS_XY', unitCode: context.unitCode, persistence: 'BROWSER_EXPORT_ONLY',
    outlines: [{
      id: 'local-1', createdAt: new Date().toISOString(),
      outlineTypeId: choice.id, outlineTypeName: choice.name, name,
      result: { ...snapshot, geometry, baseGeometry: structuredClone(geometry), transformOperations: [] },
    }],
  };
  // The alias is transport metadata, never an entry in GeneratedDocument/Undo.
  parseOutlineExport(sourceExport, context.versionId, context.sourceSha256);
  return { ...common, mode: 'SOURCE_CANONICAL', sourceExport };
}
