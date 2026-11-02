import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {clickViewerCommand} from '../e2e/viewer-menu-helper';

async function login(page:Page){
  await page.goto('/g7-runtime');await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
async function session(page:Page){
  const response=await page.request.get('/api/g7-runtime/auth/session');expect(response.status()).toBe(200);
  return await response.json() as {csrfToken:string;actor:{id:string}};
}
async function logout(api:APIRequestContext,origin:string){
  const response=await api.get('/api/g7-runtime/auth/session');if(response.status()!==200)return;
  const value=await response.json();
  expect((await api.post('/api/g7-runtime/auth/logout',{headers:{origin,'x-csrf-token':value.csrfToken}})).status()).toBe(200);
}
async function context(page:Page){
  const id=(await (await page.request.get('/api/cad-files')).json()).items[0].id as string;
  const data=await (await page.request.get(`/api/cad-files/${id}/outlines`)).json();
  return {id,sha:data.sourceSha256 as string,sceneRevision:data.sceneRevision as number};
}
function siteFor(versionId:string):string{
  const Database=createRequire(import.meta.url)('better-sqlite3');
  const db=new Database(path.join(process.env.G7_GREENFIELD_E2E_ROOT!,'db','cad.sqlite'),{readonly:true});
  try{return db.prepare('SELECT b.site_id AS id FROM CadFileVersion v JOIN CadLocation l ON l.id=v.location_id JOIN Building b ON b.id=l.building_id WHERE v.id=?').get(versionId).id;}
  finally{db.close();}
}
async function ready(page:Page,id:string,original=false){
  await page.goto(`/cad/versions/${id}/viewer${original?'?source=build':''}`);
  await expect(page.getByTestId('cad-viewer-shell').getByRole('status')).toContainText('도면 표시 완료');
}
async function open(page:Page){
  await clickViewerCommand(page,'drawing','GLB/glTF 내보내기');
  const dialog=page.getByTestId('cad-exchange-dialog');await expect(dialog).toBeVisible();
  await expect(page.getByTestId('cad-exchange-review')).toBeEnabled();return dialog;
}
async function review(page:Page){
  await page.getByTestId('cad-exchange-review').click();
  await expect(page.getByTestId('cad-exchange-preview')).toBeVisible();
  const ack=page.getByTestId('cad-exchange-partial-ack');if(await ack.count())await ack.check();
  await expect(page.getByTestId('cad-exchange-download')).toBeEnabled();
}
async function createOutline(page:Page,id:string){
  const user=await session(page),origin=new URL(page.url()).origin;
  const data=await (await page.request.get(`/api/cad-files/${id}/outlines`)).json();
  const response=await page.request.post(`/api/cad-files/${id}/outlines`,{
    headers:{origin,'x-csrf-token':user.csrfToken},data:{mode:'APP_CREATED',sourceSha256:data.sourceSha256,
      expectedSceneRevision:data.sceneRevision,kind:'CONVEX',name:'Export server '+randomUUID().slice(0,8),outlineTypeId:null,
      geometry:{type:'Polygon',coordinates:[[[10,10],[20,10],[20,20],[10,10]]]}},
  });expect(response.status()).toBe(201);return await response.json() as {id:string;name:string;revision:number};
}
async function deleteOwn(page:Page,id:string,outlineId:string,origin:string){
  const current=await page.request.get('/api/g7-runtime/auth/session');
  if(current.status()===200)await logout(page.request,origin);
  expect((await page.request.post('/api/g7-runtime/auth/login',{headers:{origin},
    data:{login:'admin',password:'synthetic-changed-password'}})).status()).toBe(200);
  const user=await session(page),row=await page.request.get(`/api/cad-files/${id}/outlines/${outlineId}`);
  if(row.status()===200){
    const data=await (await page.request.get(`/api/cad-files/${id}/outlines`)).json();
    expect((await page.request.delete(`/api/cad-files/${id}/outlines/${outlineId}`,{
      headers:{origin,'x-csrf-token':user.csrfToken},data:{expectedRevision:(await row.json()).revision,
        expectedSceneRevision:data.sceneRevision},
    })).status()).toBe(200);
  }
  await logout(page.request,origin);
}
async function addReader(page:Page,api:APIRequestContext,origin:string,site?:string){
  const user=await session(page),headers={origin,'x-csrf-token':user.csrfToken};
  const login='export-'+randomUUID().slice(0,8),initial='synthetic-export-initial',password='synthetic-export-changed';
  const response=await page.request.post('/api/g7-runtime/users/create',{headers,data:{login,initialPassword:initial}});
  expect(response.status()).toBe(201);const id=(await response.json()).id;
  for(const [kind,value]of [['role','Reader'],...(site?[['site',site]]:[])])
    expect((await page.request.post('/api/g7-runtime/access/grant',{headers,data:{kind,operation:'grant',affectedUserId:id,value}})).status()).toBe(200);
  expect((await api.post('/api/g7-runtime/auth/initial-change',{headers:{origin},
    data:{login,password:initial,newPassword:password}})).status()).toBe(200);
  return {login,password,id};
}

test('R5a already loaded public local export stays available to anonymous and no-Site users without protected default reads',async({page,browser,request,baseURL})=>{
  test.setTimeout(120_000);await login(page);const scope=await context(page),origin=baseURL!;
  const reader=await addReader(page,request,origin);await logout(page.request,origin);
  for(const credentials of [null,reader]){
    const browserContext=await browser.newContext({baseURL});
    try{
      // The existing Scene-generation preflight requires authorization even
      // though Original CAD is public. Export reuses already loaded geometry;
      // changing that loader policy is outside this exchange feature.
      expect((await browserContext.request.post('/api/g7-runtime/auth/login',{
        headers:{origin},data:{login:'admin',password:'synthetic-changed-password'},
      })).status()).toBe(200);
      const fresh=await browserContext.newPage();await ready(fresh,scope.id,true);
      await logout(browserContext.request,origin);
      if(credentials)expect((await browserContext.request.post('/api/g7-runtime/auth/login',{
        headers:{origin},data:{login:credentials.login,password:credentials.password},
      })).status()).toBe(200);
      let protectedReads=0,originalGets=0;
      fresh.on('request',req=>{const path=new URL(req.url()).pathname;
        if(path===`/api/cad-files/${scope.id}/outlines`)protectedReads++;
        if(path===`/api/cad-files/${scope.id}/content`)originalGets++;});
      const dialog=await open(fresh);await review(fresh);
      const download=fresh.waitForEvent('download');await fresh.getByTestId('cad-exchange-download').click();
      const file=await download;expect(file.suggestedFilename()).toMatch(/\.glb$/);
      const bytes=readFileSync((await file.path())!);expect(bytes.subarray(0,4).toString()).toBe('glTF');
      expect(protectedReads).toBe(0);expect(originalGets).toBe(0);
      if(credentials){
        await dialog.getByTestId('cad-exchange-server-enable').click();
        await expect(dialog.getByRole('alert')).toBeVisible();
        await expect(dialog.getByTestId('cad-exchange-server-enable')).not.toBeChecked();
        await expect(fresh.getByTestId('cad-exchange-review')).toBeEnabled();
        expect(protectedReads).toBe(1);
      }
    }finally{await logout(browserContext.request,origin);await browserContext.close();}
  }
});

test('R5a a prepared server export rejects account change and clears private rows before download',async({page,request,baseURL})=>{
  test.setTimeout(120_000);await login(page);const scope=await context(page),origin=baseURL!;
  const outline=await createOutline(page,scope.id);
  try{
    const reader=await addReader(page,request,origin,siteFor(scope.id));
    await ready(page,scope.id);const dialog=await open(page);
    await dialog.getByTestId('cad-exchange-server-enable').click();
    await expect(dialog.getByRole('checkbox',{name:new RegExp(outline.name)})).toBeVisible();
    await review(page);await logout(page.request,origin);
    expect((await page.request.post('/api/g7-runtime/auth/login',{headers:{origin},data:{login:reader.login,password:reader.password}})).status()).toBe(200);
    let downloads=0;page.on('download',()=>downloads++);
    await page.getByTestId('cad-exchange-download').click();
    await expect(dialog.getByRole('alert')).toContainText('계정');
    await expect(dialog.getByRole('checkbox',{name:new RegExp(outline.name)})).toHaveCount(0);
    await expect(page.getByTestId('cad-exchange-download')).toBeDisabled();expect(downloads).toBe(0);
  }finally{await deleteOwn(page,scope.id,outline.id,origin);}
});

test('R5a a server revision change at the final post-serialization read cancels the file',async({page,baseURL})=>{
  test.setTimeout(120_000);await login(page);const scope=await context(page),origin=baseURL!;
  const outline=await createOutline(page,scope.id);let release!:()=>void;
  const hold=new Promise<void>(resolve=>{release=resolve;});let paused=false,reads=0;
  try{
    await ready(page,scope.id);const dialog=await open(page);
    await dialog.getByTestId('cad-exchange-server-enable').click();
    await expect(dialog.getByRole('checkbox',{name:new RegExp(outline.name)})).toBeVisible();await review(page);
    await page.route(`**/api/cad-files/${scope.id}/outlines`,async route=>{
      if(route.request().method()==='GET'&&++reads===2){paused=true;await hold;}
      await route.continue();
    });
    let downloads=0;page.on('download',()=>downloads++);await page.getByTestId('cad-exchange-download').click();
    await expect.poll(()=>paused,{timeout:15_000}).toBe(true);
    const user=await session(page);
    expect((await page.request.patch(`/api/cad-files/${scope.id}/outlines/${outline.id}`,{
      headers:{origin,'x-csrf-token':user.csrfToken},data:{expectedRevision:outline.revision,
        expectedSceneRevision:scope.sceneRevision,operation:'rename',name:'Changed during final export check'},
    })).status()).toBe(200);
    release();await expect(dialog.getByRole('alert')).toContainText('변경');
    await expect(page.getByTestId('cad-exchange-download')).toBeDisabled();expect(downloads).toBe(0);expect(reads).toBe(2);
  }finally{release();await deleteOwn(page,scope.id,outline.id,origin);}
});

test('R5a failed or malformed actor proof clears loaded private headers and never downloads',async({page,baseURL})=>{
  test.setTimeout(120_000);await login(page);const scope=await context(page),origin=baseURL!;
  const outline=await createOutline(page,scope.id);
  try{
    for(const failure of ['network','json']){
      await ready(page,scope.id);const dialog=await open(page);
      await dialog.getByTestId('cad-exchange-server-enable').click();
      await expect(dialog.getByRole('checkbox',{name:new RegExp(outline.name)})).toBeVisible();await review(page);
      let downloads=0;const count=()=>downloads++;page.on('download',count);
      await page.route('**/api/g7-runtime/auth/session',async route=>{
        if(failure==='network')await route.abort('failed');
        else await route.fulfill({status:200,contentType:'application/json',body:'{'});
      });
      await page.getByTestId('cad-exchange-download').click();
      await expect(dialog.getByRole('alert')).toContainText('계정');
      await expect(dialog.getByRole('checkbox',{name:new RegExp(outline.name)})).toHaveCount(0);
      await expect(page.getByTestId('cad-exchange-download')).toBeDisabled();expect(downloads).toBe(0);
      page.off('download',count);
      await page.unroute('**/api/g7-runtime/auth/session');
    }
  }finally{await deleteOwn(page,scope.id,outline.id,origin);}
});
