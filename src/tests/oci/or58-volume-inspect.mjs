/** OR58 read-only source/restore file inventory. No file contents or names to stdout beyond JSON. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = '/data';
const files = {};
async function visit(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full);
    if (entry.isDirectory()) {
      await visit(full);
    } else if (entry.isFile()) {
      const hash = crypto.createHash('sha256');
      for await (const chunk of fs.createReadStream(full)) hash.update(chunk);
      files[relative] = {size: fs.statSync(full).size, sha256: hash.digest('hex')};
    } else {
      throw new Error('OR58_NONREGULAR_VOLUME_ENTRY');
    }
  }
}
await visit(root);
const manifestBytes = fs.readFileSync('/data/db/g7-install.json');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const installation = {
  version: manifest.version,
  schemaId: manifest.schemaId,
  sourceCommitPresent: Boolean(manifest.sourceCommit),
  appImageMatchesFixed: manifest.appImage === 'ghcr.io/planner77/layoutmanager:0.58.0',
  migratorImageMatchesFixed: manifest.migratorImage === 'ghcr.io/planner77/layoutmanager:0.58.0-migrate',
  manifestSha256: crypto.createHash('sha256').update(manifestBytes).digest('hex'),
};
process.stdout.write(JSON.stringify({files, installation}) + '\n');
