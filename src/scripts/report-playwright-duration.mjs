#!/usr/bin/env node
/** #197: Summarize per-test Playwright JSON results without altering pass/fail. */
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function collectTimings(report) {
  if (!report || !Array.isArray(report.suites) || !report.stats) {
    throw new Error('Invalid Playwright JSON report');
  }
  const rows = [];
  const visit = (suite, titles = []) => {
    const path = [...titles, suite.title || ''].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        rows.push({
          test: [...path, spec.title, test.projectName || ''].filter(Boolean).join(' / '),
          durationMs: results.reduce((sum, result) => sum + (result.duration || 0), 0),
          attempts: results.length,
          status: results.at(-1)?.status || 'not-run',
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, path);
  };
  for (const suite of report.suites) visit(suite);
  rows.sort((a, b) => b.durationMs - a.durationMs);
  return { rows, stats: report.stats };
}

const escapeCell = (text) => String(text).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').slice(0, 200);
const seconds = (durationMs) => (durationMs / 1000).toFixed(1);

export function formatTimings(report, label) {
  const { rows, stats } = collectTimings(report);
  const lines = [
    '### Playwright duration — ' + escapeCell(label),
    '',
    'Run elapsed: **' + seconds(stats.duration || 0) + ' s**; collected cases: **' + rows.length +
      '**; expected: ' + (stats.expected ?? 'N/A') +
      '; unexpected: ' + (stats.unexpected ?? 'N/A') +
      '; flaky: ' + (stats.flaky ?? 'N/A') + '; skipped: ' + (stats.skipped ?? 'N/A') + '.',
    '',
    '| Slowest test (top 10) | Execution (s) | Attempts | Final status |',
    '| --- | ---: | ---: | --- |',
  ];
  for (const row of rows.slice(0, 10)) {
    lines.push('| ' + escapeCell(row.test) + ' | ' + seconds(row.durationMs) +
      ' | ' + row.attempts + ' | ' + escapeCell(row.status) + ' |');
  }
  if (!rows.length) lines.push('| No tests recorded | — | — | — |');
  return lines.join('\n') + '\n';
}

function main(argv) {
  if (argv.length !== 2) throw new Error('Usage: report-playwright-duration.mjs JSON_FILE LABEL');
  const text = formatTimings(JSON.parse(readFileSync(argv[0], 'utf8')), argv[1]);
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error('Playwright timing report unavailable: ' + (error instanceof Error ? error.message : 'unknown'));
    process.exitCode = 1;
  }
}
