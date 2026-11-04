/** #225 B2-B draft: prepublication DATA validation only; not G7 authorization.
 * It cannot publish a Scene, write CurrentScene, or mark a Job READY.
 * Existing 0.60.0 Queue uses the OLD browser builder and fails this guard.
 */
import {CAD_SCENE_CPU_BUILDER,cpuSceneScope,validateSceneManifest} from '../../domain/cad-scene';
import {sceneSha256} from '../../domain/scene-digest';
import {SCENE_PAYLOAD_LIMITS,validateStoredScenePayload} from '../../domain/scene-payload';
export type CpuJobIdentity=Readonly<{
  versionId:string;sourceSha256:string;builder:string;payloadSchema:number;
  status:string;attempt:number;
}>;
export type CpuCandidateEnvelope=Readonly<{bytes:Uint8Array;manifest:unknown}>;
export type CpuCandidateReceipt=Readonly<{
  versionId:string;sourceSha256:string;builder:typeof CAD_SCENE_CPU_BUILDER;
  payloadSchema:2;payloadSha256:string;byteLength:number;
}>;
const SHA=/^[a-f0-9]{64}$/;
function fail(code:string):never{throw new Error(code);}
/** This immutable-data receipt is NOT a Worker/Actor/Site grant, readback
 * attestation, a verified storage write or CurrentScene CAS. */
export function inspectCpuCandidateForJob(input:Readonly<{
  job:CpuJobIdentity;source:Uint8Array;candidate:CpuCandidateEnvelope;
}>):CpuCandidateReceipt{
  const {job,candidate,source}=input;
  if(job.status!=='RUNNING'||!Number.isSafeInteger(job.attempt)||
      job.attempt<1||job.attempt>3)fail('SCENE_CPU_JOB_NOT_RUNNING');
  if(job.builder!==CAD_SCENE_CPU_BUILDER||job.payloadSchema!==2)
    fail('SCENE_CPU_JOB_BUILDER_MISMATCH');
  if(typeof job.sourceSha256!=='string'||!SHA.test(job.sourceSha256)||
     source.length===0||sceneSha256(source)!==job.sourceSha256)
    fail('SCENE_CPU_SOURCE_MISMATCH');
  if(!(candidate.bytes instanceof Uint8Array)||candidate.bytes.length===0||
     candidate.bytes.length>SCENE_PAYLOAD_LIMITS.bytes)
    fail('SCENE_CPU_CANDIDATE_INVALID');
  const raw=candidate.manifest;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!('scope' in raw)||
     !raw.scope||typeof raw.scope!=='object'||Array.isArray(raw.scope)||
     !('sourceUnit' in raw.scope)||raw.scope.sourceUnit!=='DXF_INSUNITS_4')
    fail('SCENE_CPU_CANDIDATE_INVALID');
  const digest=sceneSha256(candidate.bytes);
  try{
    const scope=cpuSceneScope(job.versionId,job.sourceSha256,'DXF_INSUNITS_4');
    const manifest=validateSceneManifest(raw,{scope,format:'CUSTOM_DTO',
      byteLength:candidate.bytes.length,sha256:digest});
    const payload:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(candidate.bytes));
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
        !('schema' in payload)||payload.schema!==2)fail('SCENE_CPU_PAYLOAD_VERSION_UNSUPPORTED');
    validateStoredScenePayload(candidate.bytes,manifest);
  }catch(error){
    if(error instanceof Error&&error.message==='SCENE_CPU_PAYLOAD_VERSION_UNSUPPORTED')throw error;
    fail('SCENE_CPU_CANDIDATE_INVALID');
  }
  return Object.freeze({versionId:job.versionId,sourceSha256:job.sourceSha256,
    builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2,
    payloadSha256:digest,byteLength:candidate.bytes.length});
}
