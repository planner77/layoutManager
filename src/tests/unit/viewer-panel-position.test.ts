import {describe,expect,test} from 'vitest';
import {clampViewerPanelPosition,EDGE_PANEL_POSITION} from '../../domain/viewer-panel-position';
describe('#85/#138 reusable Viewer panel coordinates',()=>{
 test('defaults to original edge and clamps within actual CSS workspace',()=>{
  expect(EDGE_PANEL_POSITION).toEqual({mode:'edge',x:0,y:0});
  expect(clampViewerPanelPosition(800,700,{width:1000,height:800},{width:300,height:250}))
   .toEqual({x:700,y:550});
  expect(clampViewerPanelPosition(-50,-40,{width:1000,height:800},{width:300,height:250}))
   .toEqual({x:0,y:0});
 });
 test('narrow/zoomed/small workspace keeps panel heading visible',()=>{
  expect(clampViewerPanelPosition(400,100,{width:280,height:300},{width:350,height:400}))
   .toEqual({x:0,y:0});
  expect(clampViewerPanelPosition(Number.POSITIVE_INFINITY,Number.NaN,
   {width:800,height:600},{width:300,height:150})).toEqual({x:0,y:0});
  expect(clampViewerPanelPosition(20,40,{width:500,height:350},{width:300,height:200}))
   .toEqual({x:20,y:40});
 });
});
