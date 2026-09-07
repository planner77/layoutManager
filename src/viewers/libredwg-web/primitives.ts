import type { DwgEntity, DwgLineEntity } from '@mlightcad/libredwg-web';
export interface DwgProbeResult {
  positions: number[];
  entityCount: number;
  skipped: Record<string, number>;
  initMs: number;
  parseMs: number;
  convertMs: number;
  freed: boolean;
  temporaryFileRemoved: boolean;
}
// Unit 7A deliberately renders model-space, planar LINE only.
export function linePrimitives(entities: DwgEntity[]) {
  const positions: number[] = [], skipped: Record<string, number> = {};
  for (const entity of entities) {
    const line = entity as DwgLineEntity;
    const points = [line.startPoint, line.endPoint];
    if (line.type !== 'LINE' || line.isVisible === false || line.isInPaperSpace ||
        points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.z !== 0)) {
      skipped[entity.type] = (skipped[entity.type] ?? 0) + 1;
      continue;
    }
    positions.push(line.startPoint.x, line.startPoint.y, 0, line.endPoint.x, line.endPoint.y, 0);
  }
  return { positions, entityCount: entities.length, skipped };
}
