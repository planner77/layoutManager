import { expect, test, vi } from 'vitest';

const pending = vi.hoisted(() => ({ callbacks: [] as Array<(error: Error | null, key: Buffer) => void>, active: 0, peak: 0 }));
vi.mock('node:crypto', async importOriginal => {
  const crypto = await importOriginal<typeof import('node:crypto')>();
  return { ...crypto, scrypt: (_password: string, _salt: Buffer, _length: number, _options: object, callback: (error: Error | null, key: Buffer) => void) => {
    pending.active++; pending.peak = Math.max(pending.peak, pending.active);
    pending.callbacks.push((error, key) => { pending.active--; callback(error, key); });
  } };
});
import { hashDeletePassword } from '../../server/password';

test('TC-DELETE-001: KDF capacity limits real crypto submissions, rejects overflow, and releases failed slots', async () => {
  const settled: Array<{ ok: boolean; error?: unknown }> = [];
  const tasks = Array.from({ length: 19 }, () => hashDeletePassword('bounded-password').then(() => { settled.push({ ok: true }); }, error => { settled.push({ ok: false, error }); }));
  await vi.waitFor(() => expect(pending.callbacks).toHaveLength(2));
  await vi.waitFor(() => expect(settled).toHaveLength(1));
  expect(settled[0]).toMatchObject({ ok: false, error: { code: 'KDF_BUSY', status: 429 } });
  pending.callbacks.shift()!(new Error('injected KDF failure'), Buffer.alloc(32));
  for (let completed = 1; completed < 18; completed++) {
    await vi.waitFor(() => expect(pending.callbacks.length).toBeGreaterThan(0));
    pending.callbacks.shift()!(null, Buffer.alloc(32));
  }
  await Promise.all(tasks);
  expect(settled.filter(result => result.ok)).toHaveLength(17);
  expect(pending.peak).toBe(2); expect(pending.active).toBe(0);
  const recovered = hashDeletePassword('recovered-password');
  await vi.waitFor(() => expect(pending.callbacks).toHaveLength(1));
  pending.callbacks.shift()!(null, Buffer.alloc(32));
  await expect(recovered).resolves.toMatch(/^scrypt\$v1\$/);
});
