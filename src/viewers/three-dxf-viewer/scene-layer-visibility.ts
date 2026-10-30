import * as THREE from 'three';

/** Layer visibility applies to the whole immutable imported tree, not just selectable geometry.
 * Capture baseline before any checkbox or SceneWork delta; never learn the toggled state as baseline.
 */
export function captureSceneVisibility(root:THREE.Object3D):Map<THREE.Object3D,boolean>{
  const baseline=new Map<THREE.Object3D,boolean>();
  root.traverse(object=>baseline.set(object,object.visible));
  return baseline;
}

export function applySceneVisibility(
  root:THREE.Object3D,baseline:ReadonlyMap<THREE.Object3D,boolean>,
  visibleLayers:ReadonlySet<string>,workVisible:(object:THREE.Object3D)=>boolean,
):void{
  root.traverse(object=>{
    const layer:unknown=object.userData.cadLayer??object.userData.entity?.layer;
    object.visible=(baseline.get(object)??object.visible) &&
      (typeof layer!=='string'||visibleLayers.has(layer)) && workVisible(object);
  });
}
