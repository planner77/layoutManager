import {expect,test} from '@playwright/test';
import {createHash} from 'node:crypto';
import {masterFields} from './master-helper';
import {openViewerMenu} from './viewer-menu-helper';

const dxf=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES','0','LINE','5','R200','8','ZONE','10','0','20','0','11','100','21','100',
 '0','ENDSEC','0','EOF',''].join('\n'));

test('PR200 ACTIVE initial/later Zone read failure keeps Retry in the same viewer and clears protected rows',async({page,request})=>{
 const uploaded=await request.post('/api/cad-files',{multipart:{
  file:{name:'pr200-zone.dxf',mimeType:'application/octet-stream',buffer:dxf},
  ...(await masterFields(request,{businessUnit:'pr200-zone',site:'pr200-zone',building:'A',floor:'1'})),
  registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(uploaded.status()).toBe(201);const {id}=await uploaded.json() as {id:string};
 const sha=createHash('sha256').update(dxf).digest('hex');
 const zone={id:'synthetic-zone',locationId:'floor',siteId:'site',name:'Recovery Zone',categoryId:null,
  description:'',code:'RECOVERY',tags:[],sortOrder:0,parentZoneId:null,references:[],revision:1,
  createdById:'actor',updatedById:'actor',createdAt:'2026-11-01',updatedAt:'2026-11-01',geometry:null};
 const envelope={zones:[zone],categories:[],actorId:'actor',canEdit:false,canDeleteAny:false,
  canManageCategories:false,locationId:'floor',siteId:'site',versionId:id,sourceSha256:sha,sceneRevision:null};
 await page.route('**/api/g7-runtime/status',route=>route.fulfill({status:200,json:{state:'ACTIVE',authEnabled:true,cadWriteEnabled:false}}));
 const outcomes=[503,200,503,200,401,200,403,200];let reads=0,contentGets=0;
 page.on('request',req=>{if(new URL(req.url()).pathname===`/api/cad-files/${id}/content`)contentGets++;});
 await page.route(`**/api/cad-files/${id}/zones`,route=>{
  const status=outcomes[reads++]??200;
  return route.fulfill(status===200?{status,json:envelope}:{status,json:{error:{code:status===503?'UNAVAILABLE':'ACCESS_DENIED',message:`Zone read ${status}`}}});
 });
 await page.goto(`/cad/versions/${id}/viewer?renderer=three-dxf-viewer`);
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await expect.poll(()=>reads).toBe(1);
 const canvas=page.getByTestId('cad-canvas').locator('canvas');
 const original=await canvas.elementHandle();const beforeContent=contentGets;
 await openViewerMenu(page,'work');
 await expect(page.getByTestId('viewer-menu-zone-list')).toBeEnabled();
 await page.getByTestId('viewer-menu-zone-list').click();
 const panel=page.getByTestId('cad-zone-panel');
 await expect(panel.getByTestId('zone-read-retry')).toBeVisible();
 await expect(panel.getByRole('alert')).toContainText('Zone read 503');
 await panel.getByTestId('zone-read-retry').click();
 await expect(panel.getByTestId('zone-tree-item')).toHaveCount(1);
 await panel.getByTestId('zone-tree-item').click();
 await expect(panel.getByRole('region',{name:'선택 구역 상세'})).toContainText('Recovery Zone');
 for(const status of [503,401,403]){
  await panel.getByRole('button',{name:'새로고침',exact:true}).click();
  await expect.poll(()=>reads).toBe(status===503?3:status===401?5:7);
  await expect(panel.getByTestId('zone-tree-item')).toHaveCount(0);
  await expect(panel.getByRole('region',{name:'선택 구역 상세'})).toHaveCount(0);
  await expect(panel.getByTestId('zone-read-retry')).toBeVisible();
  await panel.getByTestId('zone-read-retry').click();
  await expect(panel.getByTestId('zone-tree-item')).toHaveCount(1);
 }
 expect(reads).toBe(8);expect(contentGets).toBe(beforeContent);
 expect(await original!.evaluate(node=>node===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
});

test('PR200 delayed old-Version ACTIVE status cannot enable current OFF Zone menu',async({page,request})=>{
 const ids:string[]=[];
 for(const suffix of ['old','current']){
  const response=await request.post('/api/cad-files',{multipart:{
   file:{name:`pr200-${suffix}.dxf`,mimeType:'application/octet-stream',buffer:dxf},
   ...(await masterFields(request,{businessUnit:`pr200-${suffix}`,site:'pr200-scope',building:'A',floor:'1'})),
   registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);ids.push((await response.json()).id);
 }
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 let held=0,settled=0,currentZoneGets=0;
 page.on('request',req=>{if(new URL(req.url()).pathname===`/api/cad-files/${ids[1]}/zones`)currentZoneGets++;});
 await page.route('**/api/g7-runtime/status',async route=>{
  if(route.request().frame().url().includes(`/cad/versions/${ids[0]}/viewer`)){
   held++;await gate;
   try{await route.fulfill({status:200,json:{state:'ACTIVE',authEnabled:true,cadWriteEnabled:false}});}catch{/* old page aborted */}
   finally{settled++;}
  }else await route.fulfill({status:200,json:{state:'OFF',authEnabled:false,cadWriteEnabled:false}});
 });
 await page.goto(`/cad/versions/${ids[0]}/viewer?renderer=three-dxf-viewer`);
 await expect.poll(()=>held).toBeGreaterThan(0);
 await page.goto(`/cad/versions/${ids[1]}/viewer?renderer=three-dxf-viewer`);
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 release();await expect.poll(()=>settled).toBe(held);
 await openViewerMenu(page,'work');
 await expect(page.getByTestId('viewer-menu-zone-list')).toHaveAttribute('aria-disabled','true');
 await expect(page.getByTestId('viewer-menu-zone-list')).toHaveAttribute('title',/G7.*OFF/);
 expect(currentZoneGets).toBe(0);
});
