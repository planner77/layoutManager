/** #225/B2-B: one bounded CPU Scene Job in a separate non-root process.
 *
 * The supervisor and Compose enforce concurrency=1, wall-time, resource and
 * network bounds; do not call this from Next.js or any HTTP request. Neither
 * this entrypoint nor a green unit test is an operator GO-PILOT approval.
 */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDb} from '../server/db';
import {resolveG7RuntimeGate} from '../server/g7-operational/runtime-gate';
import {openG7RuntimeDb} from '../server/g7-operational/runtime-db';
import {requireCpuSceneWorkerRelease} from '../server/scene/scene-build-job-queue';
import {runOneCpuSceneJob,type CpuWorkerTickResult} from '../server/scene/scene-cpu-worker-once';
import {CadStorage} from '../server/storage/cad-storage';
import {SceneBlobStorage} from '../server/storage/scene-storage';

/** Explicitly local-only, independently re-checking signed G7 runtime.
 * The one-job process closes DB/storage even on failure. The active runtime
 * selects the DB and CAD directory; never trust an arbitrary Job path.
 */
export async function runCpuWorkerTick(env:Readonly<NodeJS.ProcessEnv>=process.env):
  Promise<CpuWorkerTickResult>{
  if(env.G7_GREENFIELD_MODE!=='true'||env.G7_GREENFIELD_AUTOMATED!=='true'||
     env.CAD_STORAGE_BACKEND!=='local'||env.SCENE_AUTO_BUILD_ENABLED!=='true'||
     env.SCENE_CPU_WORKER_ENABLED!=='true')
    throw new Error('SCENE_CPU_WORKER_CONFIGURATION_DENIED');
  requireCpuSceneWorkerRelease();
  const gate=resolveG7RuntimeGate(env);
  if(gate.state!=='ACTIVE'||!gate.cadWriteEnabled||gate.schemaMode!=='GREENFIELD')
    throw new Error('SCENE_CPU_WORKER_G7_DENIED');
  // A verified database open includes exact schema/history/integrity and owner
  // checks. This is a probe, not a privileged session or a cached approval.
  const probe=openG7RuntimeDb({databasePath:gate.databasePath,
    schemaMode:'GREENFIELD',siteIds:gate.siteIds},true);
  probe.close();
  const db=createDb('file:'+gate.databasePath);
  const sceneStorage=new SceneBlobStorage(gate.cadStoragePath,{...env});
  const originalStorage=new CadStorage(gate.cadStoragePath,16*1024*1024);
  try{
    return await runOneCpuSceneJob({db,originalStorage,sceneStorage});
  }finally{
    sceneStorage.close();
    await db.$disconnect();
  }
}
const invoked=Boolean(process.argv[1])&&
  import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked){
  if(process.argv.length!==3||process.argv[2]!=='--once'){
    process.stderr.write('SCENE_CPU_WORKER_ARGUMENT_DENIED\n');
    process.exitCode=2;
  }else{
    try{
      const result=await runCpuWorkerTick();
      // Codes are controlled allowlist values; do not log paths, source data,
      // session secrets, credentials or runtime approval bytes.
      process.stdout.write(JSON.stringify({kind:'CPU_SCENE_TICK',
        outcome:result.outcome,
        ...(result.outcome==='IDLE'?{}:{jobId:result.jobId}),
        ...(result.outcome==='FAILED'||result.outcome==='RETRY_WAIT'
          ?{code:result.code}:{})})+'\n');
    }catch{
      process.stderr.write('SCENE_CPU_WORKER_PROCESS_FAILED\n');
      process.exitCode=1;
    }
  }
}
