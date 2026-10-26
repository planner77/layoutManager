#!/usr/bin/env node
// Issue #66: actual OCI-distribution layer sizes for the *published* version pair.
// Excludes image config, manifest/index descriptors and attestation descriptors.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function linuxAmd64Manifest(raw, ref, inspectRaw) {
  if (Array.isArray(raw.manifests)) {
    const candidates = raw.manifests.filter(m => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64');
    if (candidates.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(candidates[0].digest)) {
      throw new Error('Expected exactly one linux/amd64 image descriptor (attestations are excluded)');
    }
    const repository = ref.replace(/@sha256:[a-f0-9]{64}$/, '').replace(/:[^/:]+$/, '');
    return inspectRaw(`${repository}@${candidates[0].digest}`);
  }
  if (Array.isArray(raw.layers) && raw.config) return raw; // single-platform manifest
  throw new Error('Unrecognized OCI manifest');
}

export function compressedLayerStats(app, migrator) {
  const layers = manifest => {
    if (!Array.isArray(manifest.layers) || manifest.layers.length === 0) throw new Error('Image has no layers');
    return manifest.layers.map(layer => {
      if (!/^sha256:[a-f0-9]{64}$/.test(layer.digest) || !Number.isSafeInteger(layer.size) || layer.size < 0) {
        throw new Error('Invalid OCI layer descriptor');
      }
      return {digest: layer.digest, size: layer.size};
    });
  };
  const appLayers = layers(app), migratorLayers = layers(migrator);
  const unique = new Map();
  for (const layer of [...appLayers, ...migratorLayers]) {
    if (unique.has(layer.digest) && unique.get(layer.digest) !== layer.size) {
      throw new Error('Conflicting size for identical layer digest');
    }
    unique.set(layer.digest, layer.size);
  }
  const total = values => values.reduce((sum, layer) => sum + layer.size, 0);
  const appBytes = total(appLayers), migratorBytes = total(migratorLayers);
  const uniqueBytes = [...unique.values()].reduce((a, b) => a + b, 0);
  return {
    appBytes, migratorBytes, pairSumBytes: appBytes + migratorBytes,
    pairUniqueBytes: uniqueBytes, sharedBytes: appBytes + migratorBytes - uniqueBytes,
    appLayerCount: appLayers.length, migratorLayerCount: migratorLayers.length
  };
}

function inspectRaw(reference) {
  return JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', '--raw', reference], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [appRef, migratorRef, summary] = process.argv.slice(2);
    if (!appRef || !migratorRef) throw new Error('Usage: measure-ghcr-pair.mjs APP_VERSION_REF MIGRATOR_VERSION_REF [summary-file]');
    const appManifest = linuxAmd64Manifest(inspectRaw(appRef), appRef, inspectRaw);
    const migratorManifest = linuxAmd64Manifest(inspectRaw(migratorRef), migratorRef, inspectRaw);
    const measured = compressedLayerStats(appManifest, migratorManifest);
    const report = [
      '## Issue #66 — Published GHCR OCI compressed layers (linux/amd64)',
      '',
      '| Reference | OCI layer bytes (compressed) | Layer count |',
      '| --- | ---: | ---: |',
      `| ${appRef} | ${measured.appBytes} | ${measured.appLayerCount} |`,
      `| ${migratorRef} | ${measured.migratorBytes} | ${measured.migratorLayerCount} |`,
      '',
      `- Sum counting shared layers twice: ${measured.pairSumBytes} bytes`,
      `- Unique layer digests counted once: ${measured.pairUniqueBytes} bytes`,
      `- Shared layer bytes (duplicate in naive sum): ${measured.sharedBytes} bytes`,
      '- Config, index, attestation descriptors and docker-save gzip are **not** included.',
      ''
    ].join('\n');
    process.stdout.write(`${report}\n`);
    if (summary) appendFileSync(summary, `${report}\n`);
  } catch (error) {
    console.error('OCI image layer measurement failed (details suppressed).');
    process.exitCode = 1;
  }
}
