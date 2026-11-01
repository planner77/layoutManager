import {expect,test,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import type {CadZoneDto,ZoneListDto} from '../../domain/cad-zone';

test.use({deviceScaleFactor:2});

async function login(page:Page){
 await page.goto('/g7-runtime');await page.getByLabel('계정').fill('admin');
 await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
 await page.getByRole('button',{name:'로그인',exact:true}).click();
 await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
async function work(page:Page,id:string){
 await page.getByRole('button',{name:'작업',exact:true}).click();await page.getByTestId(id).click();
}
async function projectedVertex(page:Page,zoneId:string){
 const path=page.locator(`[data-testid="cad-zone-path"][data-zone-id="${zoneId}"]`);await expect(path).toBeVisible();
 const d=await path.getAttribute('d');expect(d).toBeTruthy();
 const match=d!.match(/M\s*(-?[\d.]+)\s+(-?[\d.]+)/);expect(match).toBeTruthy();
 const box=(await page.getByTestId('cad-canvas').locator('canvas').boundingBox())!;
 return {x:box.x+Number(match![1]),y:box.y+Number(match![2])};
}
async function insideCanvas(page:Page,point:{x:number;y:number}){
 const box=(await page.getByTestId('cad-canvas').locator('canvas').boundingBox())!;
 return point.x>=box.x&&point.x<=box.x+box.width&&point.y>=box.y&&point.y<=box.y+box.height;
}
async function visibleProjectedVertex(page:Page,zoneId:string){
 let point={x:0,y:0};
 await expect.poll(async()=>{point=await projectedVertex(page,zoneId);return insideCanvas(page,point);}).toBe(true);
 return point;
}
async function logout(page:Page,origin:string){
 const result=await page.request.get('/api/g7-runtime/auth/session');if(result.status()!==200)return;
 const session=await result.json();
 expect((await page.request.post('/api/g7-runtime/auth/logout',{
  headers:{origin,'x-csrf-token':session.csrfToken},
 })).status()).toBe(200);
}

test('Issue 196 QA: source-derived vertex snap, stale camera epoch, and free WCS points persist',async({page,baseURL})=>{
 test.setTimeout(150_000);await login(page);const origin=baseURL!;const createdIds:string[]=[];let versionId='';
 try{
  const files=await (await page.request.get('/api/cad-files')).json() as {items:{id:string}[]};
  versionId=files.items[0]?.id??'';expect(versionId,'Greenfield fixture Version').toBeTruthy();
  const initial=await (await page.request.get(`/api/cad-files/${versionId}/zones`)).json() as ZoneListDto;
  expect(initial.sceneRevision).not.toBeNull();
  const session=await (await page.request.get('/api/g7-runtime/auth/session')).json() as {csrfToken:string};
  const calibrationKey=randomUUID();
  const calibration=await page.request.post(`/api/cad-files/${versionId}/zones`,{
   headers:{origin,'x-csrf-token':session.csrfToken,'Idempotency-Key':calibrationKey},
   data:{name:'Issue196 snap QA calibration '+randomUUID().slice(0,6),description:'',code:'',tags:[],sortOrder:0,
    categoryId:null,parentZoneId:null,references:[],geometry:{sourceSha256:initial.sourceSha256,
     sceneRevision:initial.sceneRevision!,polygon:{type:'Polygon',coordinates:[[[0,0],[-20,0],[-20,-20],[0,-20],[0,0]]]}}},
  });
  expect(calibration.status(),await calibration.text()).toBe(201);
  const calibrationZone=(await calibration.json()).zone as CadZoneDto;createdIds.push(calibrationZone.id);
  await page.goto(`/cad/versions/${versionId}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');

  await work(page,'viewer-menu-zone-list');
  await expect(page.locator(`[data-testid="cad-zone-path"][data-zone-id="${calibrationZone.id}"]`)).toHaveCount(1);
  await work(page,'viewer-menu-zone-create');
  const panel=page.getByTestId('cad-zone-panel');await expect(panel).toBeVisible();
  let vertex=await projectedVertex(page,calibrationZone.id);
  await page.mouse.click(vertex.x,vertex.y);
  const snap=panel.getByRole('group',{name:'스냅 후보 선택'});
  await expect(snap).toBeVisible();
  const endpoint=snap.getByRole('button').filter({hasText:/끝점|꼭짓점/}).first();
  const beforeChoices=await endpoint.textContent();expect(beforeChoices).toBeTruthy();

  // A pending choice is tied to the camera epoch. Zooming must invalidate it.
  await page.getByRole('button',{name:'보기',exact:true}).click();
  await page.getByRole('menuitem',{name:'확대',exact:true}).click();
  await endpoint.click();
  await expect(snap).toHaveCount(0);
  await expect(panel.getByRole('alert')).toContainText('화면이 변경되었습니다');
  await expect(panel.locator('ol li')).toHaveCount(0);

  // The zoom can move the fixture endpoint outside the viewport. Fit the CAD
  // again, verify the projected source endpoint is on canvas, then retry.
  await page.getByRole('button',{name:'보기',exact:true}).click();
  await page.getByRole('menuitem',{name:'화면 맞춤',exact:true}).click();
  vertex=await visibleProjectedVertex(page,calibrationZone.id);
  await page.mouse.click(vertex.x,vertex.y);
  const fresh=panel.getByRole('group',{name:'스냅 후보 선택'});await expect(fresh).toBeVisible();
  const candidate=fresh.getByRole('button').filter({hasText:/끝점|꼭짓점/}).first();
  const candidateText=(await candidate.textContent())!;
  const coords=candidateText.match(/(-?[\d.]+),\s*(-?[\d.]+)/);expect(coords).toBeTruthy();
  await candidate.click();
  await expect(panel.locator('ol li')).toHaveCount(1);
  expect(Number(await panel.getByLabel('1번 X').inputValue())).toBe(Number(coords![1]));
  expect(Number(await panel.getByLabel('1번 Y').inputValue())).toBe(Number(coords![2]));

  // Complete the ring with free numeric WCS points.
  const snappedX=Number(coords![1]),snappedY=Number(coords![2]);
  for(const point of [{x:snappedX+8,y:snappedY},{x:snappedX+8,y:snappedY+8},{x:snappedX,y:snappedY+8}]){
   await panel.getByLabel('WCS X',{exact:true}).fill(String(point.x));
   await panel.getByLabel('WCS Y',{exact:true}).fill(String(point.y));
   await panel.getByRole('button',{name:'점 추가',exact:true}).click();
  }
  await panel.getByLabel('이름',{exact:true}).fill('Issue196 snap QA '+randomUUID().slice(0,8));
  await panel.getByRole('button',{name:'경계 닫기',exact:true}).click();
  const posted=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/cad-files/${versionId}/zones`&&response.request().method()==='POST');
  await panel.getByRole('button',{name:'구역 확인/저장',exact:true}).click();
  const response=await posted;expect(response.status(),await response.text()).toBe(201);
  const saved=(await response.json()).zone as CadZoneDto;createdIds.push(saved.id);
  expect(saved.geometry?.state).toBe('MAPPED');
  expect(saved.geometry?.polygon.coordinates[0][0]).toEqual([snappedX,snappedY]);
  expect(saved.geometry?.polygon.coordinates[0]).toHaveLength(5);
  await expect(page.locator(`[data-testid="cad-zone-path"][data-zone-id="${saved.id}"]`)).toHaveCount(1);
  const current=await (await page.request.get(`/api/cad-files/${versionId}/zones`)).json() as ZoneListDto;
  expect(current.zones.find(zone=>zone.id===saved.id)?.geometry?.polygon).toEqual(saved.geometry?.polygon);

  // Reset through the real menu path must keep metadata while removing the
  // invalidated polygon from the Viewer and denying focus for that old mapping.
  const resetResponse=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/cad-files/${versionId}/reset`&&response.request().method()==='POST');
  page.once('dialog',dialog=>dialog.accept());
  await work(page,'viewer-menu-reset-source');
  const reset=await resetResponse;expect(reset.status(),await reset.text()).toBe(200);
  expect(await reset.json()).toMatchObject({mode:'SOURCE_ONLY',unmappedZones:2});
  await expect(page.getByTestId('cad-zone-path')).toHaveCount(0);
  const afterReset=await (await page.request.get(`/api/cad-files/${versionId}/zones`)).json() as ZoneListDto;
  const unmapped=afterReset.zones.find(zone=>zone.id===saved.id);
  expect(unmapped).toMatchObject({id:saved.id,name:saved.name,geometry:{state:'UNMAPPED',reason:'RESET'}});
  expect(afterReset.zones.find(zone=>zone.id===calibrationZone.id)?.geometry).toMatchObject({state:'UNMAPPED',reason:'RESET'});
  await page.getByTestId('cad-zone-panel').getByTestId('zone-tree-item').filter({hasText:saved.name}).click();
  await page.getByTestId('cad-zone-panel').getByTestId('zone-tree-item').filter({hasText:saved.name}).press('Enter');
  await expect(page.getByTestId('cad-zone-panel').getByRole('alert')).toContainText('RESET');
 }finally{
  if(versionId&&createdIds.length){
   const result=await page.request.get(`/api/cad-files/${versionId}/zones`);
   if(result.ok()){
    const list=await result.json() as ZoneListDto;const sessionResult=await page.request.get('/api/g7-runtime/auth/session');
    if(sessionResult.ok()){
     const session=await sessionResult.json();
     for(const id of [...createdIds].reverse()){
      const zone=list.zones.find(row=>row.id===id);if(!zone)continue;
      expect((await page.request.delete(`/api/cad-files/${versionId}/zones/${id}`,{
       headers:{origin,'x-csrf-token':session.csrfToken},data:{expectedRevision:zone.revision},
      })).status()).toBe(200);
     }
    }
   }
  }
  await logout(page,origin);
 }
});
