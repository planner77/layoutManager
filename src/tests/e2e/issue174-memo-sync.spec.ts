import {expect,test,type APIRequestContext,type Page} from '@playwright/test';
import {createHash,randomUUID} from 'node:crypto';
import {GeneratedDocument} from '../../domain/generated-document';
import {buildGeneratedTransfer} from '../../domain/generated-transfer';
import {masterFields} from './master-helper';
import {clickViewerCommand,clickViewerTestCommand} from './viewer-menu-helper';

const dxf=Buffer.from([
 '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES',
 '0','LWPOLYLINE','5','BOX','8','BOUNDS','90','4','70','1',
 '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
 '0','LINE','5','A1','8','FIRST','10','0','20','0','11','100','21','0',
 '0','LINE','5','A1','8','SECOND','10','0.6','20','0','11','100','21','10',
 '0','ENDSEC','0','EOF','',
].join('\n'));
const blockDxf=Buffer.from([
 '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','BLOCKS',
 '0','BLOCK','2','REPEATED','70','0','10','0','20','0','30','0',
 '0','LINE','5','B1','8','BLOCK_PART','10','0','20','0','11','20','21','0','0','ENDBLK',
 '0','ENDSEC','0','SECTION','2','ENTITIES',
 '0','LWPOLYLINE','5','F1','8','BOUNDS','90','4','70','1',
 '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
 '0','INSERT','5','C1','8','INSTANCES','2','REPEATED','10','0','20','0','30','0',
 '0','INSERT','5','C2','8','INSTANCES','2','REPEATED','10','0.6','20','0','30','0',
 '0','ENDSEC','0','EOF','',
].join('\n'));

