import {afterEach,expect,test,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {loadExchangeMemoFont} from '../../viewers/three-dxf-viewer/exchange-memo-font';

const fontFile=new URL('../../public/fonts/NanumGothic-Regular.ttf',import.meta.url);
afterEach(()=>vi.unstubAllGlobals());
function browser(response:Response){
 const added=new Set<unknown>();
 class Face{
  constructor(public family:string,public bytes:ArrayBuffer){}
  async load(){return this;}
 }
 vi.stubGlobal('location',{href:'http://localhost/viewer',origin:'http://localhost'});
 vi.stubGlobal('FontFace',Face);
 vi.stubGlobal('document',{fonts:{add:(face:unknown)=>added.add(face),delete:(face:unknown)=>added.delete(face),check:()=>true}});
 const fetcher=vi.fn(async()=>response);vi.stubGlobal('fetch',fetcher);
 return {added,fetcher};
}

test('bundled same-origin font checks actual Korean glyphs and releases its owned face',async()=>{
 const file=await readFile(fontFile);const {added,fetcher}=browser(new Response(file));
 const lease=await loadExchangeMemoFont();
 expect(fetcher).toHaveBeenCalledWith('http://localhost/fonts/NanumGothic-Regular.ttf',expect.objectContaining({credentials:'same-origin'}));
 expect(added.size).toBe(1);expect(()=>lease.assertGlyphs('한글 ABC\n내용')).not.toThrow();
 expect(()=>lease.assertGlyphs('😀')).toThrow('지원하지');
 lease.dispose();expect(added.size).toBe(0);
});

test('404, invalid bytes and pre-abort reject without installing a face',async()=>{
 let fixture=browser(new Response('',{status:404}));
 await expect(loadExchangeMemoFont()).rejects.toThrow('가져오지');expect(fixture.added.size).toBe(0);
 fixture=browser(new Response(new Uint8Array(1024)));
 await expect(loadExchangeMemoFont()).rejects.toThrow('형식');expect(fixture.added.size).toBe(0);
 const controller=new AbortController();controller.abort();
 await expect(loadExchangeMemoFont(controller.signal)).rejects.toMatchObject({name:'AbortError'});
 expect(fixture.fetcher).toHaveBeenCalledTimes(1);
});
