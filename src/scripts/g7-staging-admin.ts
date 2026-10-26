/** #109 S1: explicit one-time operator bootstrap/recovery in isolated staging. */
import { randomBytes } from 'node:crypto';
import { executeAdminSetup } from '../server/auth/admin-setup';
import { resolveG7StagingGate } from '../server/g7-staging/gate';
import { openG7StagingDb } from '../server/g7-staging/db';
import { createG2IsolatedStore } from '../server/g7-staging/g2-store';

if (process.argv.slice(2).join(' ') !== '--ack-staging-only')
  throw new Error('G7_OPERATOR_ACK_REQUIRED');
const gate = resolveG7StagingGate(process.env);
if (!gate) throw new Error('G7_STAGING_DUAL_GATE_NOT_READY');
const db = openG7StagingDb(gate);
try {
  const result = await executeAdminSetup(process.env, createG2IsolatedStore(db),
    'g7stage_' + randomBytes(8).toString('hex'));
  // No password, file path, nonce or personal data in command output.
  process.stdout.write('G7_STAGING_ADMIN_ACTION=' + result.kind + '\n');
} finally { db.close(); }
