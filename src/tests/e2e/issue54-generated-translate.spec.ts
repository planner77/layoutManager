import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {masterFields} from './master-helper';

const dxf=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));
type ExportRow={id:string;result:{geometry:{type:string;coordinates:unknown}}};
type ExportData={schemaVersion:number;outlines:ExportRow[]};
async function drawing(request:APIRequestContext,name:string){
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:name+'.dxf',mimeType:'application/octet-stream',buffer:dxf},
    ...(await masterFields(request,{businessUnit:name,site:'issue54',building:'A',floor:'1'})),
    registeredAt:'2026-10-25',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  return (await response.json()) as {id:string};
}
async function selectSource(page:Page){
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  const rect=await canvas.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x+5,rect!.y+5);
  await page.mouse.down();
  await page.mouse.move(rect!.x+rect!.width-5,rect!.y+rect!.height-5,{steps:8});
  await page.mouse.up();
}
async function createGenerated(page:Page,count=2){
  await page.getByTestId('viewer-menu-outline-tool').click();
  await selectSource(page);
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
  const tools=page.getByTestId('cad-outline-tools');
  for(let i=0;i<count;i++){
    await tools.getByRole('button',{name:i===0?'볼록 외곽선 미리보기':'정밀 외곽선 미리보기'}).click();
    await expect(page.getByTestId('outline-preview')).toBeVisible();
    await tools.getByRole('button',{name:'임시 확정'}).click();
  }
  await page.getByTestId('viewer-menu-outline-tool').click();
  await page.getByTestId('canvas-mode-generated').click();
  await page.getByTestId('viewer-menu-outline-tree').click();
  await expect(page.getByTestId('outline-tree-item')).toHaveCount(count);
}
async function exportGeometry(page:Page):Promise<ExportData>{
  const downloaded=page.waitForEvent('download');
  await page.getByTestId('outline-saved-tools').getByRole('button',{name:/JSON 내보내기/}).click();
  return JSON.parse(await readFile(await (await downloaded).path(),'utf8')) as ExportData;
}
function vertices(value:unknown):number[][]{
  if(!Array.isArray(value))return [];
  if(value.length===2&&typeof value[0]==='number'&&typeof value[1]==='number')
    return [[value[0],value[1]]];
  return value.flatMap(vertices);
}
test('TC-E4-E2E-001: numeric group move follows WCS and Tree/JSON/Undo/Redo',async({page,request})=>{
  const version=await drawing(request,'issue54-numeric');
  await page.goto('/cad/versions/'+version.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await createGenerated(page,2);
  const rows=page.getByTestId('outline-tree-item');
  await rows.first().click();
  await rows.last().click({modifiers:['Control']});
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 2개 · 원본 0개 · 생성 2개');
  const before=await exportGeometry(page);
  await expect(page.getByTestId('generated-translate-unit')).toHaveText('mm');
  await page.getByTestId('generated-translate-x').fill('3');
  await page.getByTestId('generated-translate-y').fill('-5');
  await page.getByTestId('generated-translate-apply').click();
  await expect(page.getByTestId('generated-undo')).toContainText('(1)');
  const moved=await exportGeometry(page);
  expect(moved.schemaVersion).toBe(before.schemaVersion);
  expect(moved.outlines.map(item=>item.id)).toEqual(before.outlines.map(item=>item.id));
  for(let i=0;i<before.outlines.length;i++){
    const b=vertices(before.outlines[i].result.geometry.coordinates);
    const a=vertices(moved.outlines[i].result.geometry.coordinates);
    expect(a).toEqual(b.map(([x,y])=>[x+3,y-5]));
  }
  await page.getByTestId('generated-undo').click();
  const undone=await exportGeometry(page);
  expect(undone.outlines.map(row=>row.result.geometry))
    .toEqual(before.outlines.map(row=>row.result.geometry));
  await page.getByTestId('generated-redo').click();
  const redone=await exportGeometry(page);
  expect(redone.outlines.map(row=>row.result.geometry))
    .toEqual(moved.outlines.map(row=>row.result.geometry));
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('canvas-edit-gate')).toHaveAttribute('data-edit-enabled','true');
});
test('TC-E4-E2E-002: invalid numeric and SOURCE/mixed/Pan refuse to change group',async({page,request})=>{
  const version=await drawing(request,'issue54-gate');
  await page.goto('/cad/versions/'+version.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await createGenerated(page,2);
  const rows=page.getByTestId('outline-tree-item');
  await rows.first().click();
  await rows.last().click({modifiers:['Control']});
  const base=await exportGeometry(page);
  await page.getByTestId('generated-translate-x').fill('Infinity');
  await page.getByTestId('generated-translate-y').fill('2');
  await page.getByTestId('generated-translate-apply').click();
  await expect(page.getByTestId('generated-translate-error')).toBeVisible();
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  expect((await exportGeometry(page)).outlines).toEqual(base.outlines);
  await page.getByTestId('canvas-mode-objects').click();
  await selectSource(page);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('원본 1개 · 생성 2개');
  await expect(page.getByTestId('generated-translate-apply')).toBeDisabled();
  await page.getByTestId('canvas-mode-pan').click();
  await expect(page.getByTestId('generated-translate-apply')).toBeDisabled();
  expect((await exportGeometry(page)).outlines).toEqual(base.outlines);
  await page.getByRole('button',{name:'다시 불러오기'}).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('generated-translate-apply')).toBeDisabled();
  await page.getByRole('button',{name:'dxf-viewer',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('generated-translate-form')).toHaveCount(0);
});
test('TC-E4-E2E-003: selected boundary ghost / Escape rollback / one pointerup history',async({page,request})=>{
  const version=await drawing(request,'issue54-drag');
  await page.goto('/cad/versions/'+version.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await createGenerated(page,1);
  await page.getByTestId('outline-tree-item').click();
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  const rect=await canvas.boundingBox();
  expect(rect).not.toBeNull();
  // The synthetic DXF bounds are exactly [0,0]–[100,100], and focusBounds uses 1.15 margin.
  const aspect=rect!.width/rect!.height;
  const worldPerPx=Math.max(100,100/aspect)*1.15/rect!.height;
  const edgeX=rect!.x+rect!.width/2+50/worldPerPx;
  const edgeY=rect!.y+rect!.height/2;
  const before=await exportGeometry(page);
  await page.mouse.move(edgeX,edgeY);
  await page.mouse.down();
  await page.mouse.move(edgeX+24,edgeY,{steps:5});
  await expect(canvas).toHaveAttribute('data-generated-drag-preview','true');
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(canvas).not.toHaveAttribute('data-generated-drag-preview','true');
  await page.mouse.up();
  expect((await exportGeometry(page)).outlines).toEqual(before.outlines);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개 · 원본 0개 · 생성 1개');

  await page.mouse.move(edgeX,edgeY);
  await page.mouse.down();
  await page.mouse.move(edgeX+24,edgeY,{steps:5});
  await expect(canvas).toHaveAttribute('data-generated-drag-preview','true');
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('data-generated-drag-preview','true');
  await expect(page.getByTestId('generated-undo')).toContainText('(1)');
  const after=await exportGeometry(page);
  const original=vertices(before.outlines[0].result.geometry.coordinates);
  const shifted=vertices(after.outlines[0].result.geometry.coordinates);
  expect(original).toHaveLength(shifted.length);
  for(let i=0;i<original.length;i++){
    expect(shifted[i][0]-original[i][0]).toBeCloseTo(24*worldPerPx,4);
    expect(shifted[i][1]-original[i][1]).toBeCloseTo(0,4);
  }
});
test('TC-E4-E2E-004: pre-threshold boundary press cancels on wheel and resize without committing',async({page,request})=>{
  const version=await drawing(request,'issue54-prethreshold');
  await page.goto('/cad/versions/'+version.id+'/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await createGenerated(page,1);
  await page.getByTestId('outline-tree-item').click();
  const canvas=page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ratio:1});
  const base=await exportGeometry(page);
  const boundary=async()=>{
    const r=await canvas.boundingBox();
    expect(r).not.toBeNull();
    const px=Math.max(100,100/(r!.width/r!.height))*1.15/r!.height;
    return {x:r!.x+r!.width/2+50/px,y:r!.y+r!.height/2};
  };
  // A wheel changes camera/unproject even before drag threshold.
  const start=await boundary();
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.wheel(0,200);
  await page.mouse.move(start.x+25,start.y,{steps:5});
  await expect(canvas).not.toHaveAttribute('data-generated-drag-preview','true');
  await page.mouse.up();
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  expect((await exportGeometry(page)).outlines).toEqual(base.outlines);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개 · 원본 0개 · 생성 1개');

  // A genuine canvas Resize must discard another pre-threshold boundary press.
  await page.getByRole('button',{name:'전체 화면 맞춤'}).click();
  const resized=await boundary();
  await page.mouse.move(resized.x,resized.y);
  await page.mouse.down();
  await page.setViewportSize({width:1110,height:765});
  await page.evaluate(()=>new Promise<void>(resolve=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.mouse.move(resized.x+25,resized.y,{steps:5});
  await expect(canvas).not.toHaveAttribute('data-generated-drag-preview','true');
  await page.mouse.up();
  await expect(page.getByTestId('generated-undo')).toBeDisabled();
  expect((await exportGeometry(page)).outlines).toEqual(base.outlines);
  await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개 · 원본 0개 · 생성 1개');
});
