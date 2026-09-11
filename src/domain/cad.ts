export class CadError extends Error {
  readonly recoveryId?: string;
  readonly retryAfterSeconds?: number;
  constructor(public code: string, message: string, public status = 400, options?: ErrorOptions & { recoveryId?: string; retryAfterSeconds?: number }) {
    super(message, options);
    this.name = 'CadError';
    this.recoveryId = options?.recoveryId;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}
export const locationFields = ['businessUnit', 'site', 'building', 'floor'] as const;
export type LocationInput = Record<typeof locationFields[number], string>;
export type Registration = LocationInput & { registeredAt: string; makeCurrent: boolean; description: string; drawingName: string | null; deletePassword: string };
export function cadDrawingName(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new CadError('INVALID_METADATA', '도면 이름을 확인해주세요.');
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new CadError('INVALID_METADATA', '도면 이름은 255자 이내의 한 줄 일반 문자로 입력해주세요.');
  const name = value.trim().normalize('NFC');
  if (!name) return null;
  if (name.length > 255) throw new CadError('INVALID_METADATA', '도면 이름은 255자 이내의 한 줄 일반 문자로 입력해주세요.');
  return name;
}
export function defaultDrawingName(location: LocationInput, version: number | string) {
  return `[${location.businessUnit}][${location.site}][${location.building}][${location.floor}]_V${version}`;
}
export function resolvedDrawingName(location: LocationInput, version: number, override?: string | null) {
  return override || defaultDrawingName(location, version);
}
export function validateDeletePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 4 || value.length > 128 || new TextEncoder().encode(value).length > 512 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new CadError('INVALID_DELETE_PASSWORD', '삭제 비밀번호는 4~128자로 입력해주세요.');
  return value;
}
export function cadDescription(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new CadError('INVALID_METADATA', '도면 설명을 확인해주세요.');
  const description = value.replace(/\r\n?/g, '\n').trim().normalize('NFC');
  if (description.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(description)) {
    throw new CadError('INVALID_METADATA', '도면 설명은 2000자 이내의 일반 문자로 입력해주세요.');
  }
  return description;
}
export function registration(input: Record<string, unknown>): Registration {
  const result = {} as Registration;
  for (const key of locationFields) {
    const value = typeof input[key] === 'string' ? input[key].trim().normalize('NFC') : '';
    if (!value || value.length > 100 || /[\x00-\x1f]/.test(value)) throw new CadError('INVALID_METADATA', '위치 항목은 1~100자로 입력해주세요.');
    result[key] = value;
  }
  const date = String(input.registeredAt ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new CadError('INVALID_METADATA', '유효한 등록일을 입력해주세요.');
  const current = input.makeCurrent;
  if (![true, false, 'true', 'false'].includes(current as boolean)) throw new CadError('INVALID_METADATA', '현재 버전 지정 여부를 확인해주세요.');
  return { ...result, registeredAt: date, makeCurrent: current === true || current === 'true', description: cadDescription(input.description), drawingName: cadDrawingName(input.drawingName), deletePassword: validateDeletePassword(input.deletePassword) };
}
export function validateId(id: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new CadError('INVALID_ID', '올바르지 않은 도면 ID입니다.'); return id; }
