import { expect, test } from 'vitest';
import { extractDxfText, normalizedText, plainMtext, searchKey } from '@/viewers/core/text-index';

const document = (entities: string) =>
  '0\nSECTION\n2\nENTITIES\n' + entities + '0\nENDSEC\n0\nEOF\n';
const text = (x: number, label: string, layer = '0') =>
  '0\nTEXT\n5\nH' + x + '\n8\n' + layer + '\n10\n' + x + '\n20\n0\n40\n10\n1\n' + label + '\n';

test('TC-TEXT-001: TEXT + formatted/continued MTEXT normalize Unicode, whitespace, case and number', () => {
  const mtext = '0\nMTEXT\n5\nM1\n8\nZONE\n10\n300\n20\n20\n40\n10\n3\n생산 \\C1;ABC\\P\n' +
    '3\n동\\P1\n' + '1\n2\\S1#2;\\U+AC00\n';
  const index = extractDxfText(document(text(0, '한글 ABC 10') + mtext));
  expect(index.hits).toHaveLength(2);
  expect(index.hits[0]).toMatchObject({ type: 'TEXT', layer: '0', text: '한글 ABC 10', handle: 'H0' });
  expect(index.hits[1]).toMatchObject({ type: 'MTEXT', layer: 'ZONE', text: '생산 ABC 동 12 1/2가' });
  expect(searchKey(index.hits[0].text)).toContain(searchKey('abc 10'));
  expect(searchKey(index.hits[1].text)).toContain(searchKey('abc 동'));
  expect(normalizedText('가')).toBe('가');
  expect(plainMtext('A\\P\\L한글\\l \\{B\\}')).toBe('A\n한글 {B}');
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
