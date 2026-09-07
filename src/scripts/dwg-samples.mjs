import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { project } from './env.mjs';
// Public upstream test data; original CAD files stay outside Git tracking.
const revision = '5909bd2bb87fa1168838e1295188f3ee603618eb';
const samples = [
  ['Line.dwg', '358fc09c7c27737ba3b500eac122caee4c83c270f5ccb8a9f7f8f3d4b763d937'],
  ['circle.dwg', 'd2c2e592c4d501aa416bf41383b8067f7f72c32af558d1dea8481bb7d884b6dc'],
];
const directory = path.join(project, 'node_modules/.cache/cad-dwg-samples');
await mkdir(directory, { recursive: true });
for (const [name, sha256] of samples) {
  const response = await fetch(`https://raw.githubusercontent.com/mlightcad/libredwg-web/${revision}/test/test-data/2000/${name}`);
  if (!response.ok) throw new Error('Sample download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Sample checksum mismatch');
  await writeFile(path.join(directory, name), bytes);
  console.log(`${name}: ${bytes.length} bytes, checksum verified`);
}
