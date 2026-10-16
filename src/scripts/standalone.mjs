import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export function standalonePort(args, inherited = process.env.PORT || '3000') {
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--port')) {
    throw new Error('Usage: npm run start -- --port <1..65535>');
  }
  const port = args.length === 2 ? args[1] : inherited;
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return String(Number(port));
}

export function prepareStandaloneAssets(project) {
  const standalone = path.join(project, '.next/standalone');
  if (!existsSync(path.join(standalone, 'server.js'))) {
    throw new Error('Next.js standalone server.js is missing');
  }
  const staticTarget = path.join(standalone, '.next/static');
  mkdirSync(path.dirname(staticTarget), { recursive: true });
  cpSync(path.join(project, '.next/static'), staticTarget, { recursive: true, force: true });
  // Includes generated CadKorean typeface, original NanumGothic TTF/license,
  // and LibreDWG ESM/WASM created by run.mjs before next build.
  cpSync(path.join(project, 'public'), path.join(standalone, 'public'), { recursive: true, force: true });
}
