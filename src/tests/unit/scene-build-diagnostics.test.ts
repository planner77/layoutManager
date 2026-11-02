import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {ViewerManager,type CadViewerAdapter} from '../../viewers/core/adapter';
import {ViewerLoadError} from '../../viewers/core/viewer-load-error';
import {
  SceneBuildError,SceneBuildLimitError,SceneBuildTracker,
  SCENE_BUILD_MESSAGES,sceneBuildErrorCode,isKnownSafeSceneBuildError,
} from '../../viewers/core/scene-build-diagnostics';
import {preflightSceneRoot} from '../../viewers/three-dxf-viewer/scene-serialization';
import {SCENE_PAYLOAD_LIMITS} from '../../domain/scene-payload';
import {canPublishSceneCandidate,sceneLoadNotice} from '../../features/cad-viewer/scene-status';

afterEach(()=>vi.unstubAllGlobals());

describe('#212 safe manual DXF Scene stage diagnostics',()=>{
  it('preserves known phase and original internal cause without leaking CAD details to UI or metric',async()=>{
    const secret=new Error('unsafe local private/path CAD_CONTENT');
    const tracker=new SceneBuildTracker();tracker.begin('SOURCE_READ_VERIFY');tracker.stat('sourceBytes',8);
    tracker.begin('TEXT_INDEX_EXTRACT');const error=tracker.fail(secret);
    expect(error).toBeInstanceOf(SceneBuildError);
    expect(error.cause).toBe(secret);
    expect(error).toMatchObject({stage:'adapter-load',phase:'TEXT_INDEX_EXTRACT',reasonCode:'SCENE_TEXT_INDEX_FAILED'});
    expect(error.message).toBe(SCENE_BUILD_MESSAGES.SCENE_TEXT_INDEX_FAILED);
    expect(error.diagnostics).toMatchObject({status:'FAILED',phase:'TEXT_INDEX_EXTRACT',stats:{sourceBytes:8}});
    expect(error.diagnostics.steps.map(step=>step.outcome)).toEqual(['success','failure']);
    expect(isKnownSafeSceneBuildError(error)).toBe(true);
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('synthetic')));
    const metrics=vi.fn();
    const adapter:CadViewerAdapter={
      load:async()=>{throw error;},
      getSceneBuildDiagnostics:()=>tracker.snapshot(),
      dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn(),
    };
    const manager=new ViewerManager(async()=>adapter,undefined,{renderer:'three-dxf-viewer',versionId:'synthetic',report:metrics});
    await expect(manager.load('/synthetic','DXF')).rejects.toBe(error);
    expect(metrics).toHaveBeenCalledOnce();
    expect(metrics.mock.calls[0][0].error).toBe('adapter-load:SCENE_TEXT_INDEX_FAILED');
    expect(metrics.mock.calls[0][0].sceneBuild.status).toBe('FAILED');
    expect(JSON.stringify(metrics.mock.calls[0][0])).not.toContain('private/path');
    expect(manager.getSceneArtifact()).toBeUndefined();
  });

  it('never trusts arbitrary adapter exception messages or spoofed typed codes',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('synthetic')));
    for(const raw of [
      new ViewerLoadError('adapter-load','SCENE_TEXT_INDEX_FAILED','SECRET PATH'),
      new ViewerLoadError('scene','SECRET','SECRET PATH'),
      new Error('SECRET PATH'),
    ]){
      const adapter:CadViewerAdapter={load:async()=>{throw raw;},dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()};
      const manager=new ViewerManager(async()=>adapter);
      const rejected=await manager.load('/synthetic','DXF').catch((error:unknown)=>error);
      expect(rejected).toMatchObject({stage:'adapter-load',reasonCode:'LOAD',message:'Viewer 도면 처리에 실패했습니다.'});
      expect(JSON.stringify({stage:rejected.stage,code:rejected.reasonCode,message:rejected.message})).not.toContain('SECRET');
    }
  });

  it('distinguishes each proven phase and leaves ambiguous font/parser or timeout as uncertain',()=>{
    expect(sceneBuildErrorCode('SOURCE_READ_VERIFY',new ViewerLoadError('scene','SOURCE_DIGEST_MISMATCH','unsafe')))
      .toBe('SCENE_SOURCE_DIGEST_MISMATCH');
    expect(sceneBuildErrorCode('DXF_DECODE_NORMALIZE',new Error('unsafe'))).toBe('SCENE_DXF_PARSE_FAILED');
    expect(sceneBuildErrorCode('DXF_PARSE',new Error('ambiguous font or parser')))
      .toBe('SCENE_CONVERTER_UNAVAILABLE');
    expect(sceneBuildErrorCode('TEXT_INDEX_EXTRACT',new Error('unsafe'))).toBe('SCENE_TEXT_INDEX_FAILED');
    expect(sceneBuildErrorCode('CUSTOM_DTO_SERIALIZE',new Error('CUSTOM_ATTRIBUTE_STORAGE_UNSUPPORTED:position')))
      .toBe('SCENE_UNSUPPORTED_GEOMETRY');
    expect(sceneBuildErrorCode('CUSTOM_DTO_SERIALIZE',new Error('unknown serializer issue')))
      .toBe('SCENE_SERIALIZE_FAILED');
    expect(sceneBuildErrorCode('PAYLOAD_VALIDATE',new Error('invalid')))
      .toBe('SCENE_VALIDATE_FAILED');
    expect(sceneBuildErrorCode('THREE_SCENE_BUILD_TAG',new Error('unknown')))
      .toBe('UNKNOWN');
    for(const limit of ['bytes','nodes','attributeScalars','depth'] as const){
      expect(sceneBuildErrorCode('THREE_SCENE_BUILD_TAG',new SceneBuildLimitError(limit))).toBe('SCENE_ASSET_TOO_LARGE');
    }
    const tracker=new SceneBuildTracker();tracker.begin('SOURCE_READ_VERIFY');
    tracker.begin('OPTIONAL_OUTLINE_INDEX');tracker.end('warning');
    tracker.begin('ARTIFACT_READY');tracker.ready();
    expect(tracker.snapshot()).toMatchObject({status:'ARTIFACT_READY',phase:'ARTIFACT_READY'});
    expect(tracker.snapshot().steps[1].outcome).toBe('warning');
  });

  it('separates fallback drawing display, local Scene artifact and confirmed server READY',()=>{
    const fallback={phase:'CUSTOM_DTO_SERIALIZE',code:'SCENE_UNSUPPORTED_GEOMETRY'} as const;
    const allowed={mode:'build' as const,renderer:'three-dxf-viewer',artifactReady:true,
      sceneCandidate:true,busy:false,loading:false};
    expect(canPublishSceneCandidate(allowed)).toBe(true);
    for(const denied of [
      {...allowed,renderer:'dxf-viewer'}, {...allowed,artifactReady:false},
      {...allowed,sceneCandidate:false}, {...allowed,busy:true},
      {...allowed,loading:true}, {...allowed,mode:'scene-first' as const},
    ])expect(canPublishSceneCandidate(denied)).toBe(false);
    const fallbackNotice=sceneLoadNotice({
      mode:'build',renderer:'dxf-viewer',strategy:'LEGACY_DXF',artifactReady:false,fallback,
    });
    expect(fallbackNotice).toContain('FALLBACK_DXF_DISPLAYED_SCENE_FAILED');
    expect(fallbackNotice).toContain('CUSTOM_DTO_SERIALIZE:SCENE_UNSUPPORTED_GEOMETRY');
    expect(fallbackNotice).not.toContain('변환 완료');
    const genericFallback=sceneLoadNotice({mode:'build',renderer:'dxf-viewer',
      strategy:'LEGACY_DXF',artifactReady:false,fallbackReason:'adapter-load:LOAD'});
    expect(genericFallback).toContain('FALLBACK_DXF_DISPLAYED_SCENE_FAILED');
    expect(genericFallback).toContain('adapter-load:LOAD');
    const local=sceneLoadNotice({mode:'build',renderer:'three-dxf-viewer',strategy:'LEGACY_DXF',artifactReady:true});
    expect(local).toContain('THREE_SCENE_ARTIFACT_READY');
    expect(local).toContain('READY 상태는 아닙니다');
    const server=sceneLoadNotice({mode:'scene-first',renderer:'three-dxf-viewer',strategy:'READY_SCENE',artifactReady:false});
    expect(server).toContain('저장된 Scene Asset 복원 (서버 READY)');
    expect(sceneLoadNotice({mode:'build',renderer:'dxf-viewer',strategy:'LEGACY_DXF',artifactReady:false}))
      .not.toContain('변환 완료');
  });
});

