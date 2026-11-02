/**
 * #104 G2: explicitly invoked one-shot local Admin creation/recovery.
 * No module side effects, application route, startup hook or production DB wiring.
 * Only an approved isolated caller can supply the store and secret file.
 */
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { decideAdminSetup, type SetupState } from './bootstrap';
import { assertLocalPassword, hashLocalPassword } from './password';

type Environment = Readonly<Record<string, string | undefined>>;

export type AdminBootstrapCommand = Readonly<{
  username: string;
  passwordHash: string;
  now: number;
  requestId: string;
}>;
export type AdminRecoveryCommand = Readonly<{
  targetId: string;
  nonce: string;
  passwordHash: string;
  now: number;
  requestId: string;
}>;
export type AdminSetupStore = Readonly<{
  /** Snapshot is advisory only; each write MUST recheck within a DB transaction. */
  snapshot(recoveryNonce: string | undefined): SetupState;
  bootstrap(command: AdminBootstrapCommand): string;
  recover(command: AdminRecoveryCommand): void;
}>;
export type AdminSetupResult =
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'bootstrap'; userId: string }>
  | Readonly<{ kind: 'recover'; targetId: string }>;

/**
 * Strict Linux/container secret-file contract: absolute path is checked by
 * decideAdminSetup, O_NOFOLLOW blocks final symlinks, ownership must match the
 * executor, and group/other read bits must be absent. Never include a file
 * path or its contents in an exception, log or return value.
 *
 * Operators should create files without a final newline (e.g. printf, not
 * echo). A read-only Compose secret with mode 0444 is intentionally rejected.
 */
function readRestrictedPassword(file: string): string {
  let fd: number | undefined;
  let bytes: Buffer | undefined;
  try {
    if (process.platform === 'win32' || typeof process.getuid !== 'function' ||
        typeof constants.O_NOFOLLOW !== 'number') {
      throw new Error('G2_SECRET_PLATFORM_UNSUPPORTED');
    }
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 8 || stat.size > 1024 ||
        (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) {
      throw new Error('G2_SECRET_METADATA_INVALID');
    }
    bytes = readFileSync(fd);
    if (bytes.length !== stat.size || bytes.includes(0) ||
        bytes.includes(10) || bytes.includes(13)) {
      throw new Error('G2_SECRET_CONTENT_INVALID');
    }
    const password = bytes.toString('utf8');
    if (!Buffer.from(password, 'utf8').equals(bytes)) {
      throw new Error('G2_SECRET_ENCODING_INVALID');
    }
    assertLocalPassword(password);
    return password;
  } catch {
    throw new Error('G2_SECRET_INVALID');
  } finally {
    bytes?.fill(0);
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Disabled by default; this method is never called automatically.
 * Separate DB transaction/unique constraints, not the snapshot, decide
 * whether a concurrent bootstrap or reused recovery nonce may commit.
 */
export async function executeAdminSetup(
  env: Environment,
  store: AdminSetupStore,
  requestId: string,
  now: number = Date.now(),
): Promise<AdminSetupResult> {
  const decision = decideAdminSetup(env, store.snapshot(env.ADMIN_RECOVERY_ONCE_ID));
  if (decision.kind === 'disabled') return { kind: 'disabled' };
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(requestId) ||
      !Number.isSafeInteger(now) || now < 0) {
    throw new Error('G2_EXECUTION_CONTEXT_INVALID');
  }

  const password = readRestrictedPassword(decision.secretFile);
  const passwordHash = await hashLocalPassword(password);
  if (decision.kind === 'bootstrap') {
    const userId = store.bootstrap({
      username: decision.username.toLowerCase(),
      passwordHash, requestId, now,
    });
    return { kind: 'bootstrap', userId };
  }
  store.recover({
    targetId: decision.targetId, nonce: decision.nonce,
    passwordHash, requestId, now,
  });
  return { kind: 'recover', targetId: decision.targetId };
}
