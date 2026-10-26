/** Child-process G3 fixture harness. Emits a result code only; no token or credential. */
import { openG1Fixture } from '../auth-g1/store';
import { createG3IsolatedStore } from './store';
import { createLoginService } from '../../../server/auth/login-service';

let input = '';
for await (const chunk of process.stdin) input += String(chunk);
try {
  const command = JSON.parse(input) as { filename: string; password: string; now: number; requestId: string };
  const db = openG1Fixture(command.filename);
  try {
    await createLoginService(createG3IsolatedStore(db)).login('user_a',
      command.password, command.now, command.requestId);
    process.stdout.write('OK');
  } finally { db.close(); }
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'DENIED';
  process.stdout.write(/^[A-Z_]+$/.test(code) ? code : 'DENIED');
}
