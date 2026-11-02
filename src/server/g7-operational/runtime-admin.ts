import { randomBytes } from 'node:crypto';
import { executeAdminSetup } from '../auth/admin-setup';
import { createG2IsolatedStore } from '../g7-staging/g2-store';
import { requireG4UserScope } from '../g7-staging/g4-store';
import { resolveG7RuntimeGate } from './runtime-gate';
import { openG7RuntimeDb } from './runtime-db';

/** Operator-only G2 bootstrap/recovery. Never called from HTTP or startup. */
export async function executeG7RuntimeAdmin(
  env: Readonly<Record<string, string | undefined>>,
): Promise<'disabled' | 'bootstrap' | 'recover'> {
  const gate = resolveG7RuntimeGate(env);
  if (gate.state !== 'ACTIVE') throw new Error('G7_RUNTIME_ADMIN_BLOCKED');
  const db = openG7RuntimeDb(gate);
  try {
    const check = () => {
      const current = resolveG7RuntimeGate(env);
      if (current.state !== 'ACTIVE' || current.approvalId !== gate.approvalId ||
          current.databasePath !== gate.databasePath || current.expiresAt !== gate.expiresAt ||
          current.origin !== gate.origin || current.cadStoragePath !== gate.cadStoragePath ||
          JSON.stringify(current.siteIds) !== JSON.stringify(gate.siteIds)) {
        throw new Error('G7_RUNTIME_ADMIN_APPROVAL_CHANGED');
      }
    };
    const store = createG2IsolatedStore(db, {}, { assertCurrent: check, now: Date.now,
      assertTarget: id => requireG4UserScope(db, id, gate.siteIds) });
    const result = await executeAdminSetup(env, store,
      'runtime_' + randomBytes(12).toString('hex'));
    return result.kind;
  } finally { db.close(); }
}
