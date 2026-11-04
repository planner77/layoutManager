import {describe,expect,it} from 'vitest';
import {
  CAD_SCENE_BUILDER,CAD_SCENE_CPU_BUILDER,cpuSceneScope,sceneScope,storedSceneScope,
  validateSceneManifest,validSceneScope,
} from '../../domain/cad-scene';
import {sceneSha256} from '../../domain/scene-digest';
import {buildCpuLineCandidate} from '../../server/scene/cpu-line-candidate';
import {inspectCpuCandidateForJob} from '../../server/scene/cpu-candidate-admission';
const versionId='11111111-1111-4111-8111-111111111111';
const enc=new TextEncoder();
const source=enc.encode(['0','SECTION','2','HEADER','9','$INSUNITS','70','4',
  '0','ENDSEC','0','SECTION','2','ENTITIES','0','LINE','8','0',
  '10','0','20','0','11','10','21','20','0','ENDSEC','0','EOF',''].join('\n'));
const sourceSha256=sceneSha256(source);
async function fixture(){
  const candidate=await buildCpuLineCandidate({source,versionId,sourceSha256});
  const job={versionId,sourceSha256,builder:CAD_SCENE_CPU_BUILDER,
    payloadSchema:2,status:'RUNNING',attempt:1};
  return {candidate,job};
}
describe('#225 B2-B CPU provenance and Job/candidate read-only matching',()=>{
  it('keeps old browser scope and makes a separate versioned CPU scope',async()=>{
    const {candidate}=await fixture();
    const browser=sceneScope(versionId,sourceSha256,'DXF_INSUNITS_4');
    const cpu=cpuSceneScope(versionId,sourceSha256,'DXF_INSUNITS_4');
    expect(browser.builder).toBe(CAD_SCENE_BUILDER);
    expect(cpu.builder).toBe(CAD_SCENE_CPU_BUILDER);
    expect(cpu).not.toEqual(browser);
    expect(validSceneScope(cpu)).toBe(true);
    expect(validSceneScope(browser)).toBe(true);
    expect(candidate.manifest.scope).toEqual(cpu);
    expect(()=>validateSceneManifest(candidate.manifest,{scope:browser,format:'CUSTOM_DTO',
      byteLength:candidate.bytes.length,sha256:candidate.manifest.sha256}))
      .toThrow('SCENE_MANIFEST_MISMATCH');
  });
  it('recognizes only known browser or CPU stored scopes without granting publish',async()=>{
    const {candidate}=await fixture();
    const browser=sceneScope(versionId,sourceSha256,'DXF_INSUNITS_4');
    expect(storedSceneScope(versionId,sourceSha256,candidate.manifest.scope))
      .toEqual(cpuSceneScope(versionId,sourceSha256,'DXF_INSUNITS_4'));
    expect(storedSceneScope(versionId,sourceSha256,browser)).toEqual(browser);
    expect(()=>storedSceneScope(versionId,sourceSha256,
      {...candidate.manifest.scope,builder:'unreviewed'})).toThrow('SCENE_SCOPE_INVALID');
  });
  it('only reports immutable data matching, not an authorization or READY',async()=>{
    const {candidate,job}=await fixture();
    expect(inspectCpuCandidateForJob({job,source,candidate})).toEqual({
      versionId,sourceSha256,builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2,
      payloadSha256:sceneSha256(candidate.bytes),byteLength:candidate.bytes.length,
    });
  });
  it('rejects legacy or unknown Builder/payload schema and forged scope',async()=>{
    const {candidate,job}=await fixture();
    for(const overrides of [
      {builder:CAD_SCENE_BUILDER},{builder:'fake'},{payloadSchema:1},
    ])expect(()=>inspectCpuCandidateForJob({job:{...job,...overrides},source,candidate}))
      .toThrow('SCENE_CPU_JOB_BUILDER_MISMATCH');
    expect(validSceneScope({...candidate.manifest.scope,builder:'fake'})).toBe(false);
  });
  it('rejects QUEUED/READY/FAILED/stale attempts and wrong raw source digest',async()=>{
    const {candidate,job}=await fixture();
    for(const overrides of [{status:'QUEUED'},{status:'READY'},{status:'FAILED'},
      {attempt:0},{attempt:4}])
      expect(()=>inspectCpuCandidateForJob({job:{...job,...overrides},source,candidate}))
        .toThrow('SCENE_CPU_JOB_NOT_RUNNING');
    expect(()=>inspectCpuCandidateForJob({
      job:{...job,sourceSha256:'a'.repeat(64)},source,candidate,
    })).toThrow('SCENE_CPU_SOURCE_MISMATCH');
    expect(()=>inspectCpuCandidateForJob({
      job,source:enc.encode('modified'),candidate,
    })).toThrow('SCENE_CPU_SOURCE_MISMATCH');
  });
  it('rejects modified DTO, a different Version, or a browser manifest',async()=>{
    const {candidate,job}=await fixture();
    const tampered=Uint8Array.from(candidate.bytes);tampered[tampered.length-1]^=1;
    expect(()=>inspectCpuCandidateForJob({job,source,candidate:{...candidate,bytes:tampered}}))
      .toThrow('SCENE_CPU_CANDIDATE_INVALID');
    expect(()=>inspectCpuCandidateForJob({
      job:{...job,versionId:'22222222-2222-4222-8222-222222222222'},
      source,candidate,
    })).toThrow('SCENE_CPU_CANDIDATE_INVALID');
    expect(()=>inspectCpuCandidateForJob({job,source,candidate:{...candidate,
      manifest:{...candidate.manifest,scope:sceneScope(versionId,sourceSha256,'DXF_INSUNITS_4')},
    }})).toThrow('SCENE_CPU_CANDIDATE_INVALID');
  });
  it('rejects DTO schema1 even with correctly recomputed bytes and digest',async()=>{
    const {candidate,job}=await fixture();
    const dto=JSON.parse(new TextDecoder().decode(candidate.bytes)) as Record<string,unknown>;
    dto.schema=1;
    const bytes=enc.encode(JSON.stringify(dto));
    const manifest={...candidate.manifest,byteLength:bytes.length,sha256:sceneSha256(bytes)};
    expect(()=>inspectCpuCandidateForJob({job,source,candidate:{bytes,manifest}}))
      .toThrow('SCENE_CPU_PAYLOAD_VERSION_UNSUPPORTED');
  });
});
