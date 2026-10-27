/** #109 G7 S3-4: offline PRIVATE evidence-file shape validation ONLY.
 * Does not connect to OCI registry, invoke Docker/Prisma, access real DB/CAD/S3,
 * activate any service, or interpret an attested PASS as verified restoration.
 */
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessS34Readiness } from '../server/g7-operational/s3-4-readiness';

const repoRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
export function loadPrivateS34Packet(filename: string): unknown {
  if (process.platform === 'win32' || typeof process.getuid !== 'function' ||
      !path.isAbsolute(filename) || path.normalize(filename) !== filename)
    throw new Error('G7_S3_4_PRIVATE_ABSOLUTE_PATH_REQUIRED');
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() ||
      (stat.mode & 0o077) !== 0 || stat.size < 2 || stat.size > 131072)
    throw new Error('G7_S3_4_PRIVATE_FILE_DENIED');
  const real = realpathSync(filename);
  if (real !== filename || real === repoRoot ||
      real.startsWith(repoRoot + path.sep))
    throw new Error('G7_S3_4_REPOSITORY_PATH_DENIED');
  return JSON.parse(readFileSync(real, 'utf8')) as unknown;
}
function main(): void {
  try {
    if (process.argv.length !== 3) throw new Error('INVALID_ARGUMENTS');
    for (const key of ['G7_AUTH_ENABLED', 'G7_CAD_WRITE_CUTOVER_ENABLED',
      'G7_S3_GO', 'G7_S3_CAD_PREVIEW_ONLY']) {
      if (process.env[key] === 'true') throw new Error('OPERATIONAL_SWITCH_MUST_BE_OFF');
    }
    const result = assessS34Readiness(loadPrivateS34Packet(process.argv[2]));
    process.stdout.write(JSON.stringify(result) + '\n');
    // Even a complete packet cannot return an operating GO or activate a service.
    if (result.state === 'BLOCKED') process.exitCode = 2;
    else if (result.state === 'PENDING') process.exitCode = 3;
  } catch {
    // Error details may contain private paths: never leak exception messages.
    process.stdout.write(JSON.stringify({
      state: 'BLOCKED', completed: 0, operationalGo: false,
      runtimeActivated: false, reasons: ['G7_S3_4_PRIVATE_PACKET_REJECTED'],
    }) + '\n');
    process.exitCode = 2;
  }
}
const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invoked) main();
