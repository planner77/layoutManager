import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { closeApi } from '../greenfield-e2e/direct-api-transport';
import { masterFields } from './master-helper';

test('TC-T201-25: standalone health and image optimizer keep SVG and remote boundaries', async ({ request }) => {
  const api = closeApi(request);
  expect((await api.get('/api/health')).status()).toBe(200);
  const icon = await api.get('/icon.svg');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('image/svg+xml');
  expect(await icon.text()).toContain('<svg');

  // Existing harmless local SVG and a non-allowlisted reserved domain only.
  for (const url of ['/icon.svg', 'https://example.invalid/image.png']) {
    const image = await api.get('/_next/image', { params: { url, w: '64', q: '75' } });
    expect(image.status()).toBe(400);
    expect(image.headers()['content-type'] ?? '').not.toContain('image/svg+xml');
    expect(await image.text()).not.toContain('<svg');
  }
});

test('TC-T201-25: original download bytes and headers survive HTTP encoding negotiation', async ({ request }) => {
  const api = closeApi(request);
  const drawing = Buffer.from('0\nSECTION\n2\nENTITIES\n' + Array.from({ length: 300 }, (_, i) =>
    `0\nLINE\n8\nHTTP\n10\n${i}\n20\n0\n11\n${i + 1}\n21\n100\n`).join('') + '0\nENDSEC\n0\nEOF\n');
  const uploaded = await api.post('/api/cad-files', { multipart: {
    file: { name: 'framework-http.dxf', mimeType: 'application/octet-stream', buffer: drawing },
    ...await masterFields(api, { businessUnit: 'Framework HTTP', site: 'synthetic', building: 'A', floor: '1' }),
    registeredAt: '2026-11-15', makeCurrent: 'true', deletePassword: '1234',
  } });
  expect(uploaded.status()).toBe(201);
  const file = await uploaded.json();
  const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  for (const encoding of ['identity', 'gzip, deflate, br']) {
    const downloaded = await api.get(`/api/cad-files/${file.id}/content`, { headers: { 'Accept-Encoding': encoding } });
    expect(downloaded.status()).toBe(200);
    expect(sha256(await downloaded.body())).toBe(sha256(drawing));
    const headers = downloaded.headers();
    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['content-disposition']).toBe('attachment; filename="original.dxf"');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('private, no-store');
    // Next may stream the Response with HTTP/1.1 chunked framing. A declared
    // length must be valid, but its absence does not mean bytes were lost.
    if (headers['content-length']) {
      expect(headers['transfer-encoding']).toBeUndefined();
      expect(headers['content-length']).toMatch(/^\d+$/);
      if (!headers['content-encoding']) expect(headers['content-length']).toBe(String(drawing.length));
    } else {
      expect(headers['transfer-encoding']).toBe('chunked');
    }
    console.log('T201_HTTP_DOWNLOAD', JSON.stringify({ requestedEncoding: encoding,
      contentEncoding: headers['content-encoding'] ?? 'identity', transferEncoding: headers['transfer-encoding'] ?? null,
      contentLength: headers['content-length'] ?? null, bytes: drawing.length, sha256: sha256(drawing) }));
  }
});
