/** One immutable download per mounted version, shared by renderer attempts. */
export class ViewerSource {
  private url?: string;
  private pending?: Promise<ArrayBuffer>;
  private abort?: AbortController;
  read(url:string): Promise<ArrayBuffer> {
    if(this.url===url && this.pending)return this.pending;
    this.dispose();this.url=url;
    const abort=this.abort=new AbortController();
    const pending=fetch(url,{signal:abort.signal}).then(async response=>{
      if(!response.ok)throw new Error(response.status===404?'CAD 원본 파일을 찾을 수 없습니다.':'CAD 원본을 불러오지 못했습니다.');
      const bytes=await response.arrayBuffer();
      if(abort.signal.aborted)throw new DOMException('취소됨','AbortError');
      return bytes;
    });
    this.pending=pending;
    void pending.catch(()=>{if(this.pending===pending){this.pending=undefined;this.url=undefined;}});
    return pending;
  }
  dispose() {this.abort?.abort();this.abort=undefined;this.pending=undefined;this.url=undefined;}
}
