/**
 * #109 S3-2 — nonproduction loopback-only Auth API preview.
 * This is NOT the S3-1 Owner/release GO gate nor a production opt-in.
 * NODE_ENV=production is unconditionally OFF even if EVERY flag is true.
 */
import { requireG7S3DisposableTarget, type G7S3TestTarget } from './disposable-target';

export type G7S3PreviewGate = G7S3TestTarget & Readonly<{origin: string}>;
export function resolveG7S3PreviewGate(
  env: Readonly<Record<string, string | undefined>>,
): G7S3PreviewGate | null {
  if (env.NODE_ENV === 'production' ||
      env.G7_S3_AUTH_API_PREVIEW_ONLY !== 'true' ||
      env.G7_AUTH_ENABLED !== 'false' ||
      env.G7_CAD_WRITE_CUTOVER_ENABLED !== 'false' ||
      env.G7_OPERATION_APPROVAL_ID ||
      env.G7_OPERATION_CHANGE_ID) return null;
  try {
    const target = requireG7S3DisposableTarget(env);
    const origin = env.G7_S3_TEST_ORIGIN;
    if (!origin || !/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(origin)) return null;
    const parsed = new URL(origin);
    if (parsed.origin !== origin || Number(parsed.port) < 1024 ||
        Number(parsed.port) > 65535) return null;
    return {...target, origin};
  } catch { return null; }
}
