import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { masterFields } from './master-helper';
import { clickViewerCommand, clickViewerTestCommand, openViewerMenu } from './viewer-menu-helper';

const dxf=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));

async function drawing(request:APIRequestContext,tag:string){
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:tag+'.dxf',mimeType:'application/octet-stream',buffer:dxf},
    ...(await masterFields(request,{businessUnit:tag,site:'memo-m1',building:'A',floor:'1'})),
    registeredAt:'2026-10-25',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  return (await response.json()) as {id:string};
}
async function openThree(page:Page,id:string){
  await page.goto('/cad/versions/'+id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page,'work');
  await expect(page.getByTestId('viewer-menu-memo-add')).toBeEnabled();
}
async function createAt(page:Page,x:string,y:string,title='메모1',content='첫 줄\n두번째'){
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await page.getByTestId('cad-memo-title').fill(title);
  await page.getByTestId('cad-memo-content').fill(content);
  await page.getByTestId('cad-memo-x').fill(x);
  await page.getByTestId('cad-memo-y').fill(y);
  await page.getByTestId('cad-memo-coordinate-place').click();
  await expect(page.getByTestId('cad-memo-candidate-wcs')).toBeVisible();
  await page.getByTestId('cad-memo-create').click();
  await expect(page.getByTestId('cad-memo-status')).toContainText('1/100');
}
test('TC-M1-E2E-001: WCS memo survives zoom/pan/CSS fullscreen and text-only changes',async({page,request})=>{
  const version=await drawing(request,'issue82-wcs');
  await openThree(page,version.id);
  await createAt(page,'10','20','작업 지시','점검\n이상 없음');
  const pin=page.getByTestId('cad-memo-pin');
  await expect(pin).toHaveAttribute('data-memo-wcs-x','10');
  await expect(pin).toHaveAttribute('data-memo-wcs-y','20');
  await page.getByTestId('cad-memo-title').fill('<b>실행 금지</b>');
  await page.getByTestId('cad-memo-content').fill('<img src=x onerror=alert(1)>');
  // Even an edited coordinate field MUST NOT be implicitly saved by text editing.
  await page.getByTestId('cad-memo-x').fill('999');
  await page.getByTestId('cad-memo-y').fill('999');
  await page.getByTestId('cad-memo-save-text').click();
  await expect(pin).toHaveAttribute('data-memo-wcs-x','10');
  await expect(pin).toHaveAttribute('data-memo-wcs-y','20');
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  await clickViewerCommand(page,'view','확대');
  await clickViewerCommand(page,'view','확대');
  // Pan with the actual OrbitControls canvas (not the memo pin) while zoomed.
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  const rect=await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+rect!.width/2,rect!.y+rect!.height/2);
  await page.mouse.down();
  await page.mouse.move(rect!.x+rect!.width/2+30,rect!.y+rect!.height/2-20,{steps:5});
  await page.mouse.up();
  // Pins outside the viewport may be culled; fit restores them without changing WCS.
  await clickViewerCommand(page,'view','화면 맞춤');
  await expect(pin).toHaveAttribute('data-memo-wcs-x','10');
  await clickViewerCommand(page,'view','전체 화면 종료');
  await expect(pin).toHaveAttribute('data-memo-wcs-y','20');
  await clickViewerCommand(page,'view','전체 화면');
  await page.setViewportSize({width:390,height:844});
  // The work Drawer becomes modal on mobile and makes the header inert.
  // Wait for the responsive transition, then close the real dialog before
  // using the top-level View menu. Do not force a click through the modal.
  const mobileTools=page.getByTestId('viewer-tools-dock');
  await expect(mobileTools).toHaveAttribute('role','dialog');
  await expect(mobileTools).toBeVisible();
  const header=page.getByTestId('cad-viewer-shell').locator('header');
  await expect(header).toHaveJSProperty('inert',true);
  await mobileTools.getByRole('button',{name:'도구 닫기'}).click();
  await expect(mobileTools).toHaveCount(0);
  await expect(header).toHaveJSProperty('inert',false);
  await clickViewerCommand(page,'view','화면 맞춤');
  await expect(pin).toHaveAttribute('data-memo-wcs-x','10');
  await page.setViewportSize({width:1280,height:820});
  // The mobile modal Drawer may close the edit pane; reselect its session pin.
  await pin.click();
  await expect(page.getByTestId('cad-memo-editor')).toBeVisible();
  await page.getByTestId('cad-memo-x').fill('13');
  await page.getByTestId('cad-memo-y').fill('15');
  await page.getByTestId('cad-memo-apply-position').click();
  await expect(pin).toHaveAttribute('data-memo-wcs-x','13');
  await expect(pin).toHaveAttribute('data-memo-wcs-y','15');
  await page.getByTestId('cad-memo-content').fill('텍스트를 다시 바꿔도 위치 그대로');
  await page.getByTestId('cad-memo-save-text').click();
  await expect(pin).toHaveAttribute('data-memo-wcs-x','13');
  await expect(pin).toHaveAttribute('data-memo-wcs-y','15');
});
test('TC-M1-E2E-002: drag cancellation, invalid coordinates, explicit release and reload destruction',async({page,request})=>{
  const version=await drawing(request,'issue82-cancel');
  await openThree(page,version.id);
  await createAt(page,'50','50','드래그 시험');
  const pin=page.getByTestId('cad-memo-pin');
  await pin.scrollIntoViewIfNeeded();
  let bounds=await pin.boundingBox();
  expect(bounds).not.toBeNull();
  const x=bounds!.x+bounds!.width/2,y=bounds!.y+bounds!.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+26,y+10,{steps:5});
  await expect(pin).toHaveAttribute('data-memo-preview','true');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(pin).toHaveAttribute('data-memo-wcs-x','50');
  await expect(pin).toHaveAttribute('data-memo-wcs-y','50');
  await expect(pin).toHaveAttribute('data-memo-preview','false');

  await page.getByTestId('cad-memo-x').fill('Infinity');
  await page.getByTestId('cad-memo-apply-position').click();
  await expect(page.getByTestId('cad-memo-error')).toBeVisible();
  await expect(pin).toHaveAttribute('data-memo-wcs-x','50');
  await page.getByTestId('cad-memo-x').fill('50');
  // Before pointer drag threshold a wheel/camera change must invalidate the captured WCS.
  bounds=await pin.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x+12,bounds!.y+12);
  await page.mouse.down();
  await page.mouse.wheel(0,160);
  await page.mouse.move(bounds!.x+40,bounds!.y+12,{steps:5});
  await page.mouse.up();
  await expect(pin).toHaveAttribute('data-memo-wcs-x','50');
  await clickViewerCommand(page,'view','화면 맞춤');

  bounds=await pin.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x+12,bounds!.y+12);
  await page.mouse.down();
  await page.mouse.move(bounds!.x+40,bounds!.y+12,{steps:5});
  await page.mouse.up();
  await expect(pin).not.toHaveAttribute('data-memo-wcs-x','50');
  // KEEP now preserves a session binding after a successful pin move.
  // Confirm the intentional destruction rather than dismissing its native dialog.
  page.once('dialog',dialog=>dialog.accept());
  await clickViewerCommand(page,'drawing','다시 불러오기');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  // Reload intentionally closes the Drawer; explicitly reopen it for the empty-session status.
  await clickViewerTestCommand(page,'viewer-menu-tools');
  await expect(page.getByTestId('cad-memo-status')).toContainText('0/100');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
  // A different renderer must explain why M1 is unavailable.
  await clickViewerCommand(page,'view','dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page,'work');
  await expect(page.getByTestId('viewer-menu-memo-add')).toBeDisabled();
});
test('TC-M1-E2E-003: placement cancels, Source/Outline modes remain exclusive, Version stays isolated',async({page,request})=>{
  const first=await drawing(request,'issue82-modes1');
  const second=await drawing(request,'issue82-modes2');
  await openThree(page,first.id);
  await clickViewerTestCommand(page,'viewer-menu-outline-tool');
  await openViewerMenu(page,'work');
  await expect(page.getByTestId('viewer-menu-outline-tool')).toHaveAttribute('aria-checked','true');
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await openViewerMenu(page,'work');
  await expect(page.getByTestId('viewer-menu-outline-tool')).toHaveAttribute('aria-checked','false');
  // First Escape closes the work menu, second cancels placement (one overlay layer per key).
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cad-memo-placement-plane')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cad-memo-placement-plane')).toHaveCount(0);
  await expect(page.getByTestId('cad-memo-status')).toContainText('0/100');
  await createAt(page,'40','40');
  await page.getByTestId('canvas-mode-objects').click();
  await expect(page.getByTestId('cad-memo-editor')).toHaveCount(0);
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(1);
  await page.goto('/cad/versions/'+second.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
  await openViewerMenu(page,'work');
  await expect(page.getByTestId('viewer-menu-memo-add')).toBeEnabled();
  await page.goto('/cad/versions/'+first.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
});

