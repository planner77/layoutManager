import {test,expect} from '@playwright/test';
import {masterFields} from './master-helper';
const drawing=[
 '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES',
 '0','LWPOLYLINE','5','1A','8','0','70','1',
 '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
 '0','ENDSEC','0','EOF','',
].join('\n');
test('TC-OUT-E2E-001: selection and convex/precise preview, non-destructive JSON export',async({page,request})=>{
 const created=await request.post('/api/cad-files',{multipart:{
   file:{name:'issue31-outline-square.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(drawing)},
   ...(await masterFields(request,{businessUnit:'Issue31',site:'outline',building:'A',floor:'1'})),
   registeredAt:'2026-10-16',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(created.status()).toBe(201);
 const file=await created.json();
 await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 const tools=page.getByTestId('cad-outline-tools');
 await expect(tools).toBeVisible();
 await tools.getByRole('button',{name:'선택 모드'}).click();
 const canvas=page.locator('canvas');
 const box=(await canvas.boundingBox())!;
 // Left-to-right window contains the entire fitted 2D square.
 await page.mouse.move(box.x+5,box.y+5);await page.mouse.down();
 await page.mouse.move(box.x+box.width-5,box.y+box.height-5,{steps:8});await page.mouse.up();
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
 await tools.getByRole('button',{name:'볼록 외곽선 미리보기'}).click();
 await expect(page.getByTestId('outline-preview')).toContainText('볼록 경계');
 await tools.getByRole('button',{name:'임시 확정'}).click();
 const download=page.waitForEvent('download');
 await tools.getByRole('button',{name:/JSON 내보내기/}).click();
 const fileDownload=await download;
 expect(fileDownload.suggestedFilename()).toMatch(/cad-outlines-/);
 await tools.getByRole('button',{name:'정밀 외곽선 미리보기'}).click();
 await expect(page.getByTestId('outline-preview')).toContainText('실제 폐곡선 Union');
 await page.getByRole('button',{name:'전체 화면',exact:true}).click();
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
 await page.getByRole('button',{name:'전체 화면 종료',exact:true}).click();
 await tools.getByRole('button',{name:'선택 해제'}).click();
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
 await tools.getByRole('button',{name:'탐색 모드'}).click();
 await page.getByRole('button',{name:'다시 불러오기'}).click();
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
});
