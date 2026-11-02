
import { afterEach,beforeEach,describe,expect,test,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { makeG7RuntimeFixture } from '../helpers/g7-runtime';
import { createDb,type Database } from '../../server/db';
import { newSessionCandidate } from '../../server/auth/session';
import { resolveG7RuntimeGate } from '../../server/g7-operational/runtime-gate';
// Keep the real G7 auth/Site policy while excluding the unrelated legacy `server-only`
// context module. The authenticated search helper must never fall back to it.
vi.mock('@/server/context', () => ({ context: () => { throw new Error('UNEXPECTED_LEGACY_CONTEXT'); } }));
import { requireMemoSearchSites } from '../../server/scene/scene-context';
import { withAuthorizedDrawingMemoList } from '../../server/services/authorized-drawing-memo-list';

let f:ReturnType<typeof makeG7RuntimeFixture>,db:Database;
beforeEach(()=>{
  f=makeG7RuntimeFixture();
  for(const [key,value] of Object.entries(f.env))vi.stubEnv(key,value);
  for(const key of ['G7_S3_CAD_PREVIEW_ONLY','G7_S3_AUTH_API_PREVIEW_ONLY','G7_S3_GO','G7_OPERATION_MANIFEST_PATH'])
    vi.stubEnv(key,undefined);
  db=createDb('file:'+f.databasePath);
});
afterEach(async()=>{await db.$disconnect();vi.unstubAllEnvs();f.cleanup();});
async function actor(role:'Reader'|'Editor'|'Admin',sites:string[]){
  const id=randomUUID(),now=Date.now(),candidate=newSessionCandidate(id,now);
  await db.user.create({data:{
    id,loginName:'user'+id.replaceAll('-','').slice(0,20),
    passwordHash:'scrypt$test-only',status:'ACTIVE',mustChangePassword:false,
    createdAt:BigInt(now),updatedAt:BigInt(now),
  }});
  await db.userRoleGrant.create({data:{userId:id,role,grantedAt:BigInt(now)}});
  for(const siteId of sites)await db.userSiteGrant.create({data:{
    userId:id,siteId,grantedAt:BigInt(now),
  }});
  await db.authSession.create({data:{
    id:candidate.session.id,userId:id,tokenHash:candidate.session.tokenHash,
    issuedAt:BigInt(now),lastSeenAt:BigInt(now),expiresAt:BigInt(candidate.session.expiresAt),
  }});
  return {id,token:candidate.rawToken,sessionId:candidate.session.id};
}
const request=(token?:string)=>new Request('http://0.0.0.0:3000/api/cad-memos/search?target=memos&q=secret',{
  headers:{host:'cad.example.test',...(token?{cookie:'cad_session='+token}:{})},
});
describe('#90 M7: per-request signed G7 Reader/Site scope',()=>{
  test('Reader with Site A can query only A; Admin without Site cannot bypass',async()=>{
    const reader=await actor('Reader',['site-a']),admin=await actor('Admin',[]);
    const gate=resolveG7RuntimeGate();
    expect(gate.state).toBe('ACTIVE');
    expect(await requireMemoSearchSites(request(reader.token),db,gate)).toEqual(['site-a']);
    await expect(requireMemoSearchSites(request(admin.token),db,gate))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  test('Site B outside signed scope is denied even to Admin',async()=>{
    const outsider=await actor('Admin',['site-b']);
    const gate=resolveG7RuntimeGate();
    expect(gate.state).toBe('ACTIVE');
    await expect(requireMemoSearchSites(request(outsider.token),db,gate))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  test('missing, revoked and disabled sessions never expose Site list',async()=>{
    const a=await actor('Reader',['site-a']),gate=resolveG7RuntimeGate();
    expect(gate.state).toBe('ACTIVE');
    await expect(requireMemoSearchSites(request(),db,gate)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
    await db.authSession.update({where:{id:a.sessionId},data:{revokedAt:BigInt(Date.now())}});
    await expect(requireMemoSearchSites(request(a.token),db,gate))
      .rejects.toMatchObject({code:'UNAUTHENTICATED'});
    const fresh=await actor('Reader',['site-a']);
    await db.user.update({where:{id:fresh.id},data:{status:'DISABLED'}});
    await expect(requireMemoSearchSites(request(fresh.token),db,gate))
      .rejects.toMatchObject({code:'UNAUTHENTICATED'});
  });
});

test('#202 drawing memo list wrapper denies before repository access and accepts only signed Reader scope', async () => {
  const reader=await actor('Reader',['site-a']);
  const admin=await actor('Admin',[]);
  let called=0;
  const action=async (_repo: unknown, sites: readonly string[])=>{called++;return sites;};
  await expect(withAuthorizedDrawingMemoList(request(),action)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await expect(withAuthorizedDrawingMemoList(request(admin.token),action)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  expect(called).toBe(0);
  expect(await withAuthorizedDrawingMemoList(request(reader.token),action)).toEqual(['site-a']);
  expect(called).toBe(1);
  await db.authSession.update({where:{id:reader.sessionId},data:{revokedAt:BigInt(Date.now())}});
  await expect(withAuthorizedDrawingMemoList(request(reader.token),action)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  expect(called).toBe(1);
});
