import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

test('#225 legacy publisher control Python transport and HOLD contracts', () => {
  execFileSync('python3', [fileURLToPath(new URL('../oci/test_legacy_publisher_control.py', import.meta.url))], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    timeout: 15_000,
    stdio: 'pipe',
  });
}, 20_000);
