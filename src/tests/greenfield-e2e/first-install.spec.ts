import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {sceneDxf} from '../fixtures/scene-dxf';

test('#109 initial browser Admin setup requires host code, then redirects to account',async({page,request})=>{
  const root=process.env.G7_GREENFIELD_E2E_ROOT;
  if(!root)throw new Error('missing isolated first run root');
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'신규 설치 · 최초 관리자 설정'})).toBeVisible();
  await expect(page.getByTestId('g7-first-setup')).toBeVisible();
  const input=page.getByLabel('Docker 호스트 최초 설정 코드');
  const username=page.getByLabel('최초 관리자 계정');
  const password=page.getByLabel('초기 비밀번호');
  await expect(page.getByRole('button',{name:'최초 관리자 등록'})).toBeEnabled();
  await input.fill('x'.repeat(43));
  await username.fill('admin');
  await password.fill('synthetic-first-password');
  await page.getByRole('button',{name:'최초 관리자 등록'}).click();
  await expect(page.getByTestId('g7-first-setup').getByRole('alert')).toContainText('SETUP_DENIED');
  const code=readFileSync(path.join(root,'db','first-admin.code'),'utf8');
  await input.fill(code);
  await page.getByRole('button',{name:'최초 관리자 등록'}).click();
  await expect(page.getByText('최초 관리자가 등록되었습니다.')).toBeVisible();
  await page.getByRole('link',{name:'초기 비밀번호 변경 및 로그인'}).click();
  await expect(page.getByRole('heading',{name:'로그인'})).toBeVisible();
  await page.getByRole('button',{name:'초기 비밀번호 변경'}).click();
  await page.getByLabel('계정').fill('admin');
  await page.getByLabel('초기 비밀번호').fill('synthetic-first-password');
  await page.getByLabel('새 비밀번호').fill('synthetic-changed-password');
  await page.getByRole('button',{name:'비밀번호 변경'}).click();
  await expect(page.getByText('비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.')).toBeVisible();
  await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
  const setup=await request.get('/api/g7-runtime/setup');
  expect(setup.status()).toBe(404);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'CAD 도면 목록'})).toBeVisible();
});

