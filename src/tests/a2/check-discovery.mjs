// #218 R09: exercise Playwright's own discovery before the costly CPU proof.
// The selectors are shared with the two CI containers through --selector.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const playwright = resolve(src, 'node_modules/.bin/playwright');
const config = 'tests/a2/playwright.config.ts';
const phases = {
  p0: {
    grep: 'P0-[1-5] ',
    titles: [
      'P0-1 isolated SwiftShader WebGL2 init without DXF',
      'P0-2 actual minimal LINE DXF to DTO without preliminary WebGL',
      'P0-3 Korean TEXT/MTEXT and nested INSERT to DTO without preliminary WebGL',
      'P0-4 measure DTO_ONLY vs legacy ALL format cost on the same minimal DXF',
      'P0-5 terminating a pending browser evaluation rejects instead of READY',
    ],
  },
  required: {
    grep: 'P1-A2 ',
    titles: [
      'P1-A2 real DXF via existing browser builder: CPU SwiftShader, CUSTOM_DTO full validator, file and new-process restore',
      'P1-A2 virtual browser origin remains trustworthy',
      'P1-A2 watchdog rejects a stalled Promise',
      'P1-A2 fail-closed preparse: unsupported geometry, nested explosion, cycles and limits',
    ],
  },
};

function discover(grep) {
  const args = ['test', '--config', config, '--list', '--reporter=json'];
  if (grep !== undefined) args.push('--grep', grep);
  const result = spawnSync(playwright, args, {cwd: src, encoding: 'utf8'});
  assert.equal(result.status, 0, 'A2 Playwright discovery failed or found zero tests');
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.errors, [], 'A2 Playwright discovery reported errors');
  const specs = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      assert.equal(spec.file, 'headless.spec.ts', 'Unexpected A2 spec file');
      assert.equal(spec.tests?.length, 1, 'A2 spec must have one discovered test');
      specs.push({id: spec.id, title: spec.title});
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  assert.ok(specs.length > 0, 'A2 Playwright selected zero tests');
  return specs;
}

function verify(all, p0, required) {
  const expected = [...phases.p0.titles, ...phases.required.titles];
  const titles = specs => specs.map(spec => spec.title);
  assert.deepEqual(titles(p0), phases.p0.titles, 'P0 discovery changed');
  assert.deepEqual(titles(required), phases.required.titles, 'Required A2 discovery changed');
  assert.deepEqual(titles(all), expected, 'Full A2 inventory changed');
  const ids = specs => new Set(specs.map(spec => spec.id));
  assert.equal(ids(p0).size, 5, 'P0 must select five unique tests');
  assert.equal(ids(required).size, 4, 'Required phase must select four unique tests');
  assert.equal(ids(all).size, 9, 'A2 suite must contain nine unique tests');
  for (const id of ids(p0)) assert.ok(!ids(required).has(id), 'Phases overlap');
  assert.deepEqual(new Set([...ids(p0), ...ids(required)]), ids(all),
    'Phases must cover every discovered A2 test');
}

function main() {
  const [command, phase] = process.argv.slice(2);
  if (command === '--selector' && Object.hasOwn(phases, phase)) {
    process.stdout.write(`${phases[phase].grep}\n`);
    return;
  }
  assert.equal(command, '--check', 'Use --check or --selector p0|required');
  const all = discover();
  const p0 = discover(phases.p0.grep);
  const required = discover(phases.required.grep);
  verify(all, p0, required);

  // Regression: the same oracle must reject an empty phase, a missing test,
  // an unselected new test and a renamed title. Probe a zero-match selector
  // through the actual Playwright CLI as well (its exit status must fail).
  assert.throws(() => verify(all, [], required));
  assert.throws(() => verify(all, p0.slice(1), required));
  assert.throws(() => verify([...all, {id: 'new', title: 'new test'}], p0, required));
  assert.throws(() => verify(all.map((spec, i) => i === 0
    ? {...spec, title: 'renamed test'} : spec), p0, required));
  assert.throws(() => discover('A2_SELECTOR_MUST_MATCH_NOTHING'));
  process.stdout.write('A2_DISCOVERY_OK: p0=5 required=4 total=9; zero/missing/extra/renamed rejected\n');
}

main();
