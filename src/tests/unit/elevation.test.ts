import { test,expect } from 'vitest';
import { explicitElevation } from '../../viewers/three-dxf-viewer/normalize';
test('TC-THREE-003: missing elevation becomes zero; explicit elevations and text survive',()=>{
  const text='0\nLINE\n10\n1\n20\n2\n11\n3\n21\n4\n31\n9\n0\nTEXT\n10\n4\n20\n5\n1\n 한글 \n0\nEOF\n';
  const result=explicitElevation(text);
  expect(result).toContain('31\n9');expect(result).toContain('1\n 한글 ');expect(result.match(/\n30\n0/g)).toHaveLength(2);
  expect(explicitElevation(result)).toBe(result);
});
