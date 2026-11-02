const FONT_PATH='/fonts/NanumGothic-Regular.ttf';
const FONT_TIMEOUT_MS=15_000;
const abort=()=>new DOMException('취소됨','AbortError');

async function bounded<T>(work:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(signal?.aborted)throw abort();
 let timer:ReturnType<typeof setTimeout>|undefined,stop:()=>void=()=>{};
 const limit=new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>reject(new Error('메모 글꼴 준비가 15초를 초과했습니다.')),FONT_TIMEOUT_MS);
  stop=()=>reject(abort());signal?.addEventListener('abort',stop,{once:true});
 });
 try{return await Promise.race([work,limit]);}
 finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',stop);}
}
export type MemoFontLease=Readonly<{family:string;assertGlyphs:(text:string)=>void;dispose:()=>void}>;
/** A new, owned FontFace per export job. No global cache or external font URL. */
export async function loadExchangeMemoFont(signal?:AbortSignal):Promise<MemoFontLease>{
 if(signal?.aborted)throw abort();
 if(typeof document==='undefined'||typeof FontFace==='undefined'||typeof location==='undefined')
  throw new Error('메모 글꼴은 Browser에서만 준비할 수 있습니다.');
 const url=new URL(FONT_PATH,location.href);
 if(url.origin!==location.origin)throw new Error('메모 글꼴 출처가 유효하지 않습니다.');
 const controller=new AbortController(),onAbort=()=>controller.abort();
 signal?.addEventListener('abort',onAbort,{once:true});
 let face:FontFace|undefined,added=false;
 try{
  const response=await bounded(fetch(url.href,{credentials:'same-origin',cache:'no-store',signal:controller.signal}),signal);
  if(!response.ok)throw new Error('번들 메모 글꼴을 가져오지 못했습니다.');
  const bytes=await bounded(response.arrayBuffer(),signal);
  if(bytes.byteLength<1024||bytes.byteLength>8*1024*1024)throw new Error('번들 메모 글꼴 바이트가 유효하지 않습니다.');
  const {parse}=await bounded(import('three/addons/libs/opentype.module.js'),signal);
  let parsed:ReturnType<typeof parse>;
  try{parsed=parse(bytes);}catch{throw new Error('번들 메모 글꼴 형식이 유효하지 않습니다.');}
  if(signal?.aborted)throw abort();
  const family='CadExchangeMemo'+Math.random().toString(36).slice(2);
  face=new FontFace(family,bytes,{style:'normal',weight:'400'});
  await bounded(face.load(),signal);if(signal?.aborted)throw abort();
  document.fonts.add(face);added=true;
  if(!document.fonts.check(`32px "${family}"`))throw new Error('메모 글꼴이 Canvas에 준비되지 않았습니다.');
  const owned=face;
  return {family,assertGlyphs:(text:string)=>{
    for(const char of text){
      if(char==='\n'||char==='\t')continue;
      if(/[\p{Cc}\p{Cf}\p{Cs}\p{M}]/u.test(char)||parsed.charToGlyphIndex(char)===0)
        throw new Error('메모 글꼴에서 지원하지 않는 문자가 있습니다.');
    }
  },dispose:()=>{document.fonts.delete(owned);}};
 }catch(error){if(added&&face)document.fonts.delete(face);throw error;}
 finally{controller.abort();signal?.removeEventListener('abort',onAbort);}
}
