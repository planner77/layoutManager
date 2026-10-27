/**
 * #104 G2 isolated-only entry. Not connected to App startup or production DB.
 * The G1 fixture path guard rejects all operational paths.
 */
import { openG1Fixture } from '../tests/fixtures/auth-g1/store';
import { createG2IsolatedStore } from '../tests/fixtures/auth-g2/store';
import { executeAdminSetup } from '../server/auth/admin-setup';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 5 || args[0] !== '--fixture-db' ||
      args[2] !== '--request-id' || args[4] !== '--ack-isolated') {
    throw new Error('G2_ARGUMENTS_INVALID');
  }
  const db = openG1Fixture(args[1]);
  try {
    const result = await executeAdminSetup(
      process.env, createG2IsolatedStore(db), args[3],
    );
    const output = result.kind === 'bootstrap'
      ? { kind: result.kind, userId: result.userId }
      : { kind: result.kind };
    process.stdout.write(JSON.stringify(output) + '\n');
  } finally {
    db.close();
  }
}
main().catch(() => {
  // Error messages cannot reveal Secret paths, hashes or recovery identifiers.
  process.stderr.write('G2_ISOLATED_EXECUTION_FAILED\n');
  process.exitCode = 1;
});
