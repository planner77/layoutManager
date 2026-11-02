import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {sceneScope,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {sceneOutlineProjection} from '../../viewers/three-dxf-viewer/scene-projection';
import {serializeSourceScene,restoreSourceScene} from '../../viewers/three-dxf-viewer/scene-serialization';
const scope=sceneScope('11111111-1111-4111-8111-111111111111','a'.repeat(64),'DXF_INSUNITS_4');
function fixture(){
  const root=new THREE.Group(),leaves:THREE.LineSegments[]=[];
  for(const x of [0,0.6]){
    const insert=new THREE.Group();insert.position.x=x;
    const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(20,0,0)]);
    geometry.addGroup(0,2,0);
    const leaf=new THREE.LineSegments(geometry,[new THREE.LineBasicMaterial()]);
    leaf.userData.entity={handle:'B1',layer:'BLOCK_PART'};
    insert.add(leaf);root.add(insert);leaves.push(leaf);
  }
  const asset=tagImportedTree(root,scope);return {root,leaves,asset};
}
describe('BLOCK singleton material render eligibility',()=>{
  it('keeps repeated leaf handles separate by imported tree identity and applies each instance matrix',()=>{
    const {root,leaves}=fixture(),before=JSON.stringify(root.toJSON());
    const projection=sceneOutlineProjection(root,scope);
    expect(projection.entities).toHaveLength(2);
    expect(new Set(projection.entities.map(entity=>entity.id)).size).toBe(2);
    expect(projection.entities.map(entity=>entity.id)).toEqual(leaves.map(leaf=>leaf.userData.cadSceneRef.id));
    expect(projection.entities.map(entity=>entity.bounds)).toEqual([[0,0,20,0],[0.6,0,20.6,0]]);
    expect(projection.entities.every(entity=>entity.handle===null&&entity.stable===false)).toBe(true);
    // MatrixWorld updates are allowed; source geometry, metadata and local transforms are untouched.
    expect(JSON.stringify(root.toJSON())).toBe(before);
  });
  it('excludes hidden singleton, empty and multiple material arrays',()=>{
    for(const materials of [[],[new THREE.LineBasicMaterial({visible:false})],
      [new THREE.LineBasicMaterial(),new THREE.LineBasicMaterial()]]){
      const {root,leaves}=fixture();for(const leaf of leaves)leaf.material=materials;
      expect(sceneOutlineProjection(root,scope).entities).toHaveLength(0);
    }
  });
  it('excludes singleton arrays with absent, partial or invalid material groups',()=>{
    for(const groups of [[],[{start:0,count:1,materialIndex:0}],
      [{start:0,count:2,materialIndex:1}],[{start:0,count:3,materialIndex:0}]]){
      const {root,leaves}=fixture();for(const leaf of leaves)leaf.geometry.groups=groups;
      expect(sceneOutlineProjection(root,scope).entities).toHaveLength(0);
    }
  });
  for(const format of ['THREE_JSON','CUSTOM_DTO'] as const)it('preserves eligible instance identity through '+format+' restore',async()=>{
    const {root,asset}=fixture(),{bytes,manifest}=await serializeSourceScene(root,asset,format);
    const restored=await restoreSourceScene(bytes,manifest,{scope,format,byteLength:bytes.length,sha256:manifest.sha256});
    const actual=sceneOutlineProjection(restored,scope).entities;
    expect(actual).toHaveLength(2);
    expect(actual.map(entity=>entity.id)).toEqual(sceneOutlineProjection(root,scope).entities.map(entity=>entity.id));
    expect(actual[1].bounds[0]).toBeCloseTo(0.6,8);
  });
});
