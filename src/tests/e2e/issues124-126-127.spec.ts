import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { masterFields } from './master-helper';

const drawing=Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n5\nA1\n8\nEQUIP\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n');
async function createDrawing(request: APIRequestContext, name:string, description='설비 배치\n검토 도면', drawingName=name, source=drawing) {
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:`${name}.dxf`,mimeType:'application/octet-stream',buffer:source},
    ...(await masterFields(request,{businessUnit:`Issues124-${name}`,site:'viewer',building:'A',floor:'1'})),
    drawingName,description,registeredAt:'2026-10-26',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  const file=await response.json() as {id:string;displayName:string};
  expect(file.displayName).toBe(drawingName.trim());
  return file;
}
const menu=(page: Page,label:'도면'|'보기'|'작업')=>page.getByRole('button',{name:label,exact:true});

test('TC-126-DEFAULT: DXF opens Three by default; explicit dxf and invalid renderer resolve correctly',async({page,request})=>{
  const file=await createDrawing(request,'default-three-'+Date.now());
  let gets=0;page.on('request',r=>{if(r.url().includes(`/api/cad-files/${file.id}/content`))gets++;});
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  expect(gets).toBe(1);
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=dxf-viewer`);
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=invalid`);
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  await expect(page).toHaveURL(/renderer=three-dxf-viewer/);
});

test('TC-126-RECOVERY: Three renderer failure falls back once with completed bytes',async({page,request})=>{
  const file=await createDrawing(request,'fallback-'+Date.now());
  let gets=0;page.on('request',r=>{if(r.url().includes(`/api/cad-files/${file.id}/content`))gets++;});
  await page.route('**/fonts/CadKorean.typeface.json',route=>route.abort());
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer',{timeout:30000});
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('viewer-recovery-notice')).toContainText('dxf-viewer로 표시했습니다');
  await expect(page).toHaveURL(/renderer=dxf-viewer/);
  expect(gets).toBe(1);
  await expect(page.getByTestId('cad-canvas').locator('canvas')).toHaveCount(1);
});

test('TC-126-RECOVERY: source failure does not trigger renderer fallback',async({page,request})=>{
  const file=await createDrawing(request,'source-fail-'+Date.now());
  await page.route(`**/api/cad-files/${file.id}/content`,route=>route.fulfill({status:404,body:''}));
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByTestId('cad-viewer-shell').getByRole('alert')).toContainText('source:HTTP_404');
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  await expect(page.getByTestId('viewer-recovery-notice')).toHaveCount(0);
});

test('TC-127-MENU/DRAWER: commands, metadata, canvas identity and mobile modal Escape',async({page,request})=>{
  const file=await createDrawing(request,'workspace-'+Date.now());
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('viewer-toolbar').getByRole('heading',{name:file.displayName})).toBeVisible();
  await expect(page.getByTestId('viewer-toolbar').getByText(`원본: workspace-`,{exact:false})).toBeVisible();
  const name=page.getByTestId('viewer-toolbar').getByRole('button',{name:file.displayName});
  await name.focus();await expect(page.getByRole('tooltip')).toContainText('설비 배치');
  await name.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
  const canvas=page.getByTestId('cad-canvas');
  await canvas.evaluate(node=>node.setAttribute('data-identity','same'));
  await menu(page,'작업').click();
  await expect(page.getByRole('menuitemcheckbox',{name:'레이어 패널'})).toHaveAttribute('aria-checked','true');
  await expect(page.getByRole('menuitem',{name:'외곽선 타입 관리'})).toHaveAttribute('aria-disabled','true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer-layer-dock')).toBeVisible();
  await menu(page,'작업').click();
  await page.getByRole('menuitemcheckbox',{name:'레이어 패널'}).click();
  await expect(page.getByTestId('viewer-layer-dock')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-identity','same');
  await page.setViewportSize({width:375,height:812});
  await menu(page,'작업').click();
  await page.getByRole('menuitemcheckbox',{name:'레이어 패널'}).click();
  const dialog=page.getByRole('dialog',{name:'레이어'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal','true');
  await expect(page.locator('[data-app-header]')).toHaveAttribute('inert','');
  const focusables=dialog.locator('button:not([disabled]),input:not([disabled])');
  await focusables.last().focus();await page.keyboard.press('Tab');
  await expect(focusables.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
  await expect(canvas).toHaveAttribute('data-identity','same');
  await menu(page,'보기').click();await page.getByRole('menuitem',{name:'전체 화면 종료'}).click();
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','false');
  await expect(page.locator('[data-app-header]')).not.toHaveAttribute('inert','');
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:'레이어 패널'}).click();
  await expect(page.getByRole('dialog',{name:'레이어'})).toBeVisible();
  await expect(page.locator('[data-app-header]')).toHaveAttribute('inert','');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-app-header]')).not.toHaveAttribute('inert','');
  await page.locator('[data-app-header]').getByRole('link',{name:'도면 목록'}).click();
  await expect(page).toHaveURL(/\/$/);
});

