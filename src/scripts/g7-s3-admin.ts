/** #109 S3 explicit operator-only one-shot Admin bootstrap/recovery, NOT app startup.
 * S2 Owner acceptance is not sufficient; requires release-specific private GO.
 */
import { randomBytes } from 'node:crypto';
import { executeAdminSetup } from '../server/auth/admin-setup';
import { resolveG7OperationGate } from '../server/g7-operational/gate';
import { openG7OperationalAuthDb } from '../server/g7-operational/sqlite';
import { createG2IsolatedStore } from '../server/g7-staging/g2-store';

if (process.argv.slice(2).join(' ') !== '--ack-approved-s3' ||
    process.env.G7_S3_ADMIN_ACK !== 'ONE_TIME_OPERATOR_ACTION') {
  throw new Error('G7_S3_ADMIN_OPERATOR_ACK_REQUIRED');
}
const gate = resolveG7OperationGate(process.env);
if (!gate) throw new Error('G7_S3_RELEASE_SPECIFIC_GO_REQUIRED');
const db = openG7OperationalAuthDb(gate);
try {
  const result = await executeAdminSetup(process.env, createG2IsolatedStore(db),
    'g7s3_' + randomBytes(10).toString('hex'));
  // Never print the user's identity, secret path/password or recovery nonce.
  process.stdout.write('G7_S3_ADMIN_ACTION=' + result.kind + '\n');
} finally { db.close(); }
