import {expect,test} from '@playwright/test';
import {randomUUID} from 'node:crypto';

test('#196 visible zone tree controls support Arrow/Home/End and Enter focus behavior',async({page,baseURL})=>{
 test.setTimeout(120_000);
 await page.goto('/g7-runtime');
 await page.getByLabel('계정').fill('admin');
 await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
 await page.getByRole('button',{name:'로그인',exact:true}).click();
 await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
 let versionId:string|undefined;
 const created:string[]=[];
 try{
  const files=await (await page.request.get('/api/cad-files')).json();
  versionId=files.items[0].id as string;
  const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
  const headers={origin:baseURL!,'x-csrf-token':session.csrfToken};
  for(const [index,name] of ['키보드 구역 A','키보드 구역 B'].entries()){
   const response=await page.request.post(`/api/cad-files/${versionId}/zones`,{headers:{...headers,'Idempotency-Key':randomUUID()},
    data:{name,categoryId:null,description:'',code:'KEY-'+index,tags:[],sortOrder:index,parentZoneId:null,references:[]}});
   expect(response.status(),await response.text()).toBe(201);
   created.push((await response.json()).zone.id);
  }
  await page.goto(`/cad/versions/${versionId}/viewer`);
  await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await page.getByRole('button',{name:'작업',exact:true}).click();
  await page.getByTestId('viewer-menu-zone-list').click();
  const panel=page.getByTestId('cad-zone-panel');
  const items=panel.getByTestId('zone-tree-item');
  await expect(items).toHaveCount(2);
  await items.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('alert')).toContainText('연결되지 않은 구역');
  await items.first().click();
  await expect(panel.getByRole('region',{name:'선택 구역 상세'})).toContainText('키보드 구역 A');
  await panel.getByRole('button',{name:'편집',exact:true}).click();
  await panel.getByLabel('설명',{exact:true}).fill('unsaved previous actor draft');
  // Simulate a newly authorized read envelope after another tab changes actor.
  // This tests UI-local data disposal; real authorization is covered server-side.
  const zonePattern=`**/api/cad-files/${versionId}/zones`;
  const allowedRead=await (await page.request.get(`/api/cad-files/${versionId}/zones`)).json();
  const switchedActor=randomUUID();
  await page.route(zonePattern,route=>route.fulfill({status:200,json:{...allowedRead,actorId:switchedActor}}));
  const switchedResponse=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/cad-files/${versionId}/zones`);
  await panel.getByRole('button',{name:'새로고침',exact:true}).click();
  await (await switchedResponse).finished();
  await expect(panel.getByLabel('설명',{exact:true})).toHaveCount(0);
  await expect(panel.getByRole('region',{name:'선택 구역 상세'})).toHaveCount(0);
  await page.unrouteAll({behavior:'wait'});

 }finally{
  await page.unrouteAll({behavior:'wait'});
  const fresh=await page.request.get('/api/g7-runtime/auth/session');
  if(fresh.status()===200){
   const session=await fresh.json();
   const headers={origin:baseURL!,'x-csrf-token':session.csrfToken};
   try{
    const response=versionId?await page.request.get(`/api/cad-files/${versionId}/zones`):null;
    if(response?.ok()){
     const latest=await response.json();
     for(const id of created.reverse()){
      const zone=latest.zones.find((item:{id:string})=>item.id===id);
      if(!zone)continue;
      const deleted=await page.request.delete(`/api/cad-files/${versionId}/zones/${id}`,{headers,
       data:{expectedRevision:zone.revision}});
      expect(deleted.status(),await deleted.text()).toBe(200);
     }
    }
   }finally{
    const logout=await page.request.post('/api/g7-runtime/auth/logout',{headers});
    expect(logout.status()).toBe(200);
   }
  }
 }
});
