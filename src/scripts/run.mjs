import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { appEnvironment, project } from './env.mjs';
import { prepareWasm } from './wasm.mjs';
import { prepareFonts } from './fonts.mjs';
import { standalonePort, prepareStandaloneAssets } from './standalone.mjs';

const env = appEnvironment();
mkdirSync(path.dirname(env.DATABASE_URL.slice(5)), { recursive: true });
const commands = {
  dev: ['next', 'dev', '--hostname', '0.0.0.0'],
  build: ['next', 'build', '--webpack'],
  generate: ['prisma', 'generate'],
  deploy: ['tsx', 'scripts/deploy.ts'],
  backfill: ['tsx', 'scripts/backfill-delete-passwords.ts'],
  'storage:cleanup': ['tsx', 'scripts/storage-cleanup.ts'],
  migrate: ['prisma', 'migrate', 'dev'],
  check: ['tsx', 'scripts/db-check.ts'],
};
const action = process.argv[2];
if (action !== 'start' && !commands[action]) throw new Error('Unknown command');
if (['dev', 'build'].includes(action)) { prepareFonts(); prepareWasm(); }
const start = action === 'start';
const childEnv = start ? { ...env, HOSTNAME: '0.0.0.0', PORT: standalonePort(process.argv.slice(3)) } : env;
const command = start ? process.execPath : path.join(project, 'node_modules/.bin', commands[action][0]);
const args = start ? [path.join(project, '.next/standalone/server.js')] : [...commands[action].slice(1), ...process.argv.slice(3)];
const child = spawn(command, args, { cwd: project, env: childEnv, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Command could not start'); process.exitCode = 1; });
child.on('exit', code => {
  if (action === 'build' && code === 0) {
    try { prepareStandaloneAssets(project); }
    catch (error) { console.error('Standalone packaging failed', error); process.exitCode = 1; return; }
  }
  process.exitCode = code ?? 1;
});
