import { CadError } from '@/domain/cad';
import { boundedJson } from '@/server/http';
import { SCENE_MAX_BYTES } from '@/server/storage/scene-storage';

const invalid=()=>new CadError('SCENE_INVALID','Scene 데이터가 올바르지 않습니다.',400);
export async function parseScenePublicationInput(request:Request):Promise<{
  manifest:unknown;bytes:Uint8Array;expectedRevision:unknown;
}>{
  const body=await boundedJson(request,Math.ceil(SCENE_MAX_BYTES*4/3)+16384);
  if(Object.keys(body).sort().join(',')!=='bytesBase64,expectedRevision,manifest'||
    typeof body.bytesBase64!=='string'||body.bytesBase64.length>Math.ceil(SCENE_MAX_BYTES*4/3)+4||
    body.bytesBase64.length%4!==0||!/^[A-Za-z0-9+/=]+$/.test(body.bytesBase64))throw invalid();
  const bytes=Buffer.from(body.bytesBase64,'base64');
  if(bytes.toString('base64')!==body.bytesBase64||bytes.length>SCENE_MAX_BYTES)throw invalid();
  return {manifest:body.manifest,bytes,expectedRevision:body.expectedRevision};
}
