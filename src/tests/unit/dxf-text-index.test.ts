import { expect, test } from 'vitest';
import { createTextSearchDxf } from '../fixtures/text-search-dxf';
import { extractDxfText, normalizedText, plainMtext, searchKey } from '@/viewers/core/text-index';

const document = (entities: string) =>
  '0\nSECTION\n2\nENTITIES\n' + entities + '0\nENDSEC\n0\nEOF\n';
const text = (x: number, label: string, layer = '0') =>
  '0\nTEXT\n5\nH' + x + '\n8\n' + layer + '\n10\n' + x + '\n20\n0\n40\n10\n1\n' + label + '\n';

test('TC-TEXT-FIXTURE-001: shared browser DXF contains three TEXTs and one searchable MTEXT', () => {
  const drawing = createTextSearchDxf();
  expect(drawing).toContain('0\nMTEXT\n');
  expect(drawing).toContain('41\n240\n71\n1\n72\n1\n1\n검사\\P구역 45\n');
  const index = extractDxfText(drawing);
  expect(index.hits.filter(hit => hit.type === 'TEXT')).toHaveLength(3);
  const mtexts = index.hits.filter(hit => hit.type === 'MTEXT');
  expect(mtexts).toHaveLength(1);
  expect(mtexts[0]).toMatchObject({ text: '검사 구역 45', layer: 'FIND' });
  expect(index.hits.filter(hit => searchKey(hit.text).includes('abc 123'))).toHaveLength(3);
});

test('TC-TEXT-001: TEXT + formatted/continued MTEXT normalize Unicode, whitespace, case and number', () => {
  const mtext = '0\nMTEXT\n5\nM1\n8\nZONE\n10\n300\n20\n20\n40\n10\n3\n생산 \\C1;ABC\\P\n' +
    '3\n동\\P1\n' + '1\n2 \\S1#2;\\U+AC00\n';
  const index = extractDxfText(document(text(0, '한글 ABC 10') + mtext));
  expect(index.hits).toHaveLength(2);
  expect(index.hits[0]).toMatchObject({ type: 'TEXT', layer: '0', text: '한글 ABC 10', handle: 'H0' });
  expect(index.hits[1]).toMatchObject({ type: 'MTEXT', layer: 'ZONE', text: '생산 ABC 동 12 1/2가' });
  expect(searchKey(index.hits[0].text)).toContain(searchKey('abc 10'));
  expect(searchKey(index.hits[1].text)).toContain(searchKey('abc 동'));
  expect(normalizedText('가')).toBe('가');
  expect(plainMtext('A\\P\\L한글\\l \\{B\\}')).toBe('A\n한글 {B}');
});

test('TC-TEXT-010: Unicode escape ends at exactly four hex digits even if next char is hex-like', () => {
  const index = extractDxfText(document(text(15, '\\U+00B0C')));
  expect(index.hits[0].text).toBe('°C');
  expect(searchKey(index.hits[0].text)).toBe(searchKey('°c'));
  expect(plainMtext('TEMP \\U+00B0C')).toBe('TEMP °C');
});

test('TC-TEXT-011: MTEXT group 3 continuation adds no implicit whitespace', () => {
  const withoutGap = document('0\nMTEXT\n10\n10\n20\n20\n40\n10\n3\nAB\n1\nCD\n');
  const withGap = document('0\nMTEXT\n10\n10\n20\n20\n40\n10\n3\nAB \n1\nCD\n');
  expect(extractDxfText(withoutGap).hits[0].text).toBe('ABCD');
  expect(extractDxfText(withGap).hits[0].text).toBe('AB CD');
});

test('TC-TEXT-002: three distant identical TEXT objects have distinct world focus centers', () => {
  const index = extractDxfText(document(text(0, 'same') + text(1000, 'same') + text(2000, 'same')));
  expect(index.hits.map(h => (h.focus.minX + h.focus.maxX) / 2)).toEqual([0, 1000, 2000]);
  expect(new Set(index.hits.map(h => h.id)).size).toBe(3);
});

test('TC-TEXT-003: INSERT translation, rotation, nonuniform scale and block base point are applied', () => {
  const source = '0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nROOM\n10\n5\n20\n2\n' +
    text(10, 'ROOM-A') + '0\nENDBLK\n0\nENDSEC\n' +
    document('0\nINSERT\n5\nI1\n2\nROOM\n8\nZONE\n10\n100\n20\n50\n41\n2\n42\n3\n50\n90\n');
  const index = extractDxfText(source);
  expect(index.hits).toHaveLength(1);
  expect(index.hits[0]).toMatchObject({ text: 'ROOM-A', layer: 'ZONE', origin: 'INSERT' });
  expect((index.hits[0].focus.minX + index.hits[0].focus.maxX) / 2).toBeCloseTo(106, 5);
  expect((index.hits[0].focus.minY + index.hits[0].focus.maxY) / 2).toBeCloseTo(60, 5);
});

