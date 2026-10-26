import type { CadTextIndex } from './text-index';
import { ViewerLoadError } from './viewer-load-error';
/** One immutable download per mounted version, shared by renderer attempts. */
export class ViewerSource {
  private url?: string;
  private pending?: Promise<ArrayBuffer>;
  private abort?: AbortController;
  private complete=false;
  private textIndex?: CadTextIndex;
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
