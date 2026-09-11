import { describe, expect, test } from 'vitest';
import { connectionDiagnostic, diagnosticJson, diagnosticText, interpretUploadResponse } from '../../features/cad-upload/diagnostics';

const id = '11111111-1111-4111-8111-111111111111';
function response(body: BodyInit | null, status: number, headers: Record<string, string> = {}) { return new Response(body, { status, headers }); }

describe('TC-OBS-001/003: public upload response diagnostics', () => {
  test('keeps fixed public fields and correlates a safe application error', async () => {
    const result = await interpretUploadResponse(response(JSON.stringify({ error: { code: 'INVALID_METADATA', message: 'canary secret', requestId: id, stack: 'canary' } }), 400, { 'X-Request-Id': id }));
    expect(result).toMatchObject({ diagnostic: { code: 'INVALID_METADATA', httpStatus: 400, requestId: id, outcome: 'failed' } });
    expect('diagnostic' in result && Number.isNaN(Date.parse(result.diagnostic.occurredAt))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('canary');
  });

  test.each([
    [413, '<html>proxy canary</html>', 'HTTP_PAYLOAD_TOO_LARGE', 'failed'],
    [502, '<html>proxy canary</html>', 'HTTP_502', 'uncertain'],
    [504, '', 'HTTP_504', 'uncertain'],
    [500, '', 'EMPTY_ERROR_RESPONSE', 'failed'],
    [500, '{broken', 'NON_JSON_ERROR_RESPONSE', 'failed'],
    [500, '{"private":"canary"}', 'UNKNOWN_ERROR_RESPONSE', 'failed'],
  ])('classifies HTTP %s without exposing its body', async (status, body, code, outcome) => {
    const result = await interpretUploadResponse(response(body, status));
    expect(result).toMatchObject({ diagnostic: { code, outcome, httpStatus: status, requestId: null } });
    expect(JSON.stringify(result)).not.toContain('canary');
  });

  test('treats an invalid 2xx body as uncertain and accepts a valid result', async () => {
    expect(await interpretUploadResponse(response('{"ok":true}', 201, { 'X-Request-Id': id }))).toMatchObject({ diagnostic: { code: 'UPLOAD_RESULT_UNCERTAIN', outcome: 'uncertain', requestId: id } });
    const locationId = '22222222-2222-4222-8222-222222222222';
    expect(await interpretUploadResponse(response(JSON.stringify({ id, locationId, requestId: id, version: 1, displayName:'[BU][SITE][B][1]_V1', originalFilename:'one.dxf', duplicateCount: 0 }), 201))).toEqual({ result: { id, locationId, requestId: id, version: 1, displayName:'[BU][SITE][B][1]_V1', originalFilename:'one.dxf', duplicateCount: 0 } });
  });

  test('connection and exported text contain only the public diagnostic', () => {
    const value = connectionDiagnostic();
    expect(value).toMatchObject({ code: 'CONNECTION_FAILED', httpStatus: null, requestId: null, outcome: 'uncertain' });
    expect(diagnosticText(value)).toContain('서버 요청 ID: 없음');
    expect(JSON.parse(diagnosticJson(value))).toEqual(value);
  });
});
