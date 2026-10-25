/**
 * Issue #41 / U4: design-only model for a future authorized OutlineType catalog.
 *
 * DO NOT connect this prototype to Prisma, an API route, or real CAD outlines.
 * Admin RBAC, scope, audit retention and persistent writes require Owner approval.
 * CONVEX/PRECISE are geometric algorithms, NOT business classification types.
 */
export type OutlineType = Readonly<{
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  scopeKey: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type OutlineTypeInput = {
  name: unknown;
  description?: unknown;
  sortOrder: unknown;
};

export type OutlineTypePatch = Partial<OutlineTypeInput> & { active?: unknown };

const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SORT_ORDER = 9999;

/** Policy proposed for review: Unicode NFC + locale-independent lowercasing.
 * The final DB collation/uniqueness key is deliberately NOT decided here. */
export function outlineTypeNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase().normalize('NFC');
}

export function normalizeOutlineTypeInput(input: OutlineTypeInput): {
  name: string;
  description: string | null;
  sortOrder: number;
} {
  if (typeof input.name !== 'string') throw new Error('타입 이름은 문자열이어야 합니다.');
  const name = input.name.trim().normalize('NFC');
  if (!name || name.length > MAX_NAME_LENGTH || FORBIDDEN.test(name)) {
    throw new Error('타입 이름은 1~100자이며 제어·비표시 문자를 포함할 수 없습니다.');
  }

  let description: string | null = null;
  if (input.description !== null && input.description !== undefined) {
    if (typeof input.description !== 'string') throw new Error('설명은 문자열이어야 합니다.');
    description = input.description.trim().normalize('NFC') || null;
    if (description && (description.length > MAX_DESCRIPTION_LENGTH || FORBIDDEN.test(description))) {
      throw new Error('설명은 최대 500자이며 제어·비표시 문자를 포함할 수 없습니다.');
    }
  }

  if (typeof input.sortOrder !== 'number' || !Number.isSafeInteger(input.sortOrder) ||
      input.sortOrder < 0 || input.sortOrder > MAX_SORT_ORDER) {
    throw new Error('정렬 순서는 0~9999의 정수여야 합니다.');
  }
  return { name, description, sortOrder: input.sortOrder };
}

function assertUniqueName(items: readonly OutlineType[], name: string, exceptId?: string): void {
  const key = outlineTypeNameKey(name);
  // Inactive names remain reserved, so later reactivation cannot create duplicates.
  if (items.some(item => item.id !== exceptId && outlineTypeNameKey(item.name) === key)) {
    throw new Error('같은 이름의 타입이 이미 있습니다. (비활성 타입 포함)');
  }
}

/**
 * Browser-memory-only command implementation, not a repository/service.
 * scopeKey=null means UNDECIDED in the prototype, NOT "global" in production.
 */
export function addPreviewOutlineType(
  items: readonly OutlineType[], input: OutlineTypeInput, id: string, now: string,
): OutlineType[] {
  const normalized = normalizeOutlineTypeInput(input);
  if (!UUID.test(id) || items.some(item => item.id === id)) {
    throw new Error('새 타입 ID가 유효하지 않거나 중복되었습니다.');
  }
  assertUniqueName(items, normalized.name);
  return [...items, {
    id, ...normalized, active: true, sortOrder: normalized.sortOrder,
    scopeKey: null, revision: 1, createdAt: now, updatedAt: now,
  }];
}

export function updatePreviewOutlineType(
  items: readonly OutlineType[], id: string, expectedRevision: number,
  patch: OutlineTypePatch, now: string,
): OutlineType[] {
  const existing = items.find(item => item.id === id);
  if (!existing) throw new Error('수정 대상 타입이 존재하지 않습니다.');
  if (existing.revision !== expectedRevision) {
    throw new Error('변경 충돌: 다른 수정이 반영되었습니다. 목록을 다시 선택해주세요.');
  }
  if (patch.active !== undefined && typeof patch.active !== 'boolean') {
    throw new Error('활성 상태 값이 올바르지 않습니다.');
  }
  const normalized = normalizeOutlineTypeInput({
    name: patch.name === undefined ? existing.name : patch.name,
    description: patch.description === undefined ? existing.description : patch.description,
    sortOrder: patch.sortOrder === undefined ? existing.sortOrder : patch.sortOrder,
  });
  assertUniqueName(items, normalized.name, id);
  const updated: OutlineType = {
    ...existing, ...normalized,
    active: patch.active === undefined ? existing.active : patch.active,
    revision: existing.revision + 1, updatedAt: now,
  };
  // Immutable ID/createdAt/scope; never physically delete or mutate references.
  return items.map(item => item.id === id ? updated : item);
}

export function sortedPreviewOutlineTypes(items: readonly OutlineType[]): OutlineType[] {
  return [...items].sort((a, b) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
}
