/** B3: one bounded user retry within the existing CPU attempt budget. */
import {safeBuildErrorCode,type SceneBuildErrorCode} from './scene-build-job';
const retryable=new Set<SceneBuildErrorCode>([
  'SCENE_STORAGE_FAILED','SCENE_WORKER_UNAVAILABLE','SCENE_BUILD_TIMEOUT',
]);
export const MAX_CPU_SCENE_ATTEMPTS=3;
export function canManualRetrySceneJob(job:Readonly<{
  status:string;attempt:number;lastCode:string|null;startedAt:Date|null;
}>):boolean{
  return job.status==='FAILED'&&job.startedAt===null&&
    Number.isSafeInteger(job.attempt)&&job.attempt>=1&&job.attempt<MAX_CPU_SCENE_ATTEMPTS&&
    job.lastCode!==null&&safeBuildErrorCode(job.lastCode)===job.lastCode&&
    retryable.has(job.lastCode as SceneBuildErrorCode);
}