test('TC-M1-E2E-004: existing memo pin/list interactions cancel outline and object selection',async({page,request})=>{
  const version=await drawing(request,'issue82-review-exclusive');
  await openThree(page,version.id);
  await createAt(page,'50','50','기존 메모');
  const pin=page.getByTestId('cad-memo-pin');
  const outlineTool=page.getByTestId('viewer-menu-outline-tool');

  await clickViewerTestCommand(page,'viewer-menu-outline-tool');
  await openViewerMenu(page,'work');
  await expect(outlineTool).toHaveAttribute('aria-checked','true');
  await page.getByTestId('cad-memo-latest').getByRole('button',{name:'기존 메모'}).click();
  await openViewerMenu(page,'work');
  await expect(outlineTool).toHaveAttribute('aria-checked','false');
  await expect(page.getByTestId('canvas-mode-pan')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('cad-memo-editor')).toBeVisible();

  await page.getByTestId('canvas-mode-objects').click();
  await expect(page.getByTestId('cad-memo-editor')).toHaveCount(0);
  await pin.click();
  await expect(page.getByTestId('canvas-mode-pan')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('cad-memo-editor')).toBeVisible();

  // Tool exclusivity is established on pointer-down, not at pointer-up/click.
  await clickViewerTestCommand(page,'viewer-menu-outline-tool');
  await openViewerMenu(page,'work');
  await expect(outlineTool).toHaveAttribute('aria-checked','true');
  await page.keyboard.press('Escape');
  await pin.scrollIntoViewIfNeeded();
  const bounds=await pin.boundingBox();
  expect(bounds).not.toBeNull();
  const x=bounds!.x+bounds!.width/2,y=bounds!.y+bounds!.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  // Pin pointerdown must exit outline selection without opening a menu during the gesture.
  await expect(page.getByTestId('cad-outline-tools')).toHaveCount(0);
  await expect(page.getByTestId('canvas-mode-pan')).toHaveAttribute('aria-pressed','true');
  await page.mouse.move(x+24,y+8,{steps:5});
  await expect(pin).toHaveAttribute('data-memo-preview','true');
  await page.mouse.up();
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(1);
  await openViewerMenu(page,'work');
  await expect(outlineTool).toHaveAttribute('aria-checked','false');
});

