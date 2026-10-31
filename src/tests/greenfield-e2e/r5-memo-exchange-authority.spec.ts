import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {clickViewerCommand} from '../e2e/viewer-menu-helper';

const password='synthetic-changed-password';
async function session(api:APIRequestContext){const response=await api.get('/api/g7-runtime/auth/session');expect(response.status()).toBe(200);return await response.json() as {actor:{id:string};csrfToken:string};}
async function logout(api:APIRequestContext,origin:string){
  const response=await api.get('/api/g7-runtime/auth/session');if(response.status()!==200)return;
  expect((await api.post('/api/g7-runtime/auth/logout',{headers:{origin,'x-csrf-token':(await response.json()).csrfToken}})).status()).toBe(200);
}
async function login(api:APIRequestContext,origin:string,login='admin',secret=password){
  expect((await api.post('/api/g7-runtime/auth/login',{headers:{origin},data:{login,password:secret}})).status()).toBe(200);
}
async function headers(api:APIRequestContext,origin:string){return {origin,'x-csrf-token':(await session(api)).csrfToken};}
function siteFor(id:string):string{
  const Database=createRequire(import.meta.url)('better-sqlite3');
  const db=new Database(path.join(process.env.G7_GREENFIELD_E2E_ROOT!,'db','cad.sqlite'),{readonly:true});
  try{return db.prepare('SELECT b.site_id AS id FROM CadFileVersion v JOIN CadLocation l ON l.id=v.location_id JOIN Building b ON b.id=l.building_id WHERE v.id=?').get(id).id;}
  finally{db.close();}
}
async function fixture(page:Page,origin:string){
  await login(page.request,origin);
  const id=(await (await page.request.get('/api/cad-files')).json()).items[0].id as string;
  const memoUrl=`/api/cad-files/${id}/memos`,pageData=await (await page.request.get(memoUrl)).json();
  const title='인가 메모 '+randomUUID().slice(0,8);
  const response=await page.request.post(memoUrl,{headers:await headers(page.request,origin),data:{
    sourceSha256:pageData.sourceSha256,title,content:'한글 첫 줄\nAuthorized content',anchorWcsXY:{x:10,y:20},
  }});expect(response.status()).toBe(201);
  const memo=await response.json() as {id:string;revision:number};
  return {id,memoUrl,memo,title,ownerId:(await session(page.request)).actor.id,sha:pageData.sourceSha256 as string};
}
async function cleanup(api:APIRequestContext,origin:string,id:string,memoId:string){
  await logout(api,origin);await login(api,origin);
  const url=`/api/cad-files/${id}/memos`,data=await (await api.get(url)).json();
  const row=data.memos.find((row:{id:string})=>row.id===memoId);
  if(row)expect((await api.delete(url+'/'+memoId,{headers:await headers(api,origin),data:{expectedRevision:row.revision}})).status()).toBe(200);
  await logout(api,origin);
}
async function reader(admin:APIRequestContext,isolated:APIRequestContext,origin:string,siteId:string){
  const login='memo-export-'+randomUUID().slice(0,8),initial='synthetic-export-initial',secret='synthetic-reader-changed';
  const response=await admin.post('/api/g7-runtime/users/create',{headers:await headers(admin,origin),data:{login,initialPassword:initial}});
  expect(response.status()).toBe(201);const id=(await response.json()).id as string;
  for(const [kind,value]of [['role','Reader'],['site',siteId]])expect((await admin.post('/api/g7-runtime/access/grant',{
    headers:await headers(admin,origin),data:{kind,operation:'grant',affectedUserId:id,value},
  })).status()).toBe(200);
  expect((await isolated.post('/api/g7-runtime/auth/initial-change',{headers:{origin},data:{login,password:initial,newPassword:secret}})).status()).toBe(200);
  return {id,login,secret};
}
async function ready(page:Page,id:string){
  await page.goto(`/cad/versions/${id}/viewer`);
  await expect(page.getByTestId('cad-viewer-shell').getByRole('status')).toContainText('도면 표시 완료');
}
async function open(page:Page){await clickViewerCommand(page,'drawing','GLB/glTF 내보내기');const dialog=page.getByTestId('cad-exchange-dialog');await expect(dialog).toBeVisible();await expect(page.getByTestId('cad-exchange-review')).toBeEnabled();return dialog;}
async function includeMemo(page:Page,title:string){
  const dialog=await open(page);await dialog.getByTestId('cad-exchange-server-memos-enable').click();
  const row=dialog.getByRole('checkbox',{name:new RegExp(title)});await expect(row).toBeVisible();
  await dialog.getByRole('button',{name:'메모 전체 해제',exact:true}).click();await row.check();return dialog;
}
async function review(page:Page){
  await page.getByTestId('cad-exchange-review').click();await expect(page.getByTestId('cad-exchange-preview')).toBeVisible();
  const ack=page.getByTestId('cad-exchange-partial-ack');if(await ack.count())await ack.check();
  await expect(page.getByTestId('cad-exchange-download')).toBeEnabled();
}

