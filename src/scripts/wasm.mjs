import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { project } from './env.mjs';
export function prepareWasm() {
  for (const file of ['dist/libredwg-web.js', 'wasm/libredwg-web.js', 'wasm/libredwg-web.wasm', 'README.md', 'package.json']) {
    const target = path.join(project, 'public/libredwg', file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(project, 'node_modules/@mlightcad/libredwg-web', file), target);
  }
}
