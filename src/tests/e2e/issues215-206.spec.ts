import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {masterFields} from './master-helper';
import {clickViewerCommand,clickViewerTestCommand,openViewerMenu} from './viewer-menu-helper';

const dxf='0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n';

async function exportCanonical(page:import('@playwright/test').Page){
  await clickViewerCommand(page,'drawing','GLB/glTF 내보내기');
  const dialog=page.getByTestId('cad-exchange-dialog');await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox',{name:'원본 단위'}).selectOption({label:'mm (0.001m)'});
  await dialog.getByTestId('cad-exchange-review').click();
  await expect(dialog.getByTestId('cad-exchange-preview')).toBeVisible();
  const ack=dialog.getByTestId('cad-exchange-partial-ack');if(await ack.count())await ack.check();
  const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();
  const download=await pending;const bytes=await readFile((await download.path())!);
  const chunkLength=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+chunkLength).toString('utf8')) as Record<string,unknown>;
  await dialog.getByRole('button',{name:'취소 / 닫기'}).click();
  return {materials:json.materials,meshes:json.meshes,accessors:json.accessors,binary:bytes.subarray(28+chunkLength).toString('hex')};
}

test('T215-02/03 shared status is server-derived, OFF skips session and focus revalidates without polling',async({page})=>{
  let gate:'ACTIVE'|'OFF'|'BLOCKED'='ACTIVE',sessionStatus=401,statusRequests=0,sessionRequests=0;
  let statusHttp=200,actorValid=true,delayNext=false,releaseDelayed:(()=>void)|undefined;
  await page.route('**/api/g7-runtime/status',async route=>{
    statusRequests++;
    if(statusHttp!==200){await route.fulfill({status:statusHttp,json:{error:{code:'STATUS_UNAVAILABLE'}}});return;}
    await route.fulfill({json:{state:gate,authEnabled:gate==='ACTIVE',cadWriteEnabled:gate==='ACTIVE'}});
  });
  await page.route('**/api/g7-runtime/auth/session',async route=>{
    sessionRequests++;
    const observed=sessionStatus;
    if(delayNext){delayNext=false;await new Promise<void>(resolve=>{releaseDelayed=resolve;});}
    if(observed!==200)await route.fulfill({status:observed,json:{error:{code:'UNAUTHENTICATED'}}}).catch(()=>{});
    else await route.fulfill({json:{actor:{id:actorValid?'private-215-id':'',status:'ACTIVE',roles:['Reader','Admin','unknown']},csrfToken:'private-215-csrf'}}).catch(()=>{});
  });
  await page.goto('/');
  await expect(page.getByTestId('app-session-status')).toContainText('로그인 필요');
  expect(sessionRequests).toBeGreaterThan(0);
  sessionStatus=200;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('app-session-status')).toContainText('로그인됨 · Admin, Reader');
  expect(await page.locator('body').innerText()).not.toMatch(/private-215/);
  await page.setViewportSize({width:320,height:720});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  delayNext=true;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>Boolean(releaseDelayed)).toBe(true);
  sessionStatus=401;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('app-session-status')).toContainText('로그인 필요');
  releaseDelayed?.();
  await expect(page.getByTestId('app-session-status')).toContainText('로그인 필요');
  sessionStatus=403;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('app-session-status')).toContainText('인증 확인 불가');
  sessionStatus=200;actorValid=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('app-session-status')).toContainText('인증 확인 불가');
  const count=sessionRequests;
  await page.waitForTimeout(800);
  expect(sessionRequests).toBe(count);
  gate='OFF';
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('app-session-status')).toContainText('인증 미사용');
  expect(sessionRequests).toBe(count);
  gate='BLOCKED';
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('app-session-status')).toContainText('인증 구성 대기');
  statusHttp=503;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('app-session-status')).toContainText('인증 확인 불가');
  expect(statusRequests).toBeGreaterThan(1);
});

