import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { appEnvironment, project } from './env.mjs';
import { prepareWasm } from './wasm.mjs';
import { prepareFonts } from './fonts.mjs';
import { standalonePort, prepareStandaloneAssets } from './standalone.mjs';
import { hasFatalModuleDiagnostic } from './build-diagnostics.mjs';

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
// Next/Webpack may exit 0 despite a missing named export in a browser Worker.
 // Tee the full build log to the caller while blocking such release warnings.
const isBuild = action === 'build';
const child = spawn(command, args, {
  cwd: project, env: childEnv,
  stdio: isBuild ? ['inherit', 'pipe', 'pipe'] : 'inherit',
});
let buildLogTail = '';
let brokenModuleImport = false;
if (isBuild) {
  const forward = (source, destination) => {
    source?.on('data', bytes => {
      destination.write(bytes);
      buildLogTail = (buildLogTail + bytes.toString('utf8')).slice(-16384);
      if (hasFatalModuleDiagnostic(buildLogTail)) brokenModuleImport = true;
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Command could not start'); process.exitCode = 1; });
// 'close' waits for stdout/stderr to drain, including last-chunk import warnings.
child.on('close', code => {
  if (action === 'build' && code === 0) {
    if (brokenModuleImport) {
      console.error('Production build has unresolved module imports/exports; release blocked.');
      process.exitCode = 1;
      return;
    }
    try { prepareStandaloneAssets(project); }
    catch { console.error('Standalone packaging failed (details suppressed).'); process.exitCode = 1; return; }
  }
  process.exitCode = code ?? 1;
});
