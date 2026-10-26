import { expect, type Page } from '@playwright/test';

type Group = 'drawing' | 'view' | 'work';

const groupLabels: Record<Group, string> = {
  drawing: '도면',
  view: '보기',
  work: '작업',
};

export async function openViewerMenu(page: Page, group: Group) {
  const mobileDrawer = page.locator('[data-testid="cad-viewer-shell"] [role="dialog"][data-drawer]');
  if (await mobileDrawer.isVisible().catch(() => false)) {
    if (await page.evaluate(() => matchMedia('(max-width: 767px)').matches)) {
      const panel = await mobileDrawer.getAttribute('data-drawer');
      const closeName = panel === 'layers' ? '레이어 패널 접기' :
        panel === 'outlines' ? '외곽선 목록 닫기' : '도구 닫기';
      await mobileDrawer.getByRole('button', { name: closeName }).click();
    } else {
      // matchMedia's React effect may still be settling after a viewport resize.
      await expect(mobileDrawer).toHaveCount(0);
    }
  }
  const trigger = page.locator(`[data-viewer-group="${group}"]`);
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const menu = page.getByRole('menu', { name: `${groupLabels[group]} 명령` });
  await expect(menu).toBeVisible();
  return menu;
}

export async function clickViewerCommand(page: Page, group: Group, name: string) {
  const menu = await openViewerMenu(page, group);
  name = name === '← 버전 목록' ? '버전 목록' : name;
  const exactName = new RegExp(`^\\s*(?:✓\\s*)?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  await menu.locator('[role^="menuitem"]').filter({ hasText: exactName }).click();
}

export async function clickViewerTestCommand(page: Page, testId: string) {
  await openViewerMenu(page, 'work');
  await page.getByTestId(testId).click();
}
