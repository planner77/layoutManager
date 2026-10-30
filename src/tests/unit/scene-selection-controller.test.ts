import {afterEach,describe,expect,it,vi} from 'vitest';
import {SelectionController} from '../../viewers/three-dxf-viewer/selection-controller';
import type {OutlineEntity,XY} from '../../viewers/core/outline-geometry';

class FakeElement extends EventTarget {
  style:Record<string,string>={position:'',cursor:'',display:''};
  dataset:Record<string,string>={};
  tabIndex=0;
  private attrs=new Map<string,string>();
  append(){}
  remove(){}
  focus(){}
  closest(){return null;}
  getBoundingClientRect(){return {left:0,top:0,width:300,height:300,right:300,bottom:300};}
  getAttribute(name:string){return this.attrs.get(name)??null;}
  setAttribute(name:string,value:string){this.attrs.set(name,value);}
  removeAttribute(name:string){this.attrs.delete(name);}
}
const triangle:OutlineEntity={id:'render-1',handle:null,entityType:'Mesh',layer:'WORK',instancePath:[],stable:false,
  paths:[{points:[[0,0],[100,0],[0,100],[0,0]],closed:true}],bounds:[0,0,100,100]};
const generated={id:'generated-1',geometry:{type:'Polygon' as const,coordinates:[
  [[150,150],[250,150],[150,250],[150,150]] as XY[],
]}};
function pointer(target:EventTarget,type:'pointerdown'|'pointerup',x:number,y:number,ctrl=false){
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.assign(event,{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,
    clientX:x,clientY:y,ctrlKey:ctrl,metaKey:false,altKey:false,shiftKey:false});
  target.dispatchEvent(event);
}
afterEach(()=>vi.unstubAllGlobals());

describe('S5 SelectionController real listener regression',()=>{
  it('selects Mesh fill and crossing box, preserves valid IDs across index refresh, and respects layers',()=>{
    const canvas=new FakeElement(),container=new FakeElement(),fakeWindow=new EventTarget();
    vi.stubGlobal('window',fakeWindow);
    vi.stubGlobal('document',{createElement:()=>new FakeElement()});
    const observed:{render:string[];generated:string[]}[]=[];
    const controller=new SelectionController(canvas as unknown as HTMLCanvasElement,
      container as unknown as HTMLElement,[],(x,y)=>[x,y],()=>{},()=>{},
      (render,generatedIds)=>observed.push({render:render.map(e=>e.id),generated:[...generatedIds]}));
    try{
      controller.setVisibleLayers(new Set(['WORK']));
      controller.setRenderEntities([triangle]);
      controller.setMode('render');
      pointer(canvas,'pointerdown',25,25);pointer(fakeWindow,'pointerup',25,25);
      expect(controller.getSelection().map(e=>e.id)).toEqual(['render-1']);
      pointer(canvas,'pointerdown',25,25,true);pointer(fakeWindow,'pointerup',25,25,true);
      expect(controller.getSelection()).toEqual([]);
      // Right-to-left means crossing; this box is wholly inside the filled triangle.
      pointer(canvas,'pointerdown',30,25);pointer(fakeWindow,'pointerup',20,20);
      expect(controller.getSelection().map(e=>e.id)).toEqual(['render-1']);
      controller.setRenderEntities([{...triangle}]);
      expect(controller.getSelection().map(e=>e.id)).toEqual(['render-1']);
      controller.setVisibleLayers(new Set());
      expect(controller.getSelection()).toEqual([]);
      pointer(canvas,'pointerdown',25,25);pointer(fakeWindow,'pointerup',25,25);
      expect(controller.getSelection()).toEqual([]);
      controller.setVisibleLayers(new Set(['WORK']));
      pointer(canvas,'pointerdown',25,25);pointer(fakeWindow,'pointerup',25,25);
      expect(controller.getSelection().map(e=>e.id)).toEqual(['render-1']);
      controller.setRenderEntities([]);
      expect(controller.getSelection()).toEqual([]);
      // Objects mode can hold generated and render IDs together. A render
      // projection refresh preserves both when neither object disappeared.
      controller.setRenderEntities([triangle]);
      controller.setGeneratedObjects([generated]);
      controller.setMode('objects');
      pointer(canvas,'pointerdown',200,200);pointer(fakeWindow,'pointerup',200,200);
      expect(controller.getSelectedGeneratedIds()).toEqual(['generated-1']);
      pointer(canvas,'pointerdown',25,25,true);pointer(fakeWindow,'pointerup',25,25,true);
      expect(controller.getSelection().map(e=>e.id)).toEqual(['render-1']);
      expect(controller.getSelectedGeneratedIds()).toEqual(['generated-1']);
      controller.setRenderEntities([{...triangle}]);
      expect(controller.getSelection().map(e=>e.id)).toEqual(['render-1']);
      expect(controller.getSelectedGeneratedIds()).toEqual(['generated-1']);
      expect(observed.at(-1)).toEqual({render:['render-1'],generated:['generated-1']});
    }finally{controller.dispose();}
  });
});
