import { CadError, locationFields } from './cad';

export type CadListQuery = {
  filename: string;
  description: string;
  businessUnit: string;
  site: string;
  building: string;
  floor: string;
  format: '' | 'DXF' | 'DWG';
  current: '' | 'true' | 'false';
  page: number;
  pageSize: number;
};

export type CadListItem = {
  id: string;
  locationId: string;
  businessUnit: string;
  site: string;
  building: string;
  floor: string;
  version: number;
  originalFilename: string;
  displayName: string;
  description: string;
  fileFormat: string;
  fileSize: number;
  registeredAt: string;
  isCurrent: boolean;
};

export function listQuery(params = new URLSearchParams()): CadListQuery {
  function value(key: string, maximum = 100) {
    if (params.getAll(key).length > 1) throw new CadError('INVALID_QUERY', '검색 조건을 중복으로 지정할 수 없습니다.');
    const text = (params.get(key) ?? '').trim().normalize('NFC');
    if (text.length > maximum || /[\x00-\x1f]/.test(text)) throw new CadError('INVALID_QUERY', '검색 조건의 길이와 문자를 확인해주세요.');
    return text;
  }
  function integer(key: string, fallback: number, maximum: number) {
    const text = value(key, 10);
    if (!text) return fallback;
    const number = Number(text);
    if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(number) || number > maximum) throw new CadError('INVALID_QUERY', '페이지와 표시 개수를 확인해주세요.');
    return number;
  }
  const format = value('format'), current = value('current');
  if (!['', 'DXF', 'DWG'].includes(format) || !['', 'true', 'false'].includes(current)) throw new CadError('INVALID_QUERY', '파일 형식과 Current 검색 조건을 확인해주세요.');
  const location = Object.fromEntries(locationFields.map(key => [key, value(key)])) as Pick<CadListQuery, typeof locationFields[number]>;
  return { ...location, filename: value('filename', 255), description: value('description', 2000), format: format as CadListQuery['format'], current: current as CadListQuery['current'], page: integer('page', 1, 1_000_000), pageSize: integer('pageSize', 25, 100) };
}

export function listUrl(query: CadListQuery, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, page })) if (value !== '') params.set(key, String(value));
  return `/?${params}`;
}
