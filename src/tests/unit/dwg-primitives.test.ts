import { test, expect } from 'vitest';
import type { DwgEntity } from '@mlightcad/libredwg-web';
import { linePrimitives } from '@/viewers/libredwg-web/primitives';
test('TC-DWG-005: only finite visible planar model-space LINE is rendered; exclusions are counted', () => {
  const line = { type: 'LINE', startPoint: { x: 1, y: 2, z: 0 }, endPoint: { x: 3, y: 4, z: 0 } };
  const entities = [line, { type: 'CIRCLE' }, { ...line, isVisible: false }, { ...line, isInPaperSpace: true }, { ...line, startPoint: { x: NaN, y: 2, z: 0 } }, { ...line, endPoint: { x: 3, y: 4, z: 1 } }] as DwgEntity[];
  expect(linePrimitives(entities)).toEqual({ positions: [1, 2, 0, 3, 4, 0], entityCount: 6, skipped: { CIRCLE: 1, LINE: 4 } });
});
