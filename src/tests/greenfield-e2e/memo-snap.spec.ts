import {expect,test,type Page,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';

type FixtureDb={prepare(sql:string):{get(...values:unknown[]):unknown};close():void};
const Database=createRequire(import.meta.url)('better-sqlite3') as new(file:string,options:{readonly:boolean})=>FixtureDb;
async function login(page:Page){
  await page.goto('/g7-runtime');await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
async function logout(api:APIRequestContext,origin:string){
  const response=await api.get('/api/g7-runtime/auth/session');if(response.status()!==200)return;
  const session=await response.json();
  expect((await api.post('/api/g7-runtime/auth/logout',{headers:{origin,'x-csrf-token':session.csrfToken}})).status()).toBe(200);
}
async function work(page:Page,id:string){
  await page.getByRole('button',{name:'작업',exact:true}).click();await page.getByTestId(id).click();
}
async function stage(page:Page,title:string,x='12',y='12'){
  await work(page,'viewer-menu-memo-add');await page.getByTestId('cad-memo-title').fill(title);
  await page.getByTestId('cad-memo-x').fill(x);await page.getByTestId('cad-memo-y').fill(y);
  await page.getByTestId('cad-memo-coordinate-place').click();
  await expect(page.getByTestId('cad-memo-candidate-wcs')).toBeVisible();
  await page.getByTestId('cad-memo-snap-select').selectOption('');
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
async function frames(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}

test('R4 prepared Memo actor cannot change before POST; delayed query obeys edits and cancellation',async({page,request,baseURL})=>{
  test.setTimeout(120_000);await login(page);const origin=baseURL!;
  const title='R4 old actor '+randomUUID().slice(0,8);let versionId='';const releases:(()=>void)[]=[];
  try{
    const admin=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const headers={origin,'x-csrf-token':admin.csrfToken};
    versionId=(await (await page.request.get('/api/cad-files')).json()).items[0].id;
    const root=process.env.G7_GREENFIELD_E2E_ROOT!;
    const db=new Database(path.join(root,'db','cad.sqlite'),{readonly:true});let siteId:string;
    try{siteId=(db.prepare('SELECT b.site_id AS id FROM CadFileVersion v JOIN CadLocation l ON l.id=v.location_id JOIN Building b ON b.id=l.building_id WHERE v.id=?').get(versionId) as {id:string}).id;}
    finally{db.close();}
    const editorLogin='r4-'+randomUUID().slice(0,8),initial='synthetic-r4-initial',password='synthetic-r4-changed';
    const created=await page.request.post('/api/g7-runtime/users/create',{headers,data:{login:editorLogin,initialPassword:initial}});
    expect(created.status()).toBe(201);const editorId=(await created.json()).id;
    for(const [kind,value] of [['role','Editor'],['site',siteId]])
      expect((await page.request.post('/api/g7-runtime/access/grant',{headers,data:{kind,operation:'grant',affectedUserId:editorId,value}})).status()).toBe(200);
    expect((await request.post('/api/g7-runtime/auth/initial-change',{headers:{origin},data:{login:editorLogin,password:initial,newPassword:password}})).status()).toBe(200);
    await page.goto(`/cad/versions/${versionId}/viewer`);
    await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
    await stage(page,title);
    await logout(page.request,origin);
    expect((await page.request.post('/api/g7-runtime/auth/login',{headers:{origin},data:{login:editorLogin,password}})).status()).toBe(200);
    let memoPosts=0;page.on('request',request=>{if(new URL(request.url()).pathname===`/api/cad-files/${versionId}/memos`&&request.method()==='POST')memoPosts++;});
    await page.getByTestId('cad-memo-create').click();
    await expect(page.getByTestId('cad-memo-error')).toContainText('계정');expect(memoPosts).toBe(0);
    await page.getByTestId('cad-memo-snap-refresh').click();
    await page.getByTestId('cad-memo-snap-select').selectOption('');
    const posted=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/cad-files/${versionId}/memos`&&response.request().method()==='POST');
    await page.getByTestId('cad-memo-create').click();expect((await posted).status()).toBe(201);
    expect(memoPosts).toBe(1);
    const stored=(await (await page.request.get(`/api/cad-files/${versionId}/memos`)).json()).memos.find((row:{title:string})=>row.title===title);
    expect(stored.createdById).toBe(editorId);
    await page.getByTestId('cad-memo-cancel').click();await work(page,'viewer-menu-memo-add');
    await page.getByTestId('cad-memo-title').fill('R4 latest query');
    await page.getByTestId('cad-memo-x').fill('1');await page.getByTestId('cad-memo-y').fill('2');
    let holdNext=true;const paused:ReturnType<typeof deferred>[]=[];
    await page.route('**/api/g7-runtime/auth/session',async route=>{
      if(holdNext){holdNext=false;const hold=deferred();paused.push(hold);releases.push(hold.resolve);await hold.promise;}
      try{await route.continue();}catch{/* A canceled proof is discarded by the app. */}
    });
    await page.getByTestId('cad-memo-coordinate-place').click();await expect.poll(()=>paused.length).toBe(1);
    await page.getByTestId('cad-memo-x').fill('5');await page.getByTestId('cad-memo-y').fill('6');
    await page.getByTestId('cad-memo-coordinate-place').click();
    await expect(page.getByTestId('cad-memo-candidate-wcs')).toBeVisible();
    await page.getByTestId('cad-memo-snap-select').selectOption('');
    const first=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/g7-runtime/auth/session');
    paused[0].resolve();await (await first).finished();await frames(page);
    await expect(page.getByTestId('cad-memo-x')).toHaveValue('5');await expect(page.getByTestId('cad-memo-y')).toHaveValue('6');
    holdNext=true;await page.getByTestId('cad-memo-snap-refresh').click();await expect.poll(()=>paused.length).toBe(2);
    await page.getByTestId('cad-memo-cancel').click();
    const last=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/g7-runtime/auth/session');
    paused[1].resolve();await (await last).finished();await frames(page);
    await expect(page.getByTestId('cad-memo-editor')).toHaveCount(0);
  }finally{
    releases.forEach(release=>release());
    if(versionId){
      const sessionResponse=await page.request.get('/api/g7-runtime/auth/session');
      if(sessionResponse.status()===200){
        const session=await sessionResponse.json();
        const result=await page.request.get(`/api/cad-files/${versionId}/memos`);
        if(result.status()===200)for(const row of (await result.json()).memos.filter((row:{title:string})=>row.title===title))
          expect((await page.request.delete(`/api/cad-files/${versionId}/memos/${row.id}`,{headers:{origin,'x-csrf-token':session.csrfToken},data:{expectedRevision:row.revision}})).status()).toBe(200);
      }
    }
    await logout(page.request,origin);
  }
});
