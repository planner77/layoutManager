import type * as THREE from 'three';
import {createSceneRef,importedId,sceneIdentity,type SceneAsset,type SceneObject,type SceneScope,type CadSceneObjectRef} from '../../domain/cad-scene';

export function sourceUnitFromDxf(text:string):string{
  const match=text.match(/\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(\d+)/);
  return match?'DXF_INSUNITS_'+match[1]:'UNSPECIFIED';
}
export {sceneScope} from '../../domain/cad-scene';
/** Called on the actual converter result, before display helpers are introduced. */
export function tagImportedTree(root:THREE.Object3D,scope:SceneScope):SceneAsset{
  const objects:SceneObject[]=[];
  const visit=(node:THREE.Object3D,path:number[])=>{
    const ref=createSceneRef(scope,'DXF_IMPORTED',importedId(scope,path),{treePath:path});
    node.userData={...node.userData,cadSceneRef:ref};
    node.updateMatrix();
    objects.push({ref,treePath:path,kind:node.type,visible:node.visible,transform:node.matrix.toArray(),revision:0});
    node.children.forEach((child,index)=>visit(child,[...path,index]));
  };
  visit(root,[]);
  return {scope,sceneId:sceneIdentity(scope),state:'BUILDING',revision:0,objects};
}
export function tagAppTree(root:THREE.Object3D,ref:CadSceneObjectRef){
  if(ref.origin!=='APP_CREATED')throw new Error('SCENE_APP_ORIGIN_REQUIRED');
  root.traverse(node=>{node.userData={...node.userData,cadSceneRef:ref};});
}
