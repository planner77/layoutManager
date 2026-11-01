import { clickViewerCommand, clickViewerTestCommand } from './viewer-menu-helper';
import {test,expect} from '@playwright/test';
import {masterFields} from './master-helper';

const dxf=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));
test('TC-E2-E2E-001: history buttons and editable text keep native Ctrl+Z, reload clears session document',async({page,request})=>{
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:'issue52-history.dxf',mimeType:'application/octet-stream',buffer:dxf},
    ...(await masterFields(request,{businessUnit:'issue52-e2e',site:'local',building:'A',floor:'1'})),
    registeredAt:'2026-10-25',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  const version=(await response.json()) as {id:string};
  await page.goto('/cad/versions/'+version.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page, 'viewer-menu-tools');
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  await expect(page.getByTestId('generated-redo')).toBeDisabled();
  await expect(page.getByTestId('generated-history-status')).toContainText('최대 100단계');
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  const rect=await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+5,rect!.y+5);
  await page.mouse.down();
  await page.mouse.move(rect!.x+rect!.width-5,rect!.y+rect!.height-5,{steps:8});
  await page.mouse.up();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
  const tools=page.getByTestId('cad-outline-tools');
  await tools.getByRole('button',{name:'볼록 외곽선 미리보기'}).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
  await tools.getByRole('button',{name:'임시 확정'}).click();
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  await expect(page.getByTestId('outline-saved-tools')).toContainText('1건');
  await page.getByTestId('canvas-mode-generated').click();
  // Tool/zoom/selection are not editing commands and must not populate history.
  await clickViewerCommand(page, 'view', '확대');
  await clickViewerTestCommand(page, 'viewer-menu-outline-tree');
  await page.getByTestId('outline-tree-item').click();
  await expect(page.getByTestId('canvas-edit-gate')).toHaveAttribute('data-edit-enabled','true');
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  await page.getByTestId('cad-viewer-shell').focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(1);
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  // Closing a menu returns focus to its trigger on the next animation frame.
  await expect(page.locator('[data-viewer-group="work"]')).toBeFocused();
  const input=page.getByTestId('outline-instance-name');
  await input.focus();
  await expect(input).toBeFocused();
  await page.evaluate(()=>{
    const input=document.querySelector<HTMLInputElement>('[data-testid="outline-instance-name"]');
    if(!input)return;
    input.setAttribute('data-input-keydown','pending');
    input.setAttribute('data-window-keydown','pending');
    input.addEventListener('keydown',event=>{
      if(event.key.toLowerCase()==='z'&&event.ctrlKey)
        input.setAttribute('data-input-keydown',event.defaultPrevented?'blocked':'native');
    });
    const observeWindowKeydown=(event:KeyboardEvent)=>{
      if(event.key.toLowerCase()==='z'&&event.ctrlKey){
        input.setAttribute('data-window-keydown',event.target===input&&!event.defaultPrevented?'native':'blocked');
        window.removeEventListener('keydown',observeWindowKeydown);
      }
    };
    window.addEventListener('keydown',observeWindowKeydown);
  });
  await page.keyboard.press('Control+z');
  await expect(input).toHaveAttribute('data-input-keydown','native');
  await expect(input).toHaveAttribute('data-window-keydown','native');
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('임시 외곽선'); await dialog.accept(); });
  await clickViewerCommand(page, 'drawing', '다시 불러오기');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page, 'viewer-menu-tools');
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  await expect(page.getByTestId('generated-redo')).toBeDisabled();
  await clickViewerTestCommand(page, 'viewer-menu-outline-tree');
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(0);
});

test('TC-E2-E2E-002: unsupported DXF renderer never offers generated history',async({page,request})=>{
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:'issue52-unsupported.dxf',mimeType:'application/octet-stream',buffer:dxf},
    ...(await masterFields(request,{businessUnit:'issue52-unsupported',site:'local',building:'A',floor:'1'})),
    registeredAt:'2026-10-25',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  const version=(await response.json()) as {id:string};
  await page.goto('/cad/versions/'+version.id+'/viewer?renderer=dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('generated-history-status')).toHaveCount(0);
  await expect(page.getByTestId('generated-undo')).toHaveCount(0);
});