test('R5b actual Memo response actor rejects A-to-B-to-A even when both surrounding session proofs are A',async({page,request,baseURL})=>{
  test.setTimeout(120_000);const origin=baseURL!,f=await fixture(page,origin);
  try{
    const other=await reader(page.request,request,origin,siteFor(f.id));
    await ready(page,f.id);const dialog=await includeMemo(page,f.title);let swapped=false,downloads=0;
    page.on('download',()=>downloads++);
    await page.route('**'+f.memoUrl,async route=>{
      if(swapped||route.request().method()!=='GET'){await route.continue();return;}swapped=true;
      await logout(page.request,origin);await login(page.request,origin,other.login,other.secret);
      const actual=await page.request.get(f.memoUrl);expect(actual.status()).toBe(200);
      expect((await actual.json()).actorId).toBe(other.id);
      await logout(page.request,origin);await login(page.request,origin);
      await route.fulfill({response:actual});
    });
    await dialog.getByTestId('cad-exchange-review').click();
    await expect(dialog.getByRole('alert')).toContainText('계정');
    await expect(dialog.getByRole('checkbox',{name:new RegExp(f.title)})).toHaveCount(0);
    await expect(page.getByTestId('cad-exchange-download')).toBeDisabled();expect(swapped).toBe(true);expect(downloads).toBe(0);
    expect((await session(page.request)).actor.id).not.toBe(other.id);
  }finally{await cleanup(page.request,origin,f.id,f.memo.id);}
});

test('R5b authorized Reader downloads a private-Memo-whitelisted artifact and rejects a later final revision change',async({page,browser,request,baseURL})=>{
  test.setTimeout(120_000);const origin=baseURL!,f=await fixture(page,origin),admin=await browser.newContext({baseURL});
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let paused=false,reads=0;
  try{
    const other=await reader(page.request,request,origin,siteFor(f.id));await logout(page.request,origin);
    await login(page.request,origin,other.login,other.secret);await login(admin.request,origin);
    await ready(page,f.id);let dialog=await includeMemo(page,f.title);
    await dialog.getByTestId('cad-exchange-source-enable').uncheck();await review(page);
    const successful=page.waitForEvent('download');await page.getByTestId('cad-exchange-download').click();
    const file=await successful,bytes=readFileSync((await file.path())!);
    expect(bytes.subarray(0,4).toString()).toBe('glTF');
    const artifact=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8')) as {
      scenes:Array<{extras:{versionId:string;sourceSha256:string}}>;
      nodes:Array<{extras?:{origin?:string;id?:string;revision?:number;title?:string}}>;
      images:Array<{bufferView?:number;uri?:string}>;
    };
    expect(artifact.scenes[0].extras).toMatchObject({versionId:f.id,sourceSha256:f.sha});
    expect(artifact.nodes.filter(node=>node.extras?.origin==='SERVER_MEMO')).toHaveLength(1);
    expect(artifact.nodes.find(node=>node.extras?.origin==='SERVER_MEMO')?.extras).toMatchObject({id:f.memo.id,revision:0,title:f.title});
    expect(artifact.images.length).toBeGreaterThan(0);expect(artifact.images.every(image=>image.bufferView!==undefined&&!image.uri)).toBe(true);
    const encoded=JSON.stringify(artifact);
    for(const privateField of [f.ownerId,other.id,'createdById','updatedById','actorId','csrfToken','SESSION_ONLY','targetRef'])expect(encoded).not.toContain(privateField);
    await dialog.getByRole('button',{name:'취소 / 닫기'}).click();
    dialog=await includeMemo(page,f.title);await dialog.getByTestId('cad-exchange-source-enable').uncheck();await review(page);
    await page.route('**'+f.memoUrl,async route=>{
      if(route.request().method()==='GET'&&++reads===2){paused=true;await held;}await route.continue();
    });
    let downloads=0;page.on('download',()=>downloads++);await page.getByTestId('cad-exchange-download').click();
    await expect.poll(()=>paused,{timeout:20_000}).toBe(true);
    expect((await admin.request.patch(f.memoUrl+'/'+f.memo.id,{headers:await headers(admin.request,origin),
      data:{expectedRevision:f.memo.revision,operation:'text',title:f.title,content:'Changed while final output is held'},
    })).status()).toBe(200);
    release();await expect(dialog.getByRole('alert')).toContainText('변경');
    await expect(dialog.getByRole('checkbox',{name:new RegExp(f.title)})).toHaveCount(0);
    expect(reads).toBe(2);expect(downloads).toBe(0);
  }finally{release();await logout(admin.request,origin);await admin.close();await cleanup(page.request,origin,f.id,f.memo.id);}
});

