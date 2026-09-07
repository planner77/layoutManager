import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { appEnvironment, project } from './env.mjs';
const env = appEnvironment();
mkdirSync(path.dirname(env.DATABASE_URL.slice(5)), { recursive: true });
const commands = {
  dev: ['next', 'dev', '--hostname', '127.0.0.1'],
  build: ['next', 'build', '--webpack'],
  start: ['next', 'start', '--hostname', '127.0.0.1'],
  generate: ['prisma', 'generate'],
  deploy: ['prisma', 'migrate', 'deploy'],
  migrate: ['prisma', 'migrate', 'dev'],
  check: ['tsx', 'scripts/db-check.ts'],
};
const command = commands[process.argv[2]];
if (!command) throw new Error('Unknown command');
const child = spawn(path.join(project, 'node_modules/.bin', command[0]), [...command.slice(1), ...process.argv.slice(3)], { cwd: project, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Command could not start'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
