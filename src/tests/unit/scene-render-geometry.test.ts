import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {sceneScope,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {sceneOutlineProjection} from '../../viewers/three-dxf-viewer/scene-projection';
import {computeRenderOutline} from '../../viewers/core/outline-compute';
import {geometryHitPoint} from '../../domain/generated-hit-test';
const scope=sceneScope('11111111-1111-4111-8111-111111111111','a'.repeat(64));
describe('S5 rendered 2D surface topology',()=>{
  it('unions actual triangulated surface while preserving its hole',()=>{
    const shape=new THREE.Shape([new THREE.Vector2(0,0),new THREE.Vector2(20,0),new THREE.Vector2(20,20),new THREE.Vector2(0,20)]);
    shape.holes.push(new THREE.Path([new THREE.Vector2(5,5),new THREE.Vector2(5,15),new THREE.Vector2(15,15),new THREE.Vector2(15,5)]));
    const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial()));tagImportedTree(root,scope);
    const result=computeRenderOutline('PRECISE',sceneOutlineProjection(root,scope).entities);
    expect(result.geometry.type).toBe('Polygon');
    expect(geometryHitPoint(result.geometry,[2,2],0)).toBe(true);
    expect(geometryHitPoint(result.geometry,[10,10],0)).toBe(false);
    expect(result.sourceEntityIds).toEqual([]);expect(result.persistable).toBe(false);
  });
  it('rejects self-intersecting and collinear closed render linework',()=>{
    for(const points of [[[0,0,0],[10,10,0],[0,10,0],[10,0,0]],[[0,0,0],[1,0,0],[2,0,0]]]){
      const root=new THREE.Group();root.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(([x,y,z])=>new THREE.Vector3(x,y,z)))));
      tagImportedTree(root,scope);
      expect(()=>computeRenderOutline('PRECISE',sceneOutlineProjection(root,scope).entities)).toThrow();
    }
  });
});