test('TC-124-LAYOUT: home controls stay available after scrolling, mobile advanced filters retain GET values',async({page,request})=>{
  const file=await createDrawing(request,'home-'+Date.now());
  await page.goto('/?versions=all&filename=home-&pageSize=50');
  await expect(page.getByRole('heading',{name:'CAD 도면 목록'})).toBeVisible();
  await expect(page.getByRole('form',{name:'도면 검색'}).getByLabel('파일명')).toHaveValue('home-');
  await page.setViewportSize({width:320,height:640});
  await expect(page.getByText('추가 필터')).toBeVisible();
  await page.getByText('추가 필터').click();
  await page.getByRole('form',{name:'도면 검색'}).getByLabel('파일 형식').selectOption('DXF');
  await page.getByText('추가 필터').click();
  await expect(page.getByRole('form',{name:'도면 검색'}).getByLabel('파일 형식')).toHaveValue('DXF');
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect(page.getByRole('heading',{name:'CAD 도면 목록'})).toBeInViewport();
  await expect(page.getByRole('button',{name:'현재 버전만 표시'})).toBeInViewport();
  await expect(page.getByRole('link',{name:'도면 보기'}).first()).toBeVisible();
  await page.getByText('추가 필터').click();
  await page.getByRole('form',{name:'도면 검색'}).getByRole('button',{name:'검색'}).click();
  await expect(page).toHaveURL(/format=DXF/);
  await page.getByRole('link',{name:'초기화'}).click();
  await expect(page.getByRole('form',{name:'도면 검색'}).getByLabel('파일명')).toHaveValue('');
  await page.getByText('추가 필터').click();
  await expect(page.getByRole('form',{name:'도면 검색'}).getByLabel('파일 형식')).toHaveValue('');
  await expect(page.getByRole('button',{name:'현재 버전만 표시'})).toHaveAttribute('aria-pressed','true');
  await page.goBack();
  await expect(page.getByRole('form',{name:'도면 검색'}).getByLabel('파일명')).toHaveValue('home-');
  await page.getByText('추가 필터').click();
  await expect(page.getByRole('form',{name:'도면 검색'}).getByLabel('파일 형식')).toHaveValue('DXF');
  await page.reload();
  await expect(page.getByRole('form',{name:'도면 검색'}).getByLabel('파일명')).toHaveValue('home-');
  expect(file.id).toBeTruthy();
});

