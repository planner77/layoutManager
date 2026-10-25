import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { masterFields } from './master-helper';

const drawing = Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','1A','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));

async function createDrawing(request: APIRequestContext, businessUnit: string) {
  const response = await request.post('/api/cad-files', {multipart:{
    file:{name:businessUnit+'.dxf',mimeType:'application/octet-stream',buffer:drawing},
    ...(await masterFields(request, {businessUnit,site:'tree-test',building:'A',floor:'1'})),
    registeredAt:'2026-10-25',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  return (await response.json()) as {id:string};
}

async function selectSquare(page: Page) {
  const canvas = page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 5, box!.y + 5);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 5, box!.y + box!.height - 5, {steps:8});
  await page.mouse.up();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
}

test('TC-U6-E2E-001: legacy tree, individual/group overlay visibility, focus and layer/tool isolation', async ({page, request}) => {
  const file = await createDrawing(request,'issue43-legacy');
  let contentRequests=0;
  page.on('request', req=>{if(new URL(req.url()).pathname==='/api/cad-files/'+file.id+'/content')contentRequests++;});
  await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const menu=page.getByTestId('viewer-menu-outline-tree');
  await expect(menu).toBeEnabled();
  await expect(menu).toHaveAttribute('aria-pressed','false');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded','true');
  await expect(menu).toHaveAttribute('aria-controls','viewer-outline-tree-dock');
  const panel=page.getByTestId('viewer-outline-tree');
  await expect(panel.getByTestId('outline-tree-empty')).toBeVisible();
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.evaluate(element=>element.setAttribute('data-u6-stable','yes'));

  const toolMenu=page.getByTestId('viewer-menu-outline-tool');
  await toolMenu.click();
  await selectSquare(page);
  const tools=page.getByTestId('cad-outline-tools');
  await tools.getByRole('button',{name:'볼록 외곽선 미리보기'}).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
  await tools.getByRole('button',{name:'임시 확정'}).click();
  await expect(panel.getByTestId('outline-tree-item')).toHaveCount(1);
  await tools.getByRole('button',{name:'정밀 외곽선 미리보기'}).click();
  await expect(page.getByTestId('outline-preview')).toContainText('실제 폐곡선 Union');
  await tools.getByRole('button',{name:'임시 확정'}).click();
  await expect(panel.getByTestId('outline-tree-item')).toHaveCount(2);
  await expect(panel.getByTestId('outline-tree-group')).toHaveCount(1);
  await expect(panel.getByTestId('outline-tree-group')).toContainText('미분류 (legacy) (2)');
  await expect(panel.getByTestId('outline-tree-temporary')).toContainText('재접속 시 소멸');

  const first=panel.getByTestId('outline-tree-item').first();
  await first.getByRole('button',{name:'외곽선 1 숨기기'}).click();
  await expect(first.getByRole('button',{name:'외곽선 1 표시'})).toBeVisible();
  const layer=page.getByRole('complementary',{name:'전체 화면 레이어'})
    .getByRole('checkbox',{name:'EQUIP'});
  await expect(layer).toBeChecked();
  await layer.uncheck();
  await expect(first.getByRole('button',{name:'외곽선 1 표시'})).toBeVisible();
  await first.getByRole('button',{name:'외곽선 1 표시'}).click();
  await expect(first.getByRole('button',{name:'외곽선 1 숨기기'})).toBeVisible();
  await expect(layer).not.toBeChecked();
  await layer.check();

  await panel.getByRole('button',{name:'미분류 (legacy) 전체 숨기기'}).click();
  await expect(first.getByRole('button',{name:'외곽선 1 표시'})).toBeVisible();
  await panel.getByRole('button',{name:'미분류 (legacy) 전체 표시'}).click();
  await expect(first.getByRole('button',{name:'외곽선 1 숨기기'})).toBeVisible();
  const group=panel.getByRole('treeitem',{name:/미분류/});
  await group.focus();
  await page.keyboard.press('ArrowDown');
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-selected','true');
  await expect(layer).toBeChecked();
  await expect(canvas).toHaveAttribute('data-u6-stable','yes');

  await toolMenu.click();
  await expect(toolMenu).toHaveAttribute('aria-pressed','false');
  await expect(panel.getByTestId('outline-tree-item')).toHaveCount(2);
  await expect(first.getByRole('button',{name:'외곽선 1 삭제'})).toBeDisabled();
  const pending=page.waitForEvent('download');
  await page.getByTestId('outline-saved-tools').getByRole('button',{name:/JSON 내보내기/}).click();
  const downloaded=JSON.parse(await readFile(await (await pending).path(),'utf8'));
  expect(downloaded.schemaVersion).toBe(1);
  expect(downloaded.outlines).toHaveLength(2);
  expect(downloaded.outlines[0]).not.toHaveProperty('visible');

  await page.setViewportSize({width:320,height:700});
  await expect(panel).toBeVisible();
  const box=await canvas.boundingBox();
  expect(box?.height).toBeGreaterThan(50);
  // P2 regression: keyboard navigation must scroll only the tree viewport,
  // not the outer CAD workspace, even in the 20dvh compact dock.
  const scrollTopBefore=await page.evaluate(()=>window.scrollY);
  const treeViewport=panel.getByTestId('outline-tree-items');
  await expect(treeViewport).toBeVisible();
  await group.focus();
  await page.keyboard.press('End');
  const last=panel.getByTestId('outline-tree-item').last();
  await expect(last).toBeFocused();
  const visible=await last.evaluate(node=>{
    const viewport=node.closest('[role="tree"]');
    if(!viewport)return false;
    const item=node.getBoundingClientRect();
    const container=viewport.getBoundingClientRect();
    return item.top>=container.top-1 && item.bottom<=container.bottom+1;
  });
  expect(visible).toBe(true);
  expect(await page.evaluate(()=>window.scrollY)).toBe(scrollTopBefore);
  await page.keyboard.press('Home');
  await expect(group).toBeFocused();
  await panel.getByRole('button',{name:'외곽선 목록 닫기'}).click();
  await expect(menu).toHaveAttribute('aria-pressed','false');
  await expect(menu).toBeFocused();
  expect(contentRequests).toBe(1);
});

test('TC-U6-E2E-002: unsupported renderer, reload and other Version fail closed',async({page,request})=>{
  const first=await createDrawing(request,'issue43-version-A');
  const second=await createDrawing(request,'issue43-version-B');
  await page.goto('/cad/versions/'+first.id+'/viewer?renderer=dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const treeMenu=page.getByTestId('viewer-menu-outline-tree');
  await expect(treeMenu).toBeDisabled();
  await expect(treeMenu).not.toHaveAttribute('aria-controls',/viewer-outline-tree-dock/);
  await page.getByRole('button',{name:'three-dxf-viewer',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(treeMenu).toBeEnabled();
  await page.getByTestId('viewer-menu-outline-tool').click();
  await selectSquare(page);
  await page.getByRole('button',{name:'볼록 외곽선 미리보기'}).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
  await page.getByRole('button',{name:'임시 확정'}).click();
  await treeMenu.click();
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(1);
  await page.getByRole('button',{name:'다시 불러오기'}).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(treeMenu).toHaveAttribute('aria-pressed','false');
  await treeMenu.click();
  await expect(page.getByTestId('outline-tree-empty')).toBeVisible();
  await page.goto('/cad/versions/'+second.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await treeMenu.click();
  await expect(page.getByTestId('outline-tree-empty')).toBeVisible();
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(0);
});