test('T206-01/02/04 Three DXF background changes real canvas pixels in place and survives reload',async({page,request})=>{
  test.setTimeout(120_000);
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:'background-206.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)},
    ...(await masterFields(request,{businessUnit:'Background206',site:'render',building:'A',floor:'1'})),
    registeredAt:'2026-11-12',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  const file=await response.json();
  let sourceGets=0;
  await page.route('**/api/cad-files/*/content',async route=>{sourceGets++;await route.continue();});
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('viewer-loading-overlay')).toHaveCount(0);
  await expect(page.getByTestId('viewer-session-status')).toContainText('인증 미사용');
  await expect(page.getByTestId('viewer-session-status')).toHaveAttribute('aria-live','polite');
  const canvas=page.getByTestId('cad-viewer-shell').locator('canvas').first();
  await canvas.evaluate(node=>{node.setAttribute('data-background-test','same-canvas');Reflect.set(window,'__backgroundGl',(node as HTMLCanvasElement).getContext('webgl2'));});
  const beforeGets=sourceGets;
  const sample=async()=>{
    const png=(await canvas.screenshot()).toString('base64');
    return page.evaluate(async base64=>{
      const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();
      const scratch=document.createElement('canvas');scratch.width=image.width;scratch.height=image.height;
      const context=scratch.getContext('2d')!;context.drawImage(image,0,0);
      return [...context.getImageData(3,3,1,1).data].slice(0,3);
    },png);
  };
  const contrastPixels=async(bright:boolean)=>{
    const png=(await canvas.screenshot()).toString('base64');
    return page.evaluate(async ({base64,bright})=>{
      const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();
      const scratch=document.createElement('canvas');scratch.width=image.width;scratch.height=image.height;
      const context=scratch.getContext('2d')!;context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,image.width,image.height).data;
      let count=0;
      for(let i=0;i<pixels.length;i+=4){
        if(bright?pixels[i]>180&&pixels[i+1]>180&&pixels[i+2]>180:
          pixels[i]<75&&pixels[i+1]<75&&pixels[i+2]<75)count++;
      }
      return count;
    },{base64:png,bright});
  };
  const black=await sample();expect(black.every(channel=>channel<25)).toBe(true);
  expect(await contrastPixels(true)).toBeGreaterThan(10);
  const originalExport=await exportCanonical(page);
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  const dialog=page.getByTestId('canvas-background-dialog');await expect(dialog).toBeVisible();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(dialog.getByLabel('Canvas 배경색 선택')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'닫기'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(dialog.getByLabel('Canvas 배경색 선택')).toBeFocused();
  await dialog.getByLabel('HEX 색상').fill('#ffffff');
  await expect(dialog.getByText('현재 색상:')).toContainText('#ffffff');
  await dialog.getByRole('button',{name:'닫기'}).click();
  const white=await sample();expect(white.every(channel=>channel>230)).toBe(true);
  expect(await contrastPixels(false)).toBeGreaterThan(10);
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  await dialog.getByLabel('HEX 색상').fill('#123');
  await expect(dialog.getByRole('alert')).toContainText('마지막 유효색');
  await dialog.getByRole('button',{name:'닫기'}).click();
  expect(await sample()).toEqual(white);
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  await dialog.getByRole('button',{name:'기본 검정 복원'}).click();
  await expect(dialog).toContainText('#000000');
  for(let i=0;i<20;i++)await dialog.getByLabel('HEX 색상').fill(i%2?'#262626':'#ffffff');
  await dialog.getByRole('button',{name:'닫기'}).click();
  expect(await exportCanonical(page)).toEqual(originalExport);
  expect(sourceGets).toBe(beforeGets);
  expect(await canvas.getAttribute('data-background-test')).toBe('same-canvas');
  expect(await canvas.evaluate(node=>(node as HTMLCanvasElement).getContext('webgl2')===Reflect.get(window,'__backgroundGl'))).toBe(true);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  await expect(page.getByTestId('canvas-background-dialog')).toContainText('#262626');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-background-dialog')).toHaveCount(0);
  await expect(page.locator('[data-viewer-group="view"]')).toBeFocused();
  await page.setViewportSize({width:320,height:720});
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  const dialogBounds=await page.getByTestId('canvas-background-dialog').boundingBox();
  expect(dialogBounds).not.toBeNull();expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.x+dialogBounds!.width).toBeLessThanOrEqual(320);
  expect(dialogBounds!.y+dialogBounds!.height).toBeLessThanOrEqual(720);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-background-dialog')).toHaveCount(0);
  await clickViewerCommand(page,'view','전체 화면 종료');
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','false');
  await clickViewerCommand(page,'view','브라우저 전체 화면');
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-native-fullscreen','true');
  await expect(page.getByTestId('viewer-session-status')).toHaveAttribute('aria-live','polite');
  await expect(page.getByTestId('app-session-status')).toHaveAttribute('aria-live','off');
  await clickViewerCommand(page,'view','브라우저 전체 화면 해제');
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-native-fullscreen','false');
  await openViewerMenu(page,'view');
  await page.getByRole('menuitemradio',{name:'dxf-viewer',exact:true}).click();
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  const dxfMenu=await openViewerMenu(page,'view');
  await expect(dxfMenu.getByTestId('viewer-menu-canvas-background')).toHaveAttribute('aria-disabled','true');
  await dxfMenu.getByRole('menuitemradio',{name:'three-dxf-viewer',exact:true}).click();
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  await expect(page.getByTestId('canvas-background-dialog')).toContainText('#262626');
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('blocked');};});
  await page.getByTestId('canvas-background-dialog').getByRole('button',{name:'팔레트 2 #ffffff'}).click();
  await expect(page.getByTestId('canvas-background-dialog')).toContainText('저장하지 못했습니다');
  await expect(page.getByTestId('canvas-background-dialog')).toContainText('#ffffff');
  await page.getByTestId('canvas-background-dialog').getByRole('button',{name:'닫기'}).click();
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  await expect(page.getByTestId('canvas-background-dialog')).toContainText('#262626');
  await page.getByTestId('canvas-background-dialog').getByRole('button',{name:'닫기'}).click();
  const second=await page.context().newPage();
  await second.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(second.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(second,'view');await second.getByTestId('viewer-menu-canvas-background').click();
  await expect(second.getByTestId('canvas-background-dialog')).toContainText('#262626');
  await second.getByTestId('canvas-background-dialog').getByRole('button',{name:'팔레트 2 #ffffff'}).click();
  await expect(second.getByTestId('canvas-background-dialog')).toContainText('#ffffff');
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  await expect(page.getByTestId('canvas-background-dialog')).toContainText('#ffffff');
  await second.close();
});

