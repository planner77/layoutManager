import { clickViewerCommand, clickViewerTestCommand, openViewerMenu } from './viewer-menu-helper';
import {expect,test,type APIRequestContext,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {masterFields} from './master-helper';

const drawing=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));
async function createDrawing(request:APIRequestContext,name:string){
  const result=await request.post('/api/cad-files',{multipart:{
    file:{name:name+'.dxf',mimeType:'application/octet-stream',buffer:drawing},
    ...(await masterFields(request,{businessUnit:name,site:'issue51',building:'A',floor:'1'})),
    registeredAt:'2026-10-25',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(result.status()).toBe(201);
  return (await result.json()) as {id:string};
}
async function dragCanvas(page:Page,fromRight=false,ctrl=false){
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  const box=await canvas.boundingBox();
  expect(box).not.toBeNull();
  if(ctrl)await page.keyboard.down('Control');
  const left=box!.x+5,right=box!.x+box!.width-5;
  const y1=box!.y+5,y2=box!.y+box!.height-5;
  await page.mouse.move(fromRight?right:left,fromRight?y2:y1);
  await page.mouse.down();
  await page.mouse.move(fromRight?left:right,fromRight?y1:y2,{steps:8});
  await page.mouse.up();
  if(ctrl)await page.keyboard.up('Control');
}
async function createOutlines(page:Page){
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  await dragCanvas(page);
  const tools=page.getByTestId('cad-outline-tools');
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
  for(const name of ['볼록 외곽선 미리보기','정밀 외곽선 미리보기']){
    await tools.getByRole('button',{name}).click();
    await expect(page.getByTestId('outline-preview')).toBeVisible();
    await tools.getByRole('button',{name:'임시 확정'}).click();
  }
  await expect(page.getByTestId('outline-saved-tools')).toHaveCount(0);
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  await expect(page.getByTestId('outline-saved-tools')).toContainText('2건');
}

test('TC-E1-E2E-001: SOURCE + 2 GENERATED unified range, tree and readonly gate',async({page,request})=>{
  const file=await createDrawing(request,'issue51-mixed');
  let downloads=0;
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/cad-files/'+file.id+'/content')downloads++;});
  await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page, 'viewer-menu-tools');
  await expect(page.getByTestId('canvas-mode-pan')).toHaveAttribute('aria-pressed','true');
  await createOutlines(page);
  await clickViewerTestCommand(page, 'viewer-menu-outline-tree');
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(2);
  await page.getByTestId('canvas-mode-objects').click();
  await dragCanvas(page);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 3개 · 원본 1개 · 생성 2개');
  await expect(page.getByTestId('canvas-edit-gate')).toHaveAttribute('data-edit-enabled','false');
  await expect(page.getByTestId('canvas-edit-gate')).toContainText('혼합 선택');
  // Ctrl/Meta tree multi-select reuses the same selection controller and canvas highlight.
  const first=page.getByTestId('outline-tree-item').first();
  const second=page.getByTestId('outline-tree-item').last();
  await first.click();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개 · 원본 0개 · 생성 1개');
  await second.click({modifiers:['Control']});
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 2개 · 원본 0개 · 생성 2개');
  await expect(page.getByTestId('canvas-edit-gate')).toHaveAttribute('data-edit-enabled','true');
  await expect(first).toHaveAttribute('aria-selected','true');
  await expect(second).toHaveAttribute('aria-selected','true');
  const exported=page.waitForEvent('download');
  await page.getByTestId('outline-saved-tools').getByRole('button',{name:/JSON 내보내기/}).click();
  const payload=JSON.parse(await readFile(await (await exported).path(),'utf8'));
  expect(payload.schemaVersion).toBe(1);
  expect(payload.outlines.map((x:{id:string})=>x.id)).toEqual(['local-1','local-2']);
  expect(payload.outlines[0]).not.toHaveProperty('ref');
  expect(downloads).toBe(1);
});

test('TC-E1-E2E-002: hidden overlays/source layers drop selection and reset on reload',async({page,request})=>{
  const file=await createDrawing(request,'issue51-hidden');
  await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await createOutlines(page);
  await clickViewerTestCommand(page, 'viewer-menu-outline-tree');
  await page.getByTestId('canvas-mode-objects').click();
  await dragCanvas(page);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 3개');
  const layer=page.getByRole('complementary',{name:'전체 화면 레이어'}).getByRole('checkbox',{name:'EQUIP'});
  await layer.uncheck();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 2개 · 원본 0개 · 생성 2개');
  await page.getByTestId('outline-tree-item').first().getByRole('button',{name:'외곽선 1 숨기기'}).click();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개 · 원본 0개 · 생성 1개');
  await expect(page.getByTestId('outline-tree-item').first()).toHaveAttribute('aria-selected','false');
  await page.getByTestId('canvas-mode-generated').click();
  await dragCanvas(page,true);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개 · 원본 0개 · 생성 1개');
  await page.getByTestId('canvas-mode-pan').click();
  await page.getByTestId('cad-viewer-shell').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 0개');
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('임시 외곽선'); await dialog.accept(); });
  await clickViewerCommand(page, 'drawing', '다시 불러오기');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page, 'viewer-menu-tools');
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 0개');
  await clickViewerTestCommand(page, 'viewer-menu-outline-tree');
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(0);
  await expect(page.getByTestId('canvas-mode-pan')).toHaveAttribute('aria-pressed','true');
});

test('TC-E1-E2E-003: non-three renderer has no editable object modes',async({page,request})=>{
  const file=await createDrawing(request,'issue51-unsupported');
  await page.goto('/cad/versions/'+file.id+'/viewer?renderer=dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('cad-object-selection-tools')).toHaveCount(0);
  await expect(page.getByTestId('canvas-mode-objects')).toHaveCount(0);
  await openViewerMenu(page, 'work');
  await expect(page.getByTestId('viewer-menu-outline-tool')).toBeDisabled();
});
