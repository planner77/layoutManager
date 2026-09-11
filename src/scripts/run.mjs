import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { appEnvironment, project } from './env.mjs';
import { prepareWasm } from './wasm.mjs';
import { prepareFonts } from './fonts.mjs';
const env = appEnvironment();
mkdirSync(path.dirname(env.DATABASE_URL.slice(5)), { recursive: true });
const commands = {
  dev: ['next', 'dev', '--hostname', '0.0.0.0'],
  build: ['next', 'build', '--webpack'],
  start: ['next', 'start', '--hostname', '0.0.0.0'],
  generate: ['prisma', 'generate'],
  deploy: ['tsx', 'scripts/deploy.ts'],
  backfill: ['tsx', 'scripts/backfill-delete-passwords.ts'],
  'storage:cleanup': ['tsx', 'scripts/storage-cleanup.ts'],
  migrate: ['prisma', 'migrate', 'dev'],
  check: ['tsx', 'scripts/db-check.ts'],
};
const command = commands[process.argv[2]];
if (!command) throw new Error('Unknown command');
if (['dev','build'].includes(process.argv[2])) { prepareFonts(); prepareWasm(); }
const child = spawn(path.join(project, 'node_modules/.bin', command[0]), [...command.slice(1), ...process.argv.slice(3)], { cwd: project, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Command could not start'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
