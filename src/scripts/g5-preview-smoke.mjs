// Issue #107: normal-path, read-only probes against an ISOLATED G5 preview.
// Do not use this as a penetration/security test or operational acceptance proof.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function checkedBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Use a plain http(s) origin as --base-url');
  }
  return url;
}

async function probe(base, label, pathname, expected, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(new URL(pathname, base), {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error(label + ': UNREACHABLE');
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(label + ': HTTP ' + response.status + ' (expected 200)');
  }
  if (expected === 'health') {
    const value = await response.json();
    if (value?.status !== 'ok') throw new Error(label + ': unexpected health response');
  } else if (expected === 'json') {
    const value = await response.json();
    if (!value || typeof value !== 'object') throw new Error(label + ': invalid JSON');
  } else if (expected === 'html') {
    if (!response.headers.get('content-type')?.includes('text/html')) {
      throw new Error(label + ': expected HTML');
    }
    await response.body?.cancel();
  } else {
    await response.body?.cancel();
  }
  return label + ': PASS (HTTP 200)';
}

export async function runG5Probes(baseUrl, fetchImpl = fetch, options = {}) {
  const base = checkedBaseUrl(baseUrl);
  // Validate optional paths before making any network request.
  if (options.viewerPath && !/^\/cad\/versions\/[a-zA-Z0-9-]+\/viewer$/.test(options.viewerPath)) {
    throw new Error('Use a relative /cad/versions/ID/viewer path for --viewer-path');
  }
  if (options.versionId && !/^[a-zA-Z0-9-]+$/.test(options.versionId)) {
    throw new Error('--version-id must be a bare version identifier');
  }
  const derivedViewer = options.versionId ? '/cad/versions/' + encodeURIComponent(options.versionId) + '/viewer' : undefined;
  if (options.viewerPath && derivedViewer && options.viewerPath !== derivedViewer) {
    throw new Error('--viewer-path and --version-id must refer to the same Viewer');
  }
  const viewerPath = options.viewerPath ?? derivedViewer;
  const results = [];
  results.push(await probe(base, 'health', '/api/health', 'health', fetchImpl));
  results.push(await probe(base, 'home/viewer entry', '/', 'html', fetchImpl));
  results.push(await probe(base, 'cad list API', '/api/cad-files', 'json', fetchImpl));
  results.push(await probe(base, 'static font', '/fonts/NanumGothic-Regular.ttf', 'binary', fetchImpl));
  if (viewerPath) {
    results.push(await probe(base, 'viewer page', viewerPath, 'html', fetchImpl));
  }
  if (options.versionId) {
    results.push(await probe(base, 'CAD content/download', '/api/cad-files/' + encodeURIComponent(options.versionId) + '/content', 'binary', fetchImpl));
  }
  return results;
}

function commandArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--base-url', '--viewer-path', '--version-id'].includes(key) || !value) {
      throw new Error('Usage: node src/scripts/g5-preview-smoke.mjs --base-url http://127.0.0.1:3302 [--version-id ID] [--viewer-path /cad/versions/ID/viewer]');
    }
    options[key] = value;
  }
  if (!options['--base-url']) throw new Error('--base-url is required');
  return { baseUrl: options['--base-url'], viewerPath: options['--viewer-path'], versionId: options['--version-id'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = commandArgs(process.argv.slice(2));
    const results = await runG5Probes(args.baseUrl, fetch, args);
    for (const result of results) console.log(result);
    console.log('G5 read-only normal-path smoke: PASS (not G6 field acceptance)');
  } catch (error) {
    console.error('G5 read-only normal-path smoke: FAIL - ' + (error instanceof Error ? error.message : 'unknown error'));
    process.exitCode = 1;
  }
}
