import { spawn } from 'node:child_process';
// Greenfield must never run the six-migration legacy deploy on its final schema.
// Use the explicit init CLI instead of the default migrator CMD.
if (process.env.G7_GREENFIELD_MODE === 'true') {
  throw new Error('G7_GREENFIELD_USE_EXPLICIT_INITIAL_INSTALL');
}
import { spawn } from 'node:child_process';
import { project } from './env.mjs';
const migrate = spawn(`${project}/node_modules/.bin/prisma`, ['migrate', 'deploy'], { cwd: project, stdio: 'inherit', env: process.env });
await new Promise<void>((resolve, reject) => { migrate.on('exit', code => code === 0 ? resolve() : reject(new Error(`migration exited ${code}`))); migrate.on('error', reject); });
const backfill = spawn(`${project}/node_modules/.bin/tsx`, ['scripts/backfill-delete-passwords.ts'], { cwd: project, stdio: 'inherit', env: process.env });
await new Promise<void>((resolve, reject) => { backfill.on('exit', code => code === 0 ? resolve() : reject(new Error(`backfill exited ${code}`))); backfill.on('error', reject); });
