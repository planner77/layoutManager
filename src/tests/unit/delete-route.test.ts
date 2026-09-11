import { beforeEach, expect, test, vi } from 'vitest';
import { CadError } from '../../domain/cad';
import { resetDeleteAttemptsForTests } from '../../server/delete-rate-limit';

const mocks = vi.hoisted(() => ({
  deleteVersion: vi.fn(), removeUncommitted: vi.fn(), deleteJob: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock('@/server/context',()=>({context:()=>({repo:{deleteVersion:mocks.deleteVersion,db:{cadDeletionJob:{delete:mocks.deleteJob}}},storage:{removeUncommitted:mocks.removeUncommitted}})}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidatePath}));
import { DELETE } from '../../app/api/cad-files/[versionId]/route';

const versionId='12345678-1234-4123-8123-123456789abc';
function request() { return new Request(`http://localhost/api/cad-files/${versionId}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({password:'abcd'})}); }
function params() { return {params:Promise.resolve({versionId})}; }

beforeEach(()=>{vi.resetAllMocks();resetDeleteAttemptsForTests()});

test('TC-DELETE-003: sixth rejected attempt is 429 with Retry-After',async()=>{
  mocks.deleteVersion.mockRejectedValue(new CadError('INVALID_DELETE_PASSWORD','삭제 비밀번호가 올바르지 않습니다.',403));
  for(let i=0;i<5;i++) expect((await DELETE(request(),params())).status).toBe(403);
  const limited=await DELETE(request(),params());
  expect(limited.status).toBe(429); expect(limited.headers.get('Retry-After')).toMatch(/^[1-9][0-9]*$/); expect(mocks.deleteVersion).toHaveBeenCalledTimes(5);
});

test('TC-DELETE-005: committed deletion returns 202 and retains retry job when original cleanup fails',async()=>{
  mocks.deleteVersion.mockResolvedValue({id:versionId,locationId:'87654321-4321-4123-8123-cba987654321',wasCurrent:true,storagePath:'safe/original.dxf',jobId:'job'});
  mocks.removeUncommitted.mockRejectedValue(new Error('injected storage failure'));
  const response=await DELETE(request(),params()); const body=await response.json();
  expect(response.status).toBe(202); expect(body).toMatchObject({deleted:true,cleanupPending:true,wasCurrent:true}); expect(mocks.deleteJob).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/'); expect(mocks.revalidatePath).toHaveBeenCalledWith('/cad/locations/87654321-4321-4123-8123-cba987654321');
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/cad/versions/${versionId}/viewer`);
});

test.each([
  ['missing password', '{}', 'application/json', 'http://localhost', versionId],
  ['malformed JSON', '{', 'application/json', 'http://localhost', versionId],
  ['wrong content type', '{"password":"abcd"}', 'text/plain', 'http://localhost', versionId],
  ['foreign origin', '{"password":"abcd"}', 'application/json', 'https://foreign.invalid', versionId],
  ['invalid ID', '{"password":"abcd"}', 'application/json', 'http://localhost', 'invalid'],
  ['oversized actual body without content-length', JSON.stringify({password:'abcd', extra:'x'.repeat(1024)}), 'application/json', 'http://localhost', versionId],
])('TC-DELETE-003: rejects %s before repository or storage work',async(_label,body,contentType,origin,id)=>{
  const req=new Request(`http://localhost/api/cad-files/${id}`,{method:'DELETE',headers:{'content-type':contentType,origin},body});
  const response=await DELETE(req,{params:Promise.resolve({versionId:id})});
  expect(response.status).toBe(origin==='https://foreign.invalid'?403:400);
  const result=await response.json(); expect(result.error.requestId).toBe(response.headers.get('x-request-id'));
  expect(mocks.deleteVersion).not.toHaveBeenCalled(); expect(mocks.removeUncommitted).not.toHaveBeenCalled();
});

test('TC-DELETE-005: cache failure cannot change confirmed deletion and storage outcome',async()=>{
  mocks.deleteVersion.mockResolvedValue({id:versionId,locationId:'87654321-4321-4123-8123-cba987654321',wasCurrent:false,storagePath:'safe/original.dxf',jobId:'job'});
  mocks.removeUncommitted.mockResolvedValue(undefined); mocks.deleteJob.mockResolvedValue(undefined);
  mocks.revalidatePath.mockImplementation(()=>{throw new Error('cache failure')});
  const response=await DELETE(request(),params()); const body=await response.json();
  expect(response.status).toBe(200); expect(body).toMatchObject({deleted:true,cleanupPending:false});
  expect(mocks.deleteJob).toHaveBeenCalledWith({where:{id:'job'}});
  expect(body.requestId).toBe(response.headers.get('x-request-id'));
});

test('TC-DELETE-005: database failure never starts storage deletion',async()=>{
  mocks.deleteVersion.mockRejectedValue(new CadError('DATABASE_BUSY','다시 시도해주세요.',503));
  const response=await DELETE(request(),params());
  expect(response.status).toBe(503); expect(mocks.removeUncommitted).not.toHaveBeenCalled(); expect(mocks.deleteJob).not.toHaveBeenCalled();
});
