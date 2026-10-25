/**
 * Issue #96: one-shot administrator setup decision only. No file reads, DB
 * writes, app wiring, or implicit bootstrap on module import.
 * All inputs are server-owned; usedRecoveryIds must be durable in the future.
 */
import { isAbsolute } from 'node:path';

type Environment = Readonly<Record<string, string | undefined>>;
export type AdminSetup =
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'bootstrap'; username: string; secretFile: string }>
  | Readonly<{ kind: 'recover'; targetId: string; secretFile: string; nonce: string }>;
export type SetupState = Readonly<{
  initialized: boolean;
  adminIds: readonly string[];
  usedRecoveryIds: readonly string[];
}>;

function enabled(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('관리자 초기화 설정이 올바르지 않습니다.');
}
function secretFile(file: string | undefined): string {
  if (!file || !isAbsolute(file) || file.includes('\0') || file.includes('\n') || file.includes('\r')) {
    throw new Error('절대 경로의 관리자 Secret 파일이 필요합니다.');
  }
  return file;
}

/** Plans are inert; caller must explicitly implement DB transaction & secret cleanup after approval. */
export function decideAdminSetup(env: Environment, state: SetupState): AdminSetup {
  const bootstrap = enabled(env.ADMIN_BOOTSTRAP_ENABLED);
  const recover = enabled(env.ADMIN_RECOVERY_ENABLED);
  if (bootstrap && recover) throw new Error('초기 생성과 복구 모드를 동시에 사용할 수 없습니다.');
  if (!bootstrap && !recover) return { kind: 'disabled' };
  if (bootstrap) {
    // A restart never resets an existing administrator or elevates an existing user.
    if (state.initialized || state.adminIds.length > 0) return { kind: 'disabled' };
    const username = env.ADMIN_BOOTSTRAP_USERNAME;
    if (!username || !/^[a-z][a-z0-9._-]{2,63}$/i.test(username)) {
      throw new Error('초기 관리자 사용자명이 올바르지 않습니다.');
    }
    return { kind: 'bootstrap', username, secretFile: secretFile(env.ADMIN_BOOTSTRAP_PASSWORD_FILE) };
  }
  if (!state.initialized) throw new Error('초기화되지 않은 DB에서 관리자 복구를 사용할 수 없습니다.');
  const targetId = env.ADMIN_RECOVERY_TARGET_USER_ID;
  const nonce = env.ADMIN_RECOVERY_ONCE_ID;
  if (!targetId || !state.adminIds.includes(targetId) ||
      !nonce || !/^[a-zA-Z0-9_-]{16,128}$/.test(nonce) ||
      state.usedRecoveryIds.includes(nonce)) {
    throw new Error('관리자 복구 대상 또는 단발 식별자가 올바르지 않습니다.');
  }
  return { kind: 'recover', targetId, nonce, secretFile: secretFile(env.ADMIN_RECOVERY_PASSWORD_FILE) };
}
