import {expect,test} from '@playwright/test';
import {createHash} from 'node:crypto';
import {masterFields} from './master-helper';
import {openViewerMenu} from './viewer-menu-helper';

const dxf=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES','0','LINE','5','QA1','8','ZONE','10','0','20','0','11','100','21','100',
 '0','ENDSEC','0','EOF',''].join('\n'));

test('#196 QA: mobile zone drawer and tree keyboard navigation',async({page,request})=>{
 const upload=await request.post('/api/cad-files',{multipart:{
  file:{name:'zone-qa.dxf',mimeType:'application/octet-stream',buffer:dxf},
  ...(await masterFields(request,{businessUnit:'zone-qa',site:'zone-site',building:'A',floor:'1'})),
  registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(upload.status(),await upload.text()).toBe(201);
 const file=await upload.json() as {id:string};
 const versionId=file.id;
 const sourceSha256=createHash('sha256').update(dxf).digest('hex');
 const zone=(id:string,name:string)=>({id,locationId:'qa-floor',siteId:'qa-site',name,categoryId:null,
  description:'',code:'',tags:[],sortOrder:0,parentZoneId:null,references:[],revision:1,
  createdById:'qa-actor',updatedById:'qa-actor',createdAt:'2026-11-01',updatedAt:'2026-11-01',geometry:null});
 // The synthetic Zone envelope represents an explicitly ACTIVE G7 viewer.
 await page.route('**/api/g7-runtime/status',route=>route.fulfill({status:200,json:{
  state:'ACTIVE',authEnabled:true,cadWriteEnabled:true,
 }}));
 await page.route(`**/api/cad-files/${versionId}/zones`,route=>route.fulfill({json:{
  zones:[zone('qa-zone-1','QA Alpha'),zone('qa-zone-2','QA Beta')],categories:[],actorId:'qa-actor',
  canEdit:true,canDeleteAny:false,canManageCategories:false,locationId:'qa-floor',siteId:'qa-site',
  versionId,sourceSha256,sceneRevision:0,
 }}));

 for(const width of [320,375]){
  await page.setViewportSize({width,height:800});
  await page.goto(`/cad/versions/${versionId}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page,'work');
  const list=page.getByTestId('viewer-menu-zone-list');
  await expect(list).toBeEnabled();
  await list.click();
  const drawer=page.getByTestId('viewer-zone-dock');
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId('cad-zone-panel')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x','scroll');
  const alpha=page.getByTestId('zone-tree-item').filter({hasText:'QA Alpha'});
  const beta=page.getByTestId('zone-tree-item').filter({hasText:'QA Beta'});
  await alpha.focus();
  await page.keyboard.press('ArrowDown');
  await expect(beta).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
 }
});
