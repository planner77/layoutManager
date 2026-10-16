/**
 * Synthetic, stable ASCII DXF for browser and unit regression of Issue #26.
 * Build group-code records explicitly so a JS comment cannot hide an entity.
 * MTEXT 41=width, 71=top-left attachment, 72=left-to-right text direction.
 */
export function createTextSearchDxf(): string {
  const groups = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const [index, x] of [0, 1800, 3600].entries()) {
    groups.push(
      '0', 'TEXT',
      '5', (0x1a0 + index).toString(16).toUpperCase(),
      '8', 'FIND',
      '10', String(x), '20', '100', '40', '20',
      '1', '장비 ABC 123',
    );
    groups.push(
      '0', 'CIRCLE', '8', 'FIND',
      '10', String(x + 60), '20', '60', '40', String(12 + index * 18),
    );
  }
  groups.push(
    '0', 'MTEXT', '8', 'FIND',
    '10', '100', '20', '400',
    '40', '15', '41', '240', '71', '1', '72', '1',
    '1', '검사\\P구역 45',
  );
  groups.push('0', 'ENDSEC', '0', 'EOF');
  return groups.join('\n') + '\n';
}
