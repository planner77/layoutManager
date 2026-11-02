import {ViewerLoadError} from './viewer-load-error';

/** #212 browser-only diagnostics. No CAD text, paths, UUIDs or server request/job IDs. */
export const SCENE_BUILD_PHASES = [
  'SOURCE_VERIFY','DXF_DECODE_NORMALIZE','DXF_PARSE','THREE_SCENE_BUILD_TAG',
  'OPTIONAL_OUTLINE_INDEX','TEXT_INDEX_EXTRACT','SCENE_JSON_INSPECT',
  'CUSTOM_DTO_SERIALIZE','PAYLOAD_VALIDATE','ARTIFACT_READY',
] as const;
export type SceneBuildPhase = (typeof SCENE_BUILD_PHASES)[number];
export type SceneBuildOutcome = 'success'|'warning'|'failure';
export type SceneBuildStep = Readonly<{phase:SceneBuildPhase;outcome:SceneBuildOutcome;elapsedMs:number}>;
export type SceneBuildStats = Partial<Readonly<Record<
  'sourceBytes'|'dxfEntities'|'sceneNodes'|'geometryCount'|'attributeScalars'|'maxDepth'|
  'serializedBytes'|'parseMs'|'serializeMs'|'jsHeapBytes',number>>>;
export type SceneBuildDiagnostics = Readonly<{
  status:'IN_PROGRESS'|'ARTIFACT_READY'|'FAILED';
  phase:SceneBuildPhase|null;
  steps:readonly SceneBuildStep[];
  stats:SceneBuildStats;
}>;
/** Stable and safe; shared with the future server Worker (#208) rather than a second log namespace. */
export const SCENE_BUILD_MESSAGES = {
  SCENE_SOURCE_DIGEST_MISMATCH:'원본 DXF의 무결성 검증에 실패했습니다. Version을 확인하세요.',
  SCENE_DXF_PARSE_FAILED:'DXF 형식·인코딩을 처리하지 못했습니다. 원본은 보존됩니다.',
  SCENE_FONT_UNAVAILABLE:'Scene 글꼴을 불러오지 못했습니다. 글꼴 배포 상태를 확인하세요.',
  SCENE_CONVERTER_UNAVAILABLE:'DXF 변환기 또는 글꼴/파서 단계에서 처리에 실패했습니다. 원본은 보존됩니다.',
  SCENE_TEXT_INDEX_FAILED:'텍스트 검색 인덱스를 생성하지 못했습니다. Scene을 저장하지 않았습니다.',
  SCENE_SERIALIZE_FAILED:'Scene 직렬화에 실패했습니다. 원본은 보존됩니다.',
  SCENE_UNSUPPORTED_GEOMETRY:'지원하지 않는 Scene 도형·재질·속성이 있습니다. 누락 없이 저장할 수 없습니다.',
  SCENE_ASSET_TOO_LARGE:'Scene이 검증된 크기·노드·속성·깊이 한도를 초과했습니다. 한도를 임의로 변경하지 마세요.',
  SCENE_VALIDATE_FAILED:'Scene 검증에 실패하여 게시 후보를 만들지 않았습니다.',
  SCENE_BUILD_TIMEOUT:'필수 Scene 생성 제한 시간을 초과했습니다. 결과를 저장하지 않았습니다.',
  UNKNOWN:'Scene 생성 실패 단계는 확인했지만 세부 원인은 분류하지 못했습니다.',
} as const;
export type SceneBuildErrorCode=keyof typeof SCENE_BUILD_MESSAGES;
export class SceneBuildLimitError extends Error {
  constructor(public readonly limit:'bytes'|'nodes'|'attributeScalars'|'depth') {
    super('SCENE_ASSET_TOO_LARGE');this.name='SceneBuildLimitError';
  }
}
export class SceneBuildError extends ViewerLoadError {
  readonly retryable:boolean;
  constructor(public readonly phase:SceneBuildPhase, code:SceneBuildErrorCode,
    public readonly diagnostics:SceneBuildDiagnostics,cause?:unknown) {
    super(code==='SCENE_SOURCE_DIGEST_MISMATCH'?'scene':'adapter-load',code,SCENE_BUILD_MESSAGES[code],cause);
    this.name='SceneBuildError';
    // A browser-only retry remains an explicit user action, never automatic publication.
    this.retryable=code==='SCENE_CONVERTER_UNAVAILABLE'||code==='SCENE_FONT_UNAVAILABLE';
  }
}
export function isKnownSafeSceneBuildError(error:unknown):error is SceneBuildError{
  return error instanceof SceneBuildError&&
    error.stage===(error.reasonCode==='SCENE_SOURCE_DIGEST_MISMATCH'?'scene':'adapter-load')&&
    SCENE_BUILD_PHASES.includes(error.phase)&&
    Object.hasOwn(SCENE_BUILD_MESSAGES,error.reasonCode)&&
    error.message===SCENE_BUILD_MESSAGES[error.reasonCode as SceneBuildErrorCode];
}
/** Only proven typed/prefix conditions are classified; library errors remain unclassified by cause. */
export function sceneBuildErrorCode(phase:SceneBuildPhase,error:unknown):SceneBuildErrorCode{
  if(error instanceof SceneBuildLimitError)return 'SCENE_ASSET_TOO_LARGE';
  if(error instanceof ViewerLoadError&&error.reasonCode==='SOURCE_DIGEST_MISMATCH')
    return 'SCENE_SOURCE_DIGEST_MISMATCH';
  if(phase==='DXF_DECODE_NORMALIZE')return 'SCENE_DXF_PARSE_FAILED';
  if(phase==='TEXT_INDEX_EXTRACT')return 'SCENE_TEXT_INDEX_FAILED';
  if(phase==='SCENE_JSON_INSPECT'||phase==='CUSTOM_DTO_SERIALIZE'){
    if(error instanceof Error&&/^CUSTOM_(?:NODE|GEOMETRY|MATERIAL|ATTRIBUTE)(?:_STORAGE)?_UNSUPPORTED(?::|$)/.test(error.message))
      return 'SCENE_UNSUPPORTED_GEOMETRY';
    return 'SCENE_SERIALIZE_FAILED';
  }
  if(phase==='PAYLOAD_VALIDATE')return 'SCENE_VALIDATE_FAILED';
  // The three-dxf-viewer library combines font fetch, parsing and geometry construction.
  // Do not infer FONT_UNAVAILABLE or DXF_PARSE_FAILED from a generic rejected promise.
  if(phase==='DXF_PARSE')return 'SCENE_CONVERTER_UNAVAILABLE';
  return 'UNKNOWN';
}
export class SceneBuildTracker {
  private current:{phase:SceneBuildPhase;started:number}|null=null;
  private readonly history:SceneBuildStep[]=[];
  private readonly values:Record<string,number>={};
  private status:SceneBuildDiagnostics['status']='IN_PROGRESS';
  begin(phase:SceneBuildPhase):void{
    this.end('success');
    this.current={phase,started:performance.now()};
  }
  end(outcome:SceneBuildOutcome='success'):void{
    if(!this.current)return;
    this.history.push({phase:this.current.phase,outcome,elapsedMs:Math.max(0,performance.now()-this.current.started)});
    this.current=null;
  }
  stat(key:keyof SceneBuildStats,value:number|undefined):void{
    if(typeof value==='number'&&Number.isFinite(value)&&value>=0)this.values[key]=value;
  }
  ready():void{this.end();this.status='ARTIFACT_READY';}
  fail(error:unknown):SceneBuildError{
    const phase=this.current?.phase??'DXF_PARSE';
    this.end('failure');this.status='FAILED';
    return new SceneBuildError(phase,sceneBuildErrorCode(phase,error),this.snapshot(),error);
  }
  snapshot():SceneBuildDiagnostics{
    return {status:this.status,phase:this.current?.phase??this.history.at(-1)?.phase??null,
      steps:[...this.history],stats:{...this.values}};
  }
}
