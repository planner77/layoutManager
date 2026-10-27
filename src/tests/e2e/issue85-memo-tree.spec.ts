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
