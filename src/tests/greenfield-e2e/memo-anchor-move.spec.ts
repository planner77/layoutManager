import {expect,test,type Page} from '@playwright/test';
async function work(page:Page,id:string){await page.getByRole('button',{name:'작업',exact:true}).click();await page.getByTestId(id).click();}
function point(value:{x:number;y:number},x:number,y:number){expect(value.x).toBeCloseTo(x,8);expect(value.y).toBeCloseTo(y,8);}

test('R4 durable Memo KEEP/DETACH from editor uses trusted target CAS and survives reload',async({page,baseURL})=>{
  test.setTimeout(120_000);const origin=baseURL!;let versionId='',outlineId='',memoId='';
  await page.goto('/g7-runtime');await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
  try{
    const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const headers={origin,'x-csrf-token':session.csrfToken};
    versionId=(await (await page.request.get('/api/cad-files')).json()).items[0].id;
    const context=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json();
    const created=await page.request.post(`/api/cad-files/${versionId}/outlines`,{headers,data:{
      mode:'APP_CREATED',sourceSha256:context.sourceSha256,expectedSceneRevision:context.sceneRevision,
      kind:'CONVEX',name:'R4 server target',outlineTypeId:null,
      geometry:{type:'Polygon',coordinates:[[[10,10],[20,10],[20,20],[10,10]]]},
    }});
    expect(created.status()).toBe(201);outlineId=(await created.json()).id;
    let originalGets=0;page.on('request',request=>{if(new URL(request.url()).pathname===`/api/cad-files/${versionId}/content`)originalGets++;});
    await page.goto(`/cad/versions/${versionId}/viewer`);
    await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
    await work(page,'viewer-menu-memo-add');await page.getByTestId('cad-memo-title').fill('R4 durable Memo');
    await page.getByTestId('cad-memo-x').fill('12');await page.getByTestId('cad-memo-y').fill('12');
    await page.getByTestId('cad-memo-coordinate-place').click();
    await expect(page.getByTestId('cad-memo-candidate-wcs')).toBeVisible();
    await page.getByTestId('cad-memo-snap-select').selectOption('');
    const newMemo=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/cad-files/${versionId}/memos`&&response.request().method()==='POST');
    await page.getByTestId('cad-memo-create').click();const memoResponse=await newMemo;
    expect(memoResponse.status()).toBe(201);memoId=(await memoResponse.json()).id;
    const targetSelect=page.locator('#cad-memo-anchor-target');
    await targetSelect.selectOption('APP_CREATED:'+outlineId);await page.getByTestId('cad-memo-anchor-attach').click();
    await expect(page.getByTestId('cad-memo-anchor-status')).toContainText('객체 연결');
    await expect(page.getByTestId('cad-memo-move-behavior')).toHaveValue('KEEP');
    const canvas=await page.getByTestId('cad-canvas').locator('canvas').elementHandle();
    const anchorPath=`/api/cad-files/${versionId}/memos/${memoId}/anchor`;
    await page.getByTestId('cad-memo-x').fill('13');await page.getByTestId('cad-memo-y').fill('14');
    const kept=page.waitForResponse(response=>new URL(response.url()).pathname===anchorPath&&response.request().method()==='PATCH');
    await page.getByTestId('cad-memo-apply-position').click();const keepResponse=await kept;
    expect(keepResponse.status()).toBe(200);
    expect(keepResponse.request().postDataJSON()).toMatchObject({operation:'reposition',behavior:'KEEP',expectedTargetRevision:0});
    expect(keepResponse.request().postDataJSON()).not.toHaveProperty('transform');
    expect(keepResponse.request().postDataJSON()).not.toHaveProperty('localAnchorWcsXY');
    await expect(page.getByTestId('cad-memo-x')).toHaveValue('13');
    let memo=await (await page.request.get(`/api/cad-files/${versionId}/memos/${memoId}`)).json();
    point(memo.anchor.localAnchorWcsXY,13,14);point(memo.anchorWcsXY,13,14);
    expect(await canvas!.evaluate(node=>node===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
    const transformed=await page.request.patch(`/api/cad-files/${versionId}/outlines/${outlineId}`,{headers,data:{
      expectedRevision:0,expectedSceneRevision:context.sceneRevision,operation:'transform',operations:[
        {type:'Translate',dx:5,dy:7},{type:'Rotate',angleDegrees:90,pivot:[0,0]},
      ],
    }});
    expect(transformed.status()).toBe(200);
    memo=await (await page.request.get(`/api/cad-files/${versionId}/memos/${memoId}`)).json();
    point(memo.anchor.localAnchorWcsXY,13,14);point(memo.anchorWcsXY,-21,18);
    await page.reload();await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
    await work(page,'viewer-menu-tools');await page.getByTestId('cad-memo-latest').getByRole('button',{name:'R4 durable Memo',exact:true}).click();
    expect(Number(await page.getByTestId('cad-memo-x').inputValue())).toBeCloseTo(-21,8);
    expect(Number(await page.getByTestId('cad-memo-y').inputValue())).toBeCloseTo(18,8);
    await expect(page.getByTestId('cad-memo-anchor-status')).toContainText('객체 연결');
    await page.getByTestId('cad-memo-move-behavior').selectOption('DETACH');
    await page.getByTestId('cad-memo-x').fill('1.2');await page.getByTestId('cad-memo-y').fill('2.3');
    const detached=page.waitForResponse(response=>new URL(response.url()).pathname===anchorPath&&response.request().method()==='PATCH');
    await page.getByTestId('cad-memo-apply-position').click();const detachedResponse=await detached;
    expect(detachedResponse.status()).toBe(200);expect(detachedResponse.request().postDataJSON()).not.toHaveProperty('expectedTargetRevision');
    await expect(page.getByTestId('cad-memo-anchor-status')).toContainText('자유 WCS');
    memo=await (await page.request.get(`/api/cad-files/${versionId}/memos/${memoId}`)).json();
    point(memo.anchorWcsXY,1.2,2.3);expect(memo.anchor.mode).toBe('FREE');const detachedRevision=memo.revision;
    const movedAgain=await page.request.patch(`/api/cad-files/${versionId}/outlines/${outlineId}`,{headers,data:{
      expectedRevision:1,expectedSceneRevision:context.sceneRevision,operation:'transform',operations:[{type:'Translate',dx:50,dy:70}],
    }});
    expect(movedAgain.status()).toBe(200);
    memo=await (await page.request.get(`/api/cad-files/${versionId}/memos/${memoId}`)).json();
    point(memo.anchorWcsXY,1.2,2.3);expect(memo.revision).toBe(detachedRevision);expect(memo.anchor.mode).toBe('FREE');
    expect(originalGets).toBe(0);
  }finally{
    const response=await page.request.get('/api/g7-runtime/auth/session');
    if(response.status()===200){
      const session=await response.json(),headers={origin,'x-csrf-token':session.csrfToken};
      if(memoId){const row=await page.request.get(`/api/cad-files/${versionId}/memos/${memoId}`);
        if(row.status()===200)expect((await page.request.delete(`/api/cad-files/${versionId}/memos/${memoId}`,{headers,data:{expectedRevision:(await row.json()).revision}})).status()).toBe(200);}
      if(outlineId){const row=await page.request.get(`/api/cad-files/${versionId}/outlines/${outlineId}`);
        const context=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json();
        if(row.status()===200)expect((await page.request.delete(`/api/cad-files/${versionId}/outlines/${outlineId}`,{headers,data:{expectedRevision:(await row.json()).revision,expectedSceneRevision:context.sceneRevision}})).status()).toBe(200);}
      expect((await page.request.post('/api/g7-runtime/auth/logout',{headers})).status()).toBe(200);
    }
  }
});
