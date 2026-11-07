import {describe,expect,it} from 'vitest';
import {CAD_SCENE_CPU_BUILDER,cpuSceneScope,storedSceneScope,validSceneScope,
  validateSceneManifest,type SceneManifest} from '../../domain/cad-scene';
import {validateStoredScenePayload} from '../../domain/scene-payload';
import {sceneSha256} from '../../domain/scene-digest';
import {buildCpuLineCandidate,parseCpuLineOnlyDxf} from '../../server/scene/cpu-line-candidate';
import {OFFLINE_CPU_PRIMITIVES_BUILDER} from '../oci/offline-cpu-primitives-dto.mjs';

const versionId='11111111-1111-4111-8111-111111111111';
const fixture=(type='LINE')=>new TextEncoder().encode([
  0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC',
  0,'SECTION',2,'ENTITIES',0,type,8,'0',10,0,20,0,
  ...(type==='LINE'?[11,10,21,20]:[40,10]),0,'ENDSEC',0,'EOF','',
].join('\n'));

describe('#225 FUP2 offline identity cannot enter production Scene admission',()=>{
  it('retains the production allowlist and refuses the distinct primitive builder',()=>{
    const source=fixture(),scope=cpuSceneScope(versionId,sceneSha256(source),'DXF_INSUNITS_4');
    expect(validSceneScope(scope)).toBe(true);
    expect(scope.builder).toBe(CAD_SCENE_CPU_BUILDER);
    expect(OFFLINE_CPU_PRIMITIVES_BUILDER).not.toBe(CAD_SCENE_CPU_BUILDER);
    const offline={...scope,builder:OFFLINE_CPU_PRIMITIVES_BUILDER};
    expect(validSceneScope(offline)).toBe(false);
    expect(()=>storedSceneScope(versionId,scope.sourceSha256,offline)).toThrow('SCENE_SCOPE_INVALID');
    expect(()=>validateSceneManifest({scope:offline,sceneId:'offline-only',format:'CUSTOM_DTO',
      state:'READY',revision:0,byteLength:1,sha256:'a'.repeat(64)},
    {scope:offline,format:'CUSTOM_DTO',byteLength:1,sha256:'a'.repeat(64)})).toThrow('SCENE_MANIFEST_MISMATCH');
  });

  it('rejects unknown builder provenance even in an otherwise valid stored payload',async()=>{
    const source=fixture();
    const old=await buildCpuLineCandidate({source,versionId,sourceSha256:sceneSha256(source)});
    expect(()=>validateStoredScenePayload(old.bytes,old.manifest)).not.toThrow();
    const payload=JSON.parse(new TextDecoder().decode(old.bytes));
    payload.asset.scope.builder=OFFLINE_CPU_PRIMITIVES_BUILDER;
    const bytes=new TextEncoder().encode(JSON.stringify(payload));
    const manifest:SceneManifest={...old.manifest,scope:{...old.manifest.scope,
      builder:OFFLINE_CPU_PRIMITIVES_BUILDER},byteLength:bytes.length,sha256:sceneSha256(bytes)};
    expect(()=>validateStoredScenePayload(bytes,manifest)).toThrow();
  });

  it('preserves the old LINE parser contract rather than widening its accepted entities',()=>{
    expect(parseCpuLineOnlyDxf(fixture()).lines).toHaveLength(1);
    expect(()=>parseCpuLineOnlyDxf(fixture('CIRCLE'))).toThrow('SCENE_CONVERTER_UNAVAILABLE');
  });
});
