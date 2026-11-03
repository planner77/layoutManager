/**
 * #218 P1-A2: a real DXF-to-Object3D-to-validated-DTO-to-restore test.
 * Evidence is only for synthetic fixtures; no G7, SceneRepository, live
 * client Scene Builder or production worker is mocked/claimed as verified.
 */
import { test, expect, chromium, type Browser, type BrowserContext, type Page, type ConsoleMessage } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { validateStoredScenePayload, SCENE_PAYLOAD_LIMITS } from '../../domain/scene-payload';
import { sceneSha256 } from '../../domain/scene-digest';
import { a2CycleDxf, a2ExplosionDxf, a2SyntheticDxf } from './fixtures';
import { A2_EXPANSION_LIMIT, A2_SOURCE_LIMIT, preflightA2Dxf } from './dxf-risk-preflight';
import type { A2Input, A2Packet, A2Inventory } from './headless-browser';

const FIXTURE_VERSION = '11111111-1111-4111-8111-111111111111';
const bytes = new TextEncoder().encode(a2SyntheticDxf);
const sha = createHash('sha256').update(bytes).digest('hex');
const executablePath = process.env.A2_CHROMIUM_EXECUTABLE || undefined;
// Independent limits are deliberately BELOW the existing 180s test and 15m
// container limits. An uncompleted conversion must fail, never look READY.
const A2_LAUNCH_TIMEOUT_MS = 25_000;
const A2_NAVIGATION_TIMEOUT_MS = 20_000;
const A2_CONVERTER_TIMEOUT_MS = 60_000;
async function bounded<T>(
  name: string, ms: number, action: () => Promise<T>, phase: () => string = () => 'UNOBSERVED',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() =>
          reject(new Error('A2_TIMEOUT:' + name + ':LAST_PHASE=' + phase())), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
function note(stage: string): void {
  // Fixed synthetic-only milestones. Do not log CAD payloads, SHA or font paths.
  console.info('A2_HOST_PHASE:' + stage);
}

function projectFont(): string {
  // Exact project TTF input and the production scripts/fonts.mjs glyph family.
  const source = readFileSync('public/fonts/NanumGothic-Regular.ttf');
  const parsed = new TTFLoader().parse(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  );
  parsed.familyName = 'CAD Korean';
  // TTFLoader's TypeScript declaration flattens metadata to strings, while
  // scripts/fonts.mjs normalizes the real font's nested language records.
  // Narrow the JSON metadata, not the font/glyph object or the TS compiler.
  const info = (parsed as unknown as {
    original_font_information?: Record<string, unknown>;
  }).original_font_information;
  if (info) {
    for (const key of ['fontFamily','fullName','postScriptName','preferredFamily','uniqueID']) {
      if (info[key]) info[key] = { en: 'CAD Korean' };
    }
  }
  if (!parsed.glyphs['한'] || !parsed.glyphs['글'])
    throw new Error('A2_KOREAN_GLYPHS_NOT_PROVEN');
  return JSON.stringify(parsed);
}
async function browserFor(software: boolean): Promise<Browser> {
  note(software ? 'SWIFT_CHROMIUM_LAUNCH' : 'BASELINE_CHROMIUM_LAUNCH');
  // No user session, Next.js request handler, hidden user tab or G7 bypass.
  // Browser sandbox is NOT verified here: the disposable, networkless test
  // container supplies the outer process boundary. Prod sandbox is a GO gate.
  const browser = await bounded('CHROMIUM_LAUNCH', A2_LAUNCH_TIMEOUT_MS, () => chromium.launch({
    headless: true, executablePath,
    chromiumSandbox: false,
    args: software ? ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] : [],
  }));
  note(software ? 'SWIFT_CHROMIUM_STARTED' : 'BASELINE_CHROMIUM_STARTED');
  return browser;
}
async function prepare(context: BrowserContext, script: string, font: string,
  errors: string[]): Promise<Page> {
  await context.route('**/fonts/CadKorean.typeface.json', r => {
    note('FONT_RESOURCE_REQUESTED');
    return r.fulfill({ status: 200, contentType: 'application/json', body: font });
  });
  await context.route('**/__a2.js', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  await context.route('**/__a2', r =>
    r.fulfill({ status: 200, contentType: 'text/html',
      body: '<!doctype html><html><body><script src="/__a2.js"></script></body></html>' }));
  const page = await context.newPage();
  page.on('pageerror', e => {
    // Error class only, no upstream message, stack, URL or DXF content.
    errors.push(e.name);
    note('PAGEERROR_' + (e.name === 'ReferenceError' ? 'REFERENCE' : 'OTHER'));
  });
  page.on('requestfailed', r => {
    // A route failure is relevant for the offline font/script diagnosis;
    // never log the original resource URL or browser error text.
    note(r.url().endsWith('/CadKorean.typeface.json') ? 'FONT_REQUEST_FAILED' : 'RESOURCE_REQUEST_FAILED');
  });
  note('HARNESS_NAVIGATE_START');
  await bounded('HARNESS_NAVIGATE', A2_NAVIGATION_TIMEOUT_MS,
    () => page.goto('http://p1-a2.invalid/__a2').then(() => undefined));
  await bounded('HARNESS_READY', A2_NAVIGATION_TIMEOUT_MS,
    () => page.waitForFunction(() => !!window.sceneA2).then(() => undefined));
  note('HARNESS_READY');
  return page;
}
function sameInventory(a: A2Inventory, b: A2Inventory): void {
  expect(a.nodes).toBe(b.nodes);
  expect(a.geometry).toBe(b.geometry);
  expect(a.rows.length).toBe(b.rows.length);
  for (let i = 0; i < a.rows.length; i++) {
    const l = a.rows[i], r = b.rows[i];
    expect([r.type,r.name,r.layer,r.visible,r.id,r.vertices])
      .toEqual([l.type,l.name,l.layer,l.visible,l.id,l.vertices]);
    expect(r.matrix.length).toBe(l.matrix.length);
    l.matrix.forEach((n,k) => expect(Math.abs(n-r.matrix[k])).toBeLessThanOrEqual(1e-5));
    expect(r.wcs === null).toBe(l.wcs === null);
    l.wcs?.forEach((n,k) => expect(Math.abs(n-r.wcs![k])).toBeLessThanOrEqual(1e-5));
  }
  a.bbox.forEach((n,k) => expect(Math.abs(n-b.bbox[k])).toBeLessThanOrEqual(1e-5));
}
async function runProof(page: Page, software: boolean): Promise<A2Packet> {
  const input: A2Input = {
    source: Array.from(bytes), expectedSha256: sha,
    versionId: FIXTURE_VERSION, requireSwiftShader: software,
  };
  let lastPhase = 'BEFORE_BROWSER_START';
  const onConsole = (message: ConsoleMessage) => {
    const match = /^A2_PHASE:([A-Z_]+)$/.exec(message.text());
    if (match) {
      lastPhase = match[1];
      // Explicitly named phases only: never echo arbitrary page console text.
      note('BROWSER_' + lastPhase);
    }
  };
  page.on('console', onConsole);
  try {
    return await bounded('DXF_TO_SCENE', A2_CONVERTER_TIMEOUT_MS,
      () => page.evaluate(value => window.sceneA2.run(value), input), () => lastPhase);
  } finally {
    page.off('console', onConsole);
  }
}
test('P1-A2 real synthetic conversion: isolated SwiftShader versus browser baseline, full DTO and restore', async () => {
  test.setTimeout(180_000);
  const limit = preflightA2Dxf(bytes);
  expect(limit).toMatchObject({ model: 7, blocks: 2 });
  expect(limit.expandedBound).toBeGreaterThanOrEqual(7);
  note('BUNDLE_START');
  const bundle = await build({
    entryPoints: ['tests/a2/headless-browser.ts'], bundle: true,
    platform: 'browser', format: 'iife', write: false, logLevel: 'silent',
  });
  note('BUNDLE_DONE');
  note('FONT_PREPARE_START');
  const font = projectFont();
  note('FONT_PREPARE_DONE');
  const errors: string[] = [];
  note('SWIFT_TEST_START');
  const headless = await browserFor(true);
  let first: A2Packet;
  try {
    const context = await headless.newContext({ serviceWorkers: 'block' });
    const page = await prepare(context, bundle.outputFiles[0].text, font, errors);
    note('SWIFT_DXF_CONVERSION_START');
    first = await runProof(page, true);
    note('SWIFT_DXF_CONVERSION_DONE');
    expect(first.renderer.toLowerCase()).toContain('swiftshader');
    expect(first.fontTextHits).toBeGreaterThanOrEqual(3);
    expect(first.koreanHits).toBeGreaterThanOrEqual(2);
    expect(first.sourceEntities).toBeGreaterThanOrEqual(7);
    expect(first.original.nodes).toBeGreaterThan(1);
    expect(first.original.geometry).toBeGreaterThan(1);
    expect(first.bytes.length).toBeGreaterThan(0);
    expect(first.bytes.length).toBeLessThanOrEqual(SCENE_PAYLOAD_LIMITS.bytes);
    expect(first.manifest).toMatchObject({ state: 'READY', format: 'CUSTOM_DTO',
      byteLength: first.bytes.length, sha256: sceneSha256(Uint8Array.from(first.bytes)) });
    validateStoredScenePayload(Uint8Array.from(first.bytes), first.manifest);
    sameInventory(first.original, first.restored);

    // Durable byte-level file round-trip in isolated temporary storage only.
    // This does NOT establish SceneRepository CAS, audit or S3 publishing.
    const dir = await mkdtemp(join(tmpdir(), 'a2-scene-synthetic-'));
    try {
      const file = join(dir, 'candidate.dto.json');
      await writeFile(file, Uint8Array.from(first.bytes));
      const persisted = await readFile(file);
      validateStoredScenePayload(persisted, first.manifest);
      expect(sceneSha256(persisted)).toBe(first.manifest.sha256);
    } finally { await rm(dir, {recursive: true, force: true}); }
    note('SWIFT_POST_COMPLETION_ASYNC_WINDOW');
    await page.waitForTimeout(600); // detect late asynchronous page errors
    await context.close();
  } finally { await headless.close(); }

  // Launch a completely separate Chromium process: simulated test restart.
  // This is NOT a kill-9, OOM, lease-recovery or operational restart test.
  note('BASELINE_TEST_START');
  const baseline = await browserFor(false);
  try {
    const context = await baseline.newContext({ serviceWorkers: 'block' });
    const page = await prepare(context, bundle.outputFiles[0].text, font, errors);
    note('BASELINE_DXF_CONVERSION_START');
    const existingBuilderBaseline = await runProof(page, false);
    note('BASELINE_DXF_CONVERSION_DONE');
    sameInventory(first.original, existingBuilderBaseline.original);
    expect(existingBuilderBaseline.manifest.scope).toEqual(first.manifest.scope);
    expect(existingBuilderBaseline.manifest.sha256).toBe(first.manifest.sha256);
    const restoredInNewProcess = await page.evaluate(
      packet => window.sceneA2.restore(packet), {bytes: first.bytes, manifest: first.manifest});
    sameInventory(first.original, restoredInNewProcess);
    await page.waitForTimeout(600);
    await context.close();
  } finally { await baseline.close(); }
  expect(errors).toEqual([]);
  console.log('A2_SYNTHETIC_EVIDENCE', JSON.stringify({
    software:'SwiftShader', model:limit.model, expandedBound:limit.expandedBound,
    nodes:first.original.nodes, geometry:first.original.geometry,
    sourceEntities:first.sourceEntities, textHits:first.fontTextHits,
    koreanHits:first.koreanHits, dtoBytes:first.bytes.length,
    parseMs: Math.round(first.parseMs), serializeMs: Math.round(first.serializeMs),
    latePageErrors: errors.length, compare:'test-harness browser baseline, NOT viewer UI',
  }));
});
test('P1-A2 watchdog reports a stalled stage as failure, never as READY', async () => {
  // Synthetic never-resolving promise: exercise only the *diagnostic* watchdog.
  // No browser/Scene work is mocked into an artificial successful conversion.
  await expect(bounded('SYNTHETIC_STALL', 25,
    () => new Promise<never>(() => {}), () => 'DXF_PARSE_START'))
    .rejects.toThrow('A2_TIMEOUT:SYNTHETIC_STALL:LAST_PHASE=DXF_PARSE_START');
});
test('P1-A2 strict preparse fail-closed: unsupported, nested explosion, cycle, source cap', () => {
  expect(() => preflightA2Dxf(new TextEncoder().encode(
    a2SyntheticDxf.replace('\nLINE\n', '\n3DSOLID\n'))))
    .toThrowError('A2_ENTITY_UNSUPPORTED');
  expect(() => preflightA2Dxf(new TextEncoder().encode(a2ExplosionDxf())))
    .toThrowError('A2_EXPANSION_LIMIT');
  expect(() => preflightA2Dxf(new TextEncoder().encode(a2CycleDxf())))
    .toThrowError('A2_BLOCK_CYCLE');
  expect(() => preflightA2Dxf(new Uint8Array(A2_SOURCE_LIMIT+1)))
    .toThrowError('A2_SOURCE_LIMIT');
  expect(A2_EXPANSION_LIMIT).toBe(SCENE_PAYLOAD_LIMITS.nodes);
  expect(SCENE_PAYLOAD_LIMITS).toMatchObject({
    bytes:32*1024*1024, nodes:100_000, attributeScalars:2_000_000, depth:128,
  });
});
