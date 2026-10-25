import { expect, test } from 'vitest';
import { assertLocalPassword, hashLocalPassword, verifyLocalPassword } from '../../server/auth/password';

test('TC-P4-D1-012: local scrypt password min 8 chars, salted, never plaintext', async () => {
  expect(() => assertLocalPassword('1234567')).toThrow();
  expect(() => assertLocalPassword('12345678')).not.toThrow();
  expect(() => assertLocalPassword('1234567가')).not.toThrow();
  expect(() => assertLocalPassword('\0abc12345678')).toThrow();
  const encoded = await hashLocalPassword('safe-passphrase-123');
  expect(encoded).toMatch(/^scrypt\$local-v1\$N=32768,r=8,p=3\$/);
  expect(encoded).not.toContain('safe-passphrase');
  await expect(verifyLocalPassword('safe-passphrase-123', encoded)).resolves.toBe(true);
  await expect(verifyLocalPassword('wrong-password', encoded)).resolves.toBe(false);
  await expect(verifyLocalPassword('safe-passphrase-123', 'scrypt$local-v1$malformed')).resolves.toBe(false);
});
