/**
 * Issue #82 / M1 — disposable, VERSION/SHA-scoped browser memo document.
 * This is not a CadMemo persistence DTO and never contains a trusted actor.
 */
export type MemoWcsXY = Readonly<{ x: number; y: number }>;
export type MemoScope = Readonly<{ versionId: string; sourceSha256: string }>;
import type {MemoAnchorState} from './cad-memo-anchor';
import {dateOnly,EMPTY_MEMO_SETTINGS,normalizeMemoSettings,type MemoSettings,type MemoSettingsInput} from './memo-schedule';
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
  /** Present only for server-committed records, never a trusted client authorization. */
  revision?: number;
  persisted?: true;
  createdById?: string;
  updatedById?: string;
  anchor?: MemoAnchorState;
  /** #85/#86: only server-returned persisted settings authorize shared visibility. */
  groupId?:string|null;
  visible?:boolean;
  scheduleEnabled?:boolean;startDate?:string|null;dueDate?:string|null;
  completionEnabled?:boolean;isCompleted?:boolean;completedAt?:string|null;
}>;
export type PersistedMemoDraft=MemoDraft & Readonly<{
 revision:number;persisted:true;createdById:string;updatedById:string;
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
  /** Server response hydration; never called on untrusted browser draft input. */
  acceptPersisted(record: PersistedMemoDraft, scope: MemoScope): PersistedMemoDraft {
    this.requireScope(scope);
    if (!uuidV4.test(record.id) || !this.matches(record) || !record.persisted ||
        !Number.isSafeInteger(record.revision) || record.revision < 0 ||
        typeof record.createdById !== 'string' || !record.createdById ||
        typeof record.updatedById !== 'string' || !record.updatedById ||
        record.textFormat !== 'plain' || !Number.isFinite(Date.parse(record.createdAt)) ||
        !Number.isFinite(Date.parse(record.updatedAt))) {
      throw new Error('서버 메모 데이터가 유효하지 않습니다.');
    }
    if(!this.records.has(record.id) && this.records.size>=MEMO_MAX_COUNT)
      throw new Error('저장된 메모 수가 100개를 초과했습니다.');
    const txt=normalizeMemoText(record.title,record.content);
    if(record.anchor && !['FREE','ATTACHED','BROKEN_ANCHOR'].includes(record.anchor.mode))
      throw new Error('서버 앵커 상태가 유효하지 않습니다.');
    const scheduleEnabled=record.scheduleEnabled??false,completionEnabled=record.completionEnabled??false;
    const startDate=dateOnly(record.startDate??null),dueDate=dateOnly(record.dueDate??null);
    if(typeof scheduleEnabled!=='boolean'||typeof completionEnabled!=='boolean'||
       typeof (record.isCompleted??false)!=='boolean'||typeof (record.visible??true)!=='boolean'||
       (record.groupId!=null&&!uuidV4.test(record.groupId))||
       (!scheduleEnabled&&(startDate!==null||dueDate!==null))||
       (startDate&&dueDate&&startDate>dueDate)||
       (!completionEnabled&&Boolean(record.isCompleted))||
       (Boolean(record.isCompleted)!==Boolean(record.completedAt))||
       (record.completedAt&&!Number.isFinite(Date.parse(record.completedAt))))
      throw new Error('서버 메모 일정·완료 정보가 유효하지 않습니다.');
    const safe:PersistedMemoDraft={...record,...txt,anchorWcsXY:assertMemoWcsXY(record.anchorWcsXY),
      labelOffset:assertMemoWcsXY(record.labelOffset),
      groupId:record.groupId??null,visible:record.visible??true,
      scheduleEnabled,startDate,dueDate,completionEnabled,isCompleted:record.isCompleted??false,
      completedAt:record.completedAt??null};
    this.records.set(record.id,safe);
    return safe;
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
      ...text, ...EMPTY_MEMO_SETTINGS, groupId:null, visible:true,
      textFormat: 'plain', createdAt: timestamp, updatedAt: timestamp,
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
  /** Session-only metadata update. The server path must use Revision CAS instead. */
  updateMetadata(id:string,meta:{groupId:string|null;visible:boolean;settings:MemoSettingsInput},scope:MemoScope):MemoDraft{
    const current=this.requireMemo(id,scope);
    if(meta.groupId!==null&&!uuidV4.test(meta.groupId))throw new Error('그룹 ID가 유효하지 않습니다.');
    if(typeof meta.visible!=='boolean')throw new Error('메모 표시 설정이 유효하지 않습니다.');
    const previous:MemoSettings={
      scheduleEnabled:current.scheduleEnabled??false,startDate:current.startDate??null,
      dueDate:current.dueDate??null,completionEnabled:current.completionEnabled??false,
      isCompleted:current.isCompleted??false,completedAt:current.completedAt??null};
    const settings=normalizeMemoSettings(meta.settings,previous);
    const next={...current,groupId:meta.groupId,visible:meta.visible,...settings,updatedAt:new Date().toISOString()};
    this.records.set(id,next);
    return next;
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