describe('#212 actual Scene preflight matches unchanged persisted limits',()=>{
  it('counts Object3D + repeated geometry, not theoretical BLOCK expansions',()=>{
    const root=new THREE.Group();
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
    root.add(new THREE.Group());
    root.children[0].add(new THREE.Line(geometry,new THREE.LineBasicMaterial()));
    root.add(new THREE.Line(geometry,new THREE.LineBasicMaterial()));
    expect(preflightSceneRoot(root)).toEqual({
      sceneNodes:4,geometryCount:2,attributeScalars:12,maxDepth:2,
    });
  });
  it('rejects actual object count and depth before recursive identity creation',()=>{
    const leaf={children:[]} as unknown as THREE.Object3D;
    const crowded={children:Array(SCENE_PAYLOAD_LIMITS.nodes).fill(leaf)} as unknown as THREE.Object3D;
    expect(()=>preflightSceneRoot(crowded)).toThrowError(SceneBuildLimitError);
    const root=new THREE.Group();let child=root;
    for(let i=0;i<=SCENE_PAYLOAD_LIMITS.depth;i++){
      const next=new THREE.Group();child.add(next);child=next;
    }
    expect(()=>preflightSceneRoot(root)).toThrowError(SceneBuildLimitError);
  });
  it('rejects scalar cap using read-only structural attributes without allocating huge test arrays',()=>{
    const huge={children:[],geometry:{isBufferGeometry:true,
      attributes:{position:{array:{length:SCENE_PAYLOAD_LIMITS.attributeScalars+1}}}}} as unknown as THREE.Object3D;
    expect(()=>preflightSceneRoot(huge)).toThrowError(SceneBuildLimitError);
  });
});
