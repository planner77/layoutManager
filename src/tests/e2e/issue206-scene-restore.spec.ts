import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

type Observation={white:number;black:number;red:number;corner:number[];
  canonicalUnchanged:boolean;packetUnchanged:boolean;originalColors:number[];
  sameCanvas:boolean;sameContext:boolean;contextLost:boolean};
declare global{interface Window{issue206Scene:{create:()=>Promise<{
  observe:(color:string)=>Observation;canonical:{primitives:{material:{color:number}}[]};dispose:()=>{canvases:number};
}>};issue206Instance:Awaited<ReturnType<Window['issue206Scene']['create']>>;}}

test('T206-03/04 persisted Scene restore keeps black/red canonical export while display contrast changes',async({page})=>{
  const bundle=await build({entryPoints:['tests/e2e/issue206-scene-browser.ts'],bundle:true,
    platform:'browser',format:'iife',write:false,logLevel:'silent'});
  await page.route('**/__issue206-scene.js',route=>route.fulfill({contentType:'application/javascript',body:bundle.outputFiles[0].text}));
  await page.route('**/__issue206-scene',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script src="/__issue206-scene.js"></script></body></html>'}));
  await page.goto('/__issue206-scene');
  await page.waitForFunction(()=>Boolean(window.issue206Scene));
  const colors=await page.evaluate(async()=>{
    window.issue206Instance=await window.issue206Scene.create();
    return window.issue206Instance.canonical.primitives.map(primitive=>primitive.material.color);
  });
  expect(colors).toEqual([0,0xff0000]);
  const observe=(color:string)=>page.evaluate(value=>window.issue206Instance.observe(value),color);
  const dark=await observe('#000000');
  console.log('SCENE_BACKGROUND_OBSERVATION',JSON.stringify(dark));
  expect(dark.corner).toEqual([0,0,0]);expect(dark.white).toBeGreaterThan(20);expect(dark.red).toBeGreaterThan(20);
  const light=await observe('#ffffff');
  expect(light.corner).toEqual([255,255,255]);expect(light.black).toBeGreaterThan(20);expect(light.red).toBeGreaterThan(20);
  for(let index=0;index<20;index++){
    const result=await observe(index%2?'#ffffff':'#262626');
    expect(result).toMatchObject({canonicalUnchanged:true,packetUnchanged:true,
      originalColors:[0,0xff0000],sameCanvas:true,sameContext:true,contextLost:false});
  }
  expect(await page.evaluate(()=>window.issue206Instance.dispose())).toEqual({canvases:0});
});
