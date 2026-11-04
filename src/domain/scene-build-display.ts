/** #225/B3: status presentation contract. No DB, credential or storage data.
 * A job READY flag alone never constitutes a verified persisted Scene.
 */
import {sceneBuildPublicSummary,type SceneBuildPublicState,type SceneBuildStatus,
  type SceneBuildStage} from './scene-build-job';

export type SceneStatusBadge=Readonly<{
  state:SceneBuildPublicState;
  label:string;
  tone:'neutral'|'pending'|'success'|'warning'|'error';
  polling:boolean;
  phase:SceneBuildStage|null;
}>;
const LABELS:Readonly<Record<SceneBuildPublicState,string>>={
  NOT_APPLICABLE:'해당 없음',MISSING:'Scene 없음',REBUILD_REQUIRED:'Scene 재생성 필요',
  QUEUED:'생성 대기',RUNNING:'생성 중',RETRY_WAIT:'재시도 대기',
  READY:'Scene 완료',FAILED:'생성 실패',BLOCKED:'작업 차단',
  UNAVAILABLE:'상태 확인 불가',
};
const TONES:Readonly<Record<SceneBuildPublicState,SceneStatusBadge['tone']>>={
  NOT_APPLICABLE:'neutral',MISSING:'neutral',REBUILD_REQUIRED:'warning',
  QUEUED:'pending',RUNNING:'pending',RETRY_WAIT:'pending',
  READY:'success',FAILED:'error',BLOCKED:'warning',UNAVAILABLE:'warning',
};
/** Accept only server-authoritative pointer validation. Never trust UI/job READY.
 * Private fields (actor, request ID, source digest, exception) are not accepted.
 */
export function sceneStatusBadge(input:Readonly<{
  fileFormat:string;
  validatedScene:'READY'|'MISSING'|'REBUILD_REQUIRED'|'UNAVAILABLE';
  jobState?:SceneBuildStatus|null;
  stage?:unknown;
}>):SceneStatusBadge{
  const summary=sceneBuildPublicSummary(input);
  const state=summary.scene;
  return {state,label:LABELS[state],tone:TONES[state],
    polling:state==='QUEUED'||state==='RUNNING'||state==='RETRY_WAIT',
    phase:summary.phase};
}
/** Client polling is allowed only while visible and enabled, and when at
 * least one displayed row has an active job. Nothing runs in a hidden tab.
 */
export function shouldPollSceneRows(states:readonly SceneStatusBadge[],
  pageVisible:boolean,featureEnabled:boolean):boolean{
  return featureEnabled&&pageVisible&&states.some(row=>row.polling);
}