test('SC-14–17 authenticated conversion → persisted Scene → independent browser and reload without original GET or parsing',async({page,browser,baseURL})=>{
  test.setTimeout(120_000);
  await page.goto('/g7-runtime');
  await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
  const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
  const headers={'origin':baseURL!,'x-csrf-token':session.csrfToken};
  const ids:Record<string,string>={};let parentId:string|undefined;
  for(const type of ['business-units','products','sites','buildings','floors']){
    const response=await page.request.post('/api/masters',{headers,data:{type,name:'Scene '+type,...(parentId?{parentId}:{}),...(type==='sites'?{kind:'SITE'}:{})}});
    expect(response.status(),await response.text()).toBe(201);
    const row=await response.json();parentId=ids[type]=row.id;
    if(type==='sites'){
      const grant=await page.request.post('/api/g7-runtime/access/grant',{headers,data:{kind:'site',operation:'grant',affectedUserId:session.actor.id,value:row.id}});
      expect(grant.status()).toBe(200);
    }
  }
  const upload=await page.request.post('/api/cad-files',{headers,multipart:{
    file:{name:'synthetic-scene.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(sceneDxf)},
    businessUnitId:ids['business-units'],productId:ids.products,siteId:ids.sites,buildingId:ids.buildings,floorId:ids.floors,
    registeredAt:'2026-10-30',deletePassword:'1234',makeCurrent:'true',
  }});
  expect(upload.status(),await upload.text()).toBe(201);const version=await upload.json();
  const original=`/api/cad-files/${version.id}/content`;let originalGets=0;
  page.on('request',request=>{if(new URL(request.url()).pathname===original)originalGets++;});
  await page.goto(`/cad/versions/${version.id}/viewer`);
  await expect(page.getByTestId('cad-viewer-shell').getByRole('alert')).toContainText('scene:UNAVAILABLE');
  expect(originalGets).toBe(0);
  await page.getByRole('button',{name:'도면',exact:true}).click();
  await page.getByRole('menuitem',{name:'원본 DXF로 Scene 생성/재생성'}).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료',{timeout:30_000});
  await page.getByRole('button',{name:'도면',exact:true}).click();
  await page.getByRole('menuitem',{name:'Scene Asset 저장',exact:true}).click();
  await expect(page.getByTestId('scene-status')).toContainText('Scene Asset 저장 완료',{timeout:30_000});
  expect(originalGets).toBe(1);
  const status=await (await page.request.get(`/api/cad-files/${version.id}/scene`)).json();
  expect(status.status).toBe('READY');
  const stored=await (await page.request.get(status.contentUrl)).json();
  expect(stored.asset.objects.length).toBeGreaterThan(5);
  expect(stored.asset.objects.every((o:{ref:{origin:string}})=>o.ref.origin==='DXF_IMPORTED')).toBe(true);
  expect(stored.viewerData.textIndex.hits.length).toBeGreaterThan(0);

  const consumer=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});
  await consumer.addInitScript(()=>{
    const counters={workers:0,blobs:0,liveWorkers:0};Object.assign(window,{sceneLoadCounters:counters});
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{
      private ended=false;
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);counters.workers++;counters.liveWorkers++;}
      terminate(){if(!this.ended){counters.liveWorkers--;this.ended=true;}super.terminate();}
    };
    const create=URL.createObjectURL.bind(URL);URL.createObjectURL=value=>{counters.blobs++;return create(value);};
  });
  const fresh=await consumer.newPage();let gets=0,sceneGets=0;
  fresh.on('request',request=>{const url=new URL(request.url());if(url.pathname===original)gets++;if(url.pathname.includes(`/cad-files/${version.id}/scene`))sceneGets++;});
  await fresh.route(`**${original}`,route=>route.abort());
  await fresh.goto('/g7-runtime');
  await fresh.getByLabel('계정').fill('admin');
  await fresh.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await fresh.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(fresh.getByRole('heading',{name:'현재 세션'})).toBeVisible();
  const firstCookie=(await page.context().cookies()).find(c=>c.name==='cad_session');
  const otherCookie=(await consumer.cookies()).find(c=>c.name==='cad_session');
  expect(otherCookie?.value).toBeTruthy();expect(otherCookie?.value).not.toBe(firstCookie?.value);
  await fresh.goto(`/cad/versions/${version.id}/viewer`);
  await expect(fresh.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await expect(fresh.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(fresh.getByTestId('cad-canvas').locator('canvas')).toHaveCount(1);
  await expect(fresh.getByTestId('viewer-layer-dock')).toBeVisible();
  await fresh.getByRole('button',{name:'작업',exact:true}).click();
  await fresh.getByRole('menuitemcheckbox',{name:'도면 내 텍스트 검색'}).click();
  await fresh.getByRole('searchbox',{name:'도면 텍스트 검색어'}).fill('HELLO');
  await expect(fresh.getByTestId('cad-text-search')).toContainText('검색 결과 1개');
  await fresh.getByRole('button',{name:/SCENE HELLO/}).click();
  await fresh.getByRole('checkbox',{name:'TEXT',exact:true}).uncheck();
  await expect(fresh.getByTestId('cad-text-search')).toContainText('검색 결과 0개');
  await fresh.getByRole('checkbox',{name:'TEXT',exact:true}).check();
  await expect(fresh.getByTestId('cad-text-search')).toContainText('검색 결과 1개');
  await fresh.setViewportSize({width:1000,height:740});
  await fresh.getByRole('button',{name:'보기',exact:true}).click();
  await fresh.getByRole('menuitem',{name:'화면 맞춤',exact:true}).click();
  await fresh.getByRole('button',{name:'보기',exact:true}).click();
  await fresh.getByRole('menuitem',{name:'브라우저 전체 화면',exact:true}).click();
  await expect.poll(()=>fresh.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await fresh.evaluate(()=>document.exitFullscreen());
  expect(await fresh.evaluate(()=>({...(window as unknown as {sceneLoadCounters:object}).sceneLoadCounters}))).toEqual({workers:0,blobs:0,liveWorkers:0});
  await fresh.reload();
  await expect(fresh.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  expect(gets).toBe(0);expect(sceneGets).toBeGreaterThanOrEqual(4);
  expect(await fresh.evaluate(()=>({...(window as unknown as {sceneLoadCounters:object}).sceneLoadCounters}))).toEqual({workers:0,blobs:0,liveWorkers:0});
  console.log('SCENE_RECONNECT',JSON.stringify({originalGets:gets,dxFConverterBlobUrls:0,dxFIndexWorkers:0,sceneGets,browserContexts:2}));
  // S5: READY Scene work stays independent of DXF Handle mapping and original GET.
  await fresh.getByRole('button',{name:'작업',exact:true}).click();
  await fresh.getByTestId('viewer-menu-layers').click();
  await fresh.getByRole('button',{name:'작업',exact:true}).click();
  await fresh.getByTestId('viewer-menu-outline-tool').click();
  await expect(fresh.getByTestId('outline-basis')).toHaveValue('render');
  await expect(fresh.getByTestId('outline-render-mapping')).toContainText('정밀 원본 매핑 0개');
  const s5Canvas=fresh.getByTestId('cad-canvas').locator('canvas');
  const s5Box=(await s5Canvas.boundingBox())!;
  await fresh.mouse.move(s5Box.x+10,s5Box.y+10);await fresh.mouse.down();
  await fresh.mouse.move(s5Box.x+s5Box.width-10,s5Box.y+s5Box.height-10,{steps:8});await fresh.mouse.up();
  await expect(fresh.getByTestId('outline-selection-count')).not.toContainText('선택 0개');
  await fresh.getByRole('button',{name:'볼록 외곽선 미리보기',exact:true}).click();
  await expect(fresh.getByTestId('outline-preview')).toContainText('Polygon');
  await fresh.getByRole('button',{name:'임시 확정',exact:true}).click();
  await fresh.getByRole('button',{name:'작업',exact:true}).click();
  await fresh.getByTestId('viewer-menu-outline-tool').click();
  await fresh.getByRole('button',{name:'작업',exact:true}).click();
  await fresh.getByTestId('viewer-menu-outline-tree').click();
  await expect(fresh.getByTestId('outline-tree-item')).toHaveCount(1);
  await expect(fresh.getByTestId('outline-saved-tools')).toContainText('1건');
  expect(await (await fresh.request.get(status.contentUrl)).json()).toEqual(stored);
  expect((await (await fresh.request.get(`/api/cad-files/${version.id}/scene`)).json()).revision).toBe(status.revision);
  expect(gets).toBe(0);
  await fresh.reload();
  await expect(fresh.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');

  const endpoint=`**/api/cad-files/${version.id}/scene`;
  for(const metadata of [{status:'MISSING'},{...status,manifest:{...status.manifest,scope:{...status.manifest.scope,builder:'unsupported'}}}]){
    await fresh.route(endpoint,route=>route.fulfill({json:metadata}));
    await fresh.reload();
    await expect(fresh.getByTestId('cad-viewer-shell').getByRole('alert')).toContainText('scene:');
    expect(gets).toBe(0);await fresh.unroute(endpoint);
  }
  await fresh.route(`**/api/cad-files/${version.id}/scene/content?assetId=*`,route=>route.fulfill({contentType:'application/json',body:'corrupt'}));
  await fresh.reload();
  await expect(fresh.getByTestId('cad-viewer-shell').getByRole('alert')).toContainText('REBUILD_REQUIRED');
  expect(gets).toBe(0);
  await fresh.unroute(`**/api/cad-files/${version.id}/scene/content?assetId=*`);
  await fresh.reload();
  await expect(fresh.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await fresh.unroute(`**${original}`);
  await fresh.getByRole('button',{name:'보기',exact:true}).click();
  await fresh.getByRole('menuitemradio',{name:'dxf-viewer',exact:true}).click();
  await expect(fresh.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await expect(fresh.getByRole('status')).toHaveText('도면 표시 완료');
  expect(gets).toBe(1);
  await fresh.getByRole('button',{name:'보기',exact:true}).click();
  await fresh.getByRole('menuitemradio',{name:'three-dxf-viewer',exact:true}).click();
  await expect(fresh.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await expect(fresh.getByTestId('cad-canvas').locator('canvas')).toHaveCount(1);
  expect(gets).toBe(1);
  expect(await fresh.evaluate(()=>(window as unknown as {sceneLoadCounters:{liveWorkers:number}}).sceneLoadCounters.liveWorkers)).toBe(0);
  // P2 regression: explicit build from the legacy URL must persist the
  // Three renderer in the URL so a reload uses the saved Scene, not DXF.
  await fresh.getByRole('button',{name:'보기',exact:true}).click();
  await fresh.getByRole('menuitemradio',{name:'dxf-viewer',exact:true}).click();
  await expect(fresh.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await expect(fresh.getByRole('status')).toHaveText('도면 표시 완료');
  expect(new URL(fresh.url()).searchParams.get('renderer')).toBe('dxf-viewer');
  await fresh.getByRole('button',{name:'도면',exact:true}).click();
  await fresh.getByRole('menuitem',{name:'원본 DXF로 Scene 생성/재생성'}).click();
  expect(new URL(fresh.url()).searchParams.get('renderer')).toBe('three-dxf-viewer');
  await expect(fresh.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  await expect(fresh.getByRole('status')).toHaveText('도면 표시 완료',{timeout:30_000});
  const getsBeforeReload=gets;
  await fresh.reload();
  await expect(fresh.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  expect(new URL(fresh.url()).searchParams.get('renderer')).toBe('three-dxf-viewer');
  expect(gets).toBe(getsBeforeReload);
  await consumer.close();
});
