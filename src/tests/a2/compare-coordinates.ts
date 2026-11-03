/** Compare every scalar without allocating one Playwright report step per vertex.
 * JSON transport must never turn a non-finite/missing coordinate into a match.
 * Error details contain only a bounded label/index, never geometry values.
 */
export function compareCoordinates(
  actual: readonly number[], expected: readonly number[], label: string,
): void {
  if (actual.length !== expected.length) throw new Error('A2_GEOMETRY_LENGTH:' + label);
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i], b = expected[i];
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-5) {
      throw new Error('A2_GEOMETRY_MISMATCH:' + label + ':' + i);
    }
  }
}
