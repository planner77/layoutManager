import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { sceneDxf } from '../fixtures/scene-dxf';

test('#202 signed drawing list: Current/all, AND filters, Version count/previews and exact memo link', async ({page,request,baseURL}) => {
  test.setTimeout(150_000);
  const suffix=randomUUID().slice(0,8),origin=baseURL!;
  await page.goto('/g7-runtime');
  await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
  try {
    const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const headers={origin,'x-csrf-token':session.csrfToken};
    const ids:Record<string,string>={};let parentId:string|undefined;
    for(const type of ['business-units','products','sites','buildings']) {
      const response=await page.request.post('/api/masters',{headers,data:{type,name:`List ${suffix} ${type}`,
        ...(parentId?{parentId}:{}),...(type==='sites'?{kind:'SITE'}:{})}});
      expect(response.status(),type+': '+await response.text()).toBe(201);
      parentId=ids[type]=(await response.json()).id;
      if(type==='sites') {
        const grant=await page.request.post('/api/g7-runtime/access/grant',{headers,data:{kind:'site',
          operation:'grant',affectedUserId:session.actor.id,value:ids.sites}});
        expect(grant.status(),await grant.text()).toBe(200);
      }
    }
    const floors:string[]=[];
    for(const floor of ['1층','2층']) {
      const response=await page.request.post('/api/masters',{headers,data:{type:'floors',name:`${suffix} ${floor}`,parentId:ids.buildings}});
      expect(response.status(),await response.text()).toBe(201);
      floors.push((await response.json()).id);
    }
    const upload=async(floorId:string,name:string,makeCurrent:boolean)=>{
      const response=await page.request.post('/api/cad-files',{headers,multipart:{
        file:{name,mimeType:'application/octet-stream',buffer:Buffer.from(sceneDxf)},
        businessUnitId:ids['business-units'],productId:ids.products,siteId:ids.sites,
        buildingId:ids.buildings,floorId,registeredAt:'2026-11-02',deletePassword:'1234',
        makeCurrent:String(makeCurrent),description:`Inspection ${suffix}`,
      }});
      expect(response.status(),await response.text()).toBe(201);
      return (await response.json()) as {id:string};
    };
    const old=await upload(floors[0],`${suffix}-old.dxf`,false);
    const current=await upload(floors[0],`${suffix}-current.dxf`,true);
    const other=await upload(floors[1],`${suffix}-other.dxf`,true);
    const addMemo=async(versionId:string,title:string,content:string)=>{
      const list=await page.request.get(`/api/cad-files/${versionId}/memos`);
      expect(list.status(),await list.text()).toBe(200);
      const response=await page.request.post(`/api/cad-files/${versionId}/memos`,{headers,
        data:{sourceSha256:(await list.json()).sourceSha256,title,content,anchorWcsXY:{x:10,y:20}}});
      expect(response.status(),await response.text()).toBe(201);
      return (await response.json()) as {id:string};
    };
    const keyword=`검사${suffix}`;
    await addMemo(old.id,keyword+' 과거','old');
    for(let i=1;i<4;i++)await addMemo(current.id,'일반',keyword+` 본문 ${i}`);
    const xssMarker='<img src=x onerror=window.__memoXssRan=true> <script>window.__memoXssRan=true</script>';
    const primary=await addMemo(current.id,keyword+' 현재 '+xssMarker,'first');
    await addMemo(other.id,keyword+' 별도 층','other');
    await page.goto(`/cad/versions/${current.id}/viewer`);
    await expect(page.getByTestId('cad-viewer-shell').getByRole('alert')).toContainText('scene:UNAVAILABLE');
    await page.getByRole('button',{name:'도면',exact:true}).click();
    await page.getByRole('menuitem',{name:'원본 DXF로 Scene 생성/재생성'}).click();
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료',{timeout:30_000});
    await page.getByRole('button',{name:'도면',exact:true}).click();
    await page.getByRole('menuitem',{name:'Scene Asset 저장',exact:true}).click();
    await expect(page.getByTestId('scene-status')).toContainText('Scene Asset 저장 완료',{timeout:30_000});
    const unauthorized=await request.get('/api/cad-files?memo='+encodeURIComponent(keyword));
    expect(unauthorized.status()).toBe(401);
    expect(unauthorized.headers()['cache-control']).toBe('private, no-store');
    expect(unauthorized.headers()['referrer-policy']).toBe('no-referrer');
    const api=await page.request.get('/api/cad-files?memo='+encodeURIComponent(keyword)+'&current=true');
    expect(api.status(),await api.text()).toBe(200);
    expect(api.headers()['cache-control']).toBe('private, no-store');
    const apiResult=await api.json();
    expect(apiResult.total).toBe(2);
    expect(apiResult.items.find((row:{id:string})=>row.id===current.id)?.memoMatches.count).toBe(4);
    let contentGets=0;
    page.on('request',request=>{if(/\/api\/cad-files\/[^/]+\/content$/.test(new URL(request.url()).pathname))contentGets++;});
    await page.goto('/?memo='+encodeURIComponent(keyword)+'&site='+encodeURIComponent(`List ${suffix} sites`));
    await expect(page.getByText('검색 결과 2개')).toBeVisible();
    await expect(page.locator(`#version-${current.id}`)).toContainText('일치 메모 4건');
    await expect(page.locator(`#version-${current.id}`).locator('a[href*="&memo="]')).toHaveCount(3);
    await expect(page.locator(`#version-${old.id}`)).toHaveCount(0);
    expect(contentGets).toBe(0);
    await page.getByRole('button',{name:'현재 버전만 표시'}).click();
    await expect(page.getByText('검색 결과 3개')).toBeVisible();
    await expect(page.locator(`#version-${old.id}`)).toBeVisible();
    await page.getByRole('searchbox',{name:'메모 검색어 (제목·본문)'}).fill(keyword);
    await page.getByLabel('파일명',{exact:true}).fill(`${suffix}-old`);
    await page.getByRole('button',{name:'검색',exact:true}).click();
    await expect(page.getByText('검색 결과 1개')).toBeVisible();
    await expect(page.locator(`#version-${old.id}`)).toBeVisible();
    expect(contentGets).toBe(0);
    await page.goto('/?memo='+encodeURIComponent(keyword));
    const deep=page.locator(`#version-${current.id} a[href*="&memo=${primary.id}"]`);
    await expect(deep).toHaveAttribute('href',`/cad/versions/${current.id}/viewer?renderer=three-dxf-viewer&memo=${primary.id}`);
    await expect(deep).toContainText(xssMarker);
    await expect(page.locator(`#version-${current.id}`).locator('img, script')).toHaveCount(0);
    expect(await page.evaluate(()=>(window as Window & {__memoXssRan?:boolean}).__memoXssRan)).toBeUndefined();
    await page.setViewportSize({width:320,height:800});
    await expect(page.getByRole('searchbox',{name:'메모 검색어 (제목·본문)'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.screenshot({path:'/tmp/qa-202-204-memo-320.png',fullPage:true});
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content','no-referrer');
    await page.screenshot({path:'/tmp/qa-202-204-memo-results.png',fullPage:true});
    await deep.click();
    await expect(page).toHaveURL(new RegExp(`/cad/versions/${current.id}/viewer\\?renderer=three-dxf-viewer&memo=${primary.id}`));
    await expect(page.getByTestId('memo-link-notice')).toContainText('공유된 메모 위치로 이동했습니다.',{timeout:30_000});
    await expect(page.getByTestId('cad-memo-pin')).toHaveCount(4,{timeout:30_000});
  } finally {
    const session=await page.request.get('/api/g7-runtime/auth/session');
    if(session.status()===200)expect((await page.request.post('/api/g7-runtime/auth/logout',{
      headers:{origin,'x-csrf-token':(await session.json()).csrfToken}})).status()).toBe(200);
  }
});