test('T206-05 mobile menu remains pointer reachable after background Escape and resize',async({page,request})=>{
  test.setTimeout(25_000);
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:'mobile-206.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)},
    ...(await masterFields(request,{businessUnit:'Mobile206',site:'render',building:'A',floor:'1'})),
    registeredAt:'2026-11-12',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  const file=await response.json();
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  await expect(page.getByTestId('canvas-background-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-viewer-group="view"]')).toBeFocused();
  await page.setViewportSize({width:320,height:720});
  await openViewerMenu(page,'view');
  await expect(page.getByRole('menu',{name:'보기 명령'})).toBeVisible();
});

test('T215-04 Viewer account link asks before discarding a live source selection',async({page,request})=>{
  const polygon=Buffer.from([
    '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
    '0','SECTION','2','ENTITIES','0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
    '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
    '0','ENDSEC','0','EOF','',
  ].join('\n'));
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:'account-guard-215.dxf',mimeType:'application/octet-stream',buffer:polygon},
    ...(await masterFields(request,{businessUnit:'AccountGuard215',site:'selection',building:'A',floor:'1'})),
    registeredAt:'2026-11-12',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);const file=await response.json();
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page,'viewer-menu-outline-tool');
  const canvas=page.getByTestId('cad-canvas').locator('canvas');const rect=await canvas.boundingBox();expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+5,rect!.y+5);await page.mouse.down();
  await page.mouse.move(rect!.x+rect!.width-5,rect!.y+rect!.height-5,{steps:8});await page.mouse.up();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
  await page.route('**/api/g7-runtime/status',route=>route.fulfill({json:{state:'ACTIVE',authEnabled:true,cadWriteEnabled:true}}));
  await page.route('**/api/g7-runtime/auth/session',route=>route.fulfill({json:{actor:{id:'private-id',status:'ACTIVE',roles:['Reader']},csrfToken:'private-token'}}));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('viewer-session-status')).toContainText('로그인됨 · Reader');
  page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');await dialog.dismiss();});
  await page.getByTestId('viewer-session-status').getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/cad/versions/${file.id}/viewer`));
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
});
