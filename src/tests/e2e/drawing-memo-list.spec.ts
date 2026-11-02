import { expect, test } from '@playwright/test';

test('#202 basic drawing list memo field, URL/reset and denied empty state at narrow width', async ({page}) => {
  await page.setViewportSize({width:320,height:740});
  await page.goto('/');
  const memo=page.getByRole('searchbox',{name:'메모 검색어 (제목·본문)'});
  await expect(memo).toBeVisible();
  await memo.fill('모터 %_');
  await page.getByRole('button',{name:'검색',exact:true}).click();
  await expect(page).toHaveURL(/memo=%EB%AA%A8%ED%84%B0/);
  await expect(page.getByRole('alert').filter({hasText:'메모 검색에는'})).toContainText('로그인');
  await expect(page.getByText(/검색 결과\s+\d+개/)).toHaveCount(0);
  await page.getByRole('link',{name:'검색 초기화'}).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('searchbox',{name:'메모 검색어 (제목·본문)'})).toHaveValue('');
});
