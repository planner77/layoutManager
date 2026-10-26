/** S2 OFFLINE ONLY: private attestation stays on the machine; no network, DB,
 * CAD object, S3, secret or hostname is accessed by this command.
 * READY_FOR_OWNER_REVIEW is NOT permission to deploy.
 */
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessS2Readiness } from '../server/g7-staging/s2-readiness';
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
function loadPrivate(file: string): unknown {
  if (!isAbsolute(file)) throw new Error('G7_S2_ABSOLUTE_PATH_REQUIRED');
  if (lstatSync(file).isSymbolicLink()) throw new Error('G7_S2_SYMLINK_DENIED');
  const absolute = realpathSync(file), root=realpathSync(projectRoot);
  const rel=relative(root,absolute);
  if (rel==='' || (!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel)))
    throw new Error('G7_S2_PRIVATE_FILE_INSIDE_REPOSITORY');
  const metadata=lstatSync(absolute);
  if (!metadata.isFile() || metadata.size<2 || metadata.size>64*1024)
    throw new Error('G7_S2_FILE_INVALID');
  return JSON.parse(readFileSync(absolute,'utf8')) as unknown;
}
if (process.argv.length!==3) {
  process.stderr.write('Usage: npx tsx scripts/g7-s2-readiness.ts /absolute/private/s2.json\n');
  process.exitCode=2;
} else {
  try {
    const result=assessS2Readiness(loadPrivate(process.argv[2]));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.state!=='READY_FOR_OWNER_REVIEW') process.exitCode=3;
  } catch {
    process.stderr.write('G7_S2_ATTESTATION_UNAVAILABLE_OR_INVALID\n');
    process.exitCode=2;
  }
}
