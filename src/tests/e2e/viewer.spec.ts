import { test, expect } from '@playwright/test';
const drawing = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nCIRCLE\n8\n0\n10\n50\n20\n50\n40\n25\n0\nENDSEC\n0\nEOF\n';
test('TC-DXF-001: actual DXF render, controls, resize and re-entry',async({page,request})=>{
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  const response=await request.post('/api/cad-files',{multipart:{file:{name:'viewer-lines.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(drawing)},businessUnit:'Viewer',site:'render',building:'A',floor:'1',registeredAt:'2026-09-08',makeCurrent:'true'}});
  expect(response.status()).toBe(201); const file=await response.json();
  await page.goto('/?filename=viewer-lines'); await page.getByRole('link',{name:'도면 보기',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const canvas=page.locator('canvas');await expect(canvas).toHaveCount(1);
  const initial=await canvas.screenshot();
  await page.getByRole('button',{name:'확대',exact:true}).click(); expect((await canvas.screenshot()).equals(initial)).toBe(false);
  await page.getByRole('button',{name:'축소',exact:true}).click();
  await page.getByRole('button',{name:'화면 맞춤'}).click();
  const beforePan=await canvas.screenshot();const box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+100,box.y+box.height/2+30,{steps:8});await page.mouse.up();
  expect((await canvas.screenshot()).equals(beforePan)).toBe(false);
  await page.setViewportSize({width:1100,height:800});
  await expect.poll(async()=>canvas.evaluate(c=>({w:(c as HTMLCanvasElement).width,h:(c as HTMLCanvasElement).height}))).toEqual({w:Math.round((await canvas.boundingBox())!.width),h:Math.round((await canvas.boundingBox())!.height)});
  await page.getByRole('button',{name:'다시 불러오기'}).click();await expect(page.getByRole('status')).toHaveText('도면 표시 완료');await expect(canvas).toHaveCount(1);
  await page.getByRole('link',{name:'← 버전 목록'}).click();await expect(page.locator('canvas')).toHaveCount(0);
  await page.goto(`/cad/versions/${file.id}/viewer`);await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await page.screenshot({path:'test-results/dxf-render.png',fullPage:true});expect(errors).toEqual([]);
});
test('TC-DXF-002: corrupted DXF, empty DXF and DWG are explicit states',async({page,request})=>{
  for (const [name,bytes,expected] of [['broken.dxf','invalid DXF','表示失敗'],['empty.dxf','0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n','empty'],['deferred.dwg','AC1032','DWG']]) {
    const response=await request.post('/api/cad-files',{multipart:{file:{name,mimeType:'application/octet-stream',buffer:Buffer.from(bytes)},businessUnit:'Viewer',site:'errors',building:'A',floor:'1',registeredAt:'2026-09-08',makeCurrent:'false'}});
    const file=await response.json();await page.goto(`/cad/versions/${file.id}/viewer`);
    if(expected==='DWG') { await expect(page.getByRole('status')).toContainText('후속 버전');await expect(page.locator('canvas')).toHaveCount(0); }
    else if(expected==='empty') await expect(page.getByRole('status')).toContainText('표시할 도형이 없습니다');
    else {await expect(page.getByRole('main').getByRole('alert')).toContainText('DXF 처리에 실패');await page.getByRole('button',{name:'다시 불러오기'}).click();await expect(page.getByRole('main').getByRole('alert')).toBeVisible();}
  }
});
