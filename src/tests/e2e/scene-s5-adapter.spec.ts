import {expect,test,type Page} from '@playwright/test';
import {build} from 'esbuild';
import type {S5AdapterHarness} from './scene-s5-browser';
declare global{interface Window{s5Ready:Promise<void>;s5Adapter:S5AdapterHarness}}
async function clickWcs(page:Page,x:number,y:number){
  const p=await page.evaluate(({x,y})=>window.s5Adapter.project(x,y),{x,y});expect(p).not.toBeNull();
  const canvas=(await page.locator('canvas').boundingBox())!;await page.mouse.click(canvas.x+p!.x,canvas.y+p!.y);
}
test('S5 actual restored Mesh adapter: interior click, work/layer/ancestor visibility, WCS transforms and immutable baseline',async({page})=>{
  const bundle=await build({entryPoints:['tests/e2e/scene-s5-browser.ts'],bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'});
  await page.route('**/__s5-adapter.js',r=>r.fulfill({contentType:'application/javascript',body:bundle.outputFiles[0].text}));
  await page.route('**/__s5-adapter',r=>r.fulfill({contentType:'text/html',body:'<body><script src="/__s5-adapter.js"></script></body>'}));
  await page.goto('/__s5-adapter');await page.evaluate(()=>window.s5Ready);
  await clickWcs(page,2,2);
  const selected=await page.evaluate(()=>window.s5Adapter.selected());expect(selected).toHaveLength(1);expect(selected[0].origin).toBe('RENDER');
  const id=selected[0].id;
  await page.evaluate(id=>window.s5Adapter.command({type:'Translate',ids:[id],dx:3,dy:4}),id);
  expect(await page.evaluate(()=>window.s5Adapter.selected())).toEqual(selected);
  const moved=await page.evaluate(()=>window.s5Adapter.preview());
  expect(moved.geometry).toEqual({type:'Polygon',coordinates:[[[3,4],[13,4],[3,14],[3,4]]]});
  await page.evaluate(()=>window.s5Adapter.clear());await clickWcs(page,5,6);
  expect(await page.evaluate(()=>window.s5Adapter.selected())).toEqual(selected);
  await page.evaluate(id=>window.s5Adapter.command({type:'Visibility',ids:[id],visible:false}),id);
  expect(await page.evaluate(()=>window.s5Adapter.selected())).toEqual([]);
  await page.evaluate(()=>window.s5Adapter.layer(false));
  await page.evaluate(id=>window.s5Adapter.command({type:'Visibility',ids:[id],visible:true}),id);
  await clickWcs(page,5,6);expect(await page.evaluate(()=>window.s5Adapter.selected())).toEqual([]);
  await page.evaluate(()=>window.s5Adapter.layer(true));await clickWcs(page,5,6);
  expect(await page.evaluate(()=>window.s5Adapter.selected())).toEqual(selected);
  await page.evaluate(()=>window.s5Adapter.clear());await clickWcs(page,22,2);
  expect(await page.evaluate(()=>window.s5Adapter.selected())).toEqual([]);
  await clickWcs(page,42,2);expect(await page.evaluate(()=>window.s5Adapter.selected())).toEqual([]);
  expect(await page.evaluate(()=>window.s5Adapter.unchanged())).toBe(true);
  await page.evaluate(()=>window.s5Adapter.dispose());await expect(page.locator('canvas')).toHaveCount(0);
});