test('TC-TEXT-004: unsupported OCS, array, attributes and invisible entities never return a guessed coordinate', () => {
  const index = extractDxfText(document(
    '0\nTEXT\n1\nhidden\n10\n1\n20\n2\n60\n1\n' +
    '0\nTEXT\n1\nextrusion\n10\n1\n20\n2\n210\n1\n' +
    '0\nATTRIB\n1\nserial\n10\n1\n20\n2\n' +
    '0\nINSERT\n2\nMISSING\n10\n3\n20\n5\n'
  ));
  expect(index.hits).toHaveLength(0);
  expect(Object.values(index.skipped).reduce((sum, count) => sum + count, 0)).toBe(4);
});

test('TC-TEXT-005: malformed/binary inputs fail explicitly and result text stays literal', () => {
  expect(() => extractDxfText('invalid DXF')).toThrow('ENTITIES');
  expect(() => extractDxfText(new TextEncoder().encode('AutoCAD Binary DXF\n').buffer)).toThrow('Binary DXF');
  const value = '<img src=x onerror=alert(1)>';
  expect(extractDxfText(document(text(0, value))).hits[0].text).toBe(value);
});

test('TC-TEXT-006: block loop is rejected without recursion or fabricated hits', () => {
  const source = '0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nRECURSE\n10\n0\n20\n0\n' +
    '0\nINSERT\n2\nRECURSE\n10\n0\n20\n0\n0\nENDBLK\n0\nENDSEC\n' +
    document('0\nINSERT\n2\nRECURSE\n10\n1\n20\n2\n');
  const index = extractDxfText(source);
  expect(index.hits).toHaveLength(0);
  expect(index.skipped['미지원 INSERT 배열/OCS/순환']).toBe(1);
});

// #139: synthetic binary fixtures are intentionally free of company CAD bytes.
// U+AC00 = CP949 B0 A1; U+B098 = CP949 B3 AA.
function binaryTextDxf(version:string,codepage:string,textBytes:Uint8Array,bom=false):ArrayBuffer {
  const prefix = new TextEncoder().encode(
    '0\nSECTION\n2\nHEADER\n9\n$DWGCODEPAGE\n3\n' + codepage +
    '\n9\n$ACADVER\n1\n' + version + '\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n' +
    '0\nTEXT\n10\n25\n20\n15\n40\n8\n1\n');
  const suffix = new TextEncoder().encode('\n0\nENDSEC\n0\nEOF\n');
  const buffer = new Uint8Array((bom?3:0)+prefix.length+textBytes.length+suffix.length);
  let position=0;
  if(bom){buffer.set([0xef,0xbb,0xbf]);position=3;}
  buffer.set(prefix,position);position+=prefix.length;
  buffer.set(textBytes,position);position+=textBytes.length;
  buffer.set(suffix,position);
  return buffer.buffer;
}

test('TC-139-01: AC1032 UTF-8 wins over obsolete ANSI_949 declaration, with exact WCS focus',()=>{
  const source=binaryTextDxf('AC1032','ANSI_949',new TextEncoder().encode('한글 검사'));
  const hits=extractDxfText(source).hits;
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({text:'한글 검사',focus:{minX:25,maxX:25,minY:15,maxY:15}});
  expect(searchKey(hits[0].text)).toContain('검사');
});

test('TC-139-02: old AC1018 actually decodes valid Windows-949 bytes',()=>{
  const cp949=Uint8Array.from([0xb0,0xa1,0xb3,0xaa]); // 가나
  expect(extractDxfText(binaryTextDxf('AC1018','ANSI_949',cp949)).hits[0].text).toBe('가나');
});

test('TC-139-03: R2007+ legacy 932/936/950 declarations, BOM, and missing HEADER',()=>{
  for(const codepage of ['ANSI_932','ANSI_936','ANSI_950','ANSI_949']) {
    const source=binaryTextDxf('AC1021',codepage,new TextEncoder().encode('구역 ABC'),true);
    expect(extractDxfText(source).hits[0].text).toBe('구역 ABC');
  }
  expect(extractDxfText(new TextEncoder().encode(document(text(2,'한국어'))).buffer).hits[0].text).toBe('한국어');
});

test('TC-139-04: unsupported codepages, invalid UTF-8 and binary input fail with distinct messages',()=>{
  expect(()=>extractDxfText(binaryTextDxf('AC1018','ANSI_999',new TextEncoder().encode('A'))))
    .toThrow('지원하지 않는 DXF 코드페이지');
  expect(()=>extractDxfText(binaryTextDxf('AC1032','ANSI_949',Uint8Array.from([0xe3,0x81]))))
    .toThrow('바이트가 UTF-8');
  expect(()=>extractDxfText(new TextEncoder().encode('AutoCAD Binary DXF').buffer)).toThrow('Binary DXF');
});

