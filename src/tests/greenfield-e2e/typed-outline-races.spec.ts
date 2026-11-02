import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

type FixtureDatabase={prepare(sql:string):{get(...values:unknown[]):unknown};close():void};
const Database=createRequire(import.meta.url)('better-sqlite3') as new(filename:string,options:{readonly:boolean})=>FixtureDatabase;

function deferred<T=void>(){
  let resolve!:(value:T|PromiseLike<T>)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}

async function login(page:Page,loginName='admin',password='synthetic-changed-password'){
  await page.goto('/g7-runtime');
  await page.getByLabel('계정').fill(loginName);
  await page.getByLabel('비밀번호',{exact:true}).fill(password);
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}

async function logout(api:APIRequestContext,origin:string){
  const response=await api.get('/api/g7-runtime/auth/session');
  if(response.status()!==200)return;
  const session=await response.json();
  expect((await api.post('/api/g7-runtime/auth/logout',{
    headers:{origin,'x-csrf-token':session.csrfToken},
  })).status()).toBe(200);
}

async function work(page:Page,id:string){
  await page.getByRole('button',{name:'작업',exact:true}).click();
  await page.getByTestId(id).click();
}

async function ready(page:Page){
  await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
}

async function selectPreview(page:Page){
  await work(page,'viewer-menu-layers');
  await work(page,'viewer-menu-outline-tool');
  await page.getByRole('button',{name:'도구 닫기',exact:true}).click();
  const box=(await page.getByTestId('cad-canvas').locator('canvas').boundingBox())!;
  await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();
  await page.mouse.move(box.x+box.width-10,box.y+box.height-10,{steps:8});await page.mouse.up();
  await work(page,'viewer-menu-tools');
  await page.getByRole('button',{name:'볼록 외곽선 미리보기',exact:true}).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
}

function fixtureDb(){
  const root=process.env.G7_GREENFIELD_E2E_ROOT;
  if(!root)throw new Error('missing isolated fixture');
  return new Database(path.join(root,'db','cad.sqlite'),{readonly:true});
}

async function createTypedOutline(page:Page,baseURL:string,versionId:string,name:string){
  const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
  const headers={origin:baseURL,'x-csrf-token':session.csrfToken};
  const catalog=await (await page.request.get('/api/outline-types')).json();
  let type=catalog.items.find((item:{name:string})=>item.name.startsWith('R3 race type '));
  if(!type){
    const created=await page.request.post('/api/outline-types',{headers,data:{name:'R3 race type '+randomUUID().slice(0,8),sortOrder:0}});
    expect(created.status()).toBe(201);type=(await created.json()).item;
  }
  const context=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json();
  const response=await page.request.post(`/api/cad-files/${versionId}/outlines`,{
    headers:{...headers,'Idempotency-Key':randomUUID()},
    data:{mode:'APP_CREATED',sourceSha256:context.sourceSha256,expectedSceneRevision:context.sceneRevision,
      name,kind:'CONVEX',outlineTypeId:type.id,
      geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,0]]]}},
  });
  expect(response.status()).toBe(201);return await response.json();
}

async function deleteCreatedOutline(api:APIRequestContext,origin:string,versionId:string,id:string){
  const sessionResponse=await api.get('/api/g7-runtime/auth/session');
  if(sessionResponse.status()!==200)return;
  const session=await sessionResponse.json();
  const headers={origin,'x-csrf-token':session.csrfToken};
  const [rowResponse,pageResponse]=await Promise.all([
    api.get(`/api/cad-files/${versionId}/outlines/${id}`),
    api.get(`/api/cad-files/${versionId}/outlines`),
  ]);
  if(rowResponse.status()===404)return;
  expect(rowResponse.status()).toBe(200);expect(pageResponse.status()).toBe(200);
  const row=await rowResponse.json(),page=await pageResponse.json();
  expect(Number.isSafeInteger(page.sceneRevision)).toBe(true);
  const deleted=await api.delete(`/api/cad-files/${versionId}/outlines/${id}`,{
    headers,data:{expectedRevision:row.revision,expectedSceneRevision:page.sceneRevision},
  });
  expect(deleted.status(),await deleted.text()).toBe(200);
}

async function capturedResponse(route:Route){
  // This fixture captures a read while the client deliberately cancels stale
  // reads. Retry one transport reset, preserving this exact GET and its proof;
  // HTTP errors and all mutations remain unretried.
  expect(route.request().method()).toBe('GET');
  const response=await route.fetch({maxRetries:1});
  return {response,body:await response.body()};
}

