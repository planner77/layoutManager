import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

type FixtureDb={prepare(sql:string):{get(...values:unknown[]):unknown};close():void};
const Database=createRequire(import.meta.url)('better-sqlite3') as new(
 filename:string,options:{readonly:boolean}
)=>FixtureDb;
async function session(api:APIRequestContext){
 const response=await api.get('/api/g7-runtime/auth/session');
 expect(response.status()).toBe(200);
 return await response.json() as {actor:{id:string};csrfToken:string};
}
async function logout(api:APIRequestContext,origin:string){
 const current=await api.get('/api/g7-runtime/auth/session');
 if(current.status()!==200)return;
 expect((await api.post('/api/g7-runtime/auth/logout',{headers:{origin,
  'x-csrf-token':(await current.json()).csrfToken}})).status()).toBe(200);
}
async function login(page:Page){
 await page.goto('/g7-runtime');
 await page.getByLabel('계정').fill('admin');
 await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
 await page.getByRole('button',{name:'로그인',exact:true}).click();
 await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
function siteOf(versionId:string){
 const root=process.env.G7_GREENFIELD_E2E_ROOT;
 if(!root)throw Error('missing isolated Greenfield fixture');
 const db=new Database(path.join(root,'db','cad.sqlite'),{readonly:true});
 try{
  return (db.prepare('SELECT b.site_id AS id FROM CadFileVersion v JOIN CadLocation l ON l.id=v.location_id JOIN Building b ON b.id=l.building_id WHERE v.id=?')
   .get(versionId) as {id:string}).id;
 }finally{db.close();}
}
async function openMemo(page:Page,title:string){
 await page.getByRole('button',{name:'작업',exact:true}).click();
 await page.getByTestId('viewer-menu-tools').click();
 await expect(page.getByTestId('cad-memo-latest')).toContainText(title);
 await page.getByTestId('cad-memo-latest').getByRole('button',{name:title,exact:true}).click();
 await expect(page.getByTestId('cad-memo-editor')).toBeVisible();
}
test('TC-172-BROWSER: same-Site Editor edits another author, cannot DELETE; owner delete disappears after reload',async({page,browser,request,baseURL})=>{
 test.setTimeout(150_000);
 const origin=baseURL!;
 let versionId='',memoId='';
 await login(page);
 const owner=(await session(page.request)).actor.id;
 const collaborator=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});
 const second=await collaborator.newPage();
 try{
  versionId=(await (await page.request.get('/api/cad-files')).json()).items[0].id;
  const siteId=siteOf(versionId);
  const memoUrl='/api/cad-files/'+versionId+'/memos',title='R172-'+randomUUID().slice(0,8);
  const editorLogin='r172-'+randomUUID().slice(0,8);
  const initial='synthetic-r172-initial',password='synthetic-r172-changed';
  const credentials={origin,'x-csrf-token':(await session(page.request)).csrfToken};
  const user=await page.request.post('/api/g7-runtime/users/create',{
   headers:credentials,data:{login:editorLogin,initialPassword:initial}});
  expect(user.status()).toBe(201);
  const editorId=(await user.json()).id;
  for(const [kind,value] of [['role','Editor'],['site',siteId]]){
   expect((await page.request.post('/api/g7-runtime/access/grant',{
    headers:credentials,data:{kind,operation:'grant',affectedUserId:editorId,value}
   })).status()).toBe(200);
  }
  expect((await request.post('/api/g7-runtime/auth/initial-change',{
   headers:{origin},data:{login:editorLogin,password:initial,newPassword:password}
  })).status()).toBe(200);
  const list=await (await page.request.get(memoUrl)).json();
  const created=await page.request.post(memoUrl,{headers:credentials,
   data:{sourceSha256:list.sourceSha256,title,content:'Before',anchorWcsXY:{x:10,y:20}}});
  expect(created.status()).toBe(201);
  const original=await created.json() as {id:string;revision:number};
  memoId=original.id;
  expect((await collaborator.request.post('/api/g7-runtime/auth/login',{
   headers:{origin},data:{login:editorLogin,password}
  })).status()).toBe(200);
  await second.goto('/cad/versions/'+versionId+'/viewer?renderer=three-dxf-viewer');
  await expect(second.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await openMemo(second,title);
  await expect(second.getByTestId('cad-memo-delete')).toBeDisabled();
  await second.getByTestId('cad-memo-title').fill(title);
  await second.getByTestId('cad-memo-content').fill('Modified by another Editor');
  await second.getByTestId('cad-memo-save-text').click();
  await expect.poll(async()=>{
   const result=await collaborator.request.get(memoUrl+'/'+memoId);
   if(result.status()!==200)return null;
   const row=await result.json();
   return {content:row.content,createdById:row.createdById,updatedById:row.updatedById,revision:row.revision};
  }).toEqual({content:'Modified by another Editor',createdById:owner,updatedById:editorId,revision:1});
  const bSession=await session(collaborator.request);
  expect((await collaborator.request.delete(memoUrl+'/'+memoId,{
   headers:{origin,'x-csrf-token':bSession.csrfToken},data:{expectedRevision:1}
  })).status()).toBe(403);
  const ownerSession=await session(page.request);
  expect((await page.request.delete(memoUrl+'/'+memoId,{
   headers:{origin,'x-csrf-token':ownerSession.csrfToken},data:{expectedRevision:1}
  })).status()).toBe(200);
  await second.reload();
  await expect(second.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await second.getByRole('button',{name:'작업',exact:true}).click();
  await second.getByTestId('viewer-menu-tools').click();
  await expect(second.getByTestId('cad-memo-latest').getByRole('button',{name:title,exact:true})).toHaveCount(0);
 }finally{
  if(memoId&&versionId){
   const row=await page.request.get('/api/cad-files/'+versionId+'/memos/'+memoId);
   if(row.status()===200){
    const proof=await session(page.request);
    expect((await page.request.delete('/api/cad-files/'+versionId+'/memos/'+memoId,{
     headers:{origin,'x-csrf-token':proof.csrfToken},data:{expectedRevision:(await row.json()).revision}
    })).status()).toBe(200);
   }
  }
  await logout(collaborator.request,origin);await collaborator.close();
  await logout(page.request,origin);
 }
});
