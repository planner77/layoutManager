import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { masterFields } from './master-helper';
import { clickViewerCommand, clickViewerTestCommand } from './viewer-menu-helper';

const dxf=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));

async function drawing(request:APIRequestContext,tag:string) {
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:tag+'.dxf',mimeType:'application/octet-stream',buffer:dxf},
    ...(await masterFields(request,{businessUnit:tag,site:'memo-tree',building:'A',floor:'1'})),
    registeredAt:'2026-10-28',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  return (await response.json()) as {id:string};
}
async function openThree(page:Page, id:string) {
  await page.goto('/cad/versions/'+id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
}
async function createAt(page:Page, x:string, y:string, title:string, content:string) {
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await page.getByTestId('cad-memo-title').fill(title);
  await page.getByTestId('cad-memo-content').fill(content);
  await page.getByTestId('cad-memo-x').fill(x);
  await page.getByTestId('cad-memo-y').fill(y);
  await page.getByTestId('cad-memo-coordinate-place').click();
  await page.getByTestId('cad-memo-create').click();
  await expect(page.getByTestId('cad-memo-latest')).toContainText(title);
}

test('TC-M4-E2E-001: Tree local search, hidden selection/focus and no stored visibility',async({page,request})=>{
  const version=await drawing(request,'m4-tree');
  await openThree(page,version.id);
  await createAt(page,'10','20','모터 점검','첫 번째 점검 내용');
  await createAt(page,'40','50','설비 확인','CONVEYOR 상태');
  await clickViewerTestCommand(page,'viewer-menu-memo-tree');
  const tree=page.getByTestId('cad-memo-tree');
  await expect(tree).toBeVisible();
  await expect(tree.getByTestId('cad-memo-tree-item')).toHaveCount(2);
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(2);
  const first=tree.getByTestId('cad-memo-tree-item').filter({hasText:'모터 점검'});
  await first.getByTestId('cad-memo-tree-visibility').click();
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(1);
  await tree.getByTestId('cad-memo-tree-search').fill('점검 내용');
  await expect(tree.getByTestId('cad-memo-tree-item')).toHaveCount(1);
  await first.click();
  await expect(tree.getByTestId('cad-memo-tree-reveal-confirm')).toBeVisible();
  await tree.getByTestId('cad-memo-tree-reveal-confirm-button').click();
  // Camera focus can cull other pins, but the selected hidden pin has exact WCS.
  await expect(page.locator('[data-testid="cad-memo-pin"][data-memo-wcs-x="10"][data-memo-wcs-y="20"]')).toBeVisible();
    await expect(tree.getByTestId('memo-tree-visibility-status')).toContainText('표시');
  // A tree selection can temporarily reveal the hidden pin but may not modify the
  // saved data or affect source layers/outline visibility.
  await expect(first.getByTestId('cad-memo-tree-visibility')).toHaveAttribute('aria-pressed','false');
  await clickViewerCommand(page,'view','메모 전체 표시');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
  await clickViewerCommand(page,'view','메모 전체 표시');
  // Per-memo hiding remains in force after the global switch is restored.
  await expect(first.getByTestId('cad-memo-tree-visibility')).toHaveAttribute('aria-pressed','false');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page,'viewer-menu-memo-tree');
  await expect(page.getByTestId('cad-memo-tree')).toContainText('메모 트리 (0)');
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
});

test('TC-M4-E2E-002: group reassignment, tree keyboard, shared right dock and mobile modal',async({page,request})=>{
  const version=await drawing(request,'m4-groups');
  await openThree(page,version.id);
  await createAt(page,'10','20','그룹메모','가나다');
  await clickViewerTestCommand(page,'viewer-menu-memo-tree');
  const tree=page.getByTestId('cad-memo-tree');
  await tree.getByTestId('cad-memo-tree-group-name').fill('A 설비');
  await tree.getByTestId('cad-memo-tree-add-group').click();
  await expect(tree.getByTestId('cad-memo-tree-group')).toHaveCount(2);
  await tree.getByTestId('cad-memo-tree-assign-group').selectOption({label:'A 설비'});
  const target=tree.getByTestId('cad-memo-tree-group').filter({hasText:'A 설비'});
  await expect(target.getByTestId('cad-memo-tree-item')).toHaveCount(1);
  await target.getByRole('treeitem',{name:/A 설비/}).first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(target.getByTestId('cad-memo-tree-item')).toBeFocused();
  await target.getByRole('button',{name:/A 설비 전체 숨김/}).click();
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
  await clickViewerTestCommand(page,'viewer-menu-outline-tree');
  await expect(page.getByTestId('viewer-memo-tree-dock')).toHaveCount(0);
  await expect(page.getByTestId('viewer-outline-tree-dock')).toBeVisible();
  await clickViewerTestCommand(page,'viewer-menu-memo-tree');
  await expect(page.getByTestId('viewer-outline-tree-dock')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByTestId('viewer-memo-tree-dock')).toHaveAttribute('role','dialog');
  await expect(page.getByTestId('cad-viewer-shell').locator('header')).toHaveJSProperty('inert',true);
  await page.getByTestId('cad-memo-tree').getByRole('button',{name:'메모 트리 닫기'}).click();
  await expect(page.getByTestId('viewer-memo-tree-dock')).toHaveCount(0);
  await expect(page.getByTestId('cad-viewer-shell').locator('header')).toHaveJSProperty('inert',false);
});

