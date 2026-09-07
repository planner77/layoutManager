export type ViewerMetric = {
  schemaVersion:1; renderer:string; versionId:string; timestamp:string;
  result:'partial'|'success'|'empty'|'error'|'cancelled';
  sourceMode:'miss'|'pending'|'memory'; fileBytes:number|null; entityCount:number|null;
  sourceWaitMs:number|null; initializeMs:number|null; adapterLoadMs:number|null; totalMs:number;
  firstDisplayMs:number|null; parseMs:null; jsHeapBytes:number|null;
  browser:string; reasons:Record<string,string>; error:string|null;
};
export async function observeFrame():Promise<boolean> {
  if(typeof requestAnimationFrame==='undefined' || document.visibilityState!=='visible')return false;
  return new Promise(resolve=>{
    let frame=0;
    const timer=setTimeout(()=>{cancelAnimationFrame(frame);resolve(false);},1000);
    frame=requestAnimationFrame(()=>{clearTimeout(timer);resolve(true);});
  });
}
export function heapBytes():number|null {
  const memory=(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory;
  return memory && Number.isFinite(memory.usedJSHeapSize)?memory.usedJSHeapSize:null;
}
