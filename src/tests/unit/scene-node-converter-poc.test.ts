import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { join, resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { sceneDxf } from '../fixtures/scene-dxf';
import { sceneSha256 } from '../../domain/scene-digest';
import { sceneScope } from '../../domain/cad-scene';
import { tagImportedTree } from '../../viewers/three-dxf-viewer/scene-tags';
import { preflightSceneRoot, restoreSourceScene, serializeSourceScene } from '../../viewers/three-dxf-viewer/scene-serialization';
import { NODE_DIRECT_DXF_STATUS, NODE_SCENE_POC_SOURCE_CAP, NodeScenePocError, probeNodeScene } from '../../server/scene/node-converter-poc';

const versionId = '11111111-1111-4111-8111-111111111111';
// Committed font source. The derived CadKorean.typeface.json is generated
// only by npm run dev/build, AFTER the PR CI's Unit test stage.
const fontPath = resolve(process.cwd(), 'public/fonts/NanumGothic-Regular.ttf');
const source = new TextEncoder().encode(sceneDxf);
const sha = sceneSha256(source);

describe('#208 P1-A: CPU-only server DXF converter GO/NO-GO probe (not production)', () => {
  it('records direct Node NO-GO on a valid real fixture and real committed font, without launching the unsafe upstream parser', async () => {
    // CI #457: four background WMF/RTF promises rejected with
    // ReferenceError(window is not defined) even though 962 tests passed.
    // This is a real, verified NO-GO gate, not an ignored failure or a
    // fabricated successful Scene. Node must never reach getFromPath.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(NODE_DIRECT_DXF_STATUS).toBe('NO_GO_ASYNC_DOM_DEPENDENCY');
    const failure: unknown = await probeNodeScene({
      source, versionId, expectedSha256: sha, fontPath,
    }).catch((error: unknown): unknown => error);
    expect(failure).toBeInstanceOf(NodeScenePocError);
    if (!(failure instanceof NodeScenePocError)) throw new Error('Node must return a typed NO-GO.');
    expect(failure).toMatchObject({
      phase: 'DXF_PARSE', code: 'SCENE_CONVERTER_UNAVAILABLE',
      message: 'SCENE_CONVERTER_UNAVAILABLE',
    });
    expect(JSON.stringify({phase: failure.phase, code: failure.code, message: failure.message}))
      .not.toContain(fontPath);
  }, 120_000);

  it('keeps the separate CPU-only THREE/CUSTOM_DTO validator and restore viable without claiming DXF parser fidelity', async () => {
    // This proves only the serializer/identity subsystem; constructing a
    // synthetic THREE Group is never evidence of actual DXF conversion.
    const scope = sceneScope(versionId, sha, 'DXF_INSUNITS_4');
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(30, 12, 0),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial());
    line.userData.cadLayer = 'SYNTHETIC';
    root.add(line);
    try {
      const counts = preflightSceneRoot(root);
      expect(counts.sceneNodes).toBe(2);
      const asset = tagImportedTree(root, scope);
      const candidate = await serializeSourceScene(root, asset, 'CUSTOM_DTO');
      expect(candidate.manifest).toMatchObject({
        state: 'READY', format: 'CUSTOM_DTO', scope,
        byteLength: candidate.bytes.length,
        sha256: sceneSha256(candidate.bytes),
      });
      const restored = await restoreSourceScene(candidate.bytes, candidate.manifest, candidate.manifest);
      try {
        let count = 0;
        restored.traverse(() => { count++; });
        expect(count).toBe(counts.sceneNodes);
        expect(restored.children[0]?.userData.cadSceneRef.id).toBe(asset.objects[1].ref.id);
      } finally {
        restored.traverse(obj => {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (material) for (const each of Array.isArray(material) ? material : [material]) each.dispose();
        });
      }
    } finally {
      geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
  });

  it('fails closed on a mismatched immutable source, without reading font or disclosing source', async () => {
    const corrupted = await probeNodeScene({
      source, versionId, expectedSha256: 'f'.repeat(64),
      fontPath: '/private/never-read-font.json',
    }).catch((error: unknown): unknown => error);
    expect(corrupted).toBeInstanceOf(NodeScenePocError);
    expect(corrupted).toMatchObject({
      phase: 'SOURCE_VERIFY', code: 'SCENE_SOURCE_DIGEST_MISMATCH',
      message: 'SCENE_SOURCE_DIGEST_MISMATCH',
    });
    expect(JSON.stringify({ phase: (corrupted as NodeScenePocError).phase,
      code: (corrupted as NodeScenePocError).code,
    })).not.toContain('private');
  });

  it('bounds the experimental input and reports a missing font as an allowlisted stage', async () => {
    const tooLarge = new Uint8Array(NODE_SCENE_POC_SOURCE_CAP + 1);
    await expect(probeNodeScene({
      source: tooLarge, versionId, expectedSha256: 'f'.repeat(64), fontPath,
    })).rejects.toMatchObject({ phase: 'SOURCE_VERIFY', code: 'SCENE_ASSET_TOO_LARGE' });
    await expect(probeNodeScene({
      source, versionId, expectedSha256: sha, fontPath: '/missing-font-for-poc.json',
    })).rejects.toMatchObject({ phase: 'FONT_PREPARE', code: 'SCENE_FONT_UNAVAILABLE' });
  });

  it('rejects unsupported font input types before trying to parse arbitrary bytes', async () => {
    await expect(probeNodeScene({
      source, versionId, expectedSha256: sha,
      fontPath: '/private/untrusted-font.svg',
    })).rejects.toMatchObject({
      phase: 'FONT_PREPARE', code: 'SCENE_FONT_UNAVAILABLE',
    });
  });

  it('fails closed on malformed committed-font format bytes without disclosing input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'scene-poc-invalid-ttf-'));
    try {
      const invalidFont = join(directory, 'invalid.ttf');
      await writeFile(invalidFont, 'invalid synthetic non-font bytes', 'utf8');
      const rejected: unknown = await probeNodeScene({
        source, versionId, expectedSha256: sha, fontPath: invalidFont,
      }).catch((error: unknown): unknown => error);
      expect(rejected).toBeInstanceOf(NodeScenePocError);
      expect(rejected).toMatchObject({
        phase: 'FONT_PREPARE', code: 'SCENE_FONT_UNAVAILABLE',
        message: 'SCENE_FONT_UNAVAILABLE',
      });
      if (!(rejected instanceof NodeScenePocError))
        throw new Error('Malformed TTF must fail with a safe typed error.');
      expect(rejected.message).not.toContain(invalidFont);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects structurally invalid typeface JSON without forwarding file contents or paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'scene-poc-invalid-typeface-'));
    try {
      const invalidFont = join(directory, 'invalid.json');
      await writeFile(invalidFont, JSON.stringify({glyphs: {}, resolution: 'not-a-number'}), 'utf8');
      const rejected: unknown = await probeNodeScene({
        source, versionId, expectedSha256: sha, fontPath: invalidFont,
      }).catch((error: unknown): unknown => error);
      expect(rejected).toBeInstanceOf(NodeScenePocError);
      expect(rejected).toMatchObject({
        phase: 'FONT_PREPARE', code: 'SCENE_FONT_UNAVAILABLE',
        message: 'SCENE_FONT_UNAVAILABLE',
      });
      if (!(rejected instanceof NodeScenePocError))
        throw new Error('Invalid typeface must produce a safe typed failure.');
      expect(rejected.message).not.toContain(invalidFont);
      expect(rejected.message).not.toContain('not-a-number');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
