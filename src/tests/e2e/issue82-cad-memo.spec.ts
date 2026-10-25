import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { masterFields } from './master-helper';

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
  await expect(page.getByTestId('viewer-menu-memo-add')).toBeEnabled();
}
async function createAt(page:Page,x:string,y:string,title='메모1',content='첫 줄\n두번째'){
  await page.getByTestId('viewer-menu-memo-add').click();
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
  await page.getByRole('button',{name:'전체 화면 확대'}).click();
  await page.getByRole('button',{name:'전체 화면 확대'}).click();
  // Pan with the actual OrbitControls canvas (not the memo pin) while zoomed.
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  const rect=await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+rect!.width/2,rect!.y+rect!.height/2);
  await page.mouse.down();
  await page.mouse.move(rect!.x+rect!.width/2+30,rect!.y+rect!.height/2-20,{steps:5});
  await page.mouse.up();
  // Pins outside the viewport may be culled; fit restores them without changing WCS.
  await page.getByRole('button',{name:'전체 화면 맞춤'}).click();
  await expect(pin).toHaveAttribute('data-memo-wcs-x','10');
  await page.getByRole('button',{name:'전체 화면 종료'}).click();
  await expect(pin).toHaveAttribute('data-memo-wcs-y','20');
  await page.getByRole('button',{name:'전체 화면',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'전체 화면 맞춤'}).click();
  await expect(pin).toHaveAttribute('data-memo-wcs-x','10');
  await page.setViewportSize({width:1280,height:820});
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
  let pin=page.getByTestId('cad-memo-pin');
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
  await page.getByRole('button',{name:'전체 화면 맞춤'}).click();

  bounds=await pin.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x+12,bounds!.y+12);
  await page.mouse.down();
  await page.mouse.move(bounds!.x+40,bounds!.y+12,{steps:5});
  await page.mouse.up();
  await expect(pin).not.toHaveAttribute('data-memo-wcs-x','50');
  await page.getByRole('button',{name:'다시 불러오기'}).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('cad-memo-status')).toContainText('0/100');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
  // A different renderer must explain why M1 is unavailable.
  await page.getByRole('button',{name:'dxf-viewer',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('viewer-menu-memo-add')).toBeDisabled();
});
test('TC-M1-E2E-003: placement cancels, Source/Outline modes remain exclusive, Version stays isolated',async({page,request})=>{
  const first=await drawing(request,'issue82-modes1');
  const second=await drawing(request,'issue82-modes2');
  await openThree(page,first.id);
  await page.getByTestId('viewer-menu-outline-tool').click();
  await expect(page.getByTestId('viewer-menu-outline-tool')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('viewer-menu-memo-add').click();
  await expect(page.getByTestId('viewer-menu-outline-tool')).toHaveAttribute('aria-pressed','false');
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
  await expect(page.getByTestId('cad-memo-status')).toContainText('0/100');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
  await page.goto('/cad/versions/'+first.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
});
