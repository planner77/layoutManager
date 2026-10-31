/** Opt-in synthetic E2E clock, never loaded by application startup/Compose. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
const root = process.env.G7_GREENFIELD_E2E_ROOT;
function reject() { throw new Error('SYNTHETIC_CLOCK_REQUIRES_OWNED_GREENFIELD_FIXTURE'); }
if (process.env.G7_E2E_MONOTONIC_CLOCK !== 'true' || !root ||
    path.dirname(root) !== fs.realpathSync(os.tmpdir()) ||
    !/^g7-first-run-ui-[A-Za-z0-9]+$/.test(path.basename(root)) ||
    process.env.DATABASE_URL !== 'file:' + path.join(root, 'db', 'cad.sqlite') ||
    process.env.CAD_STORAGE_PATH !== path.join(root, 'cad') ||
    process.env.G7_GREENFIELD_AUTOMATED !== 'true' ||
    process.env.CAD_STORAGE_BACKEND !== 'local') reject();
for (const directory of [root, path.join(root, 'db'), path.join(root, 'cad')]) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() ||
      (stat.mode & 0o077) !== 0) reject();
}
// Fixture files were created before this server process. Start synthetic time
// after their creation even if the test host wall clock just moved backwards.
let wallStart = Date.now();
for (const name of ['cad.sqlite', 'first-admin.code']) {
  const file = path.join(root, 'db', name);
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() ||
        (stat.mode & 0o077) !== 0) reject();
    wallStart = Math.max(wallStart, Math.ceil(stat.mtimeMs));
  }
}
const monotonicStart = performance.now();
Date.now = () => wallStart + Math.floor(performance.now() - monotonicStart);
