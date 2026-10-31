
import { expect,test,type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { masterFields } from './master-helper';
import { clickViewerTestCommand } from './viewer-menu-helper';

const dxf=Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n');
async function drawing(request:APIRequestContext){
 const response=await request.post('/api/cad-files',{multipart:{
   file:{name:'memo-link-validation.dxf',mimeType:'application/octet-stream',buffer:dxf},
   ...(await masterFields(request,{businessUnit:'M6',site:'Link',building:'A',floor:'1'})),
   registeredAt:'2026-10-31',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(response.status()).toBe(201);
 return await response.json() as {id:string};
}
test('#88: invalid memo UUID does not open arbitrary memo',async({page,request})=>{
 const file=await drawing(request);
 await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer&memo=invalid');
 await expect(page.getByTestId('memo-link-notice')).toContainText('형식이 올바르지');
 await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
});
test('#88: unsupported renderer is reported without unverified fallback focus',async({page,request})=>{
 const file=await drawing(request);
 await page.goto('/cad/versions/'+file.id+'/viewer?renderer=dxf-viewer&memo='+randomUUID());
 await expect(page.getByTestId('memo-link-notice')).toContainText('지원하지 않습니다');
});
test('#90: CAD list offers separate global memo search without changing Current list',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('link',{name:'메모 검색 (전체 도면)'})).toBeVisible();
 await page.getByRole('link',{name:'메모 검색 (전체 도면)'}).click();
 await expect(page.getByTestId('cad-memo-global-search')).toBeVisible();
 await expect(page.getByTestId('memo-search-query')).toHaveValue('');
 await expect(page.getByTestId('memo-search-empty')).toHaveCount(0);
});

test('#88 P2: memo HTTP retry preserves the same WebGL Canvas and unsaved session memo',async({page,request})=>{
 const file=await drawing(request);
 await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer&memo='+randomUUID());
 await expect(page.getByTestId('memo-link-retry')).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'도면 표시 완료'}).first()).toBeVisible();
 await clickViewerTestCommand(page,'viewer-menu-memo-add');
 await page.getByTestId('cad-memo-title').fill('재시도 중 유지');
 await page.getByTestId('cad-memo-content').fill('저장 전 임시 메모');
 await page.getByTestId('cad-memo-x').fill('10');
 await page.getByTestId('cad-memo-y').fill('20');
 await page.getByTestId('cad-memo-coordinate-place').click();
 await page.getByTestId('cad-memo-create').click();
 await expect(page.getByTestId('cad-memo-pin')).toHaveCount(1);
 const canvas=page.getByTestId('cad-canvas').locator('canvas').first();
 await expect(canvas).toBeVisible();
 await canvas.evaluate(element=>element.setAttribute('data-memo-retry-original','true'));
 const refreshed=page.waitForResponse(response=>response.url().endsWith('/api/g7-runtime/status'));
 await page.getByTestId('memo-link-retry').click();
 await refreshed;
 await expect(canvas).toHaveAttribute('data-memo-retry-original','true');
 await expect(page.getByTestId('cad-memo-pin')).toHaveCount(1);
 await expect(page.getByTestId('cad-memo-latest')).toContainText('재시도 중 유지');
});
