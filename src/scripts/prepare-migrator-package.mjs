#!/usr/bin/env node
// Issue #66: derive the migrator runtime contract from the *locked* full install.
// CI/production compile against src/package-lock.json, never a floating npm install.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const packagePath = 'package.json';
const lockPath = 'package-lock.json';
const direct = ['@prisma/adapter-better-sqlite3', '@prisma/client', 'dotenv', 'prisma', 'tsx', 'typescript'];
const requiredPaths = [
  'node_modules/.bin/prisma', 'node_modules/.bin/tsx',
  'node_modules/@prisma/client', 'node_modules/@prisma/adapter-better-sqlite3',
  'node_modules/prisma', 'node_modules/tsx', 'node_modules/better-sqlite3'
];
const forbiddenPaths = [
  'node_modules/next', 'node_modules/react', 'node_modules/react-dom',
  'node_modules/@playwright/test', 'node_modules/vitest',
  'node_modules/eslint', 'node_modules/eslint-config-next',
  'node_modules/dxf-viewer', 'node_modules/three-dxf-viewer',
  'node_modules/@mlightcad/libredwg-web', 'node_modules/three',
  'node_modules/tailwindcss', 'node_modules/@tailwindcss/postcss'
];
const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
if (process.argv[2] === '--verify') {
  if (manifest.name !== 'cad-layout-viewer-migrator' || manifest.devDependencies) {
    throw new Error('Unexpected migrator package manifest');
  }
  for (const file of requiredPaths) {
    if (!existsSync(file)) throw new Error(`Missing migrator dependency: ${file}`);
  }
  for (const file of forbiddenPaths) {
    if (existsSync(file)) throw new Error(`Unexpected web/test dependency in migrator: ${file}`);
  }
  console.log('Migrator dependency closure: required CLI/native packages present; web/test packages absent');
} else {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (manifest.version !== lock.packages?.['']?.version) {
    throw new Error('package.json and package-lock root version mismatch');
  }
  const dependencies = {};
  for (const name of direct) {
    const pinned = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
    if (!pinned || !lock.packages?.[`node_modules/${name}`]) {
      throw new Error(`Missing locked migrator dependency: ${name}`);
    }
    if (lock.packages[`node_modules/${name}`].version !== pinned) {
      throw new Error(`Migrator direct package is not pinned to lockfile: ${name}`);
    }
    dependencies[name] = pinned;
  }
  const sqliteVersion = lock.packages?.['node_modules/better-sqlite3']?.version;
  if (!sqliteVersion) throw new Error('better-sqlite3 native dependency is not locked');
  dependencies['better-sqlite3'] = sqliteVersion;
  const runtimeManifest = {
    name: 'cad-layout-viewer-migrator',
    version: manifest.version,
    private: true,
    type: 'module',
    engines: manifest.engines,
    dependencies
  };
  writeFileSync(packagePath, `${JSON.stringify(runtimeManifest, null, 2)}\n`);
  console.log('Migrator runtime manifest generated from locked app dependencies');
}
