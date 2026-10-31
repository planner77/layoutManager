import {expect,test,type APIRequestContext,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {masterFields} from './master-helper';
import {clickViewerCommand,clickViewerTestCommand,openViewerMenu} from './viewer-menu-helper';
import type {Inspection} from './memo-export-browser';

const drawing=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','TABLES','0','TABLE','2','LAYER','70','2',
 ...['A','B'].flatMap(name=>['0','LAYER','2',name,'70','0','62','7','6','CONTINUOUS']),'0','ENDTAB','0','ENDSEC','0','SECTION','2','ENTITIES',
 '0','LINE','5','A1','8','A','10','0','20','0','11','100','21','0','0','LINE','5','B1','8','B','10','0','20','20','11','100','21','20','0','ENDSEC','0','EOF',''].join('\n'));
async function upload(request:APIRequestContext,label:string){
 const response=await request.post('/api/cad-files',{multipart:{file:{name:label+'.dxf',mimeType:'application/octet-stream',buffer:drawing},
  ...(await masterFields(request,{businessUnit:label,site:'memo-export-qa',building:'A',floor:'1'})),registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234'}});
 expect(response.status()).toBe(201);return (await response.json()) as {id:string};
}
async function openViewer(page:Page,id:string){await page.goto(`/cad/versions/${id}/viewer?renderer=three-dxf-viewer`);await expect(page.getByRole('status')).toHaveText('도면 표시 완료');await openViewerMenu(page,'work');}
async function createMemo(page:Page,title:string,content:string){
 await clickViewerTestCommand(page,'viewer-menu-memo-add');await page.getByTestId('cad-memo-title').fill(title);await page.getByTestId('cad-memo-content').fill(content);
 await page.getByTestId('cad-memo-x').fill('30');await page.getByTestId('cad-memo-y').fill('30');await page.getByTestId('cad-memo-coordinate-place').click();
 await expect(page.getByTestId('cad-memo-candidate-wcs')).toBeVisible();await page.getByTestId('cad-memo-create').click();
 await expect(page.getByTestId('cad-memo-status')).toContainText(/\d+\/100/);
}
async function openExport(page:Page){await clickViewerCommand(page,'drawing','GLB/glTF 내보내기');const dialog=page.getByTestId('cad-exchange-dialog');await expect(dialog).toBeVisible();return dialog;}
async function prepareDownload(page:Page,dialog:ReturnType<Page['getByTestId']>,format:'glb'|'gltf'){
 await dialog.getByLabel('형식').selectOption(format);await dialog.getByTestId('cad-exchange-review').click();
 await expect(dialog.getByTestId('cad-exchange-preview')).toBeVisible();const ack=dialog.getByTestId('cad-exchange-partial-ack');if(await ack.count())await ack.check();
 const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();const download=await pending;const path=await download.path();expect(path).toBeTruthy();
 return {download,bytes:await readFile(path!)};
}
function gltfJson(bytes:Buffer,format:'glb'|'gltf'){
 if(format==='gltf')return JSON.parse(bytes.toString('utf8')) as Record<string,unknown>;
 expect(bytes.subarray(0,4).toString('ascii')).toBe('glTF');expect(bytes.readUInt32LE(4)).toBe(2);
 const jsonLength=bytes.readUInt32LE(12);return JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8')) as Record<string,unknown>;
}
function forbiddenKeys(value:unknown,path=''):string[]{
 if(!value||typeof value!=='object')return [];const found:string[]=[];
 const privateMetadataKey=/(?:createdby|updatedby|email|role|token|locator|targetbinding|targetid|actorid|authorid|csrf|cookie|authorization|credential|session(?:id|proof|key)|scopeproof)/;
 for(const [key,child] of Object.entries(value)){
  // Inspect metadata keys only; Memo title/body are values and may contain any text.
  if(privateMetadataKey.test(key.replace(/[^a-z]/gi,'').toLowerCase()))found.push(path+'.'+key);
  found.push(...forbiddenKeys(child,path+'.'+key));
 }
 return found;
}
async function inspectWithFreshLoader(page:Page,bytes:Buffer,format:'glb'|'gltf',attach:(name:string,details:{body:Buffer;contentType:string})=>Promise<void>,screenshotPath?:string){
 const bundle=await build({entryPoints:['tests/e2e/memo-export-browser.ts'],bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'});
 const context=page.context();await context.route('**/__memo-export-inspector.js',route=>route.fulfill({contentType:'application/javascript',body:bundle.outputFiles[0].text}));
 await context.route('**/__memo-export-inspector',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><script src="/__memo-export-inspector.js"></script></body></html>'}));
 const inspector=await context.newPage();await inspector.goto('/__memo-export-inspector');await inspector.waitForFunction(()=>Boolean(window.__memoExportInspector));
 const result=await inspector.evaluate(({data,type})=>window.__memoExportInspector.load(data,type),{data:[...bytes],type:format}) as Inspection;
 const screenshot=await inspector.screenshot();await attach(`memo-${format}-render.png`,{body:screenshot,contentType:'image/png'});
 if(screenshotPath){await writeFile(screenshotPath,screenshot);console.log('MEMO_RENDER_SCREENSHOT',screenshotPath);}
 expect(result.rendered).toBe(true);expect(result.memoCount).toBeGreaterThan(0);expect(result.imageCount).toBeGreaterThan(0);expect(result.inkPixels).toBeGreaterThan(100);
 await inspector.close();return result;
}

test('TC-R5B-01/02/07: actual Korean Memo PNG textures load and render in GLB and embedded glTF, including an explicitly selected hidden Memo',async({page,request},testInfo)=>{
 test.setTimeout(180_000);const version=await upload(request,'R5b-visible-'+randomUUID().slice(0,8));
 const requests={content:0,memos:0,outlines:0};page.on('request',req=>{const path=new URL(req.url()).pathname;if(path===`/api/cad-files/${version.id}/content`)requests.content++;if(path===`/api/cad-files/${version.id}/memos`)requests.memos++;if(path===`/api/cad-files/${version.id}/outlines`)requests.outlines++;});
 await openViewer(page,version.id);
 const title='한글 작업 지시';const content='Valve inspection\n유량을 확인하세요';await createMemo(page,title,content);
 await clickViewerTestCommand(page,'viewer-menu-memo-tree');const tree=page.getByTestId('cad-memo-tree');
 const row=tree.getByTestId('cad-memo-tree-item').filter({hasText:title});await expect(row).toBeVisible();await row.getByTestId('cad-memo-tree-visibility').click();
 await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);await clickViewerTestCommand(page,'viewer-menu-memo-tree');
 const dialog=await openExport(page);await dialog.getByTestId('cad-exchange-source-enable').uncheck();await dialog.getByTestId('cad-exchange-memos-enable').check();
 await dialog.getByRole('radio',{name:'메모 선택'}).check();await dialog.getByRole('checkbox',{name:new RegExp(title)}).check();
 await expect(dialog.getByTestId('cad-exchange-memo-height')).toHaveValue('0.1');
 await dialog.getByTestId('cad-exchange-memo-height').fill('0.35');await expect(dialog.getByText('직접 지정한 값을 유지합니다.')).toBeVisible();
 for(const format of ['glb','gltf'] as const){
  const {download,bytes}=await prepareDownload(page,dialog,format);expect(download.suggestedFilename()).toMatch(format==='glb'?/\.glb$/:/\.gltf$/);
  const json=gltfJson(bytes,format);const memoNode=(json.nodes as {extras?:Record<string,unknown>}[]).find(node=>node.extras?.origin==='LOCAL_MEMO');
  expect(memoNode?.extras).toMatchObject({title,content});expect(forbiddenKeys(json)).toEqual([]);
  if(format==='gltf'){
   const buffers=json.buffers as {uri:string}[];const images=json.images as {uri?:string;mimeType?:string}[];
   expect(buffers.length).toBeGreaterThan(0);expect(buffers.every(item=>item.uri.startsWith('data:'))).toBe(true);
   expect(images.length).toBeGreaterThan(0);expect(images.every(item=>item.uri?.startsWith('data:image/png;base64,'))).toBe(true);
  }else{const images=json.images as {bufferView?:number;mimeType?:string}[];expect(images.some(image=>image.mimeType==='image/png'&&Number.isInteger(image.bufferView))).toBe(true);}
  const actual=await inspectWithFreshLoader(page,bytes,format,testInfo.attach.bind(testInfo),`/tmp/layoutmanager-r5b-qa-visible-memo-${format}.png`);
  expect(actual.rasterPngDataUrl).toMatch(/^data:image\/png;base64,/);
  const rawPng=Buffer.from(actual.rasterPngDataUrl!.slice(actual.rasterPngDataUrl!.indexOf(',')+1),'base64');
  const rasterPath=`/tmp/layoutmanager-r5b-qa-memo-raster-${format}.png`;await writeFile(rasterPath,rawPng);
  await testInfo.attach(`memo-${format}-raw-texture.png`,{body:rawPng,contentType:'image/png'});
  console.log('MEMO_RENDER_PROOF',JSON.stringify({format,imageCount:actual.imageCount,darkGlyphPixels:actual.inkPixels,loadMs:actual.loadMs,memoTitles:actual.memoTitles,webglRender:actual.rendered,rasterPath,
   textureTopNdcY:actual.textureTopNdcY,textureBottomNdcY:actual.textureBottomNdcY,memoAnchors:actual.memoAnchors}));
  expect(actual.memoTitles).toContain(title);expect(actual.memoAnchors).toContainEqual({x:30,y:30,z:0});
  expect(actual.textureTopNdcY).toEqual(expect.any(Number));expect(actual.textureBottomNdcY).toEqual(expect.any(Number));
  expect(actual.textureTopNdcY!).toBeGreaterThan(actual.textureBottomNdcY!);
 }
 expect(requests.content).toBe(1);expect(requests.memos).toBe(0);expect(requests.outlines).toBe(0);
 await expect(page.getByTestId('cad-memo-status')).toContainText('1/100');await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
});

test('TC-R5B-01: mixed DXF B, two confirmed Generated objects, and one Memo export in both formats',async({page,request})=>{
 test.setTimeout(180_000);const version=await upload(request,'R5b-mixed-'+randomUUID().slice(0,8));await openViewer(page,version.id);
 await createMemo(page,'혼합 검수 메모','mixed body');
 const sourceSha256=createHash('sha256').update(drawing).digest('hex');
 const {GeneratedDocument}=await import('../../domain/generated-document');const {buildGeneratedTransfer}=await import('../../domain/generated-transfer');
 const doc=new GeneratedDocument({versionId:version.id,sourceSha256}),keys=[randomUUID(),randomUUID()];
 for(let i=0;i<2;i++)doc.append({id:keys[i],savedOutlineId:'local-'+(i+1),createdAt:new Date().toISOString(),result:{kind:'CONVEX',algorithm:'qa-mixed-v1',geometryBasis:'RENDER_WCS_2D',persistable:false,
  geometry:{type:'Polygon',coordinates:[[[i*20,0],[i*20+10,0],[i*20+10,10],[i*20,0]]]},sourceEntityIds:[],warnings:[],tolerance:.02,durationMs:0}});
 await page.getByTestId('generated-import-input').setInputFiles({name:'r5b-generated.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(buildGeneratedTransfer(doc,4)))});
 await expect(page.getByTestId('generated-json-message')).toContainText('2개 생성 개체를 복원');
 const layerPanel=page.getByRole('region',{name:'레이어'});await layerPanel.getByRole('checkbox',{name:'A'}).uncheck();await layerPanel.getByRole('checkbox',{name:'B'}).uncheck();
 const dialog=await openExport(page);await dialog.getByRole('radio',{name:'레이어 선택'}).check();
 await dialog.getByRole('checkbox',{name:/^A ·/}).uncheck();await dialog.getByRole('checkbox',{name:/^B ·/}).check();
 await dialog.getByTestId('cad-exchange-generated-enable').check();await dialog.getByRole('radio',{name:'개체 선택'}).check();
 await dialog.getByRole('checkbox',{name:/local-1|외곽선 1/}).check();await dialog.getByRole('checkbox',{name:/local-2|외곽선 2/}).check();
 await dialog.getByTestId('cad-exchange-memos-enable').check();
 const selectionBefore=await page.getByTestId('canvas-selection-count').innerText();
 for(const format of ['glb','gltf'] as const){
  const {bytes}=await prepareDownload(page,dialog,format);const json=gltfJson(bytes,format);const scene=json.scenes as {nodes:number[]}[];const nodes=json.nodes as {name?:string;extras?:Record<string,unknown>}[];
  expect(scene.length).toBeGreaterThan(0);const origins=nodes.map(node=>node.extras?.origin).filter(Boolean);
  expect(origins).toContain('DXF');expect(origins).toContain('LOCAL_GENERATED');expect(origins).toContain('LOCAL_MEMO');
  expect(origins.filter(origin=>origin==='LOCAL_GENERATED')).toHaveLength(2);
  const actual=await inspectWithFreshLoader(page,bytes,format,async()=>{});expect(actual.memoTitles).toContain('혼합 검수 메모');
  if(format==='glb')await dialog.getByLabel('형식').selectOption('gltf');
 }
 await expect(page.getByTestId('canvas-selection-count')).toHaveText(selectionBefore);
});

test('TC-R5B-07/09: active and inactive Memo settings are whitelisted; 320px focus, native fullscreen, AUTO and manual height',async({page,request},testInfo)=>{
 test.setTimeout(120_000);const version=await upload(request,'R5b-ui-'+randomUUID().slice(0,8));await openViewer(page,version.id);
 await createMemo(page,'활성 일정 메모','privacy payload');
 const activeSettings=page.getByTestId('cad-memo-settings');await activeSettings.getByTestId('cad-memo-schedule-enabled').check();await page.getByTestId('cad-memo-start-date').fill('2026-11-01');await page.getByTestId('cad-memo-due-date').fill('2026-11-30');
 await activeSettings.getByTestId('cad-memo-completion-enabled').check();await activeSettings.getByTestId('cad-memo-is-completed').check();await activeSettings.getByTestId('cad-memo-save-settings').click();
 await clickViewerTestCommand(page,'viewer-menu-memo-add');
 await page.getByTestId('cad-memo-title').fill('비활성 메모');await page.getByTestId('cad-memo-content').fill('hidden metadata');await page.getByTestId('cad-memo-x').fill('50');await page.getByTestId('cad-memo-y').fill('50');
 await page.getByTestId('cad-memo-coordinate-place').click();await page.getByTestId('cad-memo-create').click();
 await page.setViewportSize({width:320,height:740});
 await clickViewerCommand(page,'view','브라우저 전체 화면');await expect.poll(()=>page.evaluate(()=>document.fullscreenElement!==null)).toBe(true);
 const dialog=await openExport(page);const box=await dialog.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(320);
 const first=dialog.locator('input').first();await first.focus();await page.keyboard.press('Shift+Tab');await expect(dialog.locator(':focus')).toHaveCount(1);
 await dialog.getByTestId('cad-exchange-source-enable').uncheck();await dialog.getByTestId('cad-exchange-memos-enable').check();
 await expect(dialog.getByText(/자동 임시값 0\.1m/)).toBeVisible();await dialog.getByTestId('cad-exchange-review').click();
 await expect(dialog.getByText(/선택한 형상 크기로 계산한 자동 높이/)).toBeVisible();
 await dialog.getByTestId('cad-exchange-memo-height').fill('0.001');await expect(dialog.getByTestId('cad-exchange-review')).toBeEnabled();
 await dialog.getByTestId('cad-exchange-memo-height').fill('10');await expect(dialog.getByTestId('cad-exchange-review')).toBeEnabled();
 await dialog.getByTestId('cad-exchange-memo-height').fill('0.5');await dialog.getByRole('radio',{name:'메모 선택'}).check();await dialog.getByRole('checkbox',{name:/활성 일정 메모/}).check();
 await dialog.getByTestId('cad-exchange-review').click();await expect(dialog.getByText('직접 지정한 값을 유지합니다.')).toBeVisible();await expect(dialog.getByTestId('cad-exchange-memo-height')).toHaveValue('0.5');
 await dialog.getByRole('radio',{name:'전체 메모'}).check();await dialog.getByTestId('cad-exchange-review').click();await expect(dialog.getByText('직접 지정한 값을 유지합니다.')).toBeVisible();
 const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();const download=await pending;const filePath=await download.path();expect(filePath).toBeTruthy();
 const bytes=await readFile(filePath!),json=gltfJson(bytes,'glb'),nodes=json.nodes as {extras?:Record<string,unknown>}[];
 const memos=nodes.map(node=>node.extras).filter(extra=>extra?.origin==='LOCAL_MEMO') as Record<string,unknown>[];expect(memos).toHaveLength(2);
 const active=memos.find(item=>item.title==='활성 일정 메모')!,inactive=memos.find(item=>item.title==='비활성 메모')!;
 expect(active.settings).toMatchObject({scheduleEnabled:true,startDate:'2026-11-01',dueDate:'2026-11-30',completionEnabled:true,isCompleted:true});
 expect(inactive.settings).toEqual({scheduleEnabled:false,completionEnabled:false});expect(forbiddenKeys(json)).toEqual([]);
 const rendered=await inspectWithFreshLoader(page,bytes,'glb',testInfo.attach.bind(testInfo));expect(rendered.memoCount).toBe(2);
});
