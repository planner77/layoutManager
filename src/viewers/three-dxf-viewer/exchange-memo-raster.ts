import type {ExchangeMemoInput} from '../../domain/cad-exchange';
import {EXCHANGE_LIMITS} from '../../domain/cad-exchange';
import type {MemoFontLease} from './exchange-memo-font';

const MAX_SIDE=2048,PADDING=16,TITLE_PX=40,BODY_PX=32,LINE_HEIGHT=1.35,GAP=8;
const TITLE_LINE=TITLE_PX*LINE_HEIGHT,BODY_LINE=BODY_PX*LINE_HEIGHT;
const abort=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('취소됨','AbortError');};
export type MemoRasterPlan=Readonly<{titleLines:readonly string[];bodyLines:readonly string[];width:number;height:number;pixels:number}>;
export type MemoRaster=Readonly<{memo:ExchangeMemoInput;canvas:HTMLCanvasElement;plan:MemoRasterPlan}>;

function wrap(text:string,size:number,measure:(text:string,size:number)=>number):string[]{
 const lines:string[]=[];
 for(const source of text.replace(/\t/g,'    ').split('\n')){
  let current='';
  for(const point of source){
   const next=current+point;
   if(current&&measure(next,size)>MAX_SIDE-2*PADDING){lines.push(current);current=point;}
   else current=next;
   if(measure(current,size)>MAX_SIDE-2*PADDING)throw new Error('메모 한 글자가 2048px 텍스처 폭을 초과합니다.');
  }
  lines.push(current);
 }
 return lines;
}
/** Computes every full pixel budget before any output canvas is allocated. */
export function planExchangeMemoRasters(memos:readonly ExchangeMemoInput[],measure:(text:string,size:number)=>number):MemoRasterPlan[]{
 if(memos.length>EXCHANGE_LIMITS.memos)throw new Error('메모 100개 상한을 초과했습니다.');
 let totalPixels=0;
 return memos.map(memo=>{
  const titleLines=wrap(memo.title,TITLE_PX,measure);
  const bodyLines=memo.content?wrap(memo.content,BODY_PX,measure):[];
  const width=Math.max(1,Math.ceil(Math.max(...titleLines.map(line=>measure(line,TITLE_PX)),...bodyLines.map(line=>measure(line,BODY_PX)),0)+2*PADDING));
  const height=Math.max(1,Math.ceil(2*PADDING+titleLines.length*TITLE_LINE+(bodyLines.length?GAP+bodyLines.length*BODY_LINE:0)));
  const pixels=width*height;totalPixels+=pixels;
  if(width>MAX_SIDE||height>MAX_SIDE||pixels>MAX_SIDE*MAX_SIDE||totalPixels>EXCHANGE_LIMITS.texturePixels||
    totalPixels*4>EXCHANGE_LIMITS.estimatedBytes)throw new Error('메모 텍스처 픽셀/메모리 한도를 초과했습니다.');
  return {titleLines,bodyLines,width,height,pixels};
 });
}
export function rasterizeExchangeMemos(memos:readonly ExchangeMemoInput[],font:MemoFontLease,signal?:AbortSignal):{
 rasters:readonly MemoRaster[];pixels:number;dispose:()=>void;
}{
 abort(signal);
 if(typeof document==='undefined')throw new Error('메모 텍스처는 Browser에서만 생성할 수 있습니다.');
 for(const memo of memos)font.assertGlyphs(memo.title+'\n'+memo.content);
 const measuring=document.createElement('canvas');measuring.width=1;measuring.height=1;
 const measureContext=measuring.getContext('2d');
 if(!measureContext)throw new Error('Canvas 2D 글자 측정이 불가능합니다.');
 const measure=(text:string,size:number)=>{measureContext.font=`${size}px "${font.family}"`;return measureContext.measureText(text).width;};
 let plans:MemoRasterPlan[];
 try{plans=planExchangeMemoRasters(memos,measure);}finally{measuring.width=0;measuring.height=0;}
 abort(signal);
 const rasters:MemoRaster[]=[];
 const dispose=()=>{for(const raster of rasters){raster.canvas.width=0;raster.canvas.height=0;}rasters.length=0;};
 try{
  for(let i=0;i<memos.length;i++){
   abort(signal);const plan=plans[i],canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
   rasters.push({memo:memos[i],canvas,plan});
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D 메모 렌더링이 불가능합니다.');
   ctx.fillStyle='#fffef0';ctx.fillRect(0,0,plan.width,plan.height);
   ctx.fillStyle='#1f2937';ctx.textBaseline='top';
   let y=PADDING;
   ctx.font=`${TITLE_PX}px "${font.family}"`;
   for(const line of plan.titleLines){ctx.fillText(line,PADDING,y);y+=TITLE_LINE;}
   if(plan.bodyLines.length){y+=GAP;ctx.font=`${BODY_PX}px "${font.family}"`;
    for(const line of plan.bodyLines){ctx.fillText(line,PADDING,y);y+=BODY_LINE;}}
   const png=canvas.toDataURL('image/png');
   if(!png.startsWith('data:image/png;base64,')||png.length<=22)throw new Error('메모 PNG 인코딩에 실패했습니다.');
   abort(signal);
  }
  return {rasters,pixels:plans.reduce((n,p)=>n+p.pixels,0),dispose};
 }catch(error){dispose();throw error;}
}
