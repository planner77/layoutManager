import {expect,test,type Page} from '@playwright/test';
import {masterFields} from './master-helper';
import {clickViewerTestCommand} from './viewer-menu-helper';

declare global {interface Window {r4Lifecycle:{workers:()=>number}}}
function largeDxf(count:number){
  const lines=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
  for(let i=0;i<count;i++){
    const x=i%100,y=Math.floor(i/100);
    lines.push('0','LINE','5',(i+1).toString(16).toUpperCase(),'8','LOAD',
      '10',String(x),'20',String(y),'11',String(x+0.5),'21',String(y+0.2));
  }
  lines.push('0','ENDSEC','0','EOF','');return Buffer.from(lines.join('\n'));
}
async function twoFrames(page:Page){
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}
/** Sample the SAME 30 rAF intervals during the SAME pan gesture for each cohort.
 * These are CPU/browser frame intervals, not GPU VRAM or real-site SLA.
 */
async function panFrames(page:Page){
  const samples=page.evaluate(()=>new Promise<number[]>(resolve=>{
    const observed:number[]=[];let previous:number|null=null;
    const tick=(now:number)=>{
      if(previous!==null)observed.push(now-previous);previous=now;
      if(observed.length>=30)resolve(observed);else requestAnimationFrame(tick);
    };requestAnimationFrame(tick);
  }));
  const box=(await page.getByTestId('cad-canvas').locator('canvas').boundingBox())!;
  await page.mouse.move(box.x+box.width-50,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width-80,box.y+box.height/2+20,{steps:12});
  await page.mouse.up();
  return (await samples).sort((a,b)=>a-b);
}
const frameStats=(frames:number[])=>({
 samples:frames.length,p50:frames[15],p95:frames[28],max:frames[29],
 over16_7:frames.filter(value=>value>16.7).length,
});
for(const count of [1000,10000])test(`R4 browser ${count} synthetic DXF LINE inputs with bounded 100 Memo pins, frames and disposal`,async({page,request},testInfo)=>{
  test.setTimeout(240_000);
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;let workers=0;
    window.Worker=class extends NativeWorker{
      private alive=true;
      constructor(...args:ConstructorParameters<typeof Worker>){super(...args);workers++;}
      terminate(){if(this.alive){this.alive=false;workers--;}super.terminate();}
    };
    window.r4Lifecycle={workers:()=>workers};
  });
  const tag='r4-load-'+count;
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:tag+'.dxf',mimeType:'application/octet-stream',buffer:largeDxf(count)},
    ...(await masterFields(request,{businessUnit:tag,site:'memo-load',building:'A',floor:'1'})),
    registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);const version=await response.json() as {id:string};
  await page.goto('/');await twoFrames(page);
  const session=await page.context().newCDPSession(page);
  const nativeListeners=async()=>{
    const object=await session.send('Runtime.evaluate',{expression:'window',objectGroup:'r4-listeners'});
    if(!object.result.objectId)throw new Error('Window listener inspection unavailable');
    const {listeners}=await session.send('DOMDebugger.getEventListeners',{objectId:object.result.objectId});
    // Playwright installs its hit-target interceptor lazily on first pointer action.
    // Identify only its injected scripts through their own global-check listeners;
    // application handlers remain part of the native listener accounting.
    const harnessScripts=new Set(listeners.filter(listener=>
      ['__playwright_global_listeners_check__','__playwright_snapshotter_global_listeners_check__'].includes(listener.type))
      .map(listener=>listener.scriptId));
    const counts:Record<string,number>={},rawCounts:Record<string,number>={};
    for(const listener of listeners){
      const rawKey=listener.type+':'+listener.useCapture;rawCounts[rawKey]=(rawCounts[rawKey]??0)+1;
      if(harnessScripts.has(listener.scriptId))continue;
      if(!['blur','scroll','keydown','pointerdown','pointerup','resize','fullscreenchange'].includes(listener.type))continue;
      const key=listener.type+':'+listener.useCapture;counts[key]=(counts[key]??0)+1;
    }
    const details=listeners.filter(listener=>!harnessScripts.has(listener.scriptId)).map(listener=>({type:listener.type,capture:listener.useCapture,
      script:listener.scriptId,line:listener.lineNumber,column:listener.columnNumber,
      name:listener.handler?.description?.slice(0,80)}));
    // Listener inspection itself exposes remote function references. Release these
    // explicitly so the debugger cannot retain retired Viewer closures during GC.
    const handles=new Set(listeners.flatMap(listener=>
      [listener.handler?.objectId,listener.originalHandler?.objectId].filter((id):id is string=>!!id)));
    for(const objectId of handles)await session.send('Runtime.releaseObject',{objectId});
    await session.send('Runtime.releaseObjectGroup',{objectGroup:'r4-listeners'});
    return {counts,rawCounts,harnessScripts:[...harnessScripts],releasedHandlers:handles.size,details};
  };
  const homeListeners=await nativeListeners(),baseline=homeListeners.counts;
  await page.locator(`a[href*="/cad/versions/${version.id}/viewer"]`).first().click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const canvas=await page.getByTestId('cad-canvas').locator('canvas').elementHandle();
  const heap=async()=>{
    try{await session.send('HeapProfiler.collectGarbage');return (await session.send('Runtime.getHeapUsage')).usedSize;}
    catch{return null;}
  };
  const beforeHeap=await heap();
  const counters=async()=>{
    try{
      const now=await session.send('Memory.getDOMCounters');
      return {documents:now.documents,nodes:now.nodes,jsEventListeners:now.jsEventListeners};
    }catch{return null;} // Browser/CDP support varies.
  };
  const initialDom=await counters();
  const emptyFrames=await panFrames(page);
  const listenersBeforePins=(await nativeListeners()).counts;
  let listenersAfterFirst:Record<string,number>|null=null;
  for(let i=0;i<100;i++){
    await clickViewerTestCommand(page,'viewer-menu-memo-add');
    await page.getByTestId('cad-memo-title').fill('Load '+i);
    await page.getByTestId('cad-memo-x').fill(String(10+(i%10)*5));
    await page.getByTestId('cad-memo-y').fill(String(count===1000?Math.floor(i/10):10+Math.floor(i/10)*5));
    await page.getByTestId('cad-memo-coordinate-place').click();
    await page.getByTestId('cad-memo-create').click();
    await expect(page.getByTestId('cad-memo-status')).toContainText(`${i+1}/100`);
    if(i===0)listenersAfterFirst=(await nativeListeners()).counts;
  }
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(100);
  const listenersAfterPins=(await nativeListeners()).counts;
  expect(listenersAfterFirst).not.toBeNull();expect(listenersAfterPins).toEqual(listenersAfterFirst);
  await page.getByTestId('cad-memo-cancel').click();
  await page.getByTestId('viewer-tools-dock').getByRole('button',{name:'도구 닫기',exact:true}).click();
  if(await page.getByTestId('fullscreen-layer-panel').isVisible())
    await page.getByRole('button',{name:'레이어 패널 접기',exact:true}).click();
  const frames=await panFrames(page),afterHeap=await heap();
  const afterPinsDom=await counters();
  // CSS-hidden keeps Memo state, projection work and handlers in place,
  // but removes label/pin paint. Do not misattribute renderer-only p95 to Memo.
  const overlay=page.getByTestId('cad-memo-overlay');
  await overlay.evaluate(node=>{(node as HTMLElement).style.visibility='hidden';});
  await twoFrames(page);
  const hiddenFrames=await panFrames(page);
  await overlay.evaluate(node=>{(node as HTMLElement).style.visibility='';});
  await twoFrames(page);
  expect(frames).toHaveLength(30);
  expect(await canvas!.evaluate(node=>node===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
  await canvas!.dispose();
  await page.screenshot({path:testInfo.outputPath(`r4-${count}-100pins.png`)});
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('link',{name:'도면 목록으로 이동',exact:true}).click();
  await expect(page.getByTestId('cad-canvas')).toHaveCount(0);await twoFrames(page);
  const disposedHeap=await heap(),disposedDom=await counters(),native=await nativeListeners();
  const disposed={listeners:native.counts,workers:await page.evaluate(()=>window.r4Lifecycle.workers())};
  if(Object.entries(disposed.listeners).some(([key,value])=>value>(baseline[key]??0)))
    console.log('R4_REMAINING_LISTENER_METADATA',JSON.stringify(native.details));
  console.log('R4_BROWSER_LOAD',JSON.stringify({dxfLineInputs:count,productMemoPins:100,
    frames:frameStats(frames),frameControls:{noMemo:frameStats(emptyFrames),
      hundredPinsHidden:frameStats(hiddenFrames),hundredPinsVisible:frameStats(frames)},
    heap:{before:beforeHeap,after100:afterHeap,afterDispose:disposedHeap},
    domCounters:{before:initialDom,after100:afterPinsDom,afterDispose:disposedDom},
    listenerBaseline:baseline,listenerBeforePins:listenersBeforePins,listenerAfterFirst:listenersAfterFirst,
    listenerAfter100:listenersAfterPins,listenerAfterDispose:disposed.listeners,workersAfterDispose:disposed.workers,
    rawHomeListeners:homeListeners.rawCounts,rawDisposedListeners:native.rawCounts,
    excludedHarnessScripts:native.harnessScripts,releasedInspectorHandlers:native.releasedHandlers}));
  expect(disposed.workers).toBe(0);
  for(const [key,value] of Object.entries(disposed.listeners))expect(value,key).toBeLessThanOrEqual(baseline[key]??0);
  await page.locator(`a[href*="/cad/versions/${version.id}/viewer"]`).first().click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await expect(page.getByTestId('cad-memo-status')).toContainText('0/100');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
  await page.getByTestId('cad-memo-cancel').click();
  await page.getByRole('link',{name:'도면 목록으로 이동',exact:true}).click();
  await expect(page.getByTestId('cad-canvas')).toHaveCount(0);await twoFrames(page);
  const second=await nativeListeners(),secondWorkers=await page.evaluate(()=>window.r4Lifecycle.workers());
  const secondHeap=await heap(),secondDom=await counters();
  console.log('R4_SECOND_DISPOSE',JSON.stringify({dxfLineInputs:count,memoPinsOnReentry:0,
    listeners:second.counts,rawListeners:second.rawCounts,workers:secondWorkers,heap:secondHeap,
    domCounters:secondDom,heapDeltaFromFirstDispose:secondHeap!==null&&disposedHeap!==null?
      secondHeap-disposedHeap:null,releasedInspectorHandlers:second.releasedHandlers}));
  expect(secondWorkers).toBe(0);
  for(const [key,value] of Object.entries(second.counts))expect(value,key).toBeLessThanOrEqual(baseline[key]??0);
  // Third same-workload (zero Memo) cycle: measure warm route/framework cache
  // after a second and third disposal. Heap growth alone is NOT proof of an app leak.
  await page.locator(`a[href*="/cad/versions/${version.id}/viewer"]`).first().click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
  await page.getByRole('link',{name:'도면 목록으로 이동',exact:true}).click();
  await expect(page.getByTestId('cad-canvas')).toHaveCount(0);await twoFrames(page);
  const third=await nativeListeners(),thirdWorkers=await page.evaluate(()=>window.r4Lifecycle.workers());
  const thirdHeap=await heap(),thirdDom=await counters();
  console.log('R4_THIRD_DISPOSE',JSON.stringify({dxfLineInputs:count,memoPinsOnReentry:0,
    listeners:third.counts,workers:thirdWorkers,heap:thirdHeap,domCounters:thirdDom,
    heapDeltaFromSecondDispose:thirdHeap!==null&&secondHeap!==null?thirdHeap-secondHeap:null,
    cdpInspectorNotes:'CDP Runtime/DOMDebugger references and Next.js route/module cache are not individually ruled out'}));
  expect(thirdWorkers).toBe(0);
  for(const [key,value] of Object.entries(third.counts))expect(value,key).toBeLessThanOrEqual(baseline[key]??0);
});
