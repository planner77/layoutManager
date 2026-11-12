import { expect, test } from '@playwright/test';
import { masterFields } from './master-helper';
import { clickViewerCommand, openViewerMenu } from './viewer-menu-helper';

const dxf='0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n';

test('T215/206 responsive status and background dialog boundaries at 320/390/768/1440 and modeled 200% zoom',async({page,request,browser})=>{
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:'qa-responsive-215-206.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)},
    ...(await masterFields(request,{businessUnit:'Responsive215206',site:'qa',building:'A',floor:'1'})),
    registeredAt:'2026-11-12',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);const file=await response.json();
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    await expect(page.getByTestId('viewer-session-status')).toBeVisible();
    await expect(page.getByTestId('viewer-session-status')).toContainText('인증 미사용');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
    const dialog=page.getByTestId('canvas-background-dialog');await expect(dialog).toBeVisible();
    const bounds=await dialog.boundingBox();expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(900);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  }

  // A 1440×900 physical desktop at 200% browser zoom exposes a 720×450 CSS
  // layout viewport. This models that layout viewport without document CSS zoom.
  const zoomContext=await browser.newContext({baseURL:new URL(page.url()).origin,
    viewport:{width:720,height:450},deviceScaleFactor:2});
  try {
    const zoomPage=await zoomContext.newPage();
    await zoomPage.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
    await expect(zoomPage.getByRole('status')).toHaveText('도면 표시 완료');
    const viewport=await zoomPage.evaluate(()=>({width:window.innerWidth,height:window.innerHeight,dpr:window.devicePixelRatio}));
    expect(viewport).toEqual({width:720,height:450,dpr:2});
    await expect(zoomPage.getByTestId('viewer-session-status')).toContainText('인증 미사용');
    await openViewerMenu(zoomPage,'view');await zoomPage.getByTestId('viewer-menu-canvas-background').click();
    const dialog=zoomPage.getByTestId('canvas-background-dialog');await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Canvas 배경색 선택')).toBeFocused();
    const bounds=await dialog.boundingBox();expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(720);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(450);
    expect(await zoomPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await zoomPage.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  } finally { await zoomContext.close(); }
});

test('T215/206 browser native fullscreen API owns the visible status and background controls',async({page,request})=>{
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:'qa-fullscreen-215-206.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)},
    ...(await masterFields(request,{businessUnit:'Fullscreen215206',site:'qa',building:'A',floor:'1'})),
    registeredAt:'2026-11-12',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);const file=await response.json();
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  expect(await page.evaluate(()=>document.fullscreenEnabled)).toBe(true);
  await clickViewerCommand(page,'view','브라우저 전체 화면');
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-native-fullscreen','true');
  expect(await page.evaluate(()=>document.fullscreenElement===document.querySelector('[data-testid="cad-viewer-shell"]'))).toBe(true);
  await expect(page.getByTestId('viewer-session-status')).toHaveAttribute('aria-live','polite');
  await expect(page.getByTestId('app-session-status')).toHaveAttribute('aria-live','off');
  await openViewerMenu(page,'view');await page.getByTestId('viewer-menu-canvas-background').click();
  const bounds=await page.getByTestId('canvas-background-dialog').boundingBox();expect(bounds).not.toBeNull();
  const viewport=await page.evaluate(()=>({width:window.innerWidth,height:window.innerHeight}));
  expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press('Escape');
  await clickViewerCommand(page,'view','브라우저 전체 화면 해제');
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-native-fullscreen','false');
  expect(await page.evaluate(()=>document.fullscreenElement)).toBeNull();
});
