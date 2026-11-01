import {expect,test,type Page} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import type {CadZoneDto,ZoneListDto} from '../../domain/cad-zone';
async function work(page:Page,id:string){
 await page.getByRole('button',{name:'작업',exact:true}).click();
 await expect(page.getByTestId(id)).not.toHaveAttribute('aria-disabled','true');await page.getByTestId(id).click();
}
const polygon=(low:number,high:number)=>({type:'Polygon',coordinates:[[[low,low],[high,low],[high,high],[low,high],[low,low]]]});
test('TC-Z196-GREENFIELD: real Zone persistence, three-level tree, CAS, focus, remapping and source invariance',async({page,baseURL})=>{
 test.setTimeout(120_000);
 await page.goto('/g7-runtime');await page.getByLabel('계정').fill('admin');
 await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
 await page.getByRole('button',{name:'로그인',exact:true}).click();
 await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
 const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
 const headers={origin:baseURL!,'x-csrf-token':session.csrfToken};
 const files=await (await page.request.get('/api/cad-files')).json();
 const versionId=files.items[0].id as string,url=`/api/cad-files/${versionId}/zones`;
 const beforeBytes=await (await page.request.get(`/api/cad-files/${versionId}/content`)).body();
 const beforeSha=createHash('sha256').update(beforeBytes).digest('hex');
 const before=await (await page.request.get(url)).json() as ZoneListDto;
 expect(before.canEdit).toBe(true);expect(before.sceneRevision).not.toBeNull();
 const prefix='Z196-'+randomUUID().slice(0,8);
 const createdIds:string[]=[];
 try{
  let sourceGets=0;
  page.on('request',r=>{if(new URL(r.url()).pathname===`/api/cad-files/${versionId}/content`)sourceGets++;});
  await page.goto(`/cad/versions/${versionId}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await work(page,'viewer-menu-zone-create');
  const panel=page.getByTestId('cad-zone-panel');
  await panel.getByLabel('이름',{exact:true}).fill(prefix+' Root');
  await panel.getByLabel('설명',{exact:true}).fill('생산\n라인 설명');
  for(const [x,y] of [[0,0],[100,0],[100,100],[0,100]]){
   await panel.getByLabel('WCS X',{exact:true}).fill(String(x));
   await panel.getByLabel('WCS Y',{exact:true}).fill(String(y));
   await panel.getByRole('button',{name:'점 추가',exact:true}).click();
  }
  await panel.getByRole('button',{name:'경계 닫기',exact:true}).click();
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname===url&&r.request().method()==='POST');
  await panel.getByRole('button',{name:'구역 확인/저장',exact:true}).click();
  const savedResponse=await saved;expect(savedResponse.status(),await savedResponse.text()).toBe(201);
  const root=(await savedResponse.json()).zone as CadZoneDto;createdIds.push(root.id);
  expect(root.geometry?.polygon).toEqual(polygon(0,100));expect(root.description).toBe('생산\n라인 설명');
  let parent=root;
  for(const [suffix,low,high] of [['Child',10,90],['Grandchild',20,80]] as const){
   const response=await page.request.post(url,{headers:{...headers,'Idempotency-Key':randomUUID()},data:{
    name:prefix+' '+suffix,parentZoneId:parent.id,description:'Persistent reference',
    references:[{kind:'EQUIPMENT',label:'설비',value:'SYN-1'},{kind:'DOCUMENT',label:'문서',value:'SYN-2',url:'https://example.test/manual'}],
    geometry:{sourceSha256:before.sourceSha256,sceneRevision:before.sceneRevision,polygon:polygon(low,high)},
   }});
   expect(response.status(),await response.text()).toBe(201);parent=(await response.json()).zone;createdIds.push(parent.id);
  }
  await panel.getByRole('button',{name:'새로고침',exact:true}).click();
  const grand=panel.getByTestId('zone-tree-item').filter({hasText:prefix+' Grandchild'});
  await expect(grand).toBeVisible();await grand.click();
  await expect(panel.getByRole('region',{name:'선택 구역 상세'})).toContainText('SYN-1');
  await grand.dblclick();
  await expect(page.locator(`[data-testid="cad-zone-path"][data-zone-id="${parent.id}"]`)).toHaveAttribute('stroke-width','3');
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.evaluate(e=>e.setAttribute('data-zone-stable','yes'));
  const initialGets=sourceGets;
  for(let i=0;i<3;i++){
   await panel.getByRole('button',{name:'구역 목록 닫기',exact:true}).click();
   await work(page,'viewer-menu-zone-list');await expect(grand).toBeVisible();
  }
  await expect(canvas).toHaveAttribute('data-zone-stable','yes');expect(sourceGets).toBe(initialGets);
  const stale=await page.request.patch(url+'/'+root.id,{headers,data:{expectedRevision:0,name:root.name}});
  expect(stale.status()).toBe(400);
  const updated=await page.request.patch(url+'/'+root.id,{headers,data:{
   expectedRevision:root.revision,name:root.name,categoryId:root.categoryId,code:root.code,tags:root.tags,
   sortOrder:root.sortOrder,parentZoneId:root.parentZoneId,references:root.references,description:'Updated root'}});
  expect(updated.status(),await updated.text()).toBe(200);
  const conflict=await page.request.patch(url+'/'+root.id,{headers,data:{expectedRevision:root.revision,name:root.name,
   categoryId:root.categoryId,description:root.description,code:root.code,tags:root.tags,sortOrder:root.sortOrder,
   parentZoneId:root.parentZoneId,references:root.references}});
  expect(conflict.status()).toBe(409);
  await page.reload();await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await work(page,'viewer-menu-zone-list');await expect(grand).toBeVisible();
  const restored=await (await page.request.get(url)).json() as ZoneListDto;
  expect(restored.zones.find(z=>z.id===root.id)?.description).toBe('Updated root');
  expect(restored.zones.find(z=>z.id===parent.id)?.references).toHaveLength(2);
  await grand.click();
  await panel.getByRole('button',{name:'경계 편집/재연결',exact:true}).click();
  await panel.getByLabel('1번 X',{exact:true}).fill('21');
  await panel.getByRole('button',{name:'경계 닫기',exact:true}).click();
  const remapped=page.waitForResponse(r=>new URL(r.url()).pathname===url+'/'+parent.id&&r.request().method()==='PATCH');
  await panel.getByRole('button',{name:'구역 확인/저장',exact:true}).click();
  const remappedResponse=await remapped;expect(remappedResponse.status(),await remappedResponse.text()).toBe(200);
  const remappedZone=(await remappedResponse.json()).zone as CadZoneDto;
  expect(remappedZone.id).toBe(parent.id);expect(remappedZone.parentZoneId).toBe(parent.parentZoneId);
  expect(remappedZone.geometry!.polygon.coordinates[0][0]).toEqual([21,20]);
  expect(remappedZone.references).toHaveLength(2);
  const afterBytes=await (await page.request.get(`/api/cad-files/${versionId}/content`)).body();
  expect(createHash('sha256').update(afterBytes).digest('hex')).toBe(beforeSha);
  await page.getByRole('button',{name:'보기',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'dxf-viewer',exact:true}).click();
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await work(page,'viewer-menu-zone-list');await expect(grand).toBeVisible();
  await grand.click();await expect(panel.getByRole('button',{name:'편집',exact:true})).toBeDisabled();
  await grand.focus();await page.keyboard.press('Enter');
  await expect(panel.getByRole('alert')).toContainText('현재 Viewer에서는 구역 경계로 이동할 수 없습니다');

 }finally{
  const snapshot=await page.request.get(url);
  if(snapshot.ok()){
   const rows=(await snapshot.json() as ZoneListDto).zones;
   for(const id of [...createdIds].reverse()){
    const row=rows.find(z=>z.id===id);if(!row)continue;
    expect((await page.request.delete(url+'/'+id,{headers,data:{expectedRevision:row.revision}})).status()).toBe(200);
   }
  }
  const current=await page.request.get('/api/g7-runtime/auth/session');
  if(current.ok())expect((await page.request.post('/api/g7-runtime/auth/logout',{headers:{origin:baseURL!,
   'x-csrf-token':(await current.json()).csrfToken}})).status()).toBe(200);
 }
});