test('TC-M1-E2E-005: dragging selected memo retains unsaved text draft after synthetic click',async({page,request})=>{
  const version=await drawing(request,'issue82-review-draft');
  await openThree(page,version.id);
  await createAt(page,'50','50','확정 제목','확정 본문');
  const pin=page.getByTestId('cad-memo-pin');
  await page.getByTestId('cad-memo-title').fill('미저장 변경 제목');
  await page.getByTestId('cad-memo-content').fill('미저장 변경 내용');
  await pin.scrollIntoViewIfNeeded();
  const bounds=await pin.boundingBox();
  expect(bounds).not.toBeNull();
  const x=bounds!.x+bounds!.width/2,y=bounds!.y+bounds!.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+28,y+12,{steps:6});
  await expect(pin).toHaveAttribute('data-memo-preview','true');
  await page.mouse.up();
  await expect(pin).toHaveAttribute('data-memo-preview','false');
  await expect(pin).not.toHaveAttribute('data-memo-wcs-x','50');
  await expect(page.getByTestId('cad-memo-title')).toHaveValue('미저장 변경 제목');
  await expect(page.getByTestId('cad-memo-content')).toHaveValue('미저장 변경 내용');
  // Commit the draft explicitly; dragging only confirmed the WCS anchor.
  await page.getByTestId('cad-memo-save-text').click();
  await expect(pin).toContainText('미저장 변경 제목');
});

test('TC-M3-E2E-001: visible DXF WCS endpoint auto-snaps only for this Viewer session',async({page,request})=>{
  const version=await drawing(request,'issue84-render-snap');
  await openThree(page,version.id);
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await page.getByTestId('cad-memo-title').fill('Renderer session snap');
  await page.getByTestId('cad-memo-content').fill('WCS vertex bound only in memory');
  await page.getByTestId('cad-memo-x').fill('0');
  await page.getByTestId('cad-memo-y').fill('0');
  await page.getByTestId('cad-memo-coordinate-place').click();
  await expect(page.getByTestId('cad-memo-snap-candidate')).toBeVisible();
  await page.getByTestId('cad-memo-create').click();
  await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
  await expect(page.getByTestId('cad-memo-session-snap')).toContainText('재접속 시 해제');
  await expect(page.getByTestId('cad-memo-pin')).toHaveAttribute('data-memo-wcs-x','0');
  await page.getByTestId('cad-memo-session-detach').click();
  await expect(page.getByTestId('cad-memo-session-snap')).toHaveCount(0);
  await expect(page.getByTestId('cad-memo-pin')).toHaveAttribute('data-memo-wcs-x','0');
});
