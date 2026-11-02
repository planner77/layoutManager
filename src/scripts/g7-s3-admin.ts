/**
 * Explicit one-shot S3-2 Admin bootstrap/recovery on DISPOSABLE SQLite only.
 * This CLI cannot initialize or recover a real operating administrator.
 * Never invoked by App startup, Docker migrator, Compose or release workflow.
 */
import {randomBytes} from 'node:crypto';
import {resolveG7S3PreviewGate} from '../server/g7-operational/preview-gate';
import {openG7S3PreviewDb} from '../server/g7-operational/preview-db';
import {createG2IsolatedStore} from '../server/g7-staging/g2-store';
import {executeAdminSetup} from '../server/auth/admin-setup';

if(process.argv.slice(2).join(' ')!=='--ack-disposable-only')
  throw new Error('G7_S3_ADMIN_EXPLICIT_ACK_REQUIRED');
const gate=resolveG7S3PreviewGate(process.env);
if(!gate) throw new Error('G7_S3_DISPOSABLE_ADMIN_ONLY');
const db=openG7S3PreviewDb(gate);
try {
  const action=await executeAdminSetup(process.env,createG2IsolatedStore(db),
    'g7s3_'+randomBytes(8).toString('hex'));
  process.stdout.write('G7_S3_DISPOSABLE_ADMIN_ACTION='+action.kind+'\n');
} finally {db.close();}
