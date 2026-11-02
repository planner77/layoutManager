import {expect,test,type APIRequestContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {masterFields} from './master-helper';
import {clickViewerCommand,clickViewerTestCommand,openViewerMenu} from './viewer-menu-helper';

declare global {interface Window {__exchangeLife?:{
 mode:string;pending:Array<()=>void>;created:string[];revoked:string[];raster:HTMLCanvasElement[];
 release:()=>void;stats:()=>{pending:number;created:number;revoked:number;fontFaces:number;unclearedRaster:number};
}}}
const drawing=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES','0','LINE','5','A1','8','A','10','0','20','0','11','100','21','0','0','ENDSEC','0','EOF',''].join('\n'));
async function upload(request:APIRequestContext){
 const label='R5b-life-'+randomUUID().slice(0,8);
 const response=await request.post('/api/cad-files',{multipart:{file:{name:label+'.dxf',mimeType:'application/octet-stream',buffer:drawing},
  ...(await masterFields(request,{businessUnit:label,site:'memo-life',building:'A',floor:'1'})),
  registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234'}});
 expect(response.status()).toBe(201);return (await response.json()) as {id:string};
}
async function installHarness(page:Page){
 await page.addInitScript(()=>{
  const life={mode:'none',pending:[] as Array<()=>void>,created:[] as string[],revoked:[] as string[],raster:[] as HTMLCanvasElement[],
   release(){this.mode='none';for(const finish of this.pending.splice(0))finish();},
   stats(){return {pending:this.pending.length,created:this.created.length,revoked:this.revoked.length,
    fontFaces:[...document.fonts].filter(face=>face.family.startsWith('CadExchangeMemo')).length,
    unclearedRaster:this.raster.filter(canvas=>canvas.width>0||canvas.height>0).length};}};
  window.__exchangeLife=life;
  const fontLoad=FontFace.prototype.load;
  FontFace.prototype.load=function(){if(this.family.startsWith('CadExchangeMemo')&&life.mode==='font'){
    return new Promise<FontFace>((resolve,reject)=>life.pending.push(()=>fontLoad.call(this).then(resolve,reject)));}
   return fontLoad.call(this);};
  const toDataURL=HTMLCanvasElement.prototype.toDataURL;
  const getContext=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:[string,...unknown[]]){
   if(life.mode==='canvasNull'&&args[0]==='2d'&&this.width===1&&this.height===1)return null;
   return Reflect.apply(getContext,this,args);
  } as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL=function(type?:string,quality?:number){
   if(type==='image/png'&&this.width>1&&this.height>1){life.raster.push(this);
    if(life.mode==='dataThrow')throw new Error('injected memo PNG failure');
    if(life.mode==='dataInvalid')return 'data:image/png;base64,';}
   return toDataURL.call(this,type,quality);};
  const toBlob=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(callback,type?,quality?){
   if(life.mode==='blob'&&type==='image/png'){
    life.pending.push(()=>toBlob.call(this,callback,type,quality));return;}
   return toBlob.call(this,callback,type,quality);};
  const readArray=FileReader.prototype.readAsArrayBuffer;
  FileReader.prototype.readAsArrayBuffer=function(blob){
   if(life.mode==='reader'){life.pending.push(()=>readArray.call(this,blob));return;}
   return readArray.call(this,blob);};
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=function(value){const url=create(value);
   if(value instanceof Blob&&value.type.startsWith('model/gltf'))life.created.push(url);return url;};
  URL.revokeObjectURL=function(url){if(life.created.includes(url))life.revoked.push(url);return revoke(url);};
 });
}
async function setup(page:Page,request:APIRequestContext,title='한글 수명주기'){
 await installHarness(page);const version=await upload(request);
 await page.goto(`/cad/versions/${version.id}/viewer?renderer=three-dxf-viewer`);
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await clickViewerTestCommand(page,'viewer-menu-memo-add');
 await page.getByTestId('cad-memo-title').fill(title);await page.getByTestId('cad-memo-content').fill('검사 내용');
 await page.getByTestId('cad-memo-x').fill('20');await page.getByTestId('cad-memo-y').fill('20');
 await page.getByTestId('cad-memo-coordinate-place').click();await page.getByTestId('cad-memo-create').click();
 await expect(page.getByTestId('cad-memo-status')).toContainText('1/100');
 return version;
}
async function openPrepared(page:Page){
 await clickViewerCommand(page,'drawing','GLB/glTF 내보내기');const dialog=page.getByTestId('cad-exchange-dialog');await expect(dialog).toBeVisible();
 await dialog.getByTestId('cad-exchange-source-enable').uncheck();await dialog.getByTestId('cad-exchange-memos-enable').check();
 await dialog.getByTestId('cad-exchange-review').click();await expect(dialog.getByTestId('cad-exchange-preview')).toBeVisible();
 const ack=dialog.getByTestId('cad-exchange-partial-ack');if(await ack.count())await ack.check();return dialog;
}
async function stats(page:Page){return page.evaluate(()=>window.__exchangeLife!.stats());}
async function release(page:Page){await page.evaluate(()=>window.__exchangeLife!.release());}
async function mode(page:Page,value:string){await page.evaluate(value=>{window.__exchangeLife!.mode=value;},value);}
async function expectClean(page:Page){
 await expect.poll(async()=>stats(page)).toMatchObject({pending:0,fontFaces:0,unclearedRaster:0});
}
async function expectNoDownload(page:Page,action:()=>Promise<void>){
 let count=0;const listener=()=>{count++;};page.on('download',listener);try{await action();await page.waitForTimeout(350);expect(count).toBe(0);}finally{page.off('download',listener);}
}

test('TC-R5B-05/08: FontFace hold then close aborts with no late download or installed face; retry succeeds',async({page,request})=>{
 test.setTimeout(120_000);await setup(page,request);const dialog=await openPrepared(page);await mode(page,'font');
 await dialog.getByTestId('cad-exchange-download').click();
 await expect.poll(async()=>(await stats(page)).pending).toBeGreaterThan(0);
 await expectNoDownload(page,async()=>{await dialog.getByRole('button',{name:'취소 / 닫기'}).click();await release(page);});
 await expect(dialog).toHaveCount(0);await expectClean(page);
 const recovered=await openPrepared(page);const pending=page.waitForEvent('download');await recovered.getByTestId('cad-exchange-download').click();
 expect((await pending).suggestedFilename()).toMatch(/\.glb$/);await recovered.getByRole('button',{name:'취소 / 닫기'}).click();
 await expect.poll(async()=>(await stats(page)).revoked).toBe(1);await expectClean(page);
});

test('TC-R5B-05: native FontFace load timeout at 15 seconds leaves no face or artifact and recovers',async({page,request})=>{
 test.setTimeout(90_000);await setup(page,request);const dialog=await openPrepared(page);await mode(page,'font');
 await expectNoDownload(page,async()=>{
  await dialog.getByTestId('cad-exchange-download').click();
  await expect.poll(async()=>(await stats(page)).pending).toBeGreaterThan(0);
  await expect(dialog.getByRole('alert')).toContainText('15초',{timeout:20_000});
 });
 expect((await stats(page)).created).toBe(0);
 await release(page);await expectClean(page);
 await dialog.getByTestId('cad-exchange-review').click();await expect(dialog.getByTestId('cad-exchange-preview')).toBeVisible();
 const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();await pending;
 await dialog.getByRole('button',{name:'취소 / 닫기'}).click();await expectClean(page);
});

for(const kind of ['blob','reader'] as const)test(`TC-R5B-08: held native ${kind} encoder keeps global mutex until release, cancel creates no file`,async({page,request})=>{
 test.setTimeout(120_000);await setup(page,request);const dialog=await openPrepared(page);await mode(page,kind);
 await dialog.getByTestId('cad-exchange-download').click();await expect.poll(async()=>(await stats(page)).pending).toBeGreaterThan(0);
 await dialog.getByRole('button',{name:'취소 / 닫기'}).click();await expect(dialog).toHaveCount(0);
 const menu=await openViewerMenu(page,'drawing');await expect(menu.getByTestId('viewer-menu-exchange-export')).toBeDisabled();
 await expectNoDownload(page,async()=>{await release(page);});
 await expect(menu.getByTestId('viewer-menu-exchange-export')).toBeEnabled();await page.keyboard.press('Escape');await expectClean(page);
 const recovered=await openPrepared(page);const pending=page.waitForEvent('download');await recovered.getByTestId('cad-exchange-download').click();
 expect((await pending).suggestedFilename()).toMatch(/\.glb$/);await recovered.getByRole('button',{name:'취소 / 닫기'}).click();
 await expect.poll(async()=>(await stats(page)).revoked).toBe(1);await expectClean(page);
});

for(const kind of ['dataThrow','dataInvalid'] as const)test(`TC-R5B-05: native Canvas ${kind} failure yields no artifact and a retry succeeds`,async({page,request})=>{
 test.setTimeout(120_000);await setup(page,request);const dialog=await openPrepared(page);await mode(page,kind);
 await expectNoDownload(page,async()=>{
  await dialog.getByTestId('cad-exchange-download').click();await expect(dialog.getByRole('alert')).toBeVisible();});
 expect((await stats(page)).created).toBe(0);await expectClean(page);
 await dialog.getByTestId('cad-exchange-review').click();await expect(dialog.getByTestId('cad-exchange-preview')).toBeVisible();
 await mode(page,'none');const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();
 expect((await pending).suggestedFilename()).toMatch(/\.glb$/);await dialog.getByRole('button',{name:'취소 / 닫기'}).click();
 await expect.poll(async()=>(await stats(page)).revoked).toBe(1);await expectClean(page);
});

test('TC-R5B-05: Canvas 2D unavailable fails before output allocation and recovers',async({page,request})=>{
 test.setTimeout(120_000);await setup(page,request);const dialog=await openPrepared(page);await mode(page,'canvasNull');
 await expectNoDownload(page,async()=>{await dialog.getByTestId('cad-exchange-download').click();
  await expect(dialog.getByRole('alert')).toContainText('Canvas 2D');});
 expect((await stats(page)).created).toBe(0);await expectClean(page);
 await mode(page,'none');await dialog.getByTestId('cad-exchange-review').click();
 const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();await pending;
 await dialog.getByRole('button',{name:'취소 / 닫기'}).click();await expectClean(page);
});

for(const kind of ['404','invalid'] as const)test(`TC-R5B-05: bundled font ${kind} fails visibly and retries`,async({page,request},testInfo)=>{
 test.setTimeout(120_000);await setup(page,request);const dialog=await openPrepared(page);
 await page.route('**/fonts/NanumGothic-Regular.ttf',route=>kind==='404'?route.fulfill({status:404,body:''}):
  route.fulfill({status:200,contentType:'font/ttf',body:Buffer.alloc(1024)}));
 await expectNoDownload(page,async()=>{await dialog.getByTestId('cad-exchange-download').click();
  await expect(dialog.getByRole('alert')).toContainText(kind==='404'?'글꼴을 가져오지':'글꼴 형식');});
 expect((await stats(page)).created).toBe(0);await expectClean(page);
 await page.unroute('**/fonts/NanumGothic-Regular.ttf');await dialog.getByTestId('cad-exchange-review').click();
 const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();await pending;
 await dialog.getByRole('button',{name:'취소 / 닫기'}).click();await expectClean(page);
 await testInfo.attach('font-retry.json',{body:Buffer.from(JSON.stringify(await stats(page))),contentType:'application/json'});
});

test('TC-R5B-05: unsupported emoji glyph fails without silent fallback or artifact',async({page,request})=>{
 test.setTimeout(120_000);await setup(page,request,'😀 glyph');const dialog=await openPrepared(page);
 await expectNoDownload(page,async()=>{await dialog.getByTestId('cad-exchange-download').click();
  await expect(dialog.getByRole('alert')).toContainText('지원하지 않는 문자');});
 expect((await stats(page)).created).toBe(0);await expectClean(page);
});

test('TC-R5B-08: ten actual export outcomes leave no owned font or raster and all model URLs revoked',async({page,request})=>{
 test.setTimeout(240_000);await setup(page,request);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const heap=async()=>{await cdp.send('HeapProfiler.collectGarbage');
  const metrics=await cdp.send('Performance.getMetrics');return metrics.metrics.find(item=>item.name==='JSHeapUsedSize')?.value??null;};
 const before=await heap();let successes=0,failures=0,cancels=0;
 for(let cycle=0;cycle<10;cycle++){
  const dialog=await openPrepared(page);
  if(cycle%3===1){failures++;await mode(page,'dataThrow');await dialog.getByTestId('cad-exchange-download').click();
   await expect(dialog.getByRole('alert')).toBeVisible();await mode(page,'none');await dialog.getByRole('button',{name:'취소 / 닫기'}).click();}
  else if(cycle%3===2){cancels++;await mode(page,'reader');await dialog.getByTestId('cad-exchange-download').click();
   await expect.poll(async()=>(await stats(page)).pending).toBeGreaterThan(0);
   await dialog.getByRole('button',{name:'취소 / 닫기'}).click();await expectNoDownload(page,async()=>release(page));}
  else{successes++;const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();
   expect((await pending).suggestedFilename()).toMatch(/\.glb$/);await dialog.getByRole('button',{name:'취소 / 닫기'}).click();}
  await expectClean(page);
 }
 await expect.poll(async()=>(await stats(page)).revoked).toBe(successes);
 const final=await stats(page);
 expect(final.created).toBe(successes);expect(final.revoked).toBe(successes);
 // The harness itself retains canvas objects and URL strings until these arrays are cleared.
 await page.evaluate(()=>{const life=window.__exchangeLife!;life.raster.length=0;life.created.length=0;life.revoked.length=0;});
 const after=await heap();
 console.info(`R5b lifecycle observed after clearing harness refs and CDP collectGarbage: success=${successes}, fail=${failures}, cancel=${cancels}, JSHeapUsedSizeBefore=${before}, JSHeapUsedSizeAfter=${after}, modelURLs=${final.created}/${final.revoked}`);
 await cdp.detach();
});
