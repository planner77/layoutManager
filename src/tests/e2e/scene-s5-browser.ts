import * as THREE from 'three';
import {ThreeDxfViewerAdapter} from '../../viewers/three-dxf-viewer/adapter';
import {sceneScope,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {serializeSourceScene} from '../../viewers/three-dxf-viewer/scene-serialization';
import {sceneSha256} from '../../domain/scene-digest';
import type {SceneWorkCommand} from '../../domain/scene-work';

async function setup(){
  const container=document.createElement('div');container.style.cssText='width:900px;height:600px;position:relative';document.body.append(container);
  const root=new THREE.Group();
  const triangle=()=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,10,0,0,0,10,0],3));
    return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));
  };
  const mesh=triangle();mesh.userData.cadLayer='WORK';root.add(mesh);
  const intrinsic=triangle();intrinsic.position.x=20;intrinsic.visible=false;intrinsic.userData.cadLayer='WORK';root.add(intrinsic);
  const parent=new THREE.Group();parent.visible=false;parent.position.x=40;parent.userData.cadLayer='WORK';parent.add(triangle());root.add(parent);
  const displayOnly=new THREE.Points(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(60,0,0)]),new THREE.PointsMaterial({size:2}));
  displayOnly.name='s5-display-only';displayOnly.userData.cadLayer='DISPLAY';root.add(displayOnly);
  const scope=sceneScope('11111111-1111-4111-8111-111111111111','a'.repeat(64),'DXF_INSUNITS_4');
  const asset=tagImportedTree(root,scope);
  const artifact=await serializeSourceScene(root,asset,'CUSTOM_DTO');
  const adapter=new ThreeDxfViewerAdapter(container,{versionId:scope.versionId,sourceSha256:scope.sourceSha256});
  await adapter.loadScene({...artifact,assetId:'synthetic',revision:1});
  adapter.setSelectionMode('objects');
  const visiblePoint=(adapter as unknown as {object:THREE.Object3D}).object.getObjectByName('s5-display-only')!;
  return {
    selected:()=>adapter.getCanvasObjectSelection(),state:()=>adapter.getSceneWorkState(),
    project:(x:number,y:number)=>adapter.projectWcsToCanvas({x,y}),
    layer:(visible:boolean)=>adapter.showLayer('WORK',visible),
    displayLayer:(visible:boolean)=>adapter.showLayer('DISPLAY',visible),
    displayVisible:()=>visiblePoint.visible,
    command:(command:SceneWorkCommand)=>adapter.executeSceneWorkCommand(command),
    undo:()=>adapter.undoSceneWork(),redo:()=>adapter.redoSceneWork(),
    clear:()=>adapter.clearCanvasObjectSelection(),
    preview:()=>adapter.previewOutline('PRECISE'),
    unchanged:()=>sceneSha256(artifact.bytes)===artifact.manifest.sha256,
    dispose:()=>adapter.dispose(),
  };
}
Object.assign(window,{s5Ready:setup().then(value=>{Object.assign(window,{s5Adapter:value});})});
export type S5AdapterHarness=Awaited<ReturnType<typeof setup>>;
