import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {masterFields} from './master-helper';
import {clickViewerCommand,clickViewerTestCommand} from './viewer-menu-helper';
import type {Inspection} from './memo-export-browser';

declare global {interface Window {__loadModelURLs?:{live:number;created:number;revoked:number}}}
function dxf(count:number){
  const lines=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];
  for(let i=0;i<count;i++)lines.push('0','LINE','5',(i+1).toString(16),'8','LOAD','10',String(i%100),'20',String(Math.floor(i/100)),
    '11',String(i%100+0.8),'21',String(Math.floor(i/100)+0.4));
  return Buffer.from([...lines,'0','ENDSEC','0','EOF',''].join('\n'));
}
async function upload(request:APIRequestContext,count:number){
  const source=dxf(count),tag='exchange-load-'+count+'-'+randomUUID().slice(0,8);
  const result=await request.post('/api/cad-files',{multipart:{file:{name:tag+'.dxf',mimeType:'application/octet-stream',buffer:source},
    ...(await masterFields(request,{businessUnit:tag,site:'exchange-load',building:'A',floor:'1'})),registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234'}});
  expect(result.status()).toBe(201);return {source,id:(await result.json()).id as string};
}
async function memo(page:Page,n:number){
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await page.getByTestId('cad-memo-title').fill('설비 점검 '+n);await page.getByTestId('cad-memo-content').fill('확인 완료\nInspection '+n);
  await page.getByTestId('cad-memo-x').fill(String(n*5));await page.getByTestId('cad-memo-y').fill('5');
  await page.getByTestId('cad-memo-coordinate-place').click();await page.getByTestId('cad-memo-create').click();
  await expect(page.getByTestId('cad-memo-status')).toContainText((n+1)+'/100');
}
async function metadata(request:APIRequestContext,id:string){
  const response=await request.get('/api/cad-files');expect(response.status()).toBe(200);
  const value=(await response.json()).items.find((item:{id:string})=>item.id===id);
  expect(value).toBeDefined();return value;
}
for(const inputs of [1000,10000])test(`TC-R5B-10: ${inputs} synthetic LINE inputs and ten real Memo annotations export and load with measured bounds`,async({page,request,browser,baseURL},testInfo)=>{
  test.setTimeout(180_000);const version=await upload(request,inputs);
  await page.addInitScript(()=>{
    const state={live:0,created:0,revoked:0},owned=new Set<string>();window.__loadModelURLs=state;
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=value=>{const url=create(value);if(value instanceof Blob&&value.type.startsWith('model/gltf')){owned.add(url);state.live++;state.created++;}return url;};
    URL.revokeObjectURL=url=>{if(owned.delete(url)){state.live--;state.revoked++;}revoke(url);};
  });
  const requests={content:0,private:0,writes:0};
  page.on('request',req=>{const route=new URL(req.url()).pathname;
    if(route===`/api/cad-files/${version.id}/content`)requests.content++;
    if(route===`/api/cad-files/${version.id}/memos`||route===`/api/cad-files/${version.id}/outlines`)requests.private++;
    if(route.startsWith('/api/')&&req.method()!=='GET')requests.writes++;});
  await page.goto(`/cad/versions/${version.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료',{timeout:30_000});
  for(let i=0;i<10;i++)await memo(page,i);
  const metadataBefore=await metadata(request,version.id);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const heap=async()=>{await cdp.send('HeapProfiler.collectGarbage');const data=await cdp.send('Performance.getMetrics');return data.metrics.find(value=>value.name==='JSHeapUsedSize')?.value??null;};
  const heapBeforeExport=await heap();
  await clickViewerCommand(page,'drawing','GLB/glTF 내보내기');const dialog=page.getByTestId('cad-exchange-dialog');await expect(dialog).toBeVisible();
  await dialog.getByTestId('cad-exchange-memos-enable').check();
  const prepareStart=performance.now();await dialog.getByTestId('cad-exchange-review').click();
  await expect(dialog.getByTestId('cad-exchange-preview')).toBeVisible();const prepareMs=performance.now()-prepareStart;
  await dialog.getByTestId('cad-exchange-partial-ack').check();
  const start=performance.now(),pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();
  const download=await pending,coordinatorExportMs=performance.now()-start,bytes=await readFile((await download.path())!);
  expect(download.suggestedFilename()).toMatch(/\.glb$/);expect(bytes.length).toBeLessThanOrEqual(32*1024*1024);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8')) as {
    nodes:Array<{extras?:{origin?:string};mesh?:number}>;meshes:Array<{primitives:Array<{attributes:{POSITION:number}}>}>;accessors:Array<{count:number}>;
  };
  expect(json.nodes.filter(node=>node.extras?.origin==='LOCAL_MEMO')).toHaveLength(10);
  const sourceVertices=json.nodes.filter(node=>node.extras?.origin==='DXF'&&node.mesh!==undefined)
    .reduce((sum,node)=>sum+json.meshes[node.mesh!].primitives.reduce((n,item)=>n+json.accessors[item.attributes.POSITION].count,0),0);
  expect(sourceVertices).toBeGreaterThanOrEqual(inputs*2);
  await dialog.getByRole('button',{name:'취소 / 닫기'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__loadModelURLs?.live)).toBe(0);
  expect(await page.evaluate(()=>window.__loadModelURLs)).toEqual({live:0,created:1,revoked:1});
  expect(await page.evaluate(()=>[...document.fonts].filter(font=>font.family.startsWith('CadExchangeMemo')).length)).toBe(0);
  const heapAfterExportGC=await heap();
  const bundle=await build({entryPoints:['tests/e2e/memo-export-browser.ts'],bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent'});
  const consumer=await browser.newContext({baseURL});let externalRequests=0;let inspection:Inspection|undefined;let consumerLoadRenderInspectMs=0;
  try{
    await consumer.route('**/__exchange-load.js',route=>route.fulfill({contentType:'application/javascript',body:bundle.outputFiles[0].text}));
    await consumer.route('**/__exchange-load',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script src="/__exchange-load.js"></script></body></html>'}));
    const fresh=await consumer.newPage();fresh.on('request',req=>{const url=new URL(req.url());if(/^https?:$/.test(url.protocol)&&url.origin!==new URL(baseURL!).origin)externalRequests++;});
    await fresh.goto('/__exchange-load');await fresh.waitForFunction(()=>Boolean(window.__memoExportInspector));
    const result=await fresh.evaluate(async data=>{const start=performance.now();const inspection=await window.__memoExportInspector.load(data,'glb');
      return {inspection,elapsed:performance.now()-start};},[...bytes]);
    inspection=result.inspection;consumerLoadRenderInspectMs=result.elapsed;
    expect(inspection.memoCount).toBe(10);expect(inspection.imageCount).toBe(10);expect(inspection.inkPixels).toBeGreaterThan(100);expect(inspection.rendered).toBe(true);expect(externalRequests).toBe(0);
  }finally{await consumer.close();}
  if(!inspection)throw new Error('별도 Viewer의 내보내기 검사 결과가 없습니다.');
  expect(await metadata(request,version.id)).toEqual(metadataBefore);
  const original=await (await request.get(`/api/cad-files/${version.id}/content`)).body();
  expect(createHash('sha256').update(original).digest('hex')).toBe(createHash('sha256').update(version.source).digest('hex'));
  expect(requests).toEqual({content:1,private:0,writes:0});
  await page.goto('/');const heapAfterViewerDisposeGC=await heap();await cdp.detach();
  const measurement={syntheticLineInputs:inputs,memoAnnotations:10,sourceVertices,artifactBytes:bytes.length,prepareMs,coordinatorExportMs,
    loaderParseMs:inspection.loadMs,consumerLoadRenderInspectMs,heapBeforeExport,heapAfterExportGC,heapAfterViewerDisposeGC,
    externalResources:externalRequests,modelBlobURLs:{created:1,revoked:1},sourceRequests:1,privateExportReads:0,apiWrites:0};
  console.log('R5B_EXCHANGE_LOAD',JSON.stringify(measurement));
  await testInfo.attach('exchange-load.json',{body:Buffer.from(JSON.stringify(measurement)),contentType:'application/json'});
});