test('TC-126-RECOVERY: stalled Three load has an immediate manual escape and ignores late failure',async({page,request})=>{
  const file=await createDrawing(request,'stall-'+Date.now());
  const sourceUrl=`/api/cad-files/${file.id}/content`;
  let gets=0,completed=0;
  const failedReasons:string[]=[];
  page.on('request',r=>{if(r.url().includes(sourceUrl))gets++;});
  page.on('requestfinished',r=>{if(r.url().includes(sourceUrl))completed++;});
  page.on('requestfailed',r=>{
    if(r.url().includes(sourceUrl))failedReasons.push(r.failure()?.errorText ?? 'UNKNOWN_FAILURE');
  });
  const blobErrors:string[]=[];
  page.on('console',message=>{if(message.type()==='error'&&message.text().includes('ERR_FILE_NOT_FOUND'))blobErrors.push(message.text());});
  let release! : () => void;
  const hold=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/fonts/CadKorean.typeface.json',async route=>{await hold;await route.continue().catch(()=>undefined);});
  await page.goto(`/cad/versions/${file.id}/viewer`,{waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('viewer-loading-overlay')).toBeVisible();
  await page.getByRole('button',{name:'로딩 중단 후 dxf-viewer로 열기'}).click();
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await page.waitForTimeout(1300);
  release();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('viewer-recovery-notice')).toHaveCount(0);
  await expect(page.getByTestId('cad-canvas').locator('canvas')).toHaveCount(1);
  // The initial source request may be aborted while a Three font is held.
  // Switching must still produce exactly ONE completed content download.
  // Never relax this to a mere 'at most two requests': two completed GETs
  // would be a real source-cache regression, not an expected abort.
  await expect.poll(()=>gets-completed-failedReasons.length).toBe(0);
  expect(completed).toBe(1);
  expect(gets).toBeLessThanOrEqual(2);
  expect(failedReasons).toHaveLength(gets-completed);
  expect(failedReasons.every(reason=>/ERR_ABORTED|cancelled|canceled/i.test(reason))).toBe(true);
  expect(blobErrors).toEqual([]);
});

test('TC-126-RECOVERY: both renderer initialization failures stop after one fallback and keep recovery actions',async({page,request})=>{
  const file=await createDrawing(request,'both-fail-'+Date.now());
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){
      if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;
      return (original as (...parameters:unknown[])=>unknown).call(this,type,...args);
    } as typeof original;
  });
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await expect(page.getByTestId('cad-viewer-shell').getByRole('alert')).toContainText('첫 시도 adapter-init:INITIALIZE');
  await expect(page.getByTestId('cad-viewer-shell').getByRole('alert')).toContainText('adapter-init:INITIALIZE');
  await expect(page.getByRole('progressbar',{name:'도면 로딩 중'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'dxf-viewer 링크'})).toBeVisible();
});

