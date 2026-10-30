import { clickViewerCommand, clickViewerTestCommand } from './viewer-menu-helper';
import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {masterFields} from './master-helper';

const dxf=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));
async function drawing(request:APIRequestContext,name:string){
  const result=await request.post('/api/cad-files',{multipart:{
    file:{name:name+'.dxf',mimeType:'application/octet-stream',buffer:dxf},
    ...(await masterFields(request,{businessUnit:name,site:'issue53',building:'A',floor:'1'})),
    registeredAt:'2026-10-25',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(result.status()).toBe(201);
  return (await result.json()) as {id:string};
}
async function selectSource(page:Page){
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  const rect=await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+5,rect!.y+5);
  await page.mouse.down();
  await page.mouse.move(rect!.x+rect!.width-5,rect!.y+rect!.height-5,{steps:8});
  await page.mouse.up();
}
async function createGenerated(page:Page,count:number){
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  // Preserve the legacy v1 source-derived export regression.
  await page.getByTestId('outline-basis').selectOption('source');
  await selectSource(page);
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
  const tools=page.getByTestId('cad-outline-tools');
  for(let i=0;i<count;i++){
    await tools.getByRole('button',{name:i%2===0?'볼록 외곽선 미리보기':'정밀 외곽선 미리보기'}).click();
    await expect(page.getByTestId('outline-preview')).toBeVisible();
    await tools.getByRole('button',{name:'임시 확정'}).click();
  }
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  await page.getByTestId('canvas-mode-generated').click();
  await clickViewerTestCommand(page, 'viewer-menu-outline-tree');
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(count);
}
test('TC-E3-E2E-001: tree single delete, Undo/Redo and exported JSON follow Document',async({page,request})=>{
  const file=await drawing(request,'issue53-single');
  await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await createGenerated(page,3);
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  const panel=page.getByTestId('viewer-outline-tree');
  await expect(panel.getByTestId('outline-tree-delete')).toHaveCount(3);
  await panel.getByTestId('outline-tree-item').nth(1).getByRole('button',{name:'외곽선 2 삭제'}).click();
  const dialog=page.getByTestId('generated-delete-dialog');
  await expect(dialog).toContainText('생성 개체 1개 삭제 확인');
  await expect(dialog.getByTestId('generated-delete-targets')).toContainText('외곽선 2 (local-2)');
  await dialog.getByRole('button',{name:'삭제 취소'}).click();
  await expect(panel.getByTestId('outline-tree-item')).toHaveCount(3);
  await expect(page.getByTestId('generated-undo')).toBeDisabled();

  await panel.getByTestId('outline-tree-item').nth(1).getByRole('button',{name:'외곽선 2 삭제'}).click();
  await dialog.getByTestId('generated-delete-confirm').click();
  await expect(panel.getByTestId('outline-tree-item')).toHaveCount(2);
  await expect(panel.getByTestId('outline-tree-item').first()).toContainText('외곽선 1');
  await expect(panel.getByTestId('outline-tree-item').last()).toContainText('외곽선 3');
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 0개');
  await expect(canvas).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByTestId('outline-saved-tools').getByRole('button',{name:/JSON 내보내기/}).click();
  const saved=JSON.parse(await readFile(await (await download).path(),'utf8'));
  expect(saved.schemaVersion).toBe(1);
  expect(saved.outlines.map((o:{id:string})=>o.id)).toEqual(['local-1','local-3']);

  await page.getByTestId('generated-undo').click();
  await expect(panel.getByTestId('outline-tree-item')).toHaveCount(3);
  await page.getByTestId('generated-redo').click();
  await expect(panel.getByTestId('outline-tree-item')).toHaveCount(2);
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  await selectSource(page);
  await page.getByTestId('cad-outline-tools').getByRole('button',{name:'볼록 외곽선 미리보기'}).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
  await page.getByTestId('cad-outline-tools').getByRole('button',{name:'임시 확정'}).click();
  await expect(panel.getByTestId('outline-tree-item')).toHaveCount(3);
  await expect(panel.getByTestId('outline-tree-item').last()).toContainText('외곽선 4');
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
});
test('TC-E3-E2E-002: multi-select cancel/confirm, Canvas keyboard, Escape and native input isolation',async({page,request})=>{
  const file=await drawing(request,'issue53-multiple');
  await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await createGenerated(page,3);
  const rows=page.getByTestId('outline-tree-item');
  await rows.first().click();
  await rows.last().click({modifiers:['Control']});
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 2개 · 원본 0개 · 생성 2개');
  await page.getByTestId('generated-delete-selected').click();
  const dialog=page.getByTestId('generated-delete-dialog');
  await expect(dialog).toContainText('생성 개체 2개 삭제 확인');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // Escape cancels only the modal; the current multi-selection must remain intact.
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 2개 · 원본 0개 · 생성 2개');
  await expect(page.getByTestId('generated-delete-selected')).toBeEnabled();
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
  await expect(rows).toHaveCount(3);
  await page.getByTestId('generated-delete-selected').click();
  await dialog.getByTestId('generated-delete-confirm').click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 0개');
  await page.getByTestId('generated-undo').click();
  await expect(rows).toHaveCount(3);
  await page.getByTestId('generated-redo').click();
  await expect(rows).toHaveCount(1);

  // Tree click selects the only remaining confirmed object, canvas focus enables Delete.
  await rows.first().click();
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.focus();
  await page.keyboard.press('Backspace');
  await expect(dialog).toContainText('생성 개체 1개 삭제 확인');
  await dialog.getByTestId('generated-delete-confirm').click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByTestId('outline-tree-empty')).toBeVisible();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 0개');
  await page.getByTestId('generated-undo').click();
  await expect(rows).toHaveCount(1);

  // Native form editing must not open a delete dialog.
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  const input=page.getByTestId('outline-instance-name');
  await input.fill('삭제 금지 입력');
  await input.focus();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(1);
});
test('TC-E3-E2E-003: SOURCE/mixed and pan fail closed, selected shape context and renderer reload cleanup',async({page,request})=>{
  const file=await drawing(request,'issue53-gate');
  await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await createGenerated(page,2);
  const rows=page.getByTestId('outline-tree-item');
  await page.getByTestId('canvas-mode-objects').click();
  await selectSource(page);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 3개 · 원본 1개 · 생성 2개');
  await expect(page.getByTestId('generated-delete-selected')).toBeDisabled();
  await expect(page.getByTestId('canvas-edit-gate')).toContainText('읽기 전용');
  await expect(rows.first().getByTestId('outline-tree-delete')).toBeDisabled();

  await page.getByTestId('canvas-mode-generated').click();
  await rows.first().click();
  await expect(page.getByTestId('generated-delete-selected')).toBeEnabled();
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  await canvas.click({button:'right',position:{
    x:(await canvas.boundingBox())!.width/2,y:(await canvas.boundingBox())!.height/2,
  }});
  await expect(page.getByTestId('generated-context-delete')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('generated-context-menu')).toHaveCount(0);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개 · 원본 0개 · 생성 1개');
  await canvas.click({button:'right',position:{
    x:(await canvas.boundingBox())!.width/2,y:(await canvas.boundingBox())!.height/2,
  }});
  await expect(page.getByTestId('generated-context-delete')).toBeVisible();
  await page.getByTestId('generated-context-delete').click();
  await expect(page.getByTestId('generated-delete-dialog')).toBeVisible();
  await page.getByTestId('generated-delete-dialog').getByRole('button',{name:'삭제 취소'}).click();
  await expect(rows).toHaveCount(2);
  await page.getByTestId('canvas-mode-pan').click();
  await expect(page.getByTestId('generated-delete-selected')).toBeDisabled();
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('임시 외곽선'); await dialog.accept(); });
  await clickViewerCommand(page, 'drawing', '다시 불러오기');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page, 'viewer-menu-outline-tree');
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(0);
  await clickViewerCommand(page, 'view', 'dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('generated-delete-selected')).toHaveCount(0);
});
