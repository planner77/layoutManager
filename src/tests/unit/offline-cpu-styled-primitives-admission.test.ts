import {describe,expect,it} from 'vitest';
import {cpuSceneScope,storedSceneScope,validSceneScope,validateSceneManifest,
  type SceneManifest} from '../../domain/cad-scene';
import {validateStoredScenePayload} from '../../domain/scene-payload';
import {sceneSha256} from '../../domain/scene-digest';
import {buildCpuLineCandidate} from '../../server/scene/cpu-line-candidate';
import {STYLED_BUILDER} from '../oci/offline-cpu-styled-primitives-dto.mjs';

const versionId='11111111-1111-4111-8111-111111111111';
const source=new TextEncoder().encode([
  0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC',
  0,'SECTION',2,'ENTITIES',0,'LINE',8,'0',10,0,20,0,11,10,21,20,
  0,'ENDSEC',0,'EOF','',
].join('\n'));

describe('#225 FUP3 styled offline identity remains excluded from production',()=>{
  it('rejects the styled builder at scope and manifest admission',()=>{
    const production=cpuSceneScope(versionId,sceneSha256(source),'DXF_INSUNITS_4');
    expect(validSceneScope(production)).toBe(true);
    expect(STYLED_BUILDER).not.toBe(production.builder);
    const offline={...production,builder:STYLED_BUILDER};
    expect(validSceneScope(offline)).toBe(false);
    expect(()=>storedSceneScope(versionId,production.sourceSha256,offline))
      .toThrow('SCENE_SCOPE_INVALID');
    expect(()=>validateSceneManifest({scope:offline,sceneId:'styled-offline-only',
      format:'CUSTOM_DTO',state:'READY',revision:0,byteLength:1,sha256:'a'.repeat(64)},
    {scope:offline,format:'CUSTOM_DTO',byteLength:1,sha256:'a'.repeat(64)}))
      .toThrow('SCENE_MANIFEST_MISMATCH');
  });

  it('rejects styled provenance even with a matching stored payload digest',async()=>{
    const production=await buildCpuLineCandidate({source,versionId,
      sourceSha256:sceneSha256(source)});
    expect(()=>validateStoredScenePayload(production.bytes,production.manifest))
      .not.toThrow();
    const payload=JSON.parse(new TextDecoder().decode(production.bytes));
    payload.asset.scope.builder=STYLED_BUILDER;
    const bytes=new TextEncoder().encode(JSON.stringify(payload));
    const manifest:SceneManifest={...production.manifest,
      scope:{...production.manifest.scope,builder:STYLED_BUILDER},
      byteLength:bytes.length,sha256:sceneSha256(bytes)};
    expect(()=>validateStoredScenePayload(bytes,manifest)).toThrow();
  });
});
