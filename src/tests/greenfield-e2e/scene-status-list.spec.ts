import {expect,test} from '@playwright/test';
import {sceneDxf} from '../fixtures/scene-dxf';
import {withOwnedSessions} from './owned-sessions';

const statusRow=(state:'FAILED'|'READY'|'BLOCKED',code:string|null,canRetry=false)=>({
  state,label:{FAILED:'생성 실패',READY:'Scene 완료',BLOCKED:'작업 차단'}[state],
  tone:{FAILED:'error',READY:'success',BLOCKED:'warning'}[state],
  polling:false,phase:null,errorCode:code,canRetry,
});

test('L05 actual home and Location list recover via keyboard and retain Current/memo controls (mocked status API)',async({page,baseURL})=>{
  test.setTimeout(90_000);
  await withOwnedSessions(baseURL!,async owned=>{
    owned.add(page.request);
    await page.goto('/g7-runtime');
    await page.getByLabel('계정').fill('admin');
    await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
    await page.getByRole('button',{name:'로그인',exact:true}).click();
    await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
    const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const headers={'origin':baseURL!,'x-csrf-token':session.csrfToken};
    const ids:Record<string,string>={};let parentId:string|undefined;
    for(const type of ['business-units','products','sites','buildings','floors']){
      const result=await page.request.post('/api/masters',{headers,data:{
        type,name:'L05 '+type,...(parentId?{parentId}:{}),...(type==='sites'?{kind:'SITE'}:{}),
      }});
      expect(result.status()).toBe(201);
      const item=await result.json();parentId=ids[type]=item.id;
      if(type==='sites'){
        const grant=await page.request.post('/api/g7-runtime/access/grant',{headers,data:{
          kind:'site',operation:'grant',affectedUserId:session.actor.id,value:item.id,
        }});
        expect(grant.status()).toBe(200);
      }
    }
    const uploaded=await page.request.post('/api/cad-files',{headers,multipart:{
      file:{name:'l05-status.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(sceneDxf)},
      businessUnitId:ids['business-units'],productId:ids.products,siteId:ids.sites,
      buildingId:ids.buildings,floorId:ids.floors,registeredAt:'2026-11-08',
      deletePassword:'1234',makeCurrent:'true',
    }});
    expect(uploaded.status()).toBe(201);
    const version=await uploaded.json();
    let stage:'transport'|'failed'|'ready'|'blocked'='transport';let gets=0,retries=0;
    await page.route('**/api/scene-build-jobs?*',async route=>{
      gets++;
      if(stage==='transport')return route.fulfill({status:503,body:'unavailable'});
      const row=stage==='failed'?statusRow('FAILED','SCENE_STORAGE_FAILED',true):
        stage==='blocked'?statusRow('BLOCKED','SCENE_AUTH_REVOKED'):statusRow('READY',null);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:{[version.id]:row}})});
    });
    await page.route(`**/api/cad-files/${version.id}/scene-retry`,async route=>{
      retries++;stage='ready';return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    });
    await page.goto('/');
    const versionRow=page.locator(`#version-${version.id}`);
    await expect(page.getByRole('heading',{name:'CAD 도면 목록'})).toBeVisible();
    await expect(versionRow.getByText('상태 조회 실패')).toBeVisible();
    await expect(versionRow.getByText('● Current')).toBeVisible();
    await expect(page.getByRole('link',{name:'메모 검색 (전체 도면)'})).toBeVisible();
    const manual=versionRow.getByRole('button',{name:'상태 다시 확인'});
    stage='failed';await manual.focus();await expect(manual).toBeFocused();await page.keyboard.press('Enter');
    await expect(versionRow.getByText('Scene 저장 오류')).toBeVisible();
    await expect(versionRow.getByRole('button',{name:'Scene 재시도'})).toBeVisible();
    await versionRow.getByRole('button',{name:'Scene 재시도'}).click();
    await expect(versionRow.getByText('Scene 완료')).toBeVisible();
    expect(retries).toBe(1);expect(gets).toBeGreaterThanOrEqual(3);
    await page.screenshot({path:'test-results/l05-home-desktop.png',fullPage:true});
    const locationLink=versionRow.locator(`a[href^="/cad/locations/"][href*="version-${version.id}"]`).first();
    const locationHref=await locationLink.getAttribute('href');
    expect(locationHref).toBeTruthy();
    stage='blocked';await page.goto(locationHref!);
    await expect(versionRow.getByText('작업 차단')).toBeVisible();
    await expect(versionRow.getByText('작업 권한이 회수되었습니다')).toBeVisible();
    await expect(versionRow.getByText('● Current')).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    await versionRow.getByText('작업 차단').scrollIntoViewIfNeeded();
    await page.screenshot({path:'test-results/l05-location-narrow.png',fullPage:true});
    await expect(page.getByRole('table',{name:'등록된 도면'})).toBeVisible();
    expect(await versionRow.getByRole('button',{name:'Scene 재시도'}).count()).toBe(0);
  });
});
