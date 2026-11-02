import type { CadTextIndex } from './text-index';
import { ViewerLoadError } from './viewer-load-error';
import {sceneScope,validateSceneManifest,type SceneManifest} from '../../domain/cad-scene';
import {validateStoredScenePayload} from '../../domain/scene-payload';
export type ReadyScene = Readonly<{bytes:Uint8Array;manifest:SceneManifest;assetId:string;revision:number}>;
/** One immutable download per mounted version, shared by renderer attempts. */
export class ViewerSource {
  private url?: string;
  private pending?: Promise<ArrayBuffer>;
  private abort?: AbortController;
  private complete=false;
  private textIndex?: CadTextIndex;
  /** No source GET, parser or cached authorization on this path. */
  async readScene(versionId:string,sourceSha256:string,signal:AbortSignal):Promise<ReadyScene|null> {
    const endpoint=`/api/cad-files/${encodeURIComponent(versionId)}/scene`;
    try {
      const response=await fetch(endpoint,{signal,credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new ViewerLoadError('scene',response.status===401?'UNAUTHENTICATED':response.status===403?'ACCESS_DENIED':'UNAVAILABLE','Scene Asset을 조회하지 못했습니다. 로그인·사업장 권한 및 서버 상태를 확인하세요.');
      const value=await response.json();
      // Explicit rollout boundary: old schemas have never had a Scene pointer.
      if(value.status==='LEGACY_DISABLED')return null;
      if(value.status!=='READY')throw new ViewerLoadError('scene',value.status==='MISSING'?'UNAVAILABLE':'REBUILD_REQUIRED','저장된 Scene Asset이 없거나 호환되지 않습니다. 원본 재변환은 도면 메뉴에서 명시적으로 실행하세요.');
      const manifest=value.manifest as SceneManifest;
      const scope=sceneScope(versionId,sourceSha256,manifest?.scope?.sourceUnit);
      validateSceneManifest(manifest,{scope,format:'CUSTOM_DTO',byteLength:manifest.byteLength,sha256:manifest.sha256});
      if(manifest.byteLength>32*1024*1024||!Number.isSafeInteger(value.revision)||value.revision<0||
        typeof value.assetId!=='string'||!/^[a-f0-9-]{36}$/.test(value.assetId)||
        value.contentUrl!==`${endpoint}/content?assetId=${value.assetId}`)throw new Error('SCENE_RESPONSE_INVALID');
      const content=await fetch(value.contentUrl,{signal,credentials:'same-origin',cache:'no-store'});
      if(!content.ok)throw new Error('SCENE_CONTENT_UNAVAILABLE');
      const reader=content.body?.getReader();if(!reader)throw new Error('SCENE_BODY_MISSING');
      const chunks:Uint8Array[]=[];let length=0;
      try {for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>manifest.byteLength)throw new Error('SCENE_LENGTH');chunks.push(part.value);}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}
      finally{reader.releaseLock();}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      if(signal.aborted)throw new DOMException('취소됨','AbortError');
      validateStoredScenePayload(bytes,manifest);
      return {bytes,manifest,assetId:value.assetId,revision:value.revision};
    }catch(error){
      if(signal.aborted)throw new DOMException('취소됨','AbortError');
      if(error instanceof ViewerLoadError)throw error;
      throw new ViewerLoadError('scene','REBUILD_REQUIRED','Scene Asset 무결성·형식 검증 또는 전송에 실패했습니다. 사용자 자료는 보존되며 자동으로 원본을 다시 읽지 않습니다.',error);
    }
  }
  getTextIndex(url: string) { return this.url === url ? this.textIndex : undefined; }
  setTextIndex(url: string, index: CadTextIndex) { if (this.url === url && this.complete) this.textIndex = index; }
  state(url:string):'miss'|'pending'|'memory' {return this.url!==url||!this.pending?'miss':this.complete?'memory':'pending';}
  read(url:string): Promise<ArrayBuffer> {
    if(this.url===url && this.pending)return this.pending;
    this.dispose();this.url=url;
    const abort=this.abort=new AbortController();
    const pending=fetch(url,{signal:abort.signal}).catch(error=>{
      if(abort.signal.aborted)throw new DOMException('취소됨','AbortError');
      throw new ViewerLoadError('source','NETWORK','CAD 원본 요청에 실패했습니다.',error);
    }).then(async response=>{
      if(!response.ok)throw new ViewerLoadError('source',response.status===404?'HTTP_404':'HTTP_ERROR',response.status===404?'CAD 원본 파일을 찾을 수 없습니다.':'CAD 원본을 불러오지 못했습니다.');
      const bytes=await response.arrayBuffer().catch(error=>{if(abort.signal.aborted)throw new DOMException('취소됨','AbortError');throw new ViewerLoadError('source','BODY_READ','CAD 원본을 읽지 못했습니다.',error);});
      if(abort.signal.aborted)throw new DOMException('취소됨','AbortError');
      this.complete=true;
      return bytes;
    });
    this.pending=pending;
    void pending.catch(()=>{if(this.pending===pending){this.pending=undefined;this.url=undefined;}});
    return pending;
  }
  dispose() {this.textIndex=undefined;this.abort?.abort();this.abort=undefined;this.pending=undefined;this.url=undefined;this.complete=false;}
}