test('R5b revoked Memo selection is pruned and the already loaded local Source can export without another private GET',async({page,browser,request,baseURL})=>{
  test.setTimeout(120_000);const origin=baseURL!,f=await fixture(page,origin),admin=await browser.newContext({baseURL});
  try{
    const siteId=siteFor(f.id),other=await reader(page.request,request,origin,siteId);await logout(page.request,origin);
    await login(page.request,origin,other.login,other.secret);await login(admin.request,origin);
    await ready(page,f.id);const dialog=await includeMemo(page,f.title);await review(page);
    expect((await admin.request.post('/api/g7-runtime/access/grant',{headers:await headers(admin.request,origin),
      data:{kind:'site',operation:'revoke',affectedUserId:other.id,value:siteId},
    })).status()).toBe(200);
    await page.getByTestId('cad-exchange-download').click();await expect(dialog.getByRole('alert')).toContainText('권한');
    await expect(dialog.getByRole('checkbox',{name:new RegExp(f.title)})).toHaveCount(0);
    await expect(dialog.getByTestId('cad-exchange-server-memos-enable')).not.toBeChecked();
    expect((await session(page.request)).actor.id).toBe(other.id);
    let privateGets=0;page.on('request',req=>{if(new URL(req.url()).pathname===f.memoUrl)privateGets++;});
    await review(page);const pending=page.waitForEvent('download');await page.getByTestId('cad-exchange-download').click();
    const download=await pending,bytes=readFileSync((await download.path())!);
    expect(bytes.subarray(0,4).toString()).toBe('glTF');expect(bytes.includes(Buffer.from(f.title))).toBe(false);expect(privateGets).toBe(0);
  }finally{await logout(admin.request,origin);await admin.close();await cleanup(page.request,origin,f.id,f.memo.id);}
});

test('R5b selected Memo network, JSON and missing-envelope failures clear private metadata without downloading',async({page,baseURL})=>{
  test.setTimeout(120_000);const origin=baseURL!,f=await fixture(page,origin);
  try{
    for(const failure of ['network','json','envelope']){
      await ready(page,f.id);const dialog=await includeMemo(page,f.title);let downloads=0;
      const downloaded=()=>downloads++;page.on('download',downloaded);
      await page.route('**'+f.memoUrl,async route=>{
        if(failure==='network')await route.abort('failed');
        else if(failure==='json')await route.fulfill({status:200,contentType:'application/json',body:'{'});
        else await route.fulfill({json:{memos:[],groups:[],featuresAvailable:true}});
      });
      await dialog.getByTestId('cad-exchange-review').click();await expect(dialog.getByRole('alert')).toBeVisible();
      await expect(dialog.getByRole('checkbox',{name:new RegExp(f.title)})).toHaveCount(0);
      await expect(page.getByTestId('cad-exchange-download')).toBeDisabled();expect(downloads).toBe(0);
      await page.unroute('**'+f.memoUrl);page.off('download',downloaded);
    }
  }finally{await cleanup(page.request,origin,f.id,f.memo.id);}
});
