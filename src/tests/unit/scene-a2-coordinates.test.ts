import {describe, expect, it} from 'vitest';
import {compareCoordinates} from '../a2/compare-coordinates';

describe('#218 complete coordinate comparison without per-scalar report steps', () => {
  it('checks the final scalar of a large geometry and preserves 1e-5 tolerance', () => {
    const before = new Array<number>(100_000).fill(1);
    const after = [...before];
    after[99_999] += 0.000009;
    expect(() => compareCoordinates(after, before, 'trace')).not.toThrow();
    after[99_999] += 0.000002;
    expect(() => compareCoordinates(after, before, 'trace'))
      .toThrow('A2_GEOMETRY_MISMATCH:trace:99999');
  });
  it('rejects lengths, sparse arrays and non-finite or JSON-null coordinates', () => {
    expect(() => compareCoordinates([1], [], 'bbox')).toThrow('A2_GEOMETRY_LENGTH:bbox');
    for (const bad of [NaN, Infinity, -Infinity, undefined, null]) {
      expect(() => compareCoordinates([bad as number], [0], 'trace')).toThrow('A2_GEOMETRY_MISMATCH');
      expect(() => compareCoordinates([0], [bad as number], 'trace')).toThrow('A2_GEOMETRY_MISMATCH');
    }
    expect(() => compareCoordinates(new Array<number>(1), [0], 'trace')).toThrow('A2_GEOMETRY_MISMATCH');
  });
});
