import {expect,test} from '@playwright/test';
import {createHash} from 'node:crypto';
import {masterFields} from './master-helper';
import {openViewerMenu} from './viewer-menu-helper';
const dxf=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES','0','LINE','5','T201','8','ZONE','10','0','20','0','11','100','21','100',
 '0','ENDSEC','0','EOF',''].join('\n'));
const actorA='11111111-1111-4111-8111-111111111111',actorB='22222222-2222-4222-8222-222222222222';
const folder='33333333-3333-4333-8333-333333333333',outline='44444444-4444-4444-8444-444444444444';
const zone='55555555-5555-4555-8555-555555555555',child='66666666-6666-4666-8666-666666666666';
const type='77777777-7777-4777-8777-777777777777',category='88888888-8888-4888-8888-888888888888';
test('#201 one unified panel, mixed hierarchy, session replacement and source lifetime',async({page,request})=>{
 const uploaded=await request.post('/api/cad-files',{multipart:{file:{name:'tree-201.dxf',mimeType:'application/octet-stream',buffer:dxf},
  ...(await masterFields(request,{businessUnit:'tree201',site:'tree201',building:'A',floor:'1'})),
  registeredAt:'2026-11-13',makeCurrent:'true',deletePassword:'1234'}});
 expect(uploaded.status(),await uploaded.text()).toBe(201);
 const versionId=(await uploaded.json()).id as string,sha=createHash('sha256').update(dxf).digest('hex');
 let actor=actorA,treeReads=0,contentGets=0;
 let releasePatch:()=>void=()=>{},patchStarted:()=>void=()=>{};
 const patchGate=new Promise<void>(resolve=>{releasePatch=resolve;});
 const patchSeen=new Promise<void>(resolve=>{patchStarted=resolve;});
 page.on('request',req=>{if(new URL(req.url()).pathname===`/api/cad-files/${versionId}/content`)contentGets++;});
 await page.route('**/api/g7-runtime/status',route=>route.fulfill({json:{state:'ACTIVE',authEnabled:true,cadWriteEnabled:true}}));
 await page.route('**/api/g7-runtime/auth/session',route=>route.fulfill({json:{actor:{id:actor,status:'ACTIVE',roles:['Editor'],mustChangePassword:false,siteGrants:['site'],specialGrants:[]},csrfToken:'mock-token',runtime:{cadWriteEnabled:true,siteIds:['site']}}}));
 await page.route(`**/api/cad-files/${versionId}/tree`,route=>{
  if(route.request().method()==='PATCH')return (async()=>{patchStarted();await patchGate;await route.fulfill({json:{id:folder,revision:2}});})();
  if(route.request().method()!=='GET')return route.fulfill({status:403,json:{error:{code:'DENIED',message:'mock write disabled'}}});
  treeReads++;
  return route.fulfill({json:{versionId,sourceSha256:sha,locationId:'floor',siteId:'site',actorId:actor,canEdit:true,
   folders:[{id:folder,versionId,parentFolderId:null,name:actor===actorA?'Process':'Other actor folder',sortOrder:0,revision:1,createdById:actor}],
   memberships:[{id:'m1',versionId,kind:'OUTLINE',objectId:outline,folderId:folder,sortOrder:0,revision:1},
    {id:'m2',versionId,kind:'ZONE',objectId:zone,folderId:folder,sortOrder:1,revision:1}],
   outlines:[{id:outline,name:actor===actorA?'Pipe Outline':'Other actor outline',kind:'PRECISE',outlineTypeId:type,bounds:{minX:0,minY:0,maxX:100,maxY:100}}],
   zones:[{id:zone,name:'Tank',code:'T-01',categoryId:category,parentZoneId:null,sortOrder:1,geometryState:'UNMAPPED'},
    {id:child,name:'Valve',code:'V-02',categoryId:null,parentZoneId:zone,sortOrder:0,geometryState:null}],
   categories:[{id:category,name:'Equipment'}],types:[{id:type,name:'Process Type'}]}});
 });
 await page.route(`**/api/cad-files/${versionId}/zones`,route=>route.fulfill({json:{zones:[],categories:[],actorId:actor,
  canEdit:true,canDeleteAny:false,canManageCategories:false,locationId:'floor',siteId:'site',versionId,sourceSha256:sha,sceneRevision:null}}));
 await page.route(`**/api/cad-files/${versionId}/outlines`,route=>route.fulfill({json:{actorId:actor,versionId,sourceSha256:sha,sceneRevision:null,canWrite:true,total:0,offset:0,limit:100,outlines:[]}}));
 await page.route(`**/api/cad-files/${versionId}/outline-types?*`,route=>route.fulfill({json:{actorId:actor,versionId,sourceSha256:sha,sceneRevision:null,catalogScope:'GLOBAL',canCreate:false,total:0,offset:0,limit:50,items:[]}}));
 await page.goto(`/cad/versions/${versionId}/viewer?renderer=three-dxf-viewer`);
 await expect(page.getByRole('status').filter({hasText:'도면 표시 완료'})).toBeVisible();
 await openViewerMenu(page,'work');await page.getByTestId('viewer-menu-unified-tree').click();
 const panel=page.getByTestId('version-tree-panel');await expect(panel).toBeVisible();
 await expect(panel.getByText('Process Type')).toBeVisible();
 await expect(panel.getByText('Equipment')).toBeVisible();
 await expect(panel.getByText('Valve')).toBeVisible();
 await expect(page.getByTestId('viewer-zone-dock')).toHaveCount(0);
 const canvas=page.getByTestId('cad-canvas').locator('canvas'),handle=await canvas.elementHandle(),before=contentGets;
 await panel.getByTestId('version-tree-search').fill('V-02');
 await expect(panel.getByText('Valve')).toBeVisible();await expect(panel.getByText('Tank')).toBeVisible();
 await expect(panel.getByText('Pipe Outline')).toHaveCount(0);
 await panel.getByTestId('version-tree-search').fill('');
 await panel.getByRole('treeitem').filter({hasText:'Tank'}).first().locator(':scope > div').first().click();
 await expect(panel.getByText('미연결 · 확대 불가').first()).toBeVisible();
 await panel.getByRole('treeitem').filter({hasText:'Process'}).first().locator(':scope > div').first().click();
 await panel.getByRole('button',{name:'폴더 편집'}).click();
 await panel.getByLabel('폴더 이름').fill('Old actor pending edit');
 await panel.getByRole('button',{name:'저장',exact:true}).click();
 await patchSeen;
 actor=actorB;await page.evaluate(()=>window.dispatchEvent(new Event('layoutManager:session-invalidated')));
 await expect(panel.getByText('Pipe Outline')).toHaveCount(0);
 await expect(panel.getByText('Other actor outline')).toBeVisible();
 releasePatch();
 await expect(panel.getByText('Old actor pending edit')).toHaveCount(0);
 await expect(panel.getByText('Other actor folder')).toBeVisible();
 const afterSwitch=treeReads;
 for(let i=0;i<20;i++){
  await panel.getByRole('button',{name:'닫기',exact:true}).click();
  await openViewerMenu(page,'work');await page.getByTestId('viewer-menu-unified-tree').click();
  await expect(panel).toBeVisible();
 }
 expect(treeReads).toBe(afterSwitch);expect(contentGets).toBe(before);
 expect(await handle!.evaluate(node=>node===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
});

test('#201 delayed old Version tree GET cannot replace a newly opened Version',async({page,request})=>{
 const fields=await masterFields(request,{businessUnit:'tree201-version',site:'tree201-version',building:'A',floor:'1'});
 const upload=async(name:string)=>{
  const response=await request.post('/api/cad-files',{multipart:{file:{name,mimeType:'application/octet-stream',buffer:dxf},
   ...fields,registeredAt:'2026-11-13',makeCurrent:'true',deletePassword:'1234'}});
  expect(response.status(),await response.text()).toBe(201);
  return (await response.json()).id as string;
 };
 const oldVersion=await upload('tree-old.dxf'),newVersion=await upload('tree-new.dxf');
 const sha=createHash('sha256').update(dxf).digest('hex');
 let oldReads=0,oldSettled=false,releaseOld:()=>void=()=>{};
 const oldGate=new Promise<void>(resolve=>{releaseOld=resolve;});
 await page.route('**/api/g7-runtime/status',route=>route.fulfill({json:{state:'ACTIVE',authEnabled:true,cadWriteEnabled:true}}));
 await page.route('**/api/g7-runtime/auth/session',route=>route.fulfill({json:{actor:{id:actorA,status:'ACTIVE',roles:['Editor'],mustChangePassword:false,siteGrants:['site'],specialGrants:[]},csrfToken:'mock-token',runtime:{cadWriteEnabled:true,siteIds:['site']}}}));
 await page.route('**/api/cad-files/*/tree',async route=>{
  const id=new URL(route.request().url()).pathname.split('/')[3];
  const result={versionId:id,sourceSha256:sha,locationId:'floor',siteId:'site',actorId:actorA,canEdit:true,
   folders:[{id:folder,versionId:id,parentFolderId:null,name:id===oldVersion?'Old Version Folder':'New Version Folder',sortOrder:0,revision:1,createdById:actorA}],
   memberships:[],outlines:[],zones:[],categories:[],types:[]};
  if(id===oldVersion&&++oldReads===2){await oldGate;try{await route.fulfill({json:result});}catch{}finally{oldSettled=true;}return;}
  await route.fulfill({json:result});
 });
 await page.route('**/api/cad-files/*/zones',route=>{
  const versionId=new URL(route.request().url()).pathname.split('/')[3];
  return route.fulfill({json:{zones:[],categories:[],actorId:actorA,versionId,sourceSha256:sha,
   canEdit:true,canDeleteAny:false,canManageCategories:false,locationId:'floor',siteId:'site',sceneRevision:null}});
 });
 try{
  await page.goto(`/cad/versions/${oldVersion}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status').filter({hasText:'도면 표시 완료'})).toBeVisible();
  // Zone detail mounts only after its actor/Version/SHA snapshot is ready.
  // Otherwise the shared retry correctly targets Zone, not Tree, loading.
  await openViewerMenu(page,'work');await page.getByTestId('viewer-menu-zone-list').click();
  await expect(page.getByTestId('cad-zone-panel')).toBeVisible();
  const panel=page.getByTestId('version-tree-panel');
  await panel.getByRole('button',{name:'전체',exact:true}).click();
  await expect(panel.getByText('Old Version Folder')).toBeVisible();
  expect(oldReads).toBe(1);
  await panel.getByRole('button',{name:'다시 시도'}).click();
  await expect.poll(()=>oldReads,{timeout:5000,message:'the second Tree GET must reach its held-response gate'}).toBe(2);
  await page.goto(`/cad/versions/${newVersion}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status').filter({hasText:'도면 표시 완료'})).toBeVisible();
  await openViewerMenu(page,'work');await page.getByTestId('viewer-menu-unified-tree').click();
  await expect(panel.getByText('New Version Folder')).toBeVisible();
  releaseOld();await expect.poll(()=>oldSettled,{timeout:5000}).toBe(true);
  await expect(panel.getByText('Old Version Folder')).toHaveCount(0);
  await expect(panel.getByText('New Version Folder')).toBeVisible();
 }finally{releaseOld();await page.unrouteAll({behavior:'wait'});}
});
