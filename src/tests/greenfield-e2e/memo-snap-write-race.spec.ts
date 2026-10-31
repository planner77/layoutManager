import {expect,test,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {GeneratedDocument} from '../../domain/generated-document';
import {buildGeneratedTransfer} from '../../domain/generated-transfer';
import {clickViewerTestCommand} from '../e2e/viewer-menu-helper';

type Candidate={value:string;origin:string;id:string;kind:string;index:number;label:string};
type MemoRow={id:string;revision:number;anchorWcsXY:{x:number;y:number};anchor:{mode:string}};
function deferred<T=void>(){
  let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
async function loginAdmin(page:Page){
  await page.goto('/g7-runtime');await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
async function candidates(page:Page):Promise<Candidate[]>{
  return page.getByTestId('cad-memo-snap-select').locator('option').evaluateAll(options=>
    options.slice(1).map(option=>{
      const [origin,id,kind,index]=JSON.parse((option as HTMLOptionElement).value) as [string,string,string,number];
      return {value:(option as HTMLOptionElement).value,origin,id,kind,index,
        label:(option as HTMLOptionElement).textContent?.replace(/\s+/g,' ').trim()??''};
    }));
}
async function prepareViewer(page:Page){
  const files=await (await page.request.get('/api/cad-files')).json() as {items:{id:string}[]};
  const versionId=files.items[0]?.id;if(!versionId)throw new Error('Greenfield prerequisite did not create a Version');
  const outlineContext=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json() as {sourceSha256:string};
  const targetIds=[
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ];
  const names=['R4 race target A','R4 race target B','R4 race target C'];
  const doc=new GeneratedDocument({versionId,sourceSha256:outlineContext.sourceSha256});
  for(let index=0;index<targetIds.length;index++)doc.append({
    id:targetIds[index],savedOutlineId:'local-'+(index+1),name:names[index],
    createdAt:new Date().toISOString(),result:{kind:'CONVEX',algorithm:'synthetic-wcs-v1',
      geometryBasis:'RENDER_WCS_2D',persistable:false,
      geometry:{type:'Polygon',coordinates:[[[20,20],[30,20],[30,30],[20,20]]]},
      sourceEntityIds:[],warnings:[],tolerance:0.02,durationMs:0},
  });
  await page.goto(`/cad/versions/${versionId}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await page.getByTestId('generated-import-input').setInputFiles({name:'r4-race-targets.json',
    mimeType:'application/json',buffer:Buffer.from(JSON.stringify(buildGeneratedTransfer(doc,4)))});
  await expect(page.getByTestId('generated-json-message')).toContainText('3개 생성 개체를 복원');
  return {versionId,targetIds,names,origin:new URL(page.url()).origin};
}
async function createMemoOnTarget(page:Page,versionId:string,targetId:string,title:string){
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await page.getByTestId('cad-memo-title').fill(title);
  await page.getByTestId('cad-memo-x').fill('20');await page.getByTestId('cad-memo-y').fill('20');
  await page.getByTestId('cad-memo-coordinate-place').click();
  await expect(page.getByTestId('cad-memo-candidate-wcs')).toBeVisible();
  const candidate=(await candidates(page)).find(item=>item.origin==='GENERATED'&&item.id===targetId);
  expect(candidate,'requested local Generated candidate').toBeTruthy();
  await page.getByTestId('cad-memo-snap-select').selectOption(candidate!.value);
  await page.getByTestId('cad-memo-create').click();
  await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
  const list=await (await page.request.get(`/api/cad-files/${versionId}/memos`)).json() as {memos:({id:string;title:string;anchor:{mode:string}})[]};
  const saved=list.memos.find(item=>item.title===title);
  expect(saved).toMatchObject({anchor:{mode:'FREE'}});
  return saved!.id;
}
async function closeAndReopenMemo(page:Page,title:string){
  await page.getByTestId('cad-memo-cancel').click();
  await page.getByTestId('cad-memo-latest').getByRole('button',{name:title.slice(0,24),exact:true}).click({timeout:5_000});
  await expect(page.getByTestId('cad-memo-move-behavior')).toBeVisible();
}
async function cleanupMemo(page:Page,versionId:string,memoId:string,origin:string){
  const sessionResponse=await page.request.get('/api/g7-runtime/auth/session');
  if(sessionResponse.status()!==200)return;
  const session=await sessionResponse.json() as {csrfToken:string};
  const rowResponse=await page.request.get(`/api/cad-files/${versionId}/memos/${memoId}`);
  if(rowResponse.status()!==200)return;
  const row=await rowResponse.json() as MemoRow;
  expect((await page.request.delete(`/api/cad-files/${versionId}/memos/${memoId}`,{
    headers:{origin,'x-csrf-token':session.csrfToken},data:{expectedRevision:row.revision},
  })).status()).toBe(200);
}
async function logout(page:Page,origin:string){
  const response=await page.request.get('/api/g7-runtime/auth/session');
  if(response.status()!==200)return;
  const session=await response.json() as {csrfToken:string};
  expect((await page.request.post('/api/g7-runtime/auth/logout',{
    headers:{origin,'x-csrf-token':session.csrfToken},
  })).status()).toBe(200);
}

test('TC-R4-009: committed snap move keeps saved WCS and does not rebind after its Generated target is deleted',async({page})=>{
  test.setTimeout(120_000);await loginAdmin(page);
  const scene=await prepareViewer(page),title='R4commit'+randomUUID().slice(0,8);
  let memoId='';const release=deferred<void>();let commitOutcome:{status:number;operation:string}|null=null;let interceptedPatches=0;
  let browserResponse:ReturnType<Page['waitForResponse']>|null=null;
  const memoPath=`/api/cad-files/${scene.versionId}/memos/`;
  const routePattern=`**${memoPath}*`;
  try{
    memoId=await createMemoOnTarget(page,scene.versionId,scene.targetIds[0],title);
    await closeAndReopenMemo(page,title);
    await page.getByTestId('cad-memo-move-behavior').selectOption('SNAP');
    await page.getByTestId('cad-memo-x').fill('30');await page.getByTestId('cad-memo-y').fill('20');
    const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/g7-runtime/auth/session');
    await page.getByTestId('cad-memo-snap-refresh').click();
    expect((await refreshed).status()).toBe(200);
    await expect.poll(async()=> (await candidates(page)).some(item=>item.id===scene.targetIds[0]&&
      item.label.includes('(30.00000, 20.00000)'))).toBe(true);
    const choices=await candidates(page);
    const alternatives=choices.filter(item=>item.origin==='GENERATED'&&scene.targetIds.slice(1).includes(item.id));
    expect(alternatives.length).toBeGreaterThan(0);
    const selected=choices.find(item=>item.origin==='GENERATED'&&item.id===scene.targetIds[0]);
    expect(selected).toBeTruthy();
    await page.getByTestId('cad-memo-snap-select').selectOption(selected!.value);
    expect(Number(await page.getByTestId('cad-memo-x').inputValue())).toBeCloseTo(30,8);
    expect(Number(await page.getByTestId('cad-memo-y').inputValue())).toBeCloseTo(20,8);
    await page.route(routePattern,async route=>{
      if(route.request().method()!=='PATCH'||new URL(route.request().url()).pathname!==memoPath+memoId)
        return route.continue();
      if(++interceptedPatches>1)return route.continue();
      const payload=route.request().postDataJSON() as {operation?:string};
      const response=await route.fetch();
      commitOutcome={status:response.status(),operation:payload.operation??''};
      await release.promise;
      await route.fulfill({response});
    });
    browserResponse=page.waitForResponse(response=>
      new URL(response.url()).pathname===memoPath+memoId&&response.request().method()==='PATCH');
    await page.getByTestId('cad-memo-apply-position').click();
    await expect.poll(()=>commitOutcome,{timeout:15_000}).toEqual({status:200,operation:'move'});
    expect(interceptedPatches).toBe(1);

    // Delete the selected Generated target after the backend has committed the WCS,
    // while leaving two identical nearby candidates available in the Viewer.
    await page.getByTestId('canvas-mode-generated').click();
    await clickViewerTestCommand(page,'viewer-menu-outline-tree');
    const tree=page.getByTestId('viewer-outline-tree');
    const targetRow=tree.locator('[data-tree-key="local:local-1"]');
    await expect(targetRow).toHaveCount(1);await targetRow.click();
    await page.getByTestId('generated-delete-selected').click();
    await page.getByTestId('generated-delete-dialog').getByTestId('generated-delete-confirm').click();
    await expect(tree.locator('[data-tree-key="local:local-1"]')).toHaveCount(0);
    await expect(tree.locator('[data-tree-key="local:local-2"]')).toHaveCount(1);
    await expect(tree.locator('[data-tree-key="local:local-3"]')).toHaveCount(1);

    release.resolve();
    const delivered=await browserResponse!;expect(delivered.status()).toBe(200);
    await expect(page.getByTestId('cad-memo-error')).toContainText('세션 연결은 적용하지 않았습니다.');
    await expect(page.getByTestId('cad-memo-session-snap')).toHaveCount(0);
    await expect(page.getByTestId('cad-memo-move-behavior')).toHaveValue('SNAP');
    const persisted=await (await page.request.get(`/api/cad-files/${scene.versionId}/memos/${memoId}`)).json() as MemoRow;
    expect(persisted).toMatchObject({revision:1,anchor:{mode:'FREE'},anchorWcsXY:{x:30,y:20}});
    const pin=page.getByRole('button',{name:'메모: '+title,exact:true});
    expect(Number(await pin.getAttribute('data-memo-wcs-x'))).toBeCloseTo(30,8);
    expect(Number(await pin.getAttribute('data-memo-wcs-y'))).toBeCloseTo(20,8);
  }finally{
    release.resolve();
    if(commitOutcome&&browserResponse)await browserResponse.catch(()=>{});
    if(memoId)await cleanupMemo(page,scene.versionId,memoId,scene.origin);
    await logout(page,scene.origin);
  }
});

test('TC-R4-009: a definitely uncommitted failed move keeps the existing session binding',async({page})=>{
  test.setTimeout(90_000);await loginAdmin(page);
  const scene=await prepareViewer(page),title='R4abort'+randomUUID().slice(0,8);
  let memoId='';let intercepted=0;
  const memoPath=`/api/cad-files/${scene.versionId}/memos/`;
  const routePattern=`**${memoPath}*`;
  try{
    memoId=await createMemoOnTarget(page,scene.versionId,scene.targetIds[0],title);
    await closeAndReopenMemo(page,title);
    await page.getByTestId('cad-memo-x').fill('25');await page.getByTestId('cad-memo-y').fill('26');
    await page.route(routePattern,async route=>{
      if(route.request().method()==='PATCH'&&new URL(route.request().url()).pathname===memoPath+memoId){
        intercepted++;await route.abort('failed');return;
      }
      await route.continue();
    });
    const failed=page.waitForEvent('requestfailed',request=>
      new URL(request.url()).pathname===memoPath+memoId&&request.method()==='PATCH');
    await page.getByTestId('cad-memo-apply-position').click();await failed;
    expect(intercepted).toBe(1);
    await expect(page.getByTestId('cad-memo-error')).toBeVisible();
    await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
    await expect(page.getByTestId('cad-memo-move-behavior')).toHaveValue('KEEP');
    const persisted=await (await page.request.get(`/api/cad-files/${scene.versionId}/memos/${memoId}`)).json() as MemoRow;
    expect(persisted).toMatchObject({revision:0,anchor:{mode:'FREE'},anchorWcsXY:{x:20,y:20}});
  }finally{
    await page.unroute(routePattern).catch(()=>{});
    if(memoId)await cleanupMemo(page,scene.versionId,memoId,scene.origin);
    await logout(page,scene.origin);
  }
});