async function drawing(api:APIRequestContext,tag:string,bytes=dxf){
 const response=await api.post('/api/cad-files',{multipart:{
  file:{name:tag+'.dxf',mimeType:'application/octet-stream',buffer:bytes},
  ...(await masterFields(api,{businessUnit:tag,site:'memo-sync',building:'A',floor:'1'})),
  registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(response.status()).toBe(201);return (await response.json()) as {id:string};
}
async function ready(page:Page,id:string){
 await page.goto('/cad/versions/'+id+'/viewer?renderer=three-dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
}
async function stage(page:Page,title:string,x='0.1',y='0'){
 await clickViewerTestCommand(page,'viewer-menu-memo-add');
 await page.getByTestId('cad-memo-title').fill(title);
 await page.getByTestId('cad-memo-x').fill(x);await page.getByTestId('cad-memo-y').fill(y);
 await page.getByTestId('cad-memo-coordinate-place').click();
}
async function candidates(page:Page){
 return page.getByTestId('cad-memo-snap-select').locator('option').evaluateAll(nodes=>nodes.slice(1).map(node=>{
  const option=node as HTMLOptionElement;
  const [origin,id,kind,index]=JSON.parse(option.value) as [string,string,string,number];
  return {value:option.value,origin,id,kind,index,label:option.textContent??''};
 }));
}
const pin=(page:Page,title:string)=>page.getByTestId('cad-memo-pin').filter({hasText:title});
async function world(page:Page,title:string){
 const item=pin(page,title);return {x:Number(await item.getAttribute('data-memo-wcs-x')),
  y:Number(await item.getAttribute('data-memo-wcs-y'))};
}
async function selectAllRender(page:Page){
 const canvas=page.getByTestId('cad-canvas').locator('canvas');
 await canvas.scrollIntoViewIfNeeded();await expect(canvas).toBeInViewport({ratio:1});
 const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+5,box.y+5);await page.mouse.down();
 await page.mouse.move(box.x+box.width-5,box.y+box.height-5,{steps:8});await page.mouse.up();
}

test('R4 browser repeated LINE Handles remain distinct and bound Memo follows SceneWork Undo/Redo',async({page,request})=>{
 test.setTimeout(90_000);const version=await drawing(request,'r4-render-sync');await ready(page,version.id);
 await stage(page,'R4 render sync');
 const choices=(await candidates(page)).filter(c=>c.origin==='RENDER'&&c.kind==='ENDPOINT');
 expect(new Set(choices.map(c=>c.id)).size).toBeGreaterThanOrEqual(2);
 const selected=choices.find(c=>c.index===0);expect(selected).toBeTruthy();
 await page.getByTestId('cad-memo-snap-select').selectOption(selected!.value);
 await page.getByTestId('cad-memo-create').click();
 await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
 const initial=await world(page,'R4 render sync');
 await page.getByTestId('cad-memo-cancel').click();
 await page.getByTestId('canvas-mode-objects').click();await selectAllRender(page);
 await expect(page.getByTestId('scene-work-translate')).toBeEnabled();
 await page.locator('#scene-work-dx').fill('5');await page.locator('#scene-work-dy').fill('0');
 await page.getByTestId('scene-work-translate').click();
 await expect.poll(async()=>(await world(page,'R4 render sync')).x).toBeCloseTo(initial.x+5,5);
 await page.getByTestId('scene-work-undo').click();
 await expect.poll(async()=>(await world(page,'R4 render sync')).x).toBeCloseTo(initial.x,5);
 await page.getByTestId('scene-work-redo').click();
 await expect.poll(async()=>(await world(page,'R4 render sync')).x).toBeCloseTo(initial.x+5,5);
});

test('R4 browser repeated BLOCK definition produces distinct INSERT instance candidates',async({page,request})=>{
 test.setTimeout(60_000);const version=await drawing(request,'r4-block-instances',blockDxf);
 await ready(page,version.id);
 const layers=page.getByRole('complementary',{name:'전체 화면 레이어'});
 await layers.getByRole('checkbox',{name:'BOUNDS',exact:true}).uncheck();
 await stage(page,'R4 block instance');
 const choices=(await candidates(page)).filter(c=>c.origin==='RENDER'&&c.kind==='ENDPOINT');
 const first=choices.find(c=>c.label.includes('(0.000000'));
 expect(first).toBeTruthy();
 const second=choices.find(c=>c.label.includes('0.6000000'));expect(second).toBeTruthy();
 expect(second!.id).not.toBe(first!.id);
 expect(new Set(choices.map(c=>c.id)).size).toBeGreaterThanOrEqual(2);
 await page.getByTestId('cad-memo-snap-select').selectOption(second!.value);
 await page.getByTestId('cad-memo-create').click();
 expect((await world(page,'R4 block instance')).x).toBeCloseTo(0.6,5);
 await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
});

test('R4 browser two GENERATED bindings follow group Translate/Rotate/Undo/Redo and exact-ID Delete→BROKEN→Undo',async({page,request})=>{
 test.setTimeout(90_000);const version=await drawing(request,'r4-generated-sync');await ready(page,version.id);
 const scope={versionId:version.id,sourceSha256:createHash('sha256').update(dxf).digest('hex')};
 const doc=new GeneratedDocument(scope),ids=[randomUUID(),randomUUID()];
 for(const [index,id] of ids.entries()){
  const x=index*20;
  doc.append({id,savedOutlineId:'local-'+(index+1),createdAt:new Date().toISOString(),result:{
   kind:'CONVEX',algorithm:'synthetic-wcs-v1',geometryBasis:'RENDER_WCS_2D',persistable:false,
   geometry:{type:'Polygon',coordinates:[[[x,0],[x+10,0],[x+10,10],[x,0]]]},
   sourceEntityIds:[],warnings:[],tolerance:0.02,durationMs:0}});
 }
 await page.getByTestId('generated-import-input').setInputFiles({name:'r4-generated-sync.json',
  mimeType:'application/json',buffer:Buffer.from(JSON.stringify(buildGeneratedTransfer(doc,4)))});
 await expect(page.getByTestId('generated-json-message')).toContainText('2개 생성 개체를 복원');
 await stage(page,'R4 generated sync');
 const chosen=(await candidates(page)).find(c=>c.origin==='GENERATED'&&c.id===ids[0]);
 expect(chosen).toBeTruthy();
 await page.getByTestId('cad-memo-snap-select').selectOption(chosen!.value);
 await page.getByTestId('cad-memo-create').click();
 await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
 const initial=await world(page,'R4 generated sync');
 await page.getByTestId('cad-memo-cancel').click();
 await stage(page,'R4 generated second','20.1','0');
 const secondChoice=(await candidates(page)).find(c=>c.origin==='GENERATED'&&c.id===ids[1]);
 expect(secondChoice).toBeTruthy();
 await page.getByTestId('cad-memo-snap-select').selectOption(secondChoice!.value);
 await page.getByTestId('cad-memo-create').click();
 const initialSecond=await world(page,'R4 generated second');
 await page.getByTestId('cad-memo-cancel').click();
 await page.getByRole('button',{name:'R4 generated sync',exact:true}).click();
 await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
 await page.getByTestId('cad-memo-cancel').click();
 await page.getByRole('button',{name:'R4 generated second',exact:true}).click();
 await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
 await page.getByTestId('cad-memo-cancel').click();
 await page.getByTestId('canvas-mode-generated').click();
 await clickViewerTestCommand(page,'viewer-menu-outline-tree');
 const rows=page.getByTestId('outline-tree-item'),row=rows.first();
 await row.click();await rows.last().click({modifiers:['Control']});
 await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 2개');
 await clickViewerCommand(page,'view','화면 맞춤');
 await expect(page.getByTestId('generated-translate-apply')).toBeEnabled();
 await page.getByTestId('generated-translate-x').fill('5');
 await page.getByTestId('generated-translate-y').fill('0');
 await page.getByTestId('generated-translate-apply').click();
 await clickViewerCommand(page,'view','화면 맞춤');
 await expect.poll(async()=>(await world(page,'R4 generated sync')).x).toBeCloseTo(initial.x+5,5);
 await expect.poll(async()=>(await world(page,'R4 generated second')).x).toBeCloseTo(initialSecond.x+5,5);
 await page.getByTestId('generated-rotate-angle').fill('90');
 await page.getByTestId('generated-rotate-pivot-x').fill('0');
 await page.getByTestId('generated-rotate-pivot-y').fill('0');
 await page.getByTestId('generated-rotate-apply').click();
 await clickViewerCommand(page,'view','화면 맞춤');
 await expect.poll(async()=>(await world(page,'R4 generated sync')).y).toBeCloseTo(initial.x+5,5);
 await expect.poll(async()=>(await world(page,'R4 generated second')).y).toBeCloseTo(initialSecond.x+5,5);
 await page.getByTestId('generated-undo').click();
 await clickViewerCommand(page,'view','화면 맞춤');
 await expect.poll(async()=>(await world(page,'R4 generated sync')).x).toBeCloseTo(initial.x+5,5);
 await page.getByTestId('generated-undo').click();
 await clickViewerCommand(page,'view','화면 맞춤');
 await expect.poll(async()=>(await world(page,'R4 generated sync')).x).toBeCloseTo(initial.x,5);
 await expect.poll(async()=>(await world(page,'R4 generated second')).x).toBeCloseTo(initialSecond.x,5);
 await page.getByTestId('generated-redo').click();
 await page.getByTestId('generated-redo').click();
 await clickViewerCommand(page,'view','화면 맞춤');
 await expect.poll(async()=>(await world(page,'R4 generated sync')).y).toBeCloseTo(initial.x+5,5);
 await row.getByTestId('outline-tree-delete').click();
 await page.getByTestId('generated-delete-dialog').getByTestId('generated-delete-confirm').click();
 const last=await world(page,'R4 generated sync');
 const stillAttached=await world(page,'R4 generated second');
 await page.getByTestId('viewer-tools-dock').getByRole('button',{name:'도구 닫기',exact:true}).click();
 await pin(page,'R4 generated sync').click();
 await expect(page.getByTestId('cad-memo-session-snap')).toContainText('연결 객체 없음');
 await page.getByTestId('cad-memo-cancel').click();
 await page.getByTestId('generated-undo').click();
 await expect.poll(async()=>(await world(page,'R4 generated sync')).x).toBeCloseTo(last.x,5);
 expect(await world(page,'R4 generated second')).toEqual(stillAttached);
 await page.getByTestId('viewer-tools-dock').getByRole('button',{name:'도구 닫기',exact:true}).click();
 await pin(page,'R4 generated sync').click();
 await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
});
