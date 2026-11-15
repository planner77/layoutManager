/** TC-T201-21: isolated synthetic HTTP transport control; no application server. */
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, request } from '@playwright/test';
import { closeApi, closeRouteFetch } from '../greenfield-e2e/direct-api-transport';

type Observed = { path: string; socket: number; method: string; headers: IncomingHttpHeaders; body: string };
const seen: Observed[] = [], sockets = new WeakMap<Socket, number>();
let socketCount = 0;
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const row = { path: req.url!, socket: sockets.get(req.socket)!, method: req.method!, headers: req.headers, body: Buffer.concat(chunks).toString() };
  seen.push(row);
  if (row.path.startsWith('/reset')) { req.socket.destroy(); return; }
  if (row.path.startsWith('/cookie')) res.setHeader('set-cookie', 'fixture=synthetic; Path=/; HttpOnly');
  res.setHeader('content-type', row.path === '/' ? 'text/html' : 'application/json');
  res.end(row.path === '/' ? '<!doctype html><title>Owned transport control</title>' : JSON.stringify({ ok: true }));
});
server.on('connection', socket => sockets.set(socket, ++socketCount));
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert(address && typeof address !== 'string');
const baseURL = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
const standalone = await request.newContext({ baseURL });
try {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const independent = await browser.newContext({ baseURL });
  const clients = [standalone, page.request, independent.request].map(closeApi);
  assert.equal(closeApi(standalone), clients[0]);
  assert.equal(closeApi(clients[0]), clients[0]);
  for (const [i, api] of clients.entries()) {
    await api.get(`/cookie-${i}`);
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const) {
      await api[method](`/api-${i}-${method}`, {
        headers: { Connection: 'keep-alive', 'X-CSRF-Token': 'synthetic-csrf', 'Idempotency-Key': `synthetic-${i}-${method}` },
        ...(method === 'get' || method === 'head' ? {} : { data: { value: `${i}-${method}` } }),
      });
      const row = seen.at(-1)!;
      assert.equal(row.headers.connection, 'close');
      assert.equal(row.headers.cookie, 'fixture=synthetic');
      assert.equal(row.headers['x-csrf-token'], 'synthetic-csrf');
      assert.equal(row.headers['idempotency-key'], `synthetic-${i}-${method}`);
      assert.equal(row.method, method === 'fetch' ? 'GET' : method.toUpperCase());
      if (method !== 'get' && method !== 'head') assert.equal(row.body, JSON.stringify({ value: `${i}-${method}` }));
    }
  }
  assert.equal((await context.cookies())[0].value, 'synthetic');
  await page.goto('/');
  assert.equal(seen.find(row => row.path === '/')!.headers.cookie, 'fixture=synthetic');

  await page.route('**/routed*', async route => {
    const response = await closeRouteFetch(route, { headers: { 'X-Override': 'new', CONNECTION: 'keep-alive' } });
    await route.fulfill({ response });
  });
  const routed = () => page.evaluate(async () => {
    const response = await fetch('/routed', { method: 'POST', headers: { 'x-csrf-token': 'synthetic-csrf', 'idempotency-key': 'route-key', 'x-override': 'old' }, body: 'same-route-body' });
    return response.status;
  });
  assert.equal(await routed(), 200);
  assert.equal(await routed(), 200);
  await delay(6_000);
  for (const [i, api] of clients.entries()) assert.equal((await api.get(`/idle-${i}`)).status(), 200);
  assert.equal(await routed(), 200);
  const routedRows = seen.filter(row => row.path === '/routed');
  assert.equal(routedRows.length, 3);
  for (const row of routedRows) {
    assert.equal(row.headers.connection, 'close');
    assert.equal(row.headers.cookie, 'fixture=synthetic');
    assert.equal(row.headers['x-csrf-token'], 'synthetic-csrf');
    assert.equal(row.headers['idempotency-key'], 'route-key');
    assert.equal(row.headers['x-override'], 'new');
    assert.equal(row.method, 'POST'); assert.equal(row.body, 'same-route-body');
  }
  const nodeRows = seen.filter(row => row.path !== '/' && row.path !== '/favicon.ico');
  assert(nodeRows.every(row => row.headers.connection === 'close'));
  assert.equal(new Set(nodeRows.map(row => row.socket)).size, nodeRows.length);

  // No wrapper/global headers are installed on browser navigation or fetch.
  await page.evaluate(() => fetch('/browser').then(response => response.text()));
  assert.notEqual(seen.find(row => row.path === '/browser')!.headers.connection, 'close');
  for (const [i, api] of clients.entries()) {
    await assert.rejects(api.post(`/reset-${i}`, { data: 'one-attempt', maxRetries: 3 }), /ECONNRESET|socket hang up/);
    assert.equal(seen.filter(row => row.path === `/reset-${i}`).length, 1);
  }
  let routeError: unknown;
  await page.route('**/reset-route', async route => {
    try { await closeRouteFetch(route, { maxRetries: 3 }); }
    catch (error) { routeError = error; }
    finally { await route.abort(); }
  });
  assert.equal(await page.evaluate(() => fetch('/reset-route', { method: 'POST', body: 'one-route-attempt' }).then(() => false, () => true)), true);
  assert.match(String(routeError), /ECONNRESET|socket hang up/);
  assert.equal(seen.filter(row => row.path === '/reset-route').length, 1);
  const resets = seen.filter(row => row.path.startsWith('/reset'));
  assert(resets.every(row => row.method === 'POST' && row.headers.connection === 'close'));
  assert.equal(new Set(resets.map(row => row.socket)).size, 4);
  console.log(JSON.stringify({ result: 'PASS', apiContexts: 3, apiVerbs: 7, routeForwards: routedRows.length, idleMs: 6000, nodeRequestsWithDistinctClosedSockets: nodeRows.length, resetPostAttempts: resets.length, browserForcedClose: false, cookieAndHeadersPreserved: true }));
} finally {
  await standalone.dispose(); await browser.close();
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
}
