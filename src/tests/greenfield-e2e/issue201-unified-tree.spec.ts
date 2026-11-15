import {closeApi, closeRouteFetch} from './direct-api-transport';
import {expect,test,type Page,type APIRequestContext,type Locator} from '@playwright/test';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {sceneDxf} from '../fixtures/scene-dxf';
import {withOwnedSessions} from './owned-sessions';
const polygon=(low:number,high:number)=>({type:'Polygon',coordinates:[[[low,low],[high,low],[high,high],[low,high],[low,low]]]});
type Folder={id:string;revision:number;name:string};
async function ensureAdmin(page:Page){
 const setup=await closeApi(page.request).get('/api/g7-runtime/setup');
 if(setup.status()!==404){
  const root=process.env.G7_GREENFIELD_E2E_ROOT;if(!root)throw new Error('owned Greenfield fixture root required');
  await page.goto('/');
  await page.getByLabel('Docker 호스트 최초 설정 코드').fill(readFileSync(path.join(root,'db','first-admin.code'),'utf8'));
  await page.getByLabel('최초 관리자 계정').fill('admin');
  await page.getByLabel('초기 비밀번호').fill('synthetic-first-password');
  await page.getByRole('button',{name:'최초 관리자 등록',exact:true}).click();
  await expect(page.getByText('최초 관리자가 등록되었습니다.')).toBeVisible();
  expect((await closeApi(page.request).post('/api/g7-runtime/auth/initial-change',{headers:{origin:new URL(page.url()).origin},
   data:{login:'admin',password:'synthetic-first-password',newPassword:'synthetic-changed-password'}})).status()).toBe(200);
 }
 await page.goto('/g7-runtime');await page.getByLabel('계정',{exact:true}).fill('admin');
 await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
 await page.getByRole('button',{name:'로그인',exact:true}).click();
 await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
async function headers(api:APIRequestContext,origin:string){
 const response=await closeApi(api).get('/api/g7-runtime/auth/session');expect(response.status()).toBe(200);
 return {origin,'x-csrf-token':(await response.json()).csrfToken as string};
}
async function work(page:Page,testId='viewer-menu-unified-tree'){
 const drawer=page.locator('[role="dialog"][data-drawer]');
 if(await drawer.isVisible().catch(()=>false))await drawer.getByRole('button',{name:'닫기',exact:true}).click();
 const trigger=page.locator('[data-viewer-group="work"]');
 if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
 await page.getByTestId(testId).click();await expect(page.getByTestId('version-tree-panel')).toBeVisible();
}
async function createFixture(page:Page,origin:string,prefix:string){
 const session=await (await closeApi(page.request).get('/api/g7-runtime/auth/session')).json();
 const h=await headers(closeApi(page.request),origin),ids:Record<string,string>={};let parentId:string|undefined;
 for(const type of ['business-units','products','sites','buildings','floors']){
  const response=await closeApi(page.request).post('/api/masters',{headers:h,data:{type,name:prefix+' '+type,...parentId?{parentId}:{},...type==='sites'?{kind:'SITE'}:{}}});
  expect(response.status(),await response.text()).toBe(201);parentId=ids[type]=(await response.json()).id;
  if(type==='sites')expect((await closeApi(page.request).post('/api/g7-runtime/access/grant',{headers:h,data:{kind:'site',operation:'grant',affectedUserId:session.actor.id,value:parentId}})).status()).toBe(200);
 }
 const upload=async(name:string)=>{
  const response=await closeApi(page.request).post('/api/cad-files',{headers:h,multipart:{file:{name,mimeType:'application/octet-stream',buffer:Buffer.from(sceneDxf)},
   businessUnitId:ids['business-units'],productId:ids.products,siteId:ids.sites,buildingId:ids.buildings,floorId:ids.floors,registeredAt:'2026-11-13',deletePassword:'1234',makeCurrent:'false'}});
  expect(response.status(),await response.text()).toBe(201);return (await response.json()).id as string;
 };
 const versionId=await upload(prefix+'.dxf');
 await page.goto(`/cad/versions/${versionId}/viewer?renderer=three-dxf-viewer`);
 await page.getByRole('button',{name:'도면',exact:true}).click();
 await page.getByRole('menuitem',{name:'원본 DXF로 Scene 생성/재생성',exact:true}).click();
 await expect(page.getByTestId('cad-viewer-shell').getByRole('status').filter({hasText:'도면 표시 완료'})).toBeVisible({timeout:30_000});
 await page.getByRole('button',{name:'도면',exact:true}).click();
 await page.getByRole('menuitem',{name:'Scene Asset 저장',exact:true}).click();
 await expect(page.getByTestId('scene-status')).toContainText('Scene Asset 저장 완료',{timeout:30_000});
 const outlinesUrl=`/api/cad-files/${versionId}/outlines`,zonesUrl=`/api/cad-files/${versionId}/zones`,treeUrl=`/api/cad-files/${versionId}/tree`;
 const outlineList=await (await closeApi(page.request).get(outlinesUrl)).json();
 const type=await closeApi(page.request).post('/api/outline-types',{headers:h,data:{name:prefix+' Safety',sortOrder:0}});expect(type.status()).toBe(201);const typeId=(await type.json()).item.id;
 const category=await closeApi(page.request).post(`/api/cad-files/${versionId}/zone-categories`,{headers:h,data:{name:prefix+' Area',sortOrder:0}});expect(category.status()).toBe(201);const categoryId=(await category.json()).category.id;
 const outlineIds:string[]=[],zoneIds:string[]=[];
 for(let n=0;n<3;n++){
  const response=await closeApi(page.request).post(outlinesUrl,{headers:{...h,'Idempotency-Key':randomUUID()},data:{
   mode:'APP_CREATED',sourceSha256:outlineList.sourceSha256,expectedSceneRevision:outlineList.sceneRevision,
   name:prefix+' Outline '+n,kind:'CONVEX',outlineTypeId:typeId,geometry:polygon(2+n,8+n)}});
  expect(response.status(),await response.text()).toBe(201);outlineIds.push((await response.json()).id);
 }
 for(let n=0;n<3;n++){
  const response=await closeApi(page.request).post(zonesUrl,{headers:{...h,'Idempotency-Key':randomUUID()},data:{
   name:prefix+' Zone '+n,categoryId,description:'semantic metadata',code:'T201-CODE-'+n,tags:['tree201'],sortOrder:n,parentZoneId:n?zoneIds[n-1]:null,
   geometry:{sourceSha256:outlineList.sourceSha256,sceneRevision:outlineList.sceneRevision,polygon:polygon(n*10,100-n*10)}}});
  expect(response.status(),await response.text()).toBe(201);zoneIds.push((await response.json()).zone.id);
 }
 return {versionId,ids,outlineIds,zoneIds,treeUrl,zonesUrl,outlinesUrl,upload,sourceSha256:outlineList.sourceSha256 as string};
}
const node=(panel:Locator,kind:string,id:string)=>panel.locator(`[data-tree-node="${kind}:${id}"]`);
// A branch treeitem contains its descendants; click its own row, rather than
// the bounding-box center which can physically hit a child row.
const row=(panel:Locator,kind:string,id:string)=>node(panel,kind,id).locator(':scope > div').first();
async function createFolder(page:Page,panel:Locator,url:string,name:string,parentId=''):Promise<Folder>{
 await panel.getByRole('button',{name:'폴더 추가',exact:true}).click();
 await panel.getByLabel('폴더 이름',{exact:true}).fill(name);await panel.getByLabel(/^상위 폴더/).selectOption(parentId);
 const saved=page.waitForResponse(r=>new URL(r.url()).pathname===url&&r.request().method()==='POST');
 await panel.getByRole('button',{name:'저장',exact:true}).click();const response=await saved;expect(response.status(),await response.text()).toBe(201);
 const folder=(await response.json()).folder as Folder;await expect(node(panel,'folder',folder.id)).toBeVisible();return folder;
}
async function classify(page:Page,panel:Locator,url:string,kind:string,id:string,folderId:string){
 await row(panel,kind,id).click();await panel.getByRole('button',{name:'분류 이동',exact:true}).click();
 await panel.getByLabel(/^대상 폴더/).selectOption(folderId);
 const saved=page.waitForResponse(r=>new URL(r.url()).pathname===url&&r.request().method()==='PATCH');
 await panel.getByRole('button',{name:'저장',exact:true}).click();const response=await saved;expect(response.status(),await response.text()).toBe(200);
}

test('TC-T201-G7-01–06 real signed folders, mapped objects, restoration, lifecycle, mobile and actor isolation',async({page,browser,request,baseURL})=>{
 test.setTimeout(240_000);page.setDefaultTimeout(10_000);const origin=baseURL!,prefix='T201-'+randomUUID().slice(0,8);
 await withOwnedSessions(origin,async owned=>{
  owned.add(closeApi(page.request));await ensureAdmin(page);
  const f=await createFixture(page,origin,prefix),viewer=`/cad/versions/${f.versionId}/viewer?renderer=three-dxf-viewer`;
  const before={outlines:(await (await closeApi(page.request).get(f.outlinesUrl)).json()).outlines,zones:(await (await closeApi(page.request).get(f.zonesUrl)).json()).zones,
   scene:await (await closeApi(page.request).get(`/api/cad-files/${f.versionId}/scene`)).json()};
  await page.addInitScript(()=>{
   const counts={workers:0,blobs:0};Object.assign(window,{tree201Counters:counts});const Native=Worker;
   window.Worker=class extends Native{constructor(url:string|URL,options?:WorkerOptions){super(url,options);counts.workers++;}};
   const create=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{counts.blobs++;return create(b);};
  });
  let sourceGets=0,sceneGets=0;page.on('request',r=>{const url=new URL(r.url());if(url.pathname===`/api/cad-files/${f.versionId}/content`)sourceGets++;if(url.pathname.startsWith(`/api/cad-files/${f.versionId}/scene`))sceneGets++;});
  await page.reload();await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await page.getByTestId('cad-text-search-trigger').click();await page.getByRole('searchbox',{name:'도면 텍스트 검색어',exact:true}).fill('HELLO');
  await expect(page.getByTestId('cad-text-search')).toContainText('검색 결과 1개');await page.getByTestId('cad-text-search').getByRole('button',{name:'닫기',exact:true}).click();
  await work(page);const panel=page.getByTestId('version-tree-panel');
  await expect(panel.getByRole('tree')).toHaveCount(1);await expect(panel.getByRole('status')).toContainText('6개');
  await expect(page.locator('[data-testid="viewer-zone-dock"]')).toHaveCount(0);
  const folder=await createFolder(page,panel,f.treeUrl,prefix+' Logistics');await row(panel,'folder',folder.id).click();
  const child=await createFolder(page,panel,f.treeUrl,prefix+' Inspection',folder.id);
  await classify(page,panel,f.treeUrl,'outline',f.outlineIds[0],child.id);
  await classify(page,panel,f.treeUrl,'zone',f.zoneIds[0],folder.id);
  await expect(node(panel,'folder',folder.id).locator(`[data-tree-node="zone:${f.zoneIds[2]}"]`)).toBeVisible();
  await expect(node(panel,'folder',child.id).locator(`[data-tree-node="outline:${f.outlineIds[0]}"]`)).toBeVisible();
  await row(panel,'zone',f.zoneIds[1]).click();await expect(panel.getByRole('button',{name:'분류 이동',exact:true})).toHaveCount(0);
  await panel.getByTestId('version-tree-search').fill('T201-CODE-2');
  for(const id of f.zoneIds)await expect(node(panel,'zone',id)).toBeVisible();await expect(node(panel,'folder',folder.id)).toBeVisible();
  await expect(node(panel,'outline',f.outlineIds[1])).toHaveCount(0);await panel.getByTestId('version-tree-search').fill('');
  const zonePath=page.locator(`[data-testid="cad-zone-path"][data-zone-id="${f.zoneIds[2]}"]`);
  await expect(zonePath).toBeVisible();const beforeSelection=await zonePath.getAttribute('d');
  await row(panel,'zone',f.zoneIds[2]).click();await expect(zonePath).toHaveAttribute('stroke-width','3');await expect(zonePath).toHaveAttribute('d',beforeSelection!);
  await row(panel,'folder',folder.id).dblclick();await expect(zonePath).toHaveAttribute('d',beforeSelection!);
  await node(panel,'folder',folder.id).focus();await page.keyboard.press('Enter');
  await node(panel,'zone',f.zoneIds[2]).focus();await page.keyboard.press('Enter');
  await expect.poll(()=>zonePath.getAttribute('d')).not.toBe(beforeSelection);
  const outlinePath=page.locator(`[data-testid="persisted-outline-path"][data-outline-id="${f.outlineIds[0]}"]`),beforeOutline=await zonePath.getAttribute('d');
  await row(panel,'outline',f.outlineIds[0]).click();await expect(outlinePath).toHaveAttribute('data-selected','true');await expect(zonePath).toHaveAttribute('d',beforeOutline!);
  // Preserve server Outline additive/toggle selection and keyboard ARIA without moving the camera.
  const secondOutline=node(panel,'outline',f.outlineIds[1]);
  await row(panel,'outline',f.outlineIds[1]).click({modifiers:['Control']});
  await expect(node(panel,'outline',f.outlineIds[0])).toHaveAttribute('aria-selected','true');
  await expect(secondOutline).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-testid="persisted-outline-path"][data-selected="true"]')).toHaveCount(2);
  await secondOutline.focus();await page.keyboard.press('Control+Space');
  await expect(secondOutline).toHaveAttribute('aria-selected','false');
  await expect(page.locator('[data-testid="persisted-outline-path"][data-selected="true"]')).toHaveCount(1);
  await page.keyboard.press('Meta+Space');await expect(secondOutline).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-testid="persisted-outline-path"][data-selected="true"]')).toHaveCount(2);
  await row(panel,'outline',f.outlineIds[0]).click();await expect(secondOutline).toHaveAttribute('aria-selected','false');
  await expect(page.locator('[data-testid="persisted-outline-path"][data-selected="true"]')).toHaveCount(1);
  await expect(zonePath).toHaveAttribute('d',beforeOutline!);
  await node(panel,'outline',f.outlineIds[0]).focus();await page.keyboard.press('Enter');await expect.poll(()=>zonePath.getAttribute('d')).not.toBe(beforeOutline);
  await node(panel,'zone',f.zoneIds[2]).focus();await page.keyboard.press('Enter');
  const layers=await page.getByTestId('viewer-layer-dock').locator('input[type="checkbox"]').evaluateAll(nodes=>nodes.map(n=>({label:(n as HTMLInputElement).getAttribute('aria-label'),checked:(n as HTMLInputElement).checked})));
  await node(panel,'folder',folder.id).getByRole('button',{name:prefix+' Logistics 숨기기',exact:true}).click();
  await expect(zonePath).toHaveCount(0);await expect(page.locator(`[data-testid="persisted-outline-path"][data-outline-id="${f.outlineIds[0]}"]`)).toHaveCount(0);
  await node(panel,'folder',folder.id).getByRole('button',{name:prefix+' Logistics 표시',exact:true}).click();await expect(zonePath).toBeVisible();
  expect(await page.getByTestId('viewer-layer-dock').locator('input[type="checkbox"]').evaluateAll(nodes=>nodes.map(n=>({label:(n as HTMLInputElement).getAttribute('aria-label'),checked:(n as HTMLInputElement).checked})))).toEqual(layers);
  const canvas=await page.getByTestId('cad-canvas').locator('canvas').elementHandle(),sourceBefore=sourceGets,sceneBefore=sceneGets;
  await node(panel,'zone',f.zoneIds[2]).focus();await page.keyboard.press('ArrowUp');await expect(node(panel,'zone',f.zoneIds[1])).toBeFocused();
  await page.keyboard.press('Home');await expect(node(panel,'folder',folder.id)).toBeFocused();
  await page.keyboard.press('End');await expect(panel.locator('[role="treeitem"]:focus')).toHaveCount(1);
  const dock=page.getByTestId('viewer-outline-tree-dock'),handle=page.getByTestId('viewer-outlines-panel-drag-handle');
  await handle.focus();await page.keyboard.press('ArrowLeft');await expect(dock).toHaveAttribute('data-viewer-panel-mode','floating');const moved=await dock.boundingBox();
  const counts=()=>page.evaluate(()=>(window as unknown as {tree201Counters:{workers:number;blobs:number}}).tree201Counters);
  expect(await counts()).toEqual({workers:0,blobs:0});
  for(let i=0;i<20;i++){await panel.getByRole('button',{name:'닫기',exact:true}).click();await work(page);}
  expect(sourceGets).toBe(sourceBefore);expect(sceneGets).toBe(sceneBefore);expect(await counts()).toEqual({workers:0,blobs:0});
  expect(await canvas!.evaluate(element=>element===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
  const restoredPosition=await dock.boundingBox();expect(restoredPosition!.x).toBeCloseTo(moved!.x,1);expect(restoredPosition!.y).toBeCloseTo(moved!.y,1);
  await page.getByTestId('viewer-outlines-panel-reset').click();await expect(dock).toHaveAttribute('data-viewer-panel-mode','edge');
  await row(panel,'folder',folder.id).click();await panel.getByRole('button',{name:'폴더 편집',exact:true}).click();
  await panel.getByLabel('폴더 이름',{exact:true}).fill(prefix+' Renamed');await panel.getByLabel('정렬 순서',{exact:true}).fill('7');
  const renamed=page.waitForResponse(r=>new URL(r.url()).pathname===f.treeUrl&&r.request().method()==='PATCH');
  await panel.getByRole('button',{name:'저장',exact:true}).click();expect((await renamed).status()).toBe(200);
  await row(panel,'folder',folder.id).click();await panel.getByRole('button',{name:'폴더 삭제',exact:true}).click();
  const nonempty=page.waitForResponse(r=>new URL(r.url()).pathname===f.treeUrl&&r.request().method()==='DELETE');
  await panel.getByRole('button',{name:'삭제 확인',exact:true}).click();expect((await nonempty).status()).toBe(409);
  await panel.getByRole('button',{name:'취소',exact:true}).click();
  const empty=await createFolder(page,panel,f.treeUrl,prefix+' Empty');await row(panel,'folder',empty.id).click();
  await panel.getByRole('button',{name:'폴더 삭제',exact:true}).click();const deleted=page.waitForResponse(r=>new URL(r.url()).pathname===f.treeUrl&&r.request().method()==='DELETE');
  await panel.getByRole('button',{name:'삭제 확인',exact:true}).click();expect((await deleted).status()).toBe(200);await expect(node(panel,'folder',empty.id)).toHaveCount(0);
  const h=await headers(closeApi(page.request),origin),treeData=await (await closeApi(page.request).get(f.treeUrl)).json();
  expect(treeData.folders).toHaveLength(2);expect(treeData.memberships).toHaveLength(2);
  const currentFolder=treeData.folders.find((x:{id:string})=>x.id===folder.id);
  expect((await closeApi(page.request).patch(f.treeUrl,{headers:h,data:{target:'folder',folderId:folder.id,expectedRevision:1,name:'stale',parentFolderId:null,expectedParentRevision:null,sortOrder:0}})).status()).toBe(409);
  expect(currentFolder).toMatchObject({name:prefix+' Renamed',sortOrder:7,revision:2});
  await page.screenshot({path:test.info().outputPath('tree201-desktop.png')});
  await page.reload();await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');await work(page);
  await expect(node(panel,'folder',folder.id)).toContainText(prefix+' Renamed');await expect(node(panel,'folder',child.id)).toBeVisible();
  const fresh=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});owned.add(closeApi(fresh.request),()=>fresh.close());
  expect((await closeApi(fresh.request).post('/api/g7-runtime/auth/login',{headers:{origin},data:{login:'admin',password:'synthetic-changed-password'}})).status()).toBe(200);
  const independent=await fresh.newPage();await independent.goto(viewer);await expect(independent.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');await work(independent);
  await expect(node(independent.getByTestId('version-tree-panel'),'folder',child.id).locator(`[data-tree-node="outline:${f.outlineIds[0]}"]`)).toBeVisible();
  await page.setViewportSize({width:320,height:740});await expect(page.locator('[role="dialog"][data-drawer]')).toHaveCount(1);
  const mobile=await panel.boundingBox();expect(mobile).not.toBeNull();expect(mobile!.x).toBeGreaterThanOrEqual(0);expect(mobile!.x+mobile!.width).toBeLessThanOrEqual(321);
  await page.screenshot({path:test.info().outputPath('tree201-mobile.png')});await page.keyboard.press('Escape');await expect(panel).not.toBeVisible();
  await expect(page.locator('[data-viewer-group="work"]')).toBeFocused();
  await page.getByTestId('cad-text-search-trigger').click();await expect(page.locator('[role="dialog"][data-drawer="search"]')).toBeVisible();
  await page.getByRole('searchbox',{name:'도면 텍스트 검색어',exact:true}).fill('HELLO');await expect(page.getByTestId('cad-text-search')).toContainText('검색 결과 1개');
  await page.getByTestId('cad-text-search').getByRole('button',{name:'닫기',exact:true}).click();await expect(page.locator('[role="dialog"][data-drawer]')).toHaveCount(0);
  await page.setViewportSize({width:1440,height:1000});await work(page);
  await page.getByRole('button',{name:'보기',exact:true}).click();await page.getByRole('menuitem',{name:'브라우저 전체 화면',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await expect(panel).toBeVisible();await page.evaluate(()=>document.exitFullscreen());
  // Same Location metadata remains, while Version2 has no classification or mapping.
  const version2=await f.upload(prefix+'-v2.dxf');await page.goto(`/cad/versions/${version2}/viewer?renderer=three-dxf-viewer`);await work(page);
  await expect(node(panel,'folder',folder.id)).toHaveCount(0);await expect(node(panel,'zone',f.zoneIds[2])).toContainText('미연결');
  await node(panel,'zone',f.zoneIds[2]).focus();await page.keyboard.press('Enter');await expect(page.getByTestId('cad-zone-path')).toHaveCount(0);
  await page.goto(viewer);await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');await work(page);
  let failNext=true;
  await page.route(`**${f.treeUrl}`,async route=>{if(failNext&&route.request().method()==='GET'){failNext=false;await route.fulfill({status:503,json:{error:{message:'temporary tree test outage'}}});}else await route.continue();});
  await panel.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('temporary tree test outage');await expect(node(panel,'folder',folder.id)).toHaveCount(0);
  await page.unrouteAll({behavior:'wait'});await panel.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(node(panel,'folder',folder.id)).toBeVisible();
  // Real same-browser Admin→Reader transition while a previous tree read is held.
  const readerLogin='tree-reader-'+randomUUID().slice(0,8),initial='synthetic-reader-first',secret='synthetic-reader-changed';
  const created=await closeApi(page.request).post('/api/g7-runtime/users/create',{headers:await headers(closeApi(page.request),origin),data:{login:readerLogin,initialPassword:initial}});expect(created.status()).toBe(201);const readerId=(await created.json()).id;
  for(const [kind,value] of [['role','Reader'],['site',f.ids.sites]])expect((await closeApi(page.request).post('/api/g7-runtime/access/grant',{headers:await headers(closeApi(page.request),origin),data:{kind,operation:'grant',affectedUserId:readerId,value}})).status()).toBe(200);
  expect((await closeApi(request).post('/api/g7-runtime/auth/initial-change',{headers:{origin},data:{login:readerLogin,password:initial,newPassword:secret}})).status()).toBe(200);
  await panel.getByRole('button',{name:'폴더 추가',exact:true}).click();await panel.getByLabel('폴더 이름',{exact:true}).fill('UNSAVED-OLD-ACTOR');
  let release:(()=>void)|undefined,grabbed=false,held=false,oldDone=false;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route(`**${f.treeUrl}`,async route=>{if(!grabbed&&route.request().method()==='GET'){grabbed=true;const response=await closeRouteFetch(route);expect(response.status()).toBe(200);expect((await response.json()).canEdit).toBe(true);held=true;await gate;await route.fulfill({response}).catch(()=>{});oldDone=true;}else await route.continue();});
  try{
   await panel.getByRole('button',{name:'다시 시도',exact:true}).click();await expect.poll(()=>held).toBe(true);
   expect((await closeApi(page.request).post('/api/g7-runtime/auth/logout',{headers:await headers(closeApi(page.request),origin)})).status()).toBe(200);
   expect((await closeApi(page.request).post('/api/g7-runtime/auth/login',{headers:{origin},data:{login:readerLogin,password:secret}})).status()).toBe(200);
   await page.evaluate(()=>window.dispatchEvent(new Event('layoutManager:session-invalidated')));
   await expect(panel.getByLabel('폴더 이름',{exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'폴더 추가',exact:true})).toHaveCount(0);
   await expect(node(panel,'folder',folder.id)).toBeVisible();release!();await expect.poll(()=>oldDone).toBe(true);
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   await expect(panel.getByRole('button',{name:'폴더 추가',exact:true})).toHaveCount(0);
   expect((await closeApi(page.request).post(f.treeUrl,{headers:await headers(closeApi(page.request),origin),data:{name:'Forbidden',parentFolderId:null,expectedParentRevision:null,sortOrder:0}})).status()).toBe(403);
  }finally{release!();await page.unrouteAll({behavior:'wait'});}
  expect((await (await closeApi(page.request).get(f.outlinesUrl)).json()).outlines).toEqual(before.outlines);
  expect((await (await closeApi(page.request).get(f.zonesUrl)).json()).zones).toEqual(before.zones);
  const sceneAfter=await (await closeApi(page.request).get(`/api/cad-files/${f.versionId}/scene`)).json();expect(sceneAfter.revision).toBe(before.scene.revision);
  expect(createHash('sha256').update(await (await closeApi(page.request).get(`/api/cad-files/${f.versionId}/content`)).body()).digest('hex')).toBe(f.sourceSha256);
 });
});

test('TC-T201-G7-REVOKE actual Site Grant removal clears every protected overlay after tree mutation denial',async({page,browser,baseURL})=>{
 test.setTimeout(120_000);page.setDefaultTimeout(10_000);const origin=baseURL!;
 await withOwnedSessions(origin,async owned=>{
  owned.add(closeApi(page.request));await ensureAdmin(page);
  const f=await createFixture(page,origin,'T201-revoke-'+randomUUID().slice(0,8));
  await page.reload();await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');await work(page);
  const panel=page.getByTestId('version-tree-panel');
  await expect(page.getByTestId('persisted-outline-path')).toHaveCount(3);await expect(page.getByTestId('cad-zone-path')).toHaveCount(3);
  const canvas=await page.getByTestId('cad-canvas').locator('canvas').elementHandle();
  const protectedPaths=new Set([f.treeUrl,f.outlinesUrl,f.zonesUrl]);
  let protectedReads=0;page.on('request',r=>{if(protectedPaths.has(new URL(r.url()).pathname)&&r.method()==='GET')protectedReads++;});
  await panel.getByRole('button',{name:'폴더 추가',exact:true}).click();await panel.getByLabel('폴더 이름',{exact:true}).fill('After-revocation forbidden folder');
  const readsBeforeDenial=protectedReads;
  const admin=await browser.newContext({baseURL});owned.add(closeApi(admin.request),()=>admin.close());
  expect((await closeApi(admin.request).post('/api/g7-runtime/auth/login',{headers:{origin},data:{login:'admin',password:'synthetic-changed-password'}})).status()).toBe(200);
  const actor=(await (await closeApi(admin.request).get('/api/g7-runtime/auth/session')).json()).actor.id as string;
  const change=async(operation:'grant'|'revoke')=>closeApi(admin.request).post('/api/g7-runtime/access/grant',{
   headers:await headers(closeApi(admin.request),origin),data:{kind:'site',operation,affectedUserId:actor,value:f.ids.sites}});
  let revoked=false;
  try{
   const revoke=await change('revoke');expect(revoke.status(),await revoke.text()).toBe(200);revoked=true;
   const denied=page.waitForResponse(r=>new URL(r.url()).pathname===f.treeUrl&&r.request().method()==='POST');
   await panel.getByRole('button',{name:'저장',exact:true}).click();expect((await denied).status()).toBe(403);
   await expect(panel.locator('[data-tree-node^="outline:"], [data-tree-node^="zone:"]')).toHaveCount(0);
   await expect(page.getByTestId('persisted-outline-path')).toHaveCount(0);
   await expect(page.getByTestId('cad-zone-path')).toHaveCount(0);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await expect(page.getByTestId('app-session-status')).toContainText('로그인됨');
   const unexpected=await page.waitForRequest(r=>protectedPaths.has(new URL(r.url()).pathname)&&r.method()==='GET',{timeout:750}).then(()=>true,()=>false);
   expect(unexpected,'denial must not start an automatic protected-data refetch loop').toBe(false);
   expect(protectedReads).toBe(readsBeforeDenial);
   const restore=await change('grant');expect(restore.status(),await restore.text()).toBe(200);revoked=false;
   await panel.getByRole('button',{name:'다시 시도',exact:true}).click();
   await expect(panel.locator('[data-tree-node^="outline:"], [data-tree-node^="zone:"]')).toHaveCount(6);
   await expect(page.getByTestId('persisted-outline-path')).toHaveCount(3);await expect(page.getByTestId('cad-zone-path')).toHaveCount(3);
   expect(await canvas!.evaluate(element=>element===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
  }finally{if(revoked){const restored=await change('grant');expect(restored.status(),await restored.text()).toBe(200);}}
 });
});


test('TC-T201-G7-ACTOR real same-role cookie switch cannot apply the previous actor’s folder intent',async({page,request,baseURL})=>{
 test.setTimeout(120_000);page.setDefaultTimeout(10_000);const origin=baseURL!;
 await withOwnedSessions(origin,async owned=>{
  owned.add(closeApi(page.request));owned.add(closeApi(request));await ensureAdmin(page);
  const f=await createFixture(page,origin,'T201-actor-'+randomUUID().slice(0,8));
  const adminA=(await (await closeApi(page.request).get('/api/g7-runtime/auth/session')).json()).actor.id as string;
  const loginB='tree-admin-'+randomUUID().slice(0,8),initial='synthetic-actor-initial',password='synthetic-actor-changed';
  const created=await closeApi(page.request).post('/api/g7-runtime/users/create',{headers:await headers(closeApi(page.request),origin),
   data:{login:loginB,initialPassword:initial}});expect(created.status()).toBe(201);const adminB=(await created.json()).id as string;
  expect(adminB).not.toBe(adminA);
  for(const [kind,value] of [['role','Admin'],['site',f.ids.sites]])expect((await closeApi(page.request).post('/api/g7-runtime/access/grant',{
   headers:await headers(closeApi(page.request),origin),data:{kind,operation:'grant',affectedUserId:adminB,value}})).status()).toBe(200);
  expect((await closeApi(request).post('/api/g7-runtime/auth/initial-change',{headers:{origin},
   data:{login:loginB,password:initial,newPassword:password}})).status()).toBe(200);
  const fixtureRoot=process.env.G7_GREENFIELD_E2E_ROOT;if(!fixtureRoot)throw new Error('owned fixture required');
  const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(file:string,options:{readonly:boolean})=>{
   prepare(sql:string):{all(...args:unknown[]):Array<Record<string,unknown>>};close():void};
  const snapshot=()=>{const db=new Sqlite(path.join(fixtureRoot,'db','cad.sqlite'),{readonly:true});
   try{return {folders:db.prepare('SELECT id,name,created_by_id,revision FROM TreeFolder WHERE version_id=? ORDER BY id').all(f.versionId),
    audits:db.prepare('SELECT id,actor_user_id,target_id,action FROM TreeAudit WHERE version_id=? ORDER BY id').all(f.versionId)};}
   finally{db.close();}};
  await page.reload();await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');await work(page);
  const panel=page.getByTestId('version-tree-panel');
  await expect(page.getByTestId('persisted-outline-path')).toHaveCount(3);await expect(page.getByTestId('cad-zone-path')).toHaveCount(3);
  await panel.getByRole('button',{name:'폴더 추가',exact:true}).click();
  await panel.getByLabel('폴더 이름',{exact:true}).fill('STALE-A-INTENT');
  const before=snapshot();
  await page.evaluate(()=>{const counts={focus:0,invalidations:0};Object.assign(window,{tree201ActorEvents:counts});
   window.addEventListener('focus',()=>counts.focus++);window.addEventListener('layoutManager:session-invalidated',()=>counts.invalidations++);});
  // API cookie changes alone do not inform the mounted Viewer or focus the tab.
  expect((await closeApi(page.request).post('/api/g7-runtime/auth/logout',{headers:await headers(closeApi(page.request),origin)})).status()).toBe(200);
  expect((await closeApi(page.request).post('/api/g7-runtime/auth/login',{headers:{origin},data:{login:loginB,password}})).status()).toBe(200);
  expect((await (await closeApi(page.request).get('/api/g7-runtime/auth/session')).json()).actor.id).toBe(adminB);
  await expect(panel.getByLabel('폴더 이름',{exact:true})).toHaveValue('STALE-A-INTENT');
  expect(await page.evaluate(()=>(window as unknown as {tree201ActorEvents:{focus:number;invalidations:number}}).tree201ActorEvents))
   .toEqual({focus:0,invalidations:0});
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  let refreshHeld!:()=>void,mutationDone!:()=>void;
  const refreshObserved=new Promise<'REFRESH'>(resolve=>{refreshHeld=()=>resolve('REFRESH');});
  const mutationObserved=new Promise<'WRITE'>(resolve=>{mutationDone=()=>resolve('WRITE');});
  let first=true,guardSawB=false,writes=0,writeStatus:number|null=null;
  const isTreeWrite=(url:string,method:string)=>new URL(url).pathname===f.treeUrl&&method!=='GET';
  page.on('request',r=>{if(isTreeWrite(r.url(),r.method()))writes++;});
  page.on('response',r=>{if(isTreeWrite(r.url(),r.request().method())){writeStatus=r.status();mutationDone();}});
  await page.route('**/api/g7-runtime/auth/session',async route=>{
   if(first){first=false;const response=await closeRouteFetch(route);expect(response.status()).toBe(200);
    guardSawB=(await response.json()).actor.id===adminB;expect(guardSawB).toBe(true);await route.fulfill({response});return;}
   refreshHeld();await held;await route.continue();
  });
  try{
   await panel.getByRole('button',{name:'저장',exact:true}).click();
   const observed=await Promise.race([refreshObserved,mutationObserved]);
   const after=snapshot();
   console.info('T201_ACTOR_BOUNDARY',JSON.stringify({observed,guardSawB,writes,writeStatus,
    folderDelta:after.folders.length-before.folders.length,auditDelta:after.audits.length-before.audits.length,
    staleCommittedAsB:after.folders.some(row=>row.name==='STALE-A-INTENT'&&row.created_by_id===adminB)}));
   expect(writes,'an A form must not dispatch a Tree mutation with B session credentials').toBe(0);
   expect(after).toEqual(before);
   await expect(panel.getByLabel('폴더 이름',{exact:true})).toHaveCount(0);
   await expect(panel.locator('[data-tree-node^="outline:"], [data-tree-node^="zone:"]')).toHaveCount(0);
   await expect(page.getByTestId('persisted-outline-path')).toHaveCount(0);await expect(page.getByTestId('cad-zone-path')).toHaveCount(0);
   expect(await page.evaluate(()=>(window as unknown as {tree201ActorEvents:{focus:number;invalidations:number}}).tree201ActorEvents))
    .toEqual({focus:0,invalidations:1});
   release();await page.unrouteAll({behavior:'wait'});
   await expect(panel.locator('[data-tree-node^="outline:"], [data-tree-node^="zone:"]')).toHaveCount(6);
   await expect(page.getByTestId('persisted-outline-path')).toHaveCount(3);await expect(page.getByTestId('cad-zone-path')).toHaveCount(3);
   const fresh=await createFolder(page,panel,f.treeUrl,'FRESH-B-INTENT');
   const final=snapshot();expect(final.folders).toHaveLength(before.folders.length+1);expect(final.audits).toHaveLength(before.audits.length+1);
   expect(final.folders.find(row=>row.id===fresh.id)).toMatchObject({created_by_id:adminB});
   expect(final.audits.find(row=>row.target_id===fresh.id)).toMatchObject({actor_user_id:adminB,action:'CREATE'});
  }finally{release();await page.unrouteAll({behavior:'wait'});}
 });
});
