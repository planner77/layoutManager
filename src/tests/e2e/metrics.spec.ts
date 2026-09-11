import {test,expect} from '@playwright/test';
test('TC-MET-001: measurement export matches displayed renderer and empty state',async({page,request})=>{
  const response=await request.post('/api/cad-files',{multipart:{file:{name:'metrics-empty.dxf',mimeType:'application/octet-stream',buffer:Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')},businessUnit:'Metrics',site:'export',building:'A',floor:'1',registeredAt:'2026-09-08',makeCurrent:'false',deletePassword:'1234'}});
  const file=await response.json();await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect(page.getByRole('status')).toContainText('표시할 도형');
  const metric=JSON.parse((await page.getByTestId('viewer-metric').textContent())!);
  expect(metric.result).toBe('empty');expect(metric.firstDisplayMs).toBeNull();expect(metric.parseMs).toBeNull();expect(metric.reasons.parseMs).toBeTruthy();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'측정 JSON 저장'}).click();
  const saved=await download;const stream=await saved.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(metric);
  await page.getByRole('button',{name:'three-dxf-viewer',exact:true}).click();await expect(page.getByRole('status')).toContainText('표시할 도형');
  const switched=JSON.parse((await page.getByTestId('viewer-metric').textContent())!);expect(switched.renderer).toBe('three-dxf-viewer');expect(switched.sourceMode).toBe('memory');
});
