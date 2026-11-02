/**
 * Issue #208 / P1-A experimental Node-only feasibility probe.
 *
 * NOT a production worker, upload hook or authenticated publishing boundary.
 * It uses the pinned three-dxf-viewer internals to test whether a CPU-only
 * Object3D can be produced and serialized without DOM/WebGL. A passing
 * synthetic test does not authorize enabling automated Scene publication.
 */
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { DXFViewer } from 'three-dxf-viewer';
import { sceneSha256 } from '../../domain/scene-digest';
import type { SceneManifest } from '../../domain/cad-scene';
import { sceneScope, sourceUnitFromDxf, tagImportedTree } from '../../viewers/three-dxf-viewer/scene-tags';
import { explicitElevation } from '../../viewers/three-dxf-viewer/normalize';
import { preflightSceneRoot, restoreSourceScene, serializeSourceScene } from '../../viewers/three-dxf-viewer/scene-serialization';
import { extractDxfText } from '../../viewers/core/text-index';

export const NODE_SCENE_POC_SOURCE_CAP = 16 * 1024 * 1024; // experimental memory bound; NOT the upload limit
export type NodeScenePocPhase = 'SOURCE_VERIFY' | 'FONT_PREPARE' | 'DXF_PARSE' | 'SCENE_BUILD'
  | 'TEXT_INDEX' | 'SERIALIZE' | 'ROUND_TRIP';
export type NodeScenePocCode =
  'SCENE_SOURCE_DIGEST_MISMATCH' | 'SCENE_SOURCE_UNAVAILABLE' | 'SCENE_FONT_UNAVAILABLE'
  | 'SCENE_DXF_PARSE_FAILED' | 'SCENE_CONVERTER_UNAVAILABLE' | 'SCENE_ASSET_TOO_LARGE'
  | 'SCENE_SERIALIZE_FAILED' | 'SCENE_VALIDATE_FAILED';
export class NodeScenePocError extends Error {
  constructor(readonly phase: NodeScenePocPhase, readonly code: NodeScenePocCode) {
    // Never leak original CAD bytes, source paths or upstream exception strings.
    super(code);
    this.name = 'NodeScenePocError';
  }
}
export type NodeScenePocResult = Readonly<{
  bytes: Uint8Array;
  manifest: SceneManifest;
  objectCount: number;
  geometryCount: number;
  attributeScalars: number;
  sourceEntityCount: number;
  restoredObjectCount: number;
}>;

function release(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  root.clear();
}
function ownedMaterials(root: THREE.Object3D) {
  // Match the browser adapter's #212 conversion normalization. Upstream can
  // reuse mutable material instances between objects.
  const owned = new Map<THREE.Material, THREE.Material>();
  const clone = (original: THREE.Material) => {
    if (!owned.has(original)) {
      const material = original.clone() as THREE.Material & { color?: THREE.Color };
      if (material.color?.getHex() === 0) material.color.setHex(0xffffff);
      owned.set(original, material);
    }
    return owned.get(original)!;
  };
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (mesh.material)
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
  });
}

/**
 * Run only in a disposable test process. No routes, DB, storage or credentials
 * are accessed. The DXFViewer's _font field is intentionally an unsupported
 * pinned-version probe and must be replaced by a supported abstraction before GO.
 * RTF/Text/INSERT behavior on other CAD inputs remains unproven.
 */
export async function probeNodeScene(input: Readonly<{
  source: Uint8Array;
  expectedSha256: string;
  versionId: string;
  fontJsonPath: string;
}>): Promise<NodeScenePocResult> {
  if (!input.source.length) throw new NodeScenePocError('SOURCE_VERIFY', 'SCENE_SOURCE_UNAVAILABLE');
  if (input.source.length > NODE_SCENE_POC_SOURCE_CAP)
    throw new NodeScenePocError('SOURCE_VERIFY', 'SCENE_ASSET_TOO_LARGE');
  if (sceneSha256(input.source) !== input.expectedSha256)
    throw new NodeScenePocError('SOURCE_VERIFY', 'SCENE_SOURCE_DIGEST_MISMATCH');

  // Browser #212 intentionally uses this same TextDecoder; encoding fidelity
  // for non-UTF8 legacy DXFs is NOT implied by this experiment.
  const text = new TextDecoder().decode(input.source);
  if (!/(?:^|\n)\s*0\s*\r?\nSECTION\s*\r?\n/.test(text) ||
      !/(?:^|\n)\s*0\s*\r?\nEOF\s*$/.test(text))
    throw new NodeScenePocError('DXF_PARSE', 'SCENE_DXF_PARSE_FAILED');

  let font: ReturnType<FontLoader['parse']>;
  try {
    const json: unknown = JSON.parse(await readFile(input.fontJsonPath, 'utf8'));
    font = new FontLoader().parse(json);
  } catch {
    throw new NodeScenePocError('FONT_PREPARE', 'SCENE_FONT_UNAVAILABLE');
  }

  const viewer = new DXFViewer();
  viewer.useCache = false;
  // Existing package calls _loadFont before fetching a DXF. In this
  // disposable probe ONLY, preload the same font without an HTTP/DOM loader.
  (viewer as unknown as { _font: typeof font })._font = font;
  const dxfUrl = 'data:text/plain;charset=utf-8;base64,' +
    Buffer.from(explicitElevation(text), 'utf8').toString('base64');
  let root: THREE.Object3D | undefined;
  let restored: THREE.Object3D | undefined;
  try {
    try { root = await viewer.getFromPath(dxfUrl, 'poc://font-preloaded') ?? undefined; }
    catch { throw new NodeScenePocError('DXF_PARSE', 'SCENE_CONVERTER_UNAVAILABLE'); }
    if (!root) throw new NodeScenePocError('DXF_PARSE', 'SCENE_CONVERTER_UNAVAILABLE');

    let counts: ReturnType<typeof preflightSceneRoot>;
    try { counts = preflightSceneRoot(root); ownedMaterials(root); }
    catch { throw new NodeScenePocError('SCENE_BUILD', 'SCENE_ASSET_TOO_LARGE'); }

    const scope = sceneScope(input.versionId, input.expectedSha256, sourceUnitFromDxf(text));
    let candidate: Awaited<ReturnType<typeof serializeSourceScene>>;
    try {
      const asset = tagImportedTree(root, scope);
      const copy = new ArrayBuffer(input.source.byteLength);
      new Uint8Array(copy).set(input.source);
      const textIndex = extractDxfText(copy);
      candidate = await serializeSourceScene(root, asset, 'CUSTOM_DTO', { textIndex });
    } catch {
      throw new NodeScenePocError('SERIALIZE', 'SCENE_SERIALIZE_FAILED');
    }
    try { restored = await restoreSourceScene(candidate.bytes, candidate.manifest, candidate.manifest); }
    catch { throw new NodeScenePocError('ROUND_TRIP', 'SCENE_VALIDATE_FAILED'); }
    let restoredObjectCount = 0;
    restored.traverse(() => { restoredObjectCount++; });
    if (restoredObjectCount !== counts.sceneNodes)
      throw new NodeScenePocError('ROUND_TRIP', 'SCENE_VALIDATE_FAILED');
    return {
      bytes: candidate.bytes,
      manifest: candidate.manifest,
      objectCount: counts.sceneNodes,
      geometryCount: counts.geometryCount,
      attributeScalars: counts.attributeScalars,
      sourceEntityCount: viewer.lastDXF?.entities?.length ?? 0,
      restoredObjectCount,
    };
  } finally {
    if (restored) release(restored);
    if (root) release(root);
  }
}
