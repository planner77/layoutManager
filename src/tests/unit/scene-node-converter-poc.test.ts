import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { sceneDxf } from '../fixtures/scene-dxf';
import { sceneSha256 } from '../../domain/scene-digest';
import { sceneScope } from '../../domain/cad-scene';
import { NODE_SCENE_POC_SOURCE_CAP, NodeScenePocError, probeNodeScene } from '../../server/scene/node-converter-poc';

const versionId = '11111111-1111-4111-8111-111111111111';
// Committed font source. The derived CadKorean.typeface.json is generated
// only by npm run dev/build, AFTER the PR CI's Unit test stage.
const fontPath = resolve(process.cwd(), 'public/fonts/NanumGothic-Regular.ttf');
const source = new TextEncoder().encode(sceneDxf);
const sha = sceneSha256(source);

describe('#208 P1-A: CPU-only server DXF converter GO/NO-GO probe (not production)', () => {
  it('builds and validates a real synthetic LINE/CIRCLE/BLOCK/INSERT/TEXT/MTEXT Scene in Node without DOM or WebGL', async () => {
    // No browser, canvas, window, mock DXF parser, or mock Scene DTO. A failure
    // is a genuine NO-GO for the unmodified pinned converter's Node approach.
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const result = await probeNodeScene({
      source, versionId, expectedSha256: sha, fontPath,
    });
    expect(result.sourceEntityCount).toBeGreaterThan(2);
    expect(result.objectCount).toBeGreaterThan(1);
    expect(result.restoredObjectCount).toBe(result.objectCount);
    expect(result.manifest).toMatchObject({
      state: 'READY', format: 'CUSTOM_DTO',
      scope: sceneScope(versionId, sha, 'DXF_INSUNITS_4'),
      byteLength: result.bytes.length,
      sha256: sceneSha256(result.bytes),
    });
  }, 120_000);

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
