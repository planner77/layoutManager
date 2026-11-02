import { pathToFileURL } from 'node:url';
import { executeG7RuntimeAdmin } from '../server/g7-operational/runtime-admin';

export async function main(args: readonly string[], env = process.env): Promise<number> {
  if (args.length !== 1 || args[0] !== '--ack-runtime-admin') {
    process.stderr.write('G7_RUNTIME_ADMIN_EXPLICIT_ACK_REQUIRED\n');
    return 1;
  }
  try {
    const result = await executeG7RuntimeAdmin(env);
    process.stdout.write('G7_RUNTIME_ADMIN_ACTION=' + result + '\n');
    return 0;
  } catch {
    process.stderr.write('G7_RUNTIME_ADMIN_BLOCKED\n');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