test('TC-M4-P1: dedicated desktop handle floats, reopens, keyboard positions and resets without remounting canvas',async({page,request})=>{
  await page.setViewportSize({width:1366,height:900});
  const version=await drawing(request,'m4-movable');
  await openThree(page,version.id);
  await createAt(page,'20','30','창 이동 회귀','원본 좌표 불변');
  await clickViewerTestCommand(page,'viewer-menu-memo-tree');
  const dock=page.getByTestId('viewer-memo-tree-dock');
  const handle=page.getByTestId('viewer-memo-panel-drag-handle');
  await expect(dock).toHaveAttribute('data-viewer-panel-mode','edge');
  await page.evaluate(()=>{
    (window as Window & {__testMemoCanvas?:Element|null}).__testMemoCanvas=
      document.querySelector('[data-testid="cad-canvas"]');
  });
  const previous=await dock.boundingBox(), h=await handle.boundingBox();
  expect(previous).not.toBeNull();expect(h).not.toBeNull();
  await page.mouse.move(h!.x+h!.width/2,h!.y+h!.height/2);
  await page.mouse.down();
  await page.mouse.move(h!.x+h!.width/2-75,h!.y+h!.height/2+55,{steps:7});
  await page.mouse.up();
  await expect(dock).toHaveAttribute('data-viewer-panel-mode','floating');
  const moved=await dock.boundingBox();
  expect(moved!.x).toBeLessThan(previous!.x-35);
  expect(moved!.y).toBeGreaterThan(previous!.y+20);
  expect(await page.evaluate(()=>
    (window as Window & {__testMemoCanvas?:Element|null}).__testMemoCanvas===
    document.querySelector('[data-testid="cad-canvas"]'))).toBe(true);
  await dock.getByTestId('viewer-memo-panel-close').click();
  await expect(dock).toHaveCount(0);
  await clickViewerTestCommand(page,'viewer-menu-memo-tree');
  await expect(dock).toHaveAttribute('data-viewer-panel-mode','floating');
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dock).toHaveAttribute('data-viewer-panel-mode','floating');
  await page.setViewportSize({width:1000,height:680});
  await expect.poll(async()=>{
    const box=await dock.boundingBox(),workspace=await page.getByTestId('viewer-workspace').boundingBox();
    return Boolean(box&&workspace&&box.x>=workspace.x-1&&box.y>=workspace.y-1&&
      box.x+box.width<=workspace.x+workspace.width+1&&box.y+box.height<=workspace.y+workspace.height+1);
  }).toBe(true);
  await dock.getByTestId('viewer-memo-panel-reset').click();
  await expect(dock).toHaveAttribute('data-viewer-panel-mode','edge');
  await page.setViewportSize({width:390,height:844});
  await expect(dock).toHaveAttribute('role','dialog');
  await expect(handle).toHaveCount(0);
  await expect(page.getByTestId('cad-memo-pin')).toHaveCount(1);
});

test('TC-M4-P2/M5: local group survives schedule save and group-name search respects completion filter',async({page,request})=>{
  const version=await drawing(request,'m4-status-filter');
  await openThree(page,version.id);
  await createAt(page,'15','20','첫 점검','기록 A');
  await createAt(page,'35','40','두 번째 점검','기록 B');
  await clickViewerTestCommand(page,'viewer-menu-memo-tree');
  const tree=page.getByTestId('cad-memo-tree');
  await tree.getByTestId('cad-memo-tree-group-name').fill('스테이션 그룹');
  await tree.getByTestId('cad-memo-tree-add-group').click();
  await expect(tree.getByTestId('cad-memo-tree-group')).toHaveCount(2);
  const first=tree.getByTestId('cad-memo-tree-item').filter({hasText:'첫 점검'});
  const second=tree.getByTestId('cad-memo-tree-item').filter({hasText:'두 번째 점검'});
  await first.getByTestId('cad-memo-tree-assign-group').selectOption({label:'스테이션 그룹'});
  await second.getByTestId('cad-memo-tree-assign-group').selectOption({label:'스테이션 그룹'});
  const group=tree.getByTestId('cad-memo-tree-group').filter({hasText:'스테이션 그룹'});
  await expect(group.getByTestId('cad-memo-tree-item')).toHaveCount(2);
  await group.getByTestId('cad-memo-tree-item').filter({hasText:'첫 점검'})
    .getByRole('button',{name:'편집'}).click();
  const settings=page.getByTestId('cad-memo-settings');
  await settings.getByTestId('cad-memo-completion-enabled').check();
  await settings.getByTestId('cad-memo-is-completed').check();
  await settings.getByTestId('cad-memo-save-settings').click();
  await expect(group.getByTestId('cad-memo-tree-item')).toHaveCount(2);
  await tree.getByTestId('cad-memo-tree-search').fill('스테이션 그룹');
  await tree.getByTestId('cad-memo-tree-status-filter').selectOption('completed');
  await expect(group.getByTestId('cad-memo-tree-item')).toHaveCount(1);
  await expect(group.getByTestId('cad-memo-tree-item').first()).toContainText('첫 점검');
  await tree.getByTestId('cad-memo-tree-status-filter').selectOption('progress');
  await expect(group.getByTestId('cad-memo-tree-item')).toHaveCount(0);
  await tree.getByTestId('cad-memo-tree-status-filter').selectOption('registered');
  await expect(group.getByTestId('cad-memo-tree-item')).toHaveCount(1);
  await expect(group.getByTestId('cad-memo-tree-item').first()).toContainText('두 번째 점검');
});
