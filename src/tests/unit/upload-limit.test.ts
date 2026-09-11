import { describe, expect, test } from 'vitest';
import { exceedsUploadLimit, MIB_BYTES, uploadLimitDiagnostic } from '../../features/cad-upload/upload-limit';

describe('upload size preflight', () => {
  test('uses binary MiB and permits both exact and lower boundaries', () => {
    expect(exceedsUploadLimit({ size: 100 * MIB_BYTES - 1 }, 100)).toBe(false);
    expect(exceedsUploadLimit({ size: 100 * MIB_BYTES }, 100)).toBe(false);
    expect(exceedsUploadLimit({ size: 100 * MIB_BYTES + 1 }, 100)).toBe(true);
    expect(exceedsUploadLimit({ size: 7 * MIB_BYTES + 1 }, 7)).toBe(true);
  });

  test('builds a local diagnostic with the configured limit', () => {
    expect(uploadLimitDiagnostic(7)).toMatchObject({ code: 'FILE_TOO_LARGE', httpStatus: null, requestId: null, outcome: 'failed', summary: expect.stringContaining('7 MiB'), guidance: expect.stringContaining('7 MiB') });
  });
});
