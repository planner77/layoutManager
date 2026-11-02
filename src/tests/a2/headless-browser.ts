/**
 * #218/P1-A2 EXPERIMENT ONLY. This script is bundled into an isolated, synthetic
 * Chromium page; it is NOT a Worker, API route, G7 permission proof, or publisher.
 * Reuses the real DXFViewer and #212 DTO/manifest/validator/restore contract.
 */
import * as THREE from 'three';
import { DXFViewer } from 'three-dxf-viewer';
import { explicitElevation } from '../../viewers/three-dxf-viewer/normalize';
import { sceneScope, sourceUnitFromDxf, tagImportedTree } from '../../viewers/three-dxf-viewer/scene-tags';
import { preflightSceneRoot, restoreSourceScene, serializeSourceScene } from '../../viewers/three-dxf-viewer/scene-serialization';
import { validateStoredScenePayload, SCENE_PAYLOAD_LIMITS } from '../../domain/scene-payload';
import { sceneSha256 } from '../../domain/scene-digest';
import { extractDxfText } from '../../viewers/core/text-index';
import type { SceneManifest } from '../../domain/cad-scene';

export type A2Input = {
  source: number[];
  expectedSha256: string;
  versionId: string;
  requireSwiftShader: boolean;
};
export type A2Row = {
  type: string;
  name: string;
  layer: string;
  visible: boolean;
  id: string;
  matrix: number[];
  vertices: number;
  wcs: number[] | null;
};
export type A2Inventory = {
  nodes: number;
  geometry: number;
  rows: A2Row[];
  bbox: number[];
};
export type A2Packet = {
  bytes: number[];
  manifest: SceneManifest;
  original: A2Inventory;
  restored: A2Inventory;
  renderer: string;
  fontTextHits: number;
  koreanHits: number;
  sourceEntities: number;
  parseMs: number;
  serializeMs: number;
  restoredNodes: number;
};
function finiteBox(box: THREE.Box3): number[] {
  const values = [...box.min.toArray(), ...box.max.toArray()];
  if (box.isEmpty() || !values.every(Number.isFinite)) throw new Error('A2_WCS_BOUNDS_INVALID');
  return values;
}
function inventory(root: THREE.Object3D): A2Inventory {
  root.updateMatrixWorld(true);
  const rows: A2Row[] = [];
  let geometry = 0;
  root.traverse(o => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const attribute = g?.getAttribute('position');
    let wcs: number[] | null = null;
    if (attribute) {
      geometry++;
      const bounds = new THREE.Box3().makeEmpty();
      const point = new THREE.Vector3();
      for (let i = 0; i < attribute.count; i++) {
        point.fromBufferAttribute(attribute, i).applyMatrix4(o.matrixWorld);
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('A2_COORDINATE_INVALID');
        bounds.expandByPoint(point);
      }
      wcs = finiteBox(bounds);
    }
    rows.push({
      type: o.type, name: o.name, visible: o.visible,
      layer: String(o.userData.cadLayer ?? o.userData.layer ?? o.userData.entity?.layer ?? ''),
      id: String(o.userData.cadSceneRef?.id ?? ''),
      matrix: o.matrix.toArray(),
      vertices: attribute?.count ?? 0, wcs,
    });
  });
  return { nodes: rows.length, geometry, rows, bbox: finiteBox(new THREE.Box3().setFromObject(root)) };
}
function dispose(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  root.clear();
}
function ownMaterials(root: THREE.Object3D): void {
  // Mirror #212 browser adapter. The upstream viewer shares mutable materials.
  const owned = new Map<THREE.Material, THREE.Material>();
  const clone = (source: THREE.Material) => {
    if (!owned.has(source)) {
      const m = source.clone() as THREE.Material & { color?: THREE.Color };
      if (m.color?.getHex() === 0) m.color.setHex(0xffffff);
      owned.set(source, m);
    }
    return owned.get(source)!;
  };
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.material) mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(clone) : clone(mesh.material);
  });
}
function softwareRenderer(): { renderer: THREE.WebGLRenderer; identity: string } {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(32, 32);
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  // A generic "WebKit WebGL" name is NOT proof that CPU software rendering was used.
  const identity = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  return { renderer, identity };
}
async function run(input: A2Input): Promise<A2Packet> {
  const source = Uint8Array.from(input.source);
  if (!source.length || source.length > 16 * 1024 * 1024) throw new Error('A2_SOURCE_LIMIT');
  if (sceneSha256(source) !== input.expectedSha256) throw new Error('A2_SOURCE_DIGEST_MISMATCH');
  const text = new TextDecoder().decode(source);
  if (!/(?:^|\n)\s*0\s*\r?\nSECTION\s*\r?\n/.test(text) ||
      !/(?:^|\n)\s*0\s*\r?\nEOF\s*$/.test(text)) throw new Error('A2_DXF_INVALID');
  const { renderer, identity } = softwareRenderer();
  const url = URL.createObjectURL(new Blob([explicitElevation(text)], { type: 'text/plain' }));
  let root: THREE.Object3D | undefined;
  let restored: THREE.Object3D | undefined;
  try {
    if (input.requireSwiftShader && !/swiftshader/i.test(identity))
      throw new Error('A2_SOFTWARE_WEBGL_NOT_PROVEN');
    const viewer = new DXFViewer();
    viewer.useCache = false;
    const begin = performance.now();
    root = (await viewer.getFromPath(url, '/fonts/CadKorean.typeface.json')) ?? undefined;
    const parseMs = performance.now() - begin;
    if (!root) throw new Error('A2_PARSER_RETURNED_EMPTY');
    const stats = preflightSceneRoot(root);
    if (stats.sceneNodes < 2 || stats.sceneNodes > SCENE_PAYLOAD_LIMITS.nodes)
      throw new Error('A2_NODES_INVALID');
    ownMaterials(root);
    const scope = sceneScope(input.versionId, input.expectedSha256, sourceUnitFromDxf(text));
    const asset = tagImportedTree(root, scope);
    const original = inventory(root);
    const buffer = new ArrayBuffer(source.length);
    new Uint8Array(buffer).set(source);
    const textIndex = extractDxfText(buffer);
    const beginSerialize = performance.now();
    const candidate = await serializeSourceScene(root, asset, 'CUSTOM_DTO', { textIndex });
    const serializeMs = performance.now() - beginSerialize;
    validateStoredScenePayload(candidate.bytes, candidate.manifest);
    restored = await restoreSourceScene(candidate.bytes, candidate.manifest, candidate.manifest);
    const restoredInventory = inventory(restored);
    if (stats.sceneNodes !== restoredInventory.nodes) throw new Error('A2_RESTORE_COUNT_MISMATCH');
    const scene = new THREE.Scene();
    scene.add(root);
    const camera = new THREE.OrthographicCamera(-1000, 1000, 1000, -1000, 0.1, 10000);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return {
      bytes: [...candidate.bytes], manifest: candidate.manifest, original,
      restored: restoredInventory, renderer: identity,
      fontTextHits: textIndex.hits.length,
      koreanHits: textIndex.hits.filter(h => /[가-힣]/u.test(h.text)).length,
      sourceEntities: viewer.lastDXF?.entities?.length ?? 0,
      parseMs, serializeMs, restoredNodes: restoredInventory.nodes,
    };
  } finally {
    URL.revokeObjectURL(url);
    if (restored) dispose(restored);
    if (root) dispose(root);
    renderer.dispose();
  }
}
async function restore(input: Pick<A2Packet, 'bytes' | 'manifest'>): Promise<A2Inventory> {
  const bytes = Uint8Array.from(input.bytes);
  validateStoredScenePayload(bytes, input.manifest);
  const root = await restoreSourceScene(bytes, input.manifest, input.manifest);
  try { return inventory(root); }
  finally { dispose(root); }
}
declare global {
  interface Window {
    sceneA2: { run(input: A2Input): Promise<A2Packet>; restore(input: Pick<A2Packet,'bytes'|'manifest'>): Promise<A2Inventory> };
  }
}
window.sceneA2 = { run, restore };
