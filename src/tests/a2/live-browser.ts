/** Browser-only test facade around the unmodified production Adapter. */
import * as THREE from 'three';
import {DXFViewer} from 'three-dxf-viewer';
import {ThreeDxfViewerAdapter} from '../../viewers/three-dxf-viewer/adapter';
import type {SceneManifest} from '../../domain/cad-scene';
import {parityInventory} from './parity-inventory';
import {storedSceneViewerData} from '../../viewers/three-dxf-viewer/scene-serialization';
import packageJson from '../../package.json';

type Artifact={bytes:number[];manifest:SceneManifest};
let adapter:ThreeDxfViewerAdapter|undefined;
let container:HTMLElement|undefined;
let parserCalls=0;
const originalGetFromPath=DXFViewer.prototype.getFromPath;
DXFViewer.prototype.getFromPath=function(...args:Parameters<typeof originalGetFromPath>){parserCalls++;return originalGetFromPath.apply(this,args);};
function make(versionId:string,sourceSha256:string,prepareScene:boolean){
  container=document.createElement('div');
  container.style.cssText='width:800px;height:600px;position:relative';
  document.body.append(container);
  adapter=new ThreeDxfViewerAdapter(container,{versionId,sourceSha256,prepareScene});
  return adapter;
}
function rootOf(value:ThreeDxfViewerAdapter):THREE.Object3D{
  const root=(value as unknown as {object?:THREE.Object3D}).object;
  if(!root)throw new Error('LIVE_ROOT_UNAVAILABLE');
  return root;
}
function status(value:ThreeDxfViewerAdapter){
  const internals=value as unknown as {index?:{entities:unknown[]};indexError?:string;renderIndex?:{entities:unknown[]}};
  return {sourceIndex:internals.index?.entities.length??null,
    indexState:internals.index?'READY':internals.indexError?'UNAVAILABLE':'ABSENT',
    renderIndex:internals.renderIndex?.entities.length??null};
}
function screen(value:ThreeDxfViewerAdapter){
  const canvas=container?.querySelector('canvas');
  if(!canvas)throw new Error('LIVE_CANVAS_MISSING');
  const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');
  const info=gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer=gl&&info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):'';
  return {canvas:!!canvas,webgl:!!gl,renderer,width:canvas.width,height:canvas.height,
    parserCalls,layers:value.getLayers(),outline:status(value),outlineInfo:value.getOutlineInfo()};
}
async function loadSource({dxf,versionId,sourceSha256}:{dxf:string;versionId:string;sourceSha256:string}){
  dispose();
  const current=make(versionId,sourceSha256,true);
  const source=new TextEncoder().encode(dxf);
  const loaded=await current.load(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength) as ArrayBuffer);
  const result=current.getSceneArtifact();
  if(!result)throw new Error('LIVE_ARTIFACT_MISSING');
  const inventory=parityInventory(rootOf(current),storedSceneViewerData(result.bytes)?.textIndex);
  return {artifact:{bytes:[...result.bytes],manifest:result.manifest},inventory,loaded,
    screen:screen(current),diagnostics:current.getSceneBuildDiagnostics(),packageVersion:packageJson.version};
}
async function loadScene({artifact}:{artifact:Artifact}){
  dispose();
  parserCalls=0;
  const scope=artifact.manifest.scope;
  const current=make(scope.versionId,scope.sourceSha256,false);
  const bytes=Uint8Array.from(artifact.bytes);
  const loaded=await current.loadScene({bytes,manifest:artifact.manifest,assetId:'a2-test',revision:1});
  const textIndex=current.getSceneTextIndex();
  const inventory=parityInventory(rootOf(current),textIndex);
  let shapeGeometryCount=0;
  rootOf(current).traverse(o=>{const g=(o as THREE.Mesh).geometry;
    if(g?.type==='ShapeGeometry'){
      if(!(g instanceof THREE.ShapeGeometry)||!(g.clone() instanceof THREE.ShapeGeometry))throw new Error('RESTORED_SHAPE_CLASS_INVALID');
      shapeGeometryCount++;
    }
  });
  return {inventory,textIndex,loaded,screen:screen(current),shapeGeometryCount};
}
function sourceTarget(){
  if(!adapter||!container)throw new Error('LIVE_ADAPTER_MISSING');
  const internals=adapter as unknown as {renderCoverage?:{selectable:Array<{id:string;paths:Array<{points:[number,number][];closed:boolean}>}>};camera:THREE.Camera};
  const entity=internals.renderCoverage?.selectable.find(x=>x.paths.some(p=>p.closed))??internals.renderCoverage?.selectable[0];
  if(!entity)throw new Error('SOURCE_SELECTABLE_MISSING');
  const [a,b]=entity.paths[0].points;
  const p=new THREE.Vector3((a[0]+b[0])/2,(a[1]+b[1])/2,0).project(internals.camera);
  const canvas=container.querySelector('canvas')!;const rect=canvas.getBoundingClientRect();
  const clientX=rect.left+(p.x+1)*rect.width/2,clientY=rect.top+(1-p.y)*rect.height/2;
  adapter.setSelectionMode('select');
  return {id:entity.id,clientX,clientY};
}
async function probeSource(){
  if(!adapter)throw new Error('LIVE_ADAPTER_MISSING');
  const selected=adapter.getOutlineSelection();
  if(!selected.length)throw new Error('SOURCE_SELECT_FAILED');
  const outline=await adapter.previewOutline('PRECISE');
  return {selected:selected.map(x=>x.id),kind:outline.kind};
}
function renderMode(){if(!adapter)throw new Error('LIVE_ADAPTER_MISSING');adapter.setSelectionMode('render');}
function probeSceneWorkGate(){
 if(!adapter)throw new Error('LIVE_ADAPTER_MISSING');
 const selected=adapter.getCanvasObjectSelection().filter(x=>x.origin==='RENDER');
 if(selected.length!==1)throw new Error('RENDER_SELECT_FAILED');
 const baseline=adapter.getSceneWorkState().objects.find(x=>x.ref.id===selected[0].id);
 if(!baseline)throw new Error('WORK_BASELINE_MISSING');
 adapter.executeSceneWorkCommand({type:'Translate',ids:[selected[0].id],dx:1,dy:0});
 adapter.executeSceneWorkCommand({type:'Rotate',ids:[selected[0].id],angleDegrees:30,pivot:[0,0]});
 let blocked=false;try{adapter.setSelectionMode('select');}catch{blocked=true;}
 if(!blocked||!adapter.undoSceneWork()||!adapter.undoSceneWork())throw new Error('SOURCE_WORK_GATE_FAILED');
 const afterUndo=adapter.getSceneWorkState().objects.find(x=>x.ref.id===selected[0].id);
 if(JSON.stringify(afterUndo?.transform)!==JSON.stringify(baseline.transform))throw new Error('WORK_UNDO_MISMATCH');
 adapter.executeSceneWorkCommand({type:'Translate',ids:[selected[0].id],dx:2,dy:0});
 adapter.resetSceneWork();
 const afterReset=adapter.getSceneWorkState().objects.find(x=>x.ref.id===selected[0].id);
 if(JSON.stringify(afterReset?.transform)!==JSON.stringify(baseline.transform))throw new Error('WORK_RESET_MISMATCH');
 adapter.setSelectionMode('select');adapter.resetSceneWork();
 return {blocked,restored:adapter.getOutlineInfo()?.exactSourceEntityCount,
  inventory:parityInventory(rootOf(adapter),adapter.getSceneTextIndex())};
}
function layer(name:string,visible:boolean){
  if(!adapter)throw new Error('LIVE_ADAPTER_MISSING');
  adapter.showLayer(name,visible);
  const root=rootOf(adapter);
  const matching:{path:number[];visible:boolean}[]=[];
  const walk=(node:THREE.Object3D,path:number[])=>{
    if(node.userData.cadLayer===name)matching.push({path,visible:node.visible});
    node.children.forEach((child,index)=>walk(child,[...path,index]));
  };
  walk(root,[]);
  return {matching,screen:screen(adapter)};
}
function dispose(){adapter?.dispose();adapter=undefined;container?.remove();container=undefined;}
Object.assign(window,{a2Live:{loadSource,loadScene,sourceTarget,probeSource,renderMode,probeSceneWorkGate,layer,dispose}});
export type A2LiveApi={loadSource:typeof loadSource;loadScene:typeof loadScene;sourceTarget:typeof sourceTarget;probeSource:typeof probeSource;renderMode:typeof renderMode;probeSceneWorkGate:typeof probeSceneWorkGate;layer:typeof layer;dispose:typeof dispose};
