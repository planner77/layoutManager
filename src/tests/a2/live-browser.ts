/** Browser-only test facade around the unmodified production Adapter. */
import * as THREE from 'three';
import {ThreeDxfViewerAdapter} from '../../viewers/three-dxf-viewer/adapter';
import type {SceneManifest} from '../../domain/cad-scene';
import {parityInventory} from './parity-inventory';
import {storedSceneViewerData} from '../../viewers/three-dxf-viewer/scene-serialization';
import packageJson from '../../package.json';

type Artifact={bytes:number[];manifest:SceneManifest};
let adapter:ThreeDxfViewerAdapter|undefined;
let container:HTMLElement|undefined;
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
    layers:value.getLayers(),outline:status(value),outlineInfo:value.getOutlineInfo()};
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
  const scope=artifact.manifest.scope;
  const current=make(scope.versionId,scope.sourceSha256,false);
  const bytes=Uint8Array.from(artifact.bytes);
  const loaded=await current.loadScene({bytes,manifest:artifact.manifest,assetId:'a2-test',revision:1});
  const textIndex=current.getSceneTextIndex();
  const inventory=parityInventory(rootOf(current),textIndex);
  return {inventory,textIndex,loaded,screen:screen(current)};
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
Object.assign(window,{a2Live:{loadSource,loadScene,layer,dispose}});
export type A2LiveApi={loadSource:typeof loadSource;loadScene:typeof loadScene;layer:typeof layer;dispose:typeof dispose};
