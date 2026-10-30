import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {masterFields} from './master-helper';
import {clickViewerTestCommand} from './viewer-menu-helper';

const drawing=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','8','WORK','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));
async function range(page:Page,modifier=false){
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  const box=(await canvas.boundingBox())!;
  if(modifier)await page.keyboard.down('Control');
  await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();
  await page.mouse.move(box.x+box.width-10,box.y+box.height-10,{steps:8});await page.mouse.up();
  if(modifier)await page.keyboard.up('Control');
}
for(const failWorker of [false,true])test(`S5 render-only work, APP_CREATED and source separation${failWorker?' after source Worker failure':''}`,async({page,request},testInfo)=>{
  if(failWorker)await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{
      postMessage(message:unknown,options?:StructuredSerializeOptions|Transferable[]){
        if(message&&typeof message==='object'&&(message as {task?:string}).task==='index'){
          queueMicrotask(()=>this.dispatchEvent(new ErrorEvent('error',{message:'Synthetic source index failure'})));return;
        }
        if(Array.isArray(options))super.postMessage(message,options);else super.postMessage(message,options);
      }
    };
  });
  const created=await request.post('/api/cad-files',{multipart:{
    file:{name:'synthetic-s5.dxf',mimeType:'application/octet-stream',buffer:drawing},
    ...await masterFields(request,{businessUnit:'S5 '+failWorker,site:'synthetic',building:'A',floor:'1'}),
    registeredAt:'2026-10-30',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(created.status()).toBe(201);const file=await created.json();
  let gets=0;page.on('request',r=>{if(new URL(r.url()).pathname===`/api/cad-files/${file.id}/content`)gets++;});
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText(failWorker?'도면 일부 표시 완료':'도면 표시 완료');
  if(await page.getByTestId('viewer-layer-dock').isVisible())await clickViewerTestCommand(page,'viewer-menu-layers');
  await clickViewerTestCommand(page,'viewer-menu-outline-tree');
  await expect(page.getByTestId('outline-tree-empty')).toBeVisible();
  await clickViewerTestCommand(page,'viewer-menu-outline-tree');
  await clickViewerTestCommand(page,'viewer-menu-outline-tool');
  await expect(page.getByTestId('outline-basis')).toHaveValue('render');
  await expect(page.getByTestId('outline-basis').locator('option[value="source"]')).toBeDisabled();
  await expect(page.getByTestId('outline-render-mapping')).toContainText('정밀 원본 매핑 0개');
  await range(page);
  await expect(page.getByTestId('outline-selection-count')).not.toContainText('선택 0개');
  await page.getByRole('button',{name:'정밀 외곽선 미리보기',exact:true}).click();
  await expect(page.getByTestId('outline-preview')).toContainText('Polygon');
  await page.getByRole('button',{name:'임시 확정',exact:true}).click();
  const download=page.waitForEvent('download');
  await page.getByTestId('cad-outline-tools').getByRole('button',{name:/JSON 내보내기/}).click();
  const payload=JSON.parse(await readFile(await (await download).path(),'utf8'));
  expect(payload.outlines).toHaveLength(1);
  expect(payload.outlines[0].result.sourceEntityIds).toEqual([]);
  expect(payload.outlines[0].result.persistable).toBe(false);
  expect(payload.outlines[0].result.geometry.type).toBe('Polygon');
  await clickViewerTestCommand(page,'viewer-menu-outline-tool');
  await page.getByTestId('canvas-mode-objects').click();await range(page);
  await expect(page.getByTestId('canvas-edit-gate')).toContainText('혼합 선택');
  await expect(page.getByTestId('scene-work-translate')).toBeDisabled();
  await page.getByTestId('canvas-mode-generated').click();await range(page);
  await page.getByTestId('generated-translate-x').fill('5');
  await page.getByTestId('generated-translate-apply').click();
  await expect(page.getByTestId('generated-undo')).toContainText('(1)');
  await page.getByTestId('generated-undo').click();
  // Toggle generated off with Ctrl range in all-object mode, leaving RENDER only.
  await page.getByTestId('canvas-mode-objects').click();await range(page);
  await page.getByTestId('canvas-mode-generated').click();await range(page,true);
  await page.getByTestId('canvas-mode-objects').click();
  await expect(page.getByTestId('scene-work-translate')).toBeEnabled();
  const clickBox=(await page.getByTestId('cad-canvas').locator('canvas').boundingBox())!;
  const edge={x:clickBox.x+clickBox.width/2,y:clickBox.y+clickBox.height*(0.5-50/115)};
  await page.mouse.click(edge.x,edge.y);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개');
  await page.keyboard.down('Control');await page.mouse.click(edge.x,edge.y);await page.keyboard.up('Control');
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 0개');
  await page.mouse.click(edge.x,edge.y);
  await expect(page.getByTestId('scene-work-translate')).toBeEnabled();
  await page.locator('#scene-work-dx').fill('12');
  await page.getByTestId('scene-work-translate').click();
  await expect(page.getByTestId('scene-work-undo')).toContainText('(1)');
  await page.locator('#scene-work-angle').fill('90');
  await page.locator('#scene-work-px').fill('50');await page.locator('#scene-work-py').fill('50');
  await page.getByTestId('scene-work-rotate').click();
  await expect(page.getByTestId('scene-work-undo')).toContainText('(2)');
  await page.getByTestId('scene-work-hide').click();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 0개');
  await expect(page.getByTestId('scene-work-show')).toBeEnabled();
  await page.getByTestId('scene-work-show').click();
  await page.getByTestId('scene-work-undo').click();
  await page.getByTestId('scene-work-redo').click();
  await page.screenshot({path:testInfo.outputPath('s5-render-work.png')});
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await page.getByTestId('cad-memo-title').fill('S5 independent WCS memo');
  await page.getByTestId('cad-memo-x').fill('25');await page.getByTestId('cad-memo-y').fill('25');
  await page.getByTestId('cad-memo-coordinate-place').click();await page.getByTestId('cad-memo-create').click();
  await expect(page.getByTestId('cad-memo-status')).toContainText('1/100');

  expect(gets).toBe(1);
  expect(Buffer.from(await (await request.get(`/api/cad-files/${file.id}/content`)).body())).toEqual(drawing);
});
