/**
 * Issue #43 U6: browser-session outline tree projection and WCS focus envelope.
 * No server-owned catalogue, storage, or DXF source mutation is performed here.
 */
import type { SavedOutline, SavedOutlineOverlayState } from '../viewers/core/adapter';
import type { GeoJSONOutline } from '../viewers/core/outline-compute';
import type { CadFocusBounds } from '../viewers/core/text-index';

export type OutlineTreeType = Readonly<{ id: string; name: string }>;
export type OutlineTreeItem = Readonly<{
  id: string;
  name: string;
  kind: 'CONVEX' | 'PRECISE';
  visible: boolean;
  selected: boolean;
  legacy: boolean;
}>;
export type OutlineTreeGroup = Readonly<{
  id: string;
  name: string;
  legacy: boolean;
  items: readonly OutlineTreeItem[];
}>;

/** Type IDs are immutable grouping keys; never group by display name or kind. */
export function buildOutlineTree(
  outlines: readonly SavedOutline[],
  overlayStates: readonly SavedOutlineOverlayState[],
  catalogTypes: readonly OutlineTreeType[],
): OutlineTreeGroup[] {
  const states = new Map(overlayStates.map(item => [item.id, item]));
  const groups = new Map<string, { id: string; name: string; legacy: boolean; items: OutlineTreeItem[] }>();
  const typeOrder: string[] = [];
  for (const type of catalogTypes) {
    if (groups.has(type.id)) continue;
    groups.set(type.id, { id: type.id, name: type.name, legacy: false, items: [] });
    typeOrder.push(type.id);
  }
  for (const outline of outlines) {
    const id = outline.outlineTypeId || 'legacy';
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        name: id === 'legacy' ? '미분류 (legacy)' : (outline.outlineTypeName || '미확인 업무 타입'),
        legacy: id === 'legacy',
        items: [],
      };
      groups.set(id, group);
      typeOrder.push(id);
    }
    const state = states.get(outline.id);
    group.items.push({
      id: outline.id,
      name: outline.name || '외곽선 ' + outline.id.replace(/^local-/, ''),
      kind: outline.result.kind,
      visible: state?.visible ?? true,
      selected: state?.selected ?? false,
      legacy: id === 'legacy',
    });
  }
  // Always put legacy items after typed groups; empty catalogue nodes are valid.
  return [...typeOrder.filter(id => id !== 'legacy'), ...(groups.has('legacy') ? ['legacy'] : [])]
    .map(id => groups.get(id)!);
}

/**
 * Calculate the enclosing WCS rectangle of every polygon and hole. Bounds are
 * rejected rather than guessed for empty, corrupt, non-finite or degenerate
 * geometry. All disjoint MultiPolygon islands participate in the envelope.
 */
export function outlineGeometryBounds(geometry: GeoJSONOutline): CadFocusBounds | null {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!Array.isArray(polygons) || !polygons.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return null;
      for (const point of ring) {
        if (!Array.isArray(point) || point.length !== 2 ||
            !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
            Math.abs(point[0]) > 1e12 || Math.abs(point[1]) > 1e12) return null;
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
    }
  }
  const width = maxX - minX, height = maxY - minY;
  if (![width, height].every(Number.isFinite) || width <= 1e-8 || height <= 1e-8 ||
      width >= 1e15 || height >= 1e15) return null;
  return { minX, minY, maxX, maxY };
}