test('R3 typed create: an older in-flight list response cannot erase a just-created row',async({page,baseURL})=>{
  test.setTimeout(120_000);await login(page);
  const releasePost=deferred<void>(),postArrived=deferred<void>();
  const releaseOldRead=deferred<void>(),oldReadReady=deferred<Record<string,unknown>>();
  const releaseFreshRead=deferred<void>(),freshReadArrived=deferred<void>();
  let holdPost=true,oldReadHeld=false,freshReadHeld=false;
  let versionId='',createdId='';let oldSnapshot:Record<string,unknown>|null=null;
  try{
    const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const headers={origin:baseURL!,'x-csrf-token':session.csrfToken};
    const files=await (await page.request.get('/api/cad-files')).json();versionId=files.items[0].id;
    const typeName='R3 race type '+randomUUID().slice(0,8);
    const typeResponse=await page.request.post('/api/outline-types',{headers,data:{name:typeName,sortOrder:0}});
    expect(typeResponse.status()).toBe(201);const type=(await typeResponse.json()).item;
    await page.goto(`/cad/versions/${versionId}/viewer`);await ready(page);await selectPreview(page);
    await page.getByLabel('업무 타입 검색',{exact:true}).fill(typeName);
    await page.getByRole('button',{name:'타입 검색',exact:true}).click();
    await page.getByTestId('outline-type-select').selectOption(type.id);
    const instanceName='R3 race create '+randomUUID().slice(0,8);
    await page.getByTestId('outline-instance-name').fill(instanceName);
    await page.getByRole('button',{name:'도구 닫기',exact:true}).click();
    await work(page,'viewer-menu-outline-tree');
    const tree=page.getByTestId('viewer-outline-tree');
    await expect(tree.getByRole('button',{name:'서버 외곽선 새로고침',exact:true})).toBeEnabled();
    await work(page,'viewer-menu-tools');
    const collectionPath=`/api/cad-files/${versionId}/outlines`;

    await page.route(`**${collectionPath}*`,async route=>{
      const url=new URL(route.request().url());
      if(url.pathname!==collectionPath){await route.continue();return;}
      if(route.request().method()==='POST'&&holdPost){
        postArrived.resolve();await releasePost.promise;holdPost=false;await route.continue();return;
      }
      if(route.request().method()==='GET'&&!oldReadHeld){
        const response=await capturedResponse(route);
        oldSnapshot=JSON.parse(response.body.toString()) as Record<string,unknown>;
        oldReadHeld=true;
        oldReadReady.resolve(oldSnapshot);
        await releaseOldRead.promise;
        try{await route.fulfill({response:response.response,body:response.body});}catch{/* An aborted stale read is also safely discarded. */}
        return;
      }
      if(route.request().method()==='GET'&&oldReadHeld&&!freshReadHeld){
        freshReadHeld=true;freshReadArrived.resolve();await releaseFreshRead.promise;
      }
      await route.continue();
    });

    const postResponse=page.waitForResponse(response=>new URL(response.url()).pathname===collectionPath&&response.request().method()==='POST');
    await page.getByTestId('outline-typed-confirm').click();await postArrived.promise;
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const stale=await oldReadReady.promise;
    expect((stale.outlines as {name:string}[]).some(row=>row.name===instanceName)).toBe(false);

    releasePost.resolve();
    const createdResponse=await postResponse;expect(createdResponse.status()).toBe(201);
    const created=await createdResponse.json();
    createdId=created.id;
    await expect(tree.locator(`[data-tree-key="server:${created.id}"]`)).toBeVisible();
    releaseOldRead.resolve();
    await freshReadArrived.promise;
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(tree.locator(`[data-tree-key="server:${created.id}"]`)).toBeVisible();
    expect(oldSnapshot).toBeTruthy();
    releaseFreshRead.resolve();
    await expect(tree.locator(`[data-tree-key="server:${created.id}"]`)).toBeVisible();
    await page.unroute(`**${collectionPath}*`);
  }finally{
    releasePost.resolve();releaseOldRead.resolve();releaseFreshRead.resolve();
    if(versionId)await page.unroute(`**/api/cad-files/${versionId}/outlines*`).catch(()=>{});
    if(versionId&&createdId)await deleteCreatedOutline(page.request,baseURL!,versionId,createdId);
    await logout(page.request,baseURL!);
  }
});