test('TC-126-RECOVERY: stalled explicit dxf has a manual Three escape with one completed GET',async({page,request})=>{
  const withText=Buffer.from([
    '0','SECTION','2','ENTITIES',
    '0','LINE','5','A1','8','EQUIP','10','0','20','0','11','100','21','100',
    '0','TEXT','5','A2','8','TEXT','10','10','20','10','40','5','1','한글',
    '0','ENDSEC','0','EOF','',
  ].join('\n'));
  const file=await createDrawing(request,'dxf-stall-'+Date.now(),undefined,undefined,withText);
  let gets=0;page.on('request',r=>{if(r.url().includes(`/api/cad-files/${file.id}/content`))gets++;});
  let completed=0;page.on('requestfinished',r=>{if(r.url().includes(`/api/cad-files/${file.id}/content`))completed++;});
  let release! : () => void;
  const hold=new Promise<void>(resolve=>{release=resolve;});
  let routeEntered! : () => void;
  const fontStarted=new Promise<void>(resolve=>{routeEntered=resolve;});
  await page.route('**/fonts/NanumGothic-Regular.ttf',async route=>{routeEntered();await hold;await route.abort().catch(()=>undefined);});
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=dxf-viewer`,{waitUntil:'domcontentloaded'});
  await fontStarted;
  await expect(page.getByTestId('viewer-loading-overlay')).toBeVisible();
  await page.getByRole('button',{name:'로딩 중단 후 three-dxf-viewer로 열기'}).click();
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  release();
  expect(completed).toBe(1);
  expect(gets-completed).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('cad-canvas').locator('canvas')).toHaveCount(1);
});

test('TC-127-MENU: keyboard directions, Space link activation and focus return',async({page,request})=>{
  const file=await createDrawing(request,'keyboard-'+Date.now());
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const view=menu(page,'보기');
  await view.click();
  await expect(page.getByRole('menu',{name:'보기 명령'})).toBeVisible();
  await view.press('ArrowDown');
  await expect(page.getByRole('menuitemradio',{name:'three-dxf-viewer',exact:true})).toBeFocused();
  await view.focus();await view.press('ArrowUp');
  await expect(page.getByRole('menuitem',{name:'브라우저 전체 화면'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(view).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await view.focus();await page.keyboard.press('Space');
  await expect(page.getByRole('menu',{name:'보기 명령'})).toBeVisible();
  await expect(page.getByRole('menuitemradio',{name:'three-dxf-viewer',exact:true})).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem',{name:'브라우저 전체 화면'})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menu',{name:'작업 명령'})).toBeVisible();
  await expect(page.getByRole('menuitemcheckbox',{name:'레이어 패널'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page,'작업')).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await menu(page,'작업').press('ArrowUp');
  await expect(page.getByRole('menu',{name:'작업 명령'})).toBeVisible();
  await expect(page.getByRole('menuitem',{name:'외곽선 타입 관리'})).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menu',{name:'보기 명령'})).toBeVisible();
  await expect(page.getByRole('menuitemradio',{name:'three-dxf-viewer',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(view).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await menu(page,'도면').focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('menu',{name:'도면 명령'})).toBeVisible();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem',{name:'버전 목록'})).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(new RegExp(`/cad/locations/`));
});

test('TC-126-RECOVERY: a later Version starts a fresh Three attempt after earlier fallback',async({page,request})=>{
  const first=await createDrawing(request,'first-fallback-'+Date.now());
  const second=await createDrawing(request,'second-normal-'+Date.now());
  let fonts=0;
  await page.route('**/fonts/CadKorean.typeface.json',async route=>{fonts++;if(fonts===1)await route.abort();else await route.continue();});
  await page.goto(`/cad/versions/${first.id}/viewer`);
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await page.goto(`/cad/versions/${second.id}/viewer`);
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('viewer-recovery-notice')).toHaveCount(0);
});

test('TC-126-CAPABILITY: selected work prompts before manual renderer switch, cancel preserves it',async({page,request})=>{
  const file=await createDrawing(request,'unsaved-'+Date.now());
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await menu(page,'작업').click();
  await page.getByRole('menuitemcheckbox',{name:'선택·편집 도구'}).click();
  await page.getByTestId('canvas-mode-objects').click();
  await page.getByRole('button',{name:'도구 닫기'}).click();
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  const box=await canvas.boundingBox();expect(box).not.toBeNull();
  await page.mouse.move(box!.x+5,box!.y+5);await page.mouse.down();
  await page.mouse.move(box!.x+box!.width-5,box!.y+box!.height-5,{steps:8});await page.mouse.up();
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:'선택·편집 도구'}).click();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개');
  await menu(page,'보기').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu',{name:'보기 명령'})).toHaveCount(0);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개');
  await page.getByRole('button',{name:'도구 닫기'}).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewer-tools-dock')).toHaveCount(0);
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:'선택·편집 도구'}).click();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개');
  page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');await dialog.dismiss();});
  await menu(page,'보기').click();await page.getByRole('menuitemradio',{name:'dxf-viewer',exact:true}).click();
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('three-dxf-viewer');
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개');
  page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');await dialog.accept();});
  await menu(page,'보기').click();await page.getByRole('menuitemradio',{name:'dxf-viewer',exact:true}).click();
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
});

test('TC-127-METADATA: long tooltip scrolls by keyboard and touch; empty description omits it',async({page,request,browser})=>{
  const long=await createDrawing(request,'long-description-'+Date.now(),'설비 배치 설명\n'.repeat(120),'설비 배치 상세 검토 도면 '.repeat(6));
  await page.goto(`/cad/versions/${long.id}/viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const name=page.getByTestId('viewer-toolbar').getByRole('button',{name:long.displayName});
  await name.focus();
  const tooltip=page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  expect(await tooltip.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
  await page.keyboard.press('Tab');await expect(tooltip).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect.poll(()=>tooltip.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(name).toBeFocused();
  const empty=await createDrawing(request,'empty-description-'+Date.now(),'');
  await page.goto(`/cad/versions/${empty.id}/viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await page.getByTestId('viewer-toolbar').getByRole('button',{name:empty.displayName}).focus();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const touchContext=await browser.newContext({baseURL:new URL(page.url()).origin,hasTouch:true,isMobile:true,viewport:{width:375,height:812}});
  try {
    const touchPage=await touchContext.newPage();
    await touchPage.goto(`/cad/versions/${long.id}/viewer`);
    await expect(touchPage.getByRole('status')).toHaveText('도면 표시 완료');
    await touchPage.getByRole('dialog',{name:'레이어'}).getByRole('button',{name:'레이어 패널 접기'}).tap();
    const touchName=touchPage.getByTestId('viewer-toolbar').getByRole('button',{name:long.displayName});
    await touchName.tap();await expect(touchPage.getByRole('tooltip')).toBeVisible();
    await touchName.tap();await expect(touchPage.getByRole('tooltip')).toHaveCount(0);
  } finally { await touchContext.close(); }
});

test('TC-127-DRAWER: mobile generated-delete confirmation remains interactive above its Drawer',async({page,request})=>{
  const square=Buffer.from([
    '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
    '0','SECTION','2','ENTITIES','0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
    '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
    '0','ENDSEC','0','EOF','',
  ].join('\n'));
  const file=await createDrawing(request,'mobile-delete-'+Date.now(),undefined,undefined,square);
  await page.setViewportSize({width:375,height:812});
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await page.getByRole('dialog',{name:'레이어'}).getByRole('button',{name:'레이어 패널 접기'}).click();
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:/외곽선 생성/}).click();
  await expect(page.getByRole('dialog',{name:'선택 및 외곽선 도구'})).toBeVisible();
  await page.getByRole('button',{name:'도구 닫기'}).click();
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.evaluate(node=>node.setAttribute('data-mobile-delete-stable','yes'));
  const box=await canvas.boundingBox();expect(box).not.toBeNull();
  await page.mouse.move(box!.x+5,box!.y+5);await page.mouse.down();
  await page.mouse.move(box!.x+box!.width-5,box!.y+box!.height-5,{steps:8});await page.mouse.up();
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:'선택·편집 도구'}).click();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
  await page.getByRole('button',{name:'볼록 외곽선 미리보기'}).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
  await page.getByRole('button',{name:'임시 확정'}).click();
  await page.getByRole('button',{name:'도구 닫기'}).click();
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:/외곽선 생성/}).click();
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:'선택·편집 도구'}).click();
  await page.getByTestId('canvas-mode-generated').click();
  await page.getByRole('button',{name:'도구 닫기'}).click();
  await page.mouse.move(box!.x+5,box!.y+5);await page.mouse.down();
  await page.mouse.move(box!.x+box!.width-5,box!.y+box!.height-5,{steps:8});await page.mouse.up();
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:'선택·편집 도구'}).click();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 1개');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'선택 및 외곽선 도구'})).toHaveCount(0);
  await menu(page,'보기').click();await page.keyboard.press('Escape');
  await expect(page.getByRole('menu',{name:'보기 명령'})).toHaveCount(0);
  await menu(page,'작업').click();await page.getByRole('menuitemcheckbox',{name:'선택·편집 도구'}).click();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 1개');
  const drawer=page.getByRole('dialog',{name:'선택 및 외곽선 도구'});
  await page.getByTestId('generated-delete-selected').click();
  const confirm=page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 1개');
  await expect(drawer).toHaveAttribute('inert','');
  await expect(drawer).not.toHaveAttribute('aria-modal','true');
  await expect(confirm.getByRole('button',{name:'삭제 취소'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByTestId('generated-delete-confirm')).toBeFocused();
  await page.keyboard.press('Tab');await expect(confirm.getByRole('button',{name:'삭제 취소'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(drawer).not.toHaveAttribute('inert','');
  await expect(drawer).toHaveAttribute('aria-modal','true');
  await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 1개');
  await expect(page.getByTestId('generated-delete-selected')).toBeFocused();
  await page.getByTestId('generated-delete-selected').click();
  await confirm.getByRole('button',{name:'삭제 취소'}).click();
  await expect(confirm).toHaveCount(0);
  await expect(drawer).toHaveAttribute('aria-modal','true');
  await expect(page.getByTestId('generated-delete-selected')).toBeFocused();
  await page.getByTestId('generated-delete-selected').click();
  await page.getByTestId('generated-delete-confirm').click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByTestId('generated-undo')).toContainText('1');
  await expect(canvas).toHaveAttribute('data-mobile-delete-stable','yes');
});
