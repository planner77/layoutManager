import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectTimings, formatTimings } from './report-playwright-duration.mjs';

test('CI-197-REPORT: nested suites/attempt durations and slowest order', () => {
  const report = { stats: { duration: 1500, expected: 2, unexpected: 0, flaky: 0, skipped: 0 },
    suites: [{ title: 'file.spec.ts', suites: [{ title: 'group', specs: [
      { title: 'slow', tests: [{ projectName: '', results: [
        { duration: 350, status: 'failed' }, { duration: 650, status: 'passed' },
      ] }] },
      { title: 'fast', tests: [{ results: [{ duration: 100, status: 'passed' }] }] },
    ] }] }] };
  const { rows, stats } = collectTimings(report);
  assert.equal(stats.duration, 1500);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].durationMs, 1000);
  assert.equal(rows[0].attempts, 2);
  assert.match(rows[0].test, /file.spec.ts \/ group \/ slow/);
  assert.match(formatTimings(report, 'General 1/2'), /1\.5 s/);
  assert.match(formatTimings(report, 'General 1/2'), /Slowest test/);
});

test('CI-197-REPORT: fail closed on malformed report and escape markdown', () => {
  assert.throws(() => collectTimings({ suites: [] }), /Invalid/);
  const rendered = formatTimings({ stats: { duration: 0 }, suites: [
    { title: 'a|b', specs: [{ title: 'case', tests: [{ results: [] }] }] },
  ] }, 'CI|test');
  assert.match(rendered, /CI\\\|test/);
  assert.match(rendered, /not-run/);
});
