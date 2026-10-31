import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {masterFields} from './master-helper';
import {clickViewerCommand,clickViewerTestCommand} from './viewer-menu-helper';
import {createTextSearchDxf} from '../fixtures/text-search-dxf';

const sourceSquare=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));

async function drawing(request:APIRequestContext,name:string,data=Buffer.from(createTextSearchDxf())){
  const created=await request.post('/api/cad-files',{multipart:{
    file:{name:name+'.dxf',mimeType:'application/octet-stream',buffer:data},
    ...(await masterFields(request,{businessUnit:name,site:'viewer-movable',building:'A',floor:'1'})),
    registeredAt:'2026-10-31',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(created.status()).toBe(201);
  return (await created.json()) as {id:string};
}
async function openViewer(page:Page,id:string){
  await page.goto('/cad/versions/'+id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
}
async function movePanel(page:Page,kind:'layers'|'outlines'|'tools'|'search',dx=-80,dy=55){
  const dock=page.getByTestId(kind==='search'?'viewer-text-search-dock':
    kind==='outlines'?'viewer-outline-tree-dock':kind==='layers'?'viewer-layer-dock':'viewer-tools-dock');
  const handle=page.getByTestId('viewer-'+kind+'-panel-drag-handle');
  await expect(dock).toHaveAttribute('data-viewer-panel-mode','edge');
  const rect=await handle.boundingBox();expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+rect!.width/2,rect!.y+rect!.height/2);
  await page.mouse.down();
  await page.mouse.move(rect!.x+rect!.width/2+dx,rect!.y+rect!.height/2+dy,{steps:8});
  await page.mouse.up();
  await expect(dock).toHaveAttribute('data-viewer-panel-mode','floating');
  return dock;
}

test('TC-138-01: shared layer/outline/tools/search panels move without Canvas reload or text query loss',async({page,request})=>{
  await page.setViewportSize({width:1440,height:900});
  const file=await drawing(request,'viewer-panels-'+Date.now());
  let contents=0;
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/cad-files/'+file.id+'/content')contents++;});
  await openViewer(page,file.id);
  const canvas=page.getByTestId('cad-canvas');
  await canvas.evaluate(el=>el.setAttribute('data-panel-identity','stable'));
  const layer=await movePanel(page,'layers',180,70);
  await layer.getByTestId('viewer-layers-panel-reset').click();
  await expect(layer).toHaveAttribute('data-viewer-panel-mode','edge');
  await clickViewerTestCommand(page,'viewer-menu-outline-tree');
  const outlines=await movePanel(page,'outlines',-180,100);
  await outlines.getByTestId('viewer-outlines-panel-close').click();
  await expect(outlines).toHaveCount(0);
  await clickViewerTestCommand(page,'viewer-menu-tools');
  const tools=await movePanel(page,'tools',120,-80);
  await tools.getByTestId('viewer-tools-panel-reset').click();
  await expect(tools).toHaveAttribute('data-viewer-panel-mode','edge');
  await clickViewerCommand(page,'work','도면 내 텍스트 검색');
  const searchDock=await movePanel(page,'search',-125,80);
  const query=page.getByRole('searchbox',{name:'도면 텍스트 검색어'});
  await query.fill('abc 123');
  await expect(page.getByTestId('cad-text-search')).toContainText('검색 결과 3개');
  await searchDock.getByTestId('viewer-search-panel-close').click();
  await expect(searchDock).toHaveCount(0);
  await clickViewerCommand(page,'work','도면 내 텍스트 검색');
  await expect(query).toHaveValue('abc 123');
  await expect(searchDock).toHaveAttribute('data-viewer-panel-mode','floating');
  await searchDock.getByTestId('viewer-search-panel-reset').click();
  await expect(searchDock).toHaveAttribute('data-viewer-panel-mode','edge');
  await expect(canvas).toHaveAttribute('data-panel-identity','stable');
  expect(contents).toBe(1);
});

test('TC-138-02: compact mobile search is a single modal; Escape closes it without exiting Viewer',async({page,request})=>{
  await page.setViewportSize({width:375,height:812});
  const file=await drawing(request,'viewer-mobile-'+Date.now());
  await openViewer(page,file.id);
  await clickViewerCommand(page,'work','도면 내 텍스트 검색');
  const dock=page.getByTestId('viewer-text-search-dock');
  await expect(dock).toHaveAttribute('role','dialog');
  await expect(dock).toHaveAttribute('aria-modal','true');
  await expect(page.getByTestId('cad-viewer-shell').locator('header')).toHaveJSProperty('inert',true);
  await page.getByRole('searchbox',{name:'도면 텍스트 검색어'}).focus();
  await page.keyboard.press('Escape');
  await expect(dock).toHaveCount(0);
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
});

test('TC-137-01: visible first header list link works from direct Viewer URL without browser history',async({page,request})=>{
  const file=await drawing(request,'viewer-home-'+Date.now());
  await openViewer(page,file.id);
  const link=page.getByTestId('viewer-back-to-list');
  await expect(link).toHaveAttribute('href','/');
  await expect(link).toHaveAttribute('aria-label','도면 목록으로 이동');
  const ordered=await page.getByTestId('viewer-menu-bar').locator('a,button').allTextContents();
  expect(ordered.join('')).toContain('도면');
  await link.click();
  await expect(page).toHaveURL(/\/$/);
});

test('TC-137-02: local outline selection requires discard confirmation; cancel preserves Viewer',async({page,request})=>{
  const file=await drawing(request,'viewer-discard-'+Date.now(),sourceSquare);
  await openViewer(page,file.id);
  await clickViewerTestCommand(page,'viewer-menu-outline-tool');
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  const rect=await canvas.boundingBox();expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+5,rect!.y+5);
  await page.mouse.down();
  await page.mouse.move(rect!.x+rect!.width-5,rect!.y+rect!.height-5,{steps:8});
  await page.mouse.up();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('임시 외곽선');await dialog.dismiss();});
  await page.getByTestId('viewer-back-to-list').click();
  await expect(page.getByTestId('cad-viewer-shell')).toBeVisible();
  await expect(page).toHaveURL(new RegExp('/cad/versions/'+file.id+'/viewer'));
  page.once('dialog',async dialog=>{await dialog.accept();});
  await page.getByTestId('viewer-back-to-list').click();
  await expect(page).toHaveURL(/\/$/);
});

for (const renderer of ['dxf-viewer','three-dxf-viewer'] as const) {
  test('TC-139-E2E: '+renderer+' indexes UTF-8 Korean even when DXF AC1032 still declares ANSI_949',async({page,request})=>{
    const source=createTextSearchDxf().replace(
      '0\nSECTION\n2\nENTITIES',
      '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1032\n9\n$DWGCODEPAGE\n3\nANSI_949\n0\nENDSEC\n0\nSECTION\n2\nENTITIES'
    );
    const created=await drawing(request,'viewer-codepage-'+renderer+'-'+Date.now(),Buffer.from(source,'utf8'));
    await page.goto('/cad/versions/'+created.id+'/viewer?renderer='+renderer);
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    await clickViewerCommand(page,'work','도면 내 텍스트 검색');
    const input=page.getByRole('searchbox',{name:'도면 텍스트 검색어'});
    await input.fill('검사 구역 45');
    await expect(page.getByTestId('cad-text-search')).toContainText('검색 결과 1개');
    await expect(page.getByTestId('cad-text-search').getByRole('listitem')).toHaveCount(1);
  });
}
