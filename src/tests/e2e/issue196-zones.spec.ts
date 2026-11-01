import {expect,test} from '@playwright/test';
import {masterFields} from './master-helper';
import {openViewerMenu} from './viewer-menu-helper';

const dxf=Buffer.from([
 '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES','0','LINE','5','ZA','8','ZONE','10','0','20','0','11','100','21','100',
 '0','ENDSEC','0','EOF','',
].join('\n'));

test('#196 zone controls remain gated on legacy source and renderer fallback without replacing the canvas session',async({page,request})=>{
 const upload=await request.post('/api/cad-files',{multipart:{
  file:{name:'zone-legacy.dxf',mimeType:'application/octet-stream',buffer:dxf},
  ...(await masterFields(request,{businessUnit:'zone-legacy',site:'zone-site',building:'A',floor:'1'})),
  registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(upload.status()).toBe(201);const {id}=await upload.json() as {id:string};
 let zoneReads=0;
 page.on('request',req=>{if(new URL(req.url()).pathname===`/api/cad-files/${id}/zones`)zoneReads++;});
 await page.goto(`/cad/versions/${id}/viewer?renderer=three-dxf-viewer`);
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 const canvas=page.getByTestId('cad-canvas').locator('canvas');
 await expect(canvas).toBeVisible();
 const original=await canvas.elementHandle();
 await openViewerMenu(page,'work');
 const create=page.getByTestId('viewer-menu-zone-create'),list=page.getByTestId('viewer-menu-zone-list');
 await expect(create).toHaveAttribute('aria-disabled','true');
 await expect(list).toHaveAttribute('aria-disabled','true');
 await expect(list).toHaveAttribute('title',/Scene|구역/);
 await expect(page.getByTestId('viewer-zone-dock')).toHaveCount(0);
 await expect.poll(()=>zoneReads).toBeGreaterThan(0);
 expect(await original!.evaluate(node=>node===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
 await page.getByRole('button',{name:'보기',exact:true}).click();
 await page.getByRole('menuitemradio',{name:'dxf-viewer',exact:true}).click();
 await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await openViewerMenu(page,'work');
 await expect(create).toHaveAttribute('aria-disabled','true');
 await expect(create).toHaveAttribute('title',/DXF three-dxf-viewer/);
 await expect(page.getByTestId('viewer-zone-dock')).toHaveCount(0);
});
