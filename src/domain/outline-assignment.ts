/**
 * Issue #42 U5: read-only browser draft type assignment. Catalog input is not
 * evidence of authority: actual production data MUST come from #65's
 * authenticated version/scope-aware server. Never use this for server writes.
 */
import type { OutlineType } from './outline-type';
import { sortedPreviewOutlineTypes } from './outline-type';

export type ScopedOutlineCatalog = Readonly<{
  versionId: string;
  sourceSha256: string;
  scopeKey: string;
  types: readonly OutlineType[];
}>;

export type OutlineAssignment = Readonly<{
  outlineTypeId: string;
  outlineTypeName: string;
  name: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const MAX_NAME_LENGTH = 100;

function cleanName(input: string, label: string): string {
  const name = input.trim().normalize('NFC');
  if (!name || name.length > MAX_NAME_LENGTH || FORBIDDEN.test(name))
    throw new Error(label + '은(는) 1~100자이며 제어·비표시 문자를 포함할 수 없습니다.');
  return name;
}

/** Labels may repeat; stable local IDs, not display names, are the identity. */
export function normalizeOutlineInstanceName(input: unknown, ordinal: number): string {
  if (input !== null && input !== undefined && typeof input !== 'string')
    throw new Error('외곽선 이름은 문자열이어야 합니다.');
  if (!Number.isSafeInteger(ordinal) || ordinal < 1)
    throw new Error('외곽선 생성 순번이 올바르지 않습니다.');
  return cleanName((typeof input === 'string' ? input.trim() : '') || '외곽선 ' + ordinal, '외곽선 이름');
}

/** #41 lab preview has scopeKey=null and must never become a Viewer catalog. */
export function selectableOutlineTypes(
  catalog: ScopedOutlineCatalog | null, versionId: string, sourceSha256: string,
): OutlineType[] {
  if (!catalog || !UUID.test(versionId) || !SHA256.test(sourceSha256) ||
      catalog.versionId !== versionId ||
      catalog.sourceSha256.toLowerCase() !== sourceSha256.toLowerCase() ||
      typeof catalog.scopeKey !== 'string' || catalog.scopeKey.trim() === '') return [];
  return sortedPreviewOutlineTypes(catalog.types.filter(item =>
    UUID.test(item.id) && item.active === true && item.scopeKey === catalog.scopeKey));
}

export function resolveOutlineAssignment(
  catalog: ScopedOutlineCatalog | null, versionId: string, sourceSha256: string,
  typeId: unknown, name: unknown, ordinal: number,
): OutlineAssignment {
  if (!catalog || !catalog.scopeKey || catalog.versionId !== versionId ||
      !SHA256.test(sourceSha256) ||
      catalog.sourceSha256.toLowerCase() !== sourceSha256.toLowerCase())
    throw new Error('서버의 현재 Version·Scope 업무 타입 기준정보가 필요합니다. 관리자 등록 및 #65 승인을 확인하세요.');
  if (typeof typeId !== 'string' || !UUID.test(typeId))
    throw new Error('외곽선 업무 타입을 선택하세요.');
  const type = catalog.types.find(item => item.id === typeId);
  if (!type) throw new Error('존재하지 않는 업무 타입입니다.');
  if (!type.active) throw new Error('비활성 업무 타입으로 외곽선을 확정할 수 없습니다.');
  if (type.scopeKey !== catalog.scopeKey) throw new Error('현재 도면 범위 밖의 업무 타입입니다.');
  return {outlineTypeId:type.id,outlineTypeName:cleanName(type.name,'업무 타입 이름'),
    name:normalizeOutlineInstanceName(name,ordinal)};
}

/** V2 may contain explicit null triples for imported legacy outlines only.
 * No v2 JSON, including its metadata, is evidence for authorized persistence. */
export function parseOutlineAssignmentMetadata(input: unknown): OutlineAssignment | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('외곽선 타입 메타데이터 형식이 올바르지 않습니다.');
  const value = input as Record<string, unknown>;
  if (!('outlineTypeId' in value) || !('outlineTypeName' in value) || !('name' in value))
    throw new Error('외곽선 JSON v2 타입·이름 메타데이터가 필요합니다.');
  if (value.outlineTypeId === null && value.outlineTypeName === null && value.name === null) return null;
  if (typeof value.outlineTypeId !== 'string' || !UUID.test(value.outlineTypeId) ||
      typeof value.outlineTypeName !== 'string' || typeof value.name !== 'string')
    throw new Error('업무 타입 ID·이름 또는 외곽선 이름이 올바르지 않습니다.');
  return {outlineTypeId:value.outlineTypeId,outlineTypeName:cleanName(value.outlineTypeName,'업무 타입 이름'),
    name:cleanName(value.name,'외곽선 이름')};
}
