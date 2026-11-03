import {describe,expect,it,vi} from 'vitest';
import {CAD_SCENE_BUILDER} from '../../domain/cad-scene';
import {enqueueSceneBuildTx,claimNextSceneJob,recoverStaleSceneJob,
  requeueDueSceneJob,failRunningSceneJob} from '../../server/scene/scene-build-job-queue';

const sha='a'.repeat(64);
const enqueue={versionId:'version-001',sourceSha256:sha,actorId:'actor-001',
  siteId:'site-001',requestId:'request-001'};
type Call={where?:unknown;data?:Record<string,unknown>};
function fixture(row:Record<string,unknown>|null,count=1){
 const create=vi.fn(async(_args:Call)=>({id:'job-001'}));
 const findFirst=vi.fn(async(_args:Call)=>row);
 const updateMany=vi.fn(async(_args:Call)=>({count}));
 const tx={sceneBuildJob:{create,findFirst,updateMany}};
 const db={$transaction:vi.fn(async(fn:(arg:typeof tx)=>Promise<unknown>)=>fn(tx))};
 return {create,findFirst,updateMany,tx,db};
}
const original={id:'job-001',versionId:'version-001',sourceSha256:sha,
 builder:CAD_SCENE_BUILDER,payloadSchema:2,attempt:0,
 status:'QUEUED',dueAt:new Date(1000),startedAt:null,
 createdAt:new Date(500)};
describe('#225 B1 transactional queue adapter (stubbed transaction)',()=>{
 it('persists only approved actor/site/Version metadata; no session secrets',async()=>{
  const f=fixture(null);
  expect(await enqueueSceneBuildTx(f.tx as never,enqueue)).toEqual({jobId:'job-001',status:'QUEUED'});
  const value=f.create.mock.calls[0][0] as {data:Record<string,unknown>};
  expect(value.data).toMatchObject({versionId:'version-001',sourceSha256:sha,
    actorId:'actor-001',siteId:'site-001',requestId:'request-001',
    builder:CAD_SCENE_BUILDER,payloadSchema:2,status:'QUEUED',attempt:0,stage:'JOB_ENQUEUED'});
  expect(value.data).not.toHaveProperty('tokenHash');
  expect(value.data).not.toHaveProperty('cookie');
  expect(value.data).not.toHaveProperty('password');
  await expect(enqueueSceneBuildTx(f.tx as never,{...enqueue,tokenHash:'secret'} as never))
    .rejects.toThrow('SCENE_JOB_ENQUEUE_INVALID');
  expect(f.create).toHaveBeenCalledTimes(1);
 });
 it('claims only a due QUEUED record through a status+attempt compare-and-set',async()=>{
  const f=fixture(original);
  const claimed=await claimNextSceneJob(f.db as never,new Date(1100));
  expect(claimed).toMatchObject({id:'job-001',status:'RUNNING',attempt:1});
  expect(f.updateMany).toHaveBeenCalledWith({
    where:{id:'job-001',status:'QUEUED',attempt:0,startedAt:null},
    data:{status:'RUNNING',stage:'SOURCE_READ',attempt:{increment:1},startedAt:new Date(1100)},
  });
  expect((await claimNextSceneJob(fixture(original,0).db as never,new Date(1100)))).toBeNull();
 });
 it('a stale RUNNING attempt schedules bounded retry and never publishes READY',async()=>{
  const f=fixture({...original,status:'RUNNING',attempt:1,startedAt:new Date(100)});
  expect(await recoverStaleSceneJob(f.db as never,new Date(180100)))
    .toEqual({id:'job-001',status:'RETRY_WAIT'});
  expect(f.updateMany.mock.calls[0][0]).toMatchObject({
    where:{id:'job-001',status:'RUNNING',attempt:1,startedAt:new Date(100)},
    data:{status:'RETRY_WAIT',lastCode:'SCENE_BUILD_TIMEOUT',startedAt:null,
      dueAt:new Date(210100)},
  });
 });
 it('exhausted stale attempts fail safely, without a fake READY',async()=>{
  const f=fixture({...original,status:'RUNNING',attempt:3,startedAt:new Date(0)});
  expect(await recoverStaleSceneJob(f.db as never,new Date(180000)))
    .toEqual({id:'job-001',status:'FAILED'});
  expect(f.updateMany.mock.calls[0][0]).toMatchObject({
    data:{status:'FAILED',lastCode:'SCENE_BUILD_TIMEOUT',finishedAt:new Date(180000)}});
 });
 it('due retries become QUEUED without consuming an attempt',async()=>{
  const f=fixture({...original,status:'RETRY_WAIT',attempt:1,dueAt:new Date(1000)});
  expect(await requeueDueSceneJob(f.db as never,new Date(1200)))
    .toEqual({id:'job-001',status:'QUEUED'});
  expect(f.updateMany.mock.calls[0][0]).toMatchObject({where:{
    id:'job-001',status:'RETRY_WAIT',attempt:1},data:{status:'QUEUED'}});
 });
 it('a failed attempt is CAS-matched and only an allowlisted error is stored',async()=>{
  const f=fixture(original);
  expect(await failRunningSceneJob(f.db as never,'job-001',1,
    'SCENE_DXF_PARSE_FAILED',new Date(2000))).toBe(true);
  expect(f.updateMany.mock.calls[0][0]).toMatchObject({
    where:{id:'job-001',status:'RUNNING',attempt:1},
    data:{status:'FAILED',lastCode:'SCENE_DXF_PARSE_FAILED',startedAt:null}});
  expect(await failRunningSceneJob(fixture(original,0).db as never,'job-001',1,
    'UNKNOWN',new Date(2000))).toBe(false);
 });
});
