import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runG5Probes } from '../../scripts/g5-preview-smoke.mjs';

const root = process.cwd();
const compose = readFileSync(path.join(root, 'deploy/g5/compose.preview.yml'), 'utf8');
const nginx = readFileSync(path.join(root, 'deploy/g5/nginx.preview.conf'), 'utf8');

function serviceBlock(name: string): string {
  return compose.split('  ' + name + ':\n')[1]?.split(/\n  [a-z0-9-]+:\n|\nvolumes:/)[0] ?? '';
}

describe('Issue #107: isolated LAN preview is not an operational switch', () => {
  test('TC-P4-G5-001: PROD has proxy only; DEV publishes its own direct port', () => {
    expect(serviceBlock('g5-prod-app')).toContain('expose:');
    expect(serviceBlock('g5-prod-app')).not.toMatch(/^    ports:/m);
    expect(serviceBlock('g5-prod-nginx')).toContain('host_ip: "${G5_PROD_BIND_IP:-127.0.0.1}"');
    expect(serviceBlock('g5-dev-app')).toContain('host_ip: "${G5_DEV_BIND_IP:-127.0.0.1}"');
    expect(serviceBlock('g5-dev-app')).toContain('published: "${G5_DEV_PORT:-3301}"');
    expect(nginx).toContain('proxy_pass http://g5-prod-app:3000;');
    expect(nginx).toContain('proxy_set_header Host $http_host;');
    expect(nginx).toContain('client_max_body_size 110m;');
  });

  test('TC-P4-G5-002: test profiles, data volumes and networks are distinct', () => {
    expect(serviceBlock('g5-prod-migrate')).toContain('profiles: [g5-prod]');
    expect(serviceBlock('g5-dev-migrate')).toContain('profiles: [g5-dev]');
    expect(serviceBlock('g5-prod-app')).toContain('g5-prod-data:/data');
    expect(serviceBlock('g5-dev-app')).toContain('g5-dev-data:/data');
    expect(serviceBlock('g5-prod-app')).toContain('g5-prod-net');
    expect(serviceBlock('g5-dev-app')).toContain('g5-dev-net');
    expect(compose).not.toContain('cad-layout-viewer-data');
    expect(compose).not.toContain('container_name: cad-layout-viewer-app');
  });

  test('TC-P4-G5-003: normal read-only health/list/viewer/static/download probes', async () => {
    const paths: string[] = [];
    const mockFetch = (async (input: URL) => {
      const uri = new URL(String(input));
      paths.push(uri.pathname);
      if (uri.pathname === '/api/health') return Response.json({ status: 'ok' });
      if (uri.pathname === '/api/cad-files') return Response.json({ items: [] });
      if (uri.pathname === '/' || /^\/cad\/versions\/[a-zA-Z0-9-]+\/viewer$/.test(uri.pathname)) {
        return new Response('<html>CAD</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response('fixture', { status: 200 });
    }) as typeof fetch;
    const checked = await runG5Probes('http://127.0.0.1:3302', mockFetch, {
      viewerPath: '/cad/versions/version-1/viewer', versionId: 'version-1',
    });
    expect(checked).toHaveLength(6);
    expect(paths).toEqual([
      '/api/health', '/', '/api/cad-files', '/fonts/NanumGothic-Regular.ttf',
      '/cad/versions/version-1/viewer', '/api/cad-files/version-1/content',
    ]);
  });

  test('TC-P4-G5-004: a backend error or unexpected response is NOT PASS', async () => {
    const failing = (async () => Response.json({ status: 'unavailable' }, { status: 503 })) as typeof fetch;
    await expect(runG5Probes('http://127.0.0.1:3302', failing)).rejects.toThrow('health: HTTP 503');
    await expect(runG5Probes('http://127.0.0.1:3302', fetch, { viewerPath: '//other-host' }))
      .rejects.toThrow('Use a relative /cad/versions/ID/viewer path');
    await expect(runG5Probes('http://127.0.0.1:3302', fetch, { versionId: '../invalid' }))
      .rejects.toThrow('--version-id must be a bare version identifier');
    await expect(runG5Probes('http://user:password@127.0.0.1:3302', failing)).rejects.toThrow();
  });
  test('TC-P4-G5-007: Version ID probes real Viewer and never passes location management page', async () => {
    const requested: string[] = [];
    const mockFetch = (async (input: URL) => {
      const uri = new URL(String(input));
      requested.push(uri.pathname);
      if (uri.pathname === '/api/health') return Response.json({ status: 'ok' });
      if (uri.pathname === '/api/cad-files') return Response.json({ items: [] });
      if (uri.pathname === '/' || uri.pathname === '/cad/versions/version-1/viewer') {
        return new Response('<html>Viewer</html>', { headers: { 'content-type': 'text/html' } });
      }
      return new Response('fixture', { status: 200 });
    }) as typeof fetch;
    await expect(runG5Probes('http://127.0.0.1:3301', mockFetch, { versionId: 'version-1' }))
      .resolves.toHaveLength(6);
    expect(requested).toContain('/cad/versions/version-1/viewer');
    const before = requested.length;
    await expect(runG5Probes('http://127.0.0.1:3301', mockFetch, {
      versionId: 'version-1', viewerPath: '/cad/versions/other/viewer',
    })).rejects.toThrow('--viewer-path and --version-id must refer to the same Viewer');
    expect(requested).toHaveLength(before);
  });

});
