export class CadError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
export const locationFields = ['businessUnit', 'site', 'building', 'floor'] as const;
export type LocationInput = Record<typeof locationFields[number], string>;
export type Registration = LocationInput & { registeredAt: string; makeCurrent: boolean };
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
  return { ...result, registeredAt: date, makeCurrent: current === true || current === 'true' };
}
export function validateId(id: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new CadError('INVALID_ID', '올바르지 않은 도면 ID입니다.'); return id; }