test('R3 delayed legacy PATCH response from a prior actor cannot replace the current actor’s newer row',async({page,baseURL,request})=>{
  test.setTimeout(120_000);await login(page);
  const releaseAdminReply=deferred<void>(),adminReplyReady=deferred<void>();
  let versionId='',createdId='';let firstPatch=true,responseHeld=false;
  const adminReplySettled=deferred<void>();
  let delayedResponse:{response:Awaited<ReturnType<Route['fetch']>>;body:Buffer}|null=null;
  try{
    const adminSession=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const adminHeaders={origin:baseURL!,'x-csrf-token':adminSession.csrfToken};
    const files=await (await page.request.get('/api/cad-files')).json();versionId=files.items[0].id;
    const siteDb=fixtureDb();let siteId:string;
    try{
      siteId=(siteDb.prepare('SELECT b.site_id AS id FROM CadFileVersion v JOIN CadLocation l ON l.id=v.location_id JOIN Building b ON b.id=l.building_id WHERE v.id=?').get(versionId) as {id:string}).id;
    }finally{siteDb.close();}

    const editorLogin='r3-race-'+randomUUID().slice(0,8),editorInitial='synthetic-race-initial',editorPassword='synthetic-race-changed';
    const userResponse=await page.request.post('/api/g7-runtime/users/create',{headers:adminHeaders,
      data:{login:editorLogin,initialPassword:editorInitial}});
    expect(userResponse.status()).toBe(201);const user=await userResponse.json();
    expect((await page.request.post('/api/g7-runtime/access/grant',{headers:adminHeaders,
      data:{kind:'role',operation:'grant',affectedUserId:user.id,value:'Editor'}})).status()).toBe(200);
    expect((await page.request.post('/api/g7-runtime/access/grant',{headers:adminHeaders,
      data:{kind:'site',operation:'grant',affectedUserId:user.id,value:siteId}})).status()).toBe(200);
    // Use Playwright's isolated API fixture so the temporary-password flow
    // cannot replace the Admin cookie in this page's browser context.
    expect((await request.post('/api/g7-runtime/auth/initial-change',{
      headers:{origin:baseURL!},data:{login:editorLogin,password:editorInitial,newPassword:editorPassword},
    })).status()).toBe(200);
    const row=await createTypedOutline(page,baseURL!,versionId,'R3 delayed actor '+randomUUID().slice(0,8));
    createdId=row.id;
    await page.goto(`/cad/versions/${versionId}/viewer`);await ready(page);await work(page,'viewer-menu-tools');
    const tools=page.getByTestId('cad-stored-outline-tools');
    const rowLocator=()=>tools.getByText(row.name+' (r'+(row.revision)+')',{exact:true}).locator('..');
    const patchPath=`/api/cad-files/${versionId}/outlines/${row.id}`;
    await page.route(`**${patchPath}`,async route=>{
      if(route.request().method()!=='PATCH'||!firstPatch){await route.continue();return;}
      firstPatch=false;
      const response=await route.fetch();
      delayedResponse={response,body:await response.body()};
      responseHeld=true;adminReplyReady.resolve();await releaseAdminReply.promise;
      try{await route.fulfill({response:delayedResponse.response,body:delayedResponse.body});}
      catch{/* The prior actor request can be aborted after session replacement. */}
      finally{adminReplySettled.resolve();}
    });
    page.once('dialog',dialog=>dialog.accept('R3 actor A revision'));
    await rowLocator().getByRole('button',{name:'이름',exact:true}).click();
    await adminReplyReady.promise;
    expect(delayedResponse).toBeTruthy();

    expect((await page.request.post('/api/g7-runtime/auth/logout',{headers:adminHeaders})).status()).toBe(200);
    const editorLoginResponse=await page.request.post('/api/g7-runtime/auth/login',{
      headers:{origin:baseURL!},data:{login:editorLogin,password:editorPassword},
    });
    expect(editorLoginResponse.status()).toBe(200);
    const editorSession=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const actorRead=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/cad-files/${versionId}/outlines`&&response.request().method()==='GET');
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const fresh=await (await actorRead).json();expect(fresh.actorId).toBe(editorSession.actor.id);
    await expect(tools.getByText('R3 actor A revision (r1)',{exact:true})).toBeVisible();
    const currentRow=()=>tools.getByText('R3 actor A revision (r1)',{exact:true}).locator('..');
    await expect(currentRow().getByRole('button',{name:'이름',exact:true})).toBeEnabled();
    page.once('dialog',dialog=>dialog.accept('R3 actor B latest'));
    const editorPatch=page.waitForResponse(response=>new URL(response.url()).pathname===patchPath&&response.request().method()==='PATCH');
    await currentRow().getByRole('button',{name:'이름',exact:true}).click();
    expect((await editorPatch).status()).toBe(200);
    await expect(tools.getByText('R3 actor B latest (r2)',{exact:true})).toBeVisible();

    releaseAdminReply.resolve();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(tools.getByText('R3 actor B latest (r2)',{exact:true})).toBeVisible();
    const persisted=await (await page.request.get(`/api/cad-files/${versionId}/outlines/${row.id}`)).json();
    expect(persisted).toMatchObject({name:'R3 actor B latest',revision:2,updatedById:editorSession.actor.id});
    await page.unroute(`**${patchPath}`);
  }finally{
    releaseAdminReply.resolve();
    if(versionId)await page.unroute(`**/api/cad-files/${versionId}/outlines/*`).catch(()=>{});
    if(responseHeld)await adminReplySettled.promise;
    if(versionId&&createdId)await deleteCreatedOutline(page.request,baseURL!,versionId,createdId);
    await logout(page.request,baseURL!);
  }
});
