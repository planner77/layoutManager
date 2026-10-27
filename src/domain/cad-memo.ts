/**
 * Issue #82 / M1 — disposable, VERSION/SHA-scoped browser memo document.
 * This is not a CadMemo persistence DTO and never contains a trusted actor.
 */
export type MemoWcsXY = Readonly<{ x: number; y: number }>;
export type MemoScope = Readonly<{ versionId: string; sourceSha256: string }>;
export type MemoDraft = Readonly<{
  id: string;
  versionId: string;
  sourceSha256: string;
  anchorWcsXY: MemoWcsXY;
  /** CSS pixel offset of the plain-text label from its world-anchored pin. */
  labelOffset: MemoWcsXY;
  title: string;
  content: string;
  textFormat: 'plain';
  createdAt: string;
  updatedAt: string;
}>;

export const MEMO_MAX_COUNT = 100;
export const MEMO_MAX_TITLE = 100;
export const MEMO_MAX_CONTENT = 2000;
export const MEMO_WCS_ABS_LIMIT = 1e12;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalidControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

export function assertMemoScope(scope: MemoScope): MemoScope {
  if (!uuidV4.test(scope.versionId) ||
      !/^[0-9a-f]{64}$/i.test(scope.sourceSha256)) {
    throw new Error('메모는 유효한 도면 Version ID와 원본 SHA-256이 있어야 작성할 수 있습니다.');
  }
  return scope;
}

export function parseMemoWcsXY(x: string, y: string): MemoWcsXY {
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!decimal.test(x.trim()) || !decimal.test(y.trim())) {
    throw new Error('좌표 X/Y에는 유한한 WCS 숫자만 입력하세요.');
  }
  return assertMemoWcsXY({ x: Number(x.trim()), y: Number(y.trim()) });
}

export function assertMemoWcsXY(point: MemoWcsXY): MemoWcsXY {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      Math.abs(point.x) > MEMO_WCS_ABS_LIMIT ||
      Math.abs(point.y) > MEMO_WCS_ABS_LIMIT) {
    throw new Error('메모 좌표는 유한하고 절대값 1e12 이하인 WCS XY여야 합니다.');
  }
  return { x: point.x, y: point.y };
}

export function normalizeMemoText(title: string, content: string): Pick<MemoDraft, 'title' | 'content'> {
  if (typeof title !== 'string' || typeof content !== 'string') {
    throw new Error('제목과 본문은 텍스트여야 합니다.');
  }
  const safeTitle = title.normalize('NFC').trim();
  const safeContent = content.replace(/\r\n?/g, '\n').normalize('NFC').trim();
  if (!safeTitle || safeTitle.length > MEMO_MAX_TITLE || /[\r\n\t]/.test(safeTitle) ||
      invalidControls.test(safeTitle)) {
    throw new Error('메모 제목은 1~100자, 한 줄의 일반 텍스트여야 합니다.');
  }
  if (safeContent.length > MEMO_MAX_CONTENT || invalidControls.test(safeContent)) {
    throw new Error('메모 본문은 2,000자 이하의 일반 텍스트여야 합니다.');
  }
  return { title: safeTitle, content: safeContent };
}

const defaultLabelOffset = Object.freeze({ x: 14, y: -12 });
/** No localStorage, global singleton, export-to-server, authentication or hidden persistence. */
export class MemoSession {
  private readonly records = new Map<string, MemoDraft>();
  private readonly scope: MemoScope;

  constructor(scope: MemoScope) {
    this.scope = { ...assertMemoScope(scope) };
  }
  matches(scope: MemoScope): boolean {
    return scope.versionId === this.scope.versionId &&
      scope.sourceSha256.toLowerCase() === this.scope.sourceSha256.toLowerCase();
  }
  list(): MemoDraft[] {
    return [...this.records.values()];
  }
  get(id: string): MemoDraft | undefined {
    return this.records.get(id);
  }
  create(input: { id: string; anchorWcsXY: MemoWcsXY; title: string; content: string }, scope: MemoScope): MemoDraft {
    this.requireScope(scope);
    if (this.records.size >= MEMO_MAX_COUNT) throw new Error('세션 임시 메모는 최대 100개까지 작성할 수 있습니다.');
    if (!uuidV4.test(input.id) || this.records.has(input.id)) {
      throw new Error('중복되거나 유효하지 않은 임시 메모 UUID입니다.');
    }
    const anchorWcsXY = assertMemoWcsXY(input.anchorWcsXY);
    const text = normalizeMemoText(input.title, input.content);
    const timestamp = new Date().toISOString();
    const memo: MemoDraft = {
      id: input.id, ...this.scope, anchorWcsXY, labelOffset: { ...defaultLabelOffset },
      ...text, textFormat: 'plain', createdAt: timestamp, updatedAt: timestamp,
    };
    this.records.set(memo.id, memo);
    return memo;
  }
  editText(id: string, title: string, content: string, scope: MemoScope): MemoDraft {
    const current = this.requireMemo(id, scope);
    const text = normalizeMemoText(title, content);
    if (text.title === current.title && text.content === current.content) return current;
    const updated = { ...current, ...text, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    return updated;
  }
  /** The only way to modify a committed world anchor. Neither editText nor render can do so. */
  move(id: string, anchorWcsXY: MemoWcsXY, scope: MemoScope): MemoDraft {
    const current = this.requireMemo(id, scope);
    const next = assertMemoWcsXY(anchorWcsXY);
    if (current.anchorWcsXY.x === next.x && current.anchorWcsXY.y === next.y) return current;
    const updated = { ...current, anchorWcsXY: next, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    return updated;
  }
  remove(id: string, scope: MemoScope): void {
    this.requireMemo(id, scope);
    this.records.delete(id);
  }
  clear(): void { this.records.clear(); }
  private requireScope(scope: MemoScope) {
    if (!this.matches(scope)) throw new Error('다른 Version 또는 원본 SHA의 메모는 수정할 수 없습니다.');
  }
  private requireMemo(id: string, scope: MemoScope): MemoDraft {
    this.requireScope(scope);
    const current = this.records.get(id);
    if (!current) throw new Error('선택한 세션 메모를 찾지 못했습니다.');
    return current;
  }
}
