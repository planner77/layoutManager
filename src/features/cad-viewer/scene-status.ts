import type {SceneBuildPhase,SceneBuildErrorCode} from '../../viewers/core/scene-build-diagnostics';

export type SceneFallback = Readonly<{phase:SceneBuildPhase;code:SceneBuildErrorCode}>;
/** Distinguish canvas display, validated client artifact and server READY pointer. */
export function sceneLoadNotice(input:Readonly<{
  mode:'scene-first'|'build';renderer:string;strategy:'READY_SCENE'|'LEGACY_DXF'|'DWG';
  artifactReady:boolean;fallback?:SceneFallback|null;fallbackReason?:string|null;
}>):string{
  if(input.strategy==='READY_SCENE')
    return '저장된 READY Scene Asset 복원 · DXF 원본 조회·재파싱 없음';
  if(input.mode==='build'){
    if(input.renderer==='three-dxf-viewer'&&input.artifactReady)
      return 'THREE_SCENE_ARTIFACT_READY · Scene 생성·검증 완료. 서버에 저장하기 전이므로 READY 상태는 아닙니다.';
    if(input.renderer==='dxf-viewer'&&input.fallback)
      return `FALLBACK_DXF_DISPLAYED_SCENE_FAILED · 도면만 대체 표시했습니다. Scene 생성 실패 (${input.fallback.phase}:${input.fallback.code}). Scene Asset 저장은 불가능합니다.`;
    return `Scene 생성 실패 또는 검증된 Artifact 없음. 도면 표시와 Scene 생성은 별개입니다.${input.fallbackReason?' ('+input.fallbackReason+')':''}`;
  }
  if(input.fallback)
    return `레거시 DXF 대체 표시 · three-dxf-viewer 실패 (${input.fallback.phase}:${input.fallback.code}). Scene READY를 의미하지 않습니다.`;
  return '레거시 DXF 로딩 · 원본을 사용합니다. Scene 저장/복원 성공을 의미하지 않습니다.';
}

/** A display-only fallback can never authorize a Scene publication request. */
export function canPublishSceneCandidate(input:Readonly<{
  mode:'scene-first'|'build';renderer:string;artifactReady:boolean;
  sceneCandidate:boolean;busy:boolean;loading:boolean;
}>):boolean{
  return input.mode==='build'&&input.renderer==='three-dxf-viewer'&&
    input.artifactReady&&input.sceneCandidate&&!input.busy&&!input.loading;
}
