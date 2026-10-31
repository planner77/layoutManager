import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {clickViewerCommand,openViewerMenu,clickViewerTestCommand} from './viewer-menu-helper';
import {masterFields} from './master-helper';

const dxf=Buffer.from([
 '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES',
 '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
 '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
 '0','ENDSEC','0','EOF','',
].join('\n'));
type Polygon={type:'Polygon';coordinates:number[][][]};
type Transfer={
 format:string;schemaVersion:number;versionId:string;sourceSha256:string;
 objects:Array<{id:string;savedOutlineId:string;baseGeometry:Polygon;
   editedGeometry:Polygon;transform:number[];transformOperations:unknown[];
   origin:string;visible:boolean}>;
};
async function setup(request:APIRequestContext,name:string){
 const response=await request.post('/api/cad-files',{multipart:{
  file:{name:name+'.dxf',mimeType:'application/octet-stream',buffer:dxf},
  ...(await masterFields(request,{businessUnit:name,site:'issue55',building:'A',floor:'1'})),
  registeredAt:'2026-10-31',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(response.status()).toBe(201);
 return (await response.json()) as {id:string};
}
async function createGenerated(page:Page,count=1){
 await clickViewerTestCommand(page,'viewer-menu-outline-tool');
 const canvas=page.getByTestId('cad-canvas').locator('canvas');
 const rect=await canvas.boundingBox();expect(rect).not.toBeNull();
 await page.mouse.move(rect!.x+5,rect!.y+5);
 await page.mouse.down();await page.mouse.move(rect!.x+rect!.width-5,rect!.y+rect!.height-5,{steps:8});await page.mouse.up();
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
 const tools=page.getByTestId('cad-outline-tools');
 for(let i=0;i<count;i++){
  await tools.getByRole('button',{name:i===0?'볼록 외곽선 미리보기':'정밀 외곽선 미리보기'}).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
  await tools.getByRole('button',{name:'임시 확정'}).click();
 }
 await clickViewerTestCommand(page,'viewer-menu-outline-tool');
 await page.getByTestId('canvas-mode-generated').click();
 await clickViewerTestCommand(page,'viewer-menu-outline-tree');
 await expect(page.getByTestId('outline-tree-item')).toHaveCount(count);
}
async function exportGenerated(page:Page):Promise<Transfer>{
 const pending=page.waitForEvent('download');
 const menu=await openViewerMenu(page,'drawing');
 await menu.getByTestId('viewer-menu-generated-export').click();
 const file=await pending;
 return JSON.parse(await readFile(await file.path(),'utf8')) as Transfer;
}
function fileOf(value:unknown){
 return {name:'generated.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))};
}

test('TC-E5-E2E-001: numeric +90 CCW and group pivot, Tree/JSON/Undo/Redo',async({page,request})=>{
 const drawing=await setup(request,'issue55-e2e-numeric');
 await page.goto('/cad/versions/'+drawing.id+'/viewer?renderer=three-dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await createGenerated(page,2);
 const rows=page.getByTestId('outline-tree-item');
 await rows.first().click();await rows.last().click({modifiers:['Control']});
 await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 2개');
 const before=await exportGenerated(page);
 expect(before.format).toBe('cad-generated-objects');
 expect(before.schemaVersion).toBe(2);
 await page.getByTestId('generated-rotate-angle').fill('90');
 await page.getByTestId('generated-rotate-pivot-x').fill('0');
 await page.getByTestId('generated-rotate-pivot-y').fill('0');
 await page.getByTestId('generated-rotate-apply').click();
 await expect(page.getByTestId('generated-undo')).toContainText('(1)');
 const after=await exportGenerated(page);
 expect(after.objects.map(o=>o.id)).toEqual(before.objects.map(o=>o.id));
 for(let i=0;i<after.objects.length;i++){
  const first=before.objects[i].editedGeometry.coordinates[0][1];
  const rotated=after.objects[i].editedGeometry.coordinates[0][1];
  expect(rotated[0]).toBeCloseTo(-first[1],5);
  expect(rotated[1]).toBeCloseTo(first[0],5);
  expect(after.objects[i].transformOperations).toHaveLength(1);
 }
 await page.getByTestId('generated-undo').click();
 const undone=await exportGenerated(page);
 expect(undone.objects.map(o=>o.editedGeometry))
   .toEqual(before.objects.map(o=>o.editedGeometry));
 await page.getByTestId('generated-redo').click();
 expect((await exportGenerated(page)).objects.map(o=>o.editedGeometry))
  .toEqual(after.objects.map(o=>o.editedGeometry));
 await page.getByTestId('generated-rotate-default-pivot').click();
 expect(await page.getByTestId('generated-rotate-pivot-x').inputValue()).not.toBe('');
});

test('TC-E5-E2E-002: handle ghost ESC cancel and pointer release one Undo',async({page,request})=>{
 const drawing=await setup(request,'issue55-e2e-handle');
 await page.goto('/cad/versions/'+drawing.id+'/viewer?renderer=three-dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await createGenerated(page);
 await page.getByTestId('outline-tree-item').click();
 const handle=page.getByTestId('generated-rotate-handle');
 await expect(handle).toBeVisible();
 const h=await handle.boundingBox();expect(h).not.toBeNull();
 const x=h!.x+h!.width/2,y=h!.y+h!.height/2;
 const canvas=page.getByTestId('cad-canvas').locator('canvas');
 await page.mouse.move(x,y);await page.mouse.down();
 await page.mouse.move(x+32,y+4,{steps:8});
 await expect(canvas).toHaveAttribute('data-generated-rotate-preview',/[-0-9.]+/);
 await page.keyboard.press('Escape');
 await expect(canvas).not.toHaveAttribute('data-generated-rotate-preview');
 await page.mouse.up();
 await expect(page.getByTestId('generated-undo')).toBeDisabled();
 const h2=await handle.boundingBox();expect(h2).not.toBeNull();
 await page.mouse.move(h2!.x+h2!.width/2,h2!.y+h2!.height/2);await page.mouse.down();
 await page.mouse.move(h2!.x+h2!.width/2+32,h2!.y+h2!.height/2+4,{steps:8});
 await page.mouse.up();
 await expect(canvas).not.toHaveAttribute('data-generated-rotate-preview');
 await expect(page.getByTestId('generated-undo')).toContainText('(1)');
});

test('TC-E6-E2E-001: rejected file keeps session; v2 restores after explicit reload',async({page,request})=>{
 const drawing=await setup(request,'issue56-e2e-import');
 await page.goto('/cad/versions/'+drawing.id+'/viewer?renderer=three-dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await createGenerated(page);
 await page.getByTestId('outline-tree-item').click();
 await page.getByTestId('generated-rotate-angle').fill('90');
 await page.getByTestId('generated-rotate-apply').click();
 const data=await exportGenerated(page);
 const bad=structuredClone(data);bad.sourceSha256='b'.repeat(64);
 page.once('dialog',async dialog=>{expect(dialog.message()).toContain('교체');await dialog.accept();});
 await page.getByTestId('generated-import-input').setInputFiles(fileOf(bad));
 await expect(page.getByTestId('generated-json-message')).toContainText('기존 브라우저 작업은 유지');
 expect((await exportGenerated(page)).objects.map(o=>o.editedGeometry))
  .toEqual(data.objects.map(o=>o.editedGeometry));
 page.once('dialog',async dialog=>{expect(dialog.message()).toContain('임시');await dialog.accept();});
 await clickViewerCommand(page,'drawing','다시 불러오기');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await expect(page.getByTestId('outline-tree-item')).toHaveCount(0);
 await page.getByTestId('generated-import-input').setInputFiles(fileOf(data));
 await expect(page.getByTestId('generated-json-message')).toContainText('1개 생성 개체');
 await expect(page.getByTestId('outline-tree-item')).toHaveCount(1);
 const restored=await exportGenerated(page);
 expect(restored.objects.map(o=>o.id)).toEqual(data.objects.map(o=>o.id));
 expect(restored.objects.map(o=>o.editedGeometry))
  .toEqual(data.objects.map(o=>o.editedGeometry));
 await clickViewerCommand(page,'view','dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await expect(page.getByTestId('generated-rotate-form')).toHaveCount(0);
});
