/** Independent test-only path matching the live Adapter's source Scene build. */
import * as THREE from 'three';
import {DXFViewer} from 'three-dxf-viewer';
import {sceneSha256} from '../../domain/scene-digest';
import {explicitElevation} from '../../viewers/three-dxf-viewer/normalize';
import {sceneScope,sourceUnitFromDxf,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {preflightSceneRoot,serializeSourceScene} from '../../viewers/three-dxf-viewer/scene-serialization';
import {extractDxfText} from '../../viewers/core/text-index';
import {parseDxfOutlineIndex} from '../../viewers/core/outline-geometry';
import {captureSourceIndex} from '../../viewers/three-dxf-viewer/scene-source-bridge';
import {parityInventory} from './parity-inventory';
import {preflightA2Dxf} from './dxf-risk-preflight';
import packageJson from '../../package.json';

export type CandidateRequest={dxf:string;versionId:string;sourceSha256:string};
export async function buildCandidate({dxf,versionId,sourceSha256}:CandidateRequest){
  const source=new TextEncoder().encode(dxf);
  if(sceneSha256(source)!==sourceSha256)throw new Error('SOURCE_DIGEST_MISMATCH');
  const sourcePreflight=preflightA2Dxf(source);
  const normalized=explicitElevation(dxf);
  const url=URL.createObjectURL(new Blob([normalized],{type:'text/plain'}));
  try{
    const viewer=new DXFViewer();viewer.useCache=false;
    const root=await viewer.getFromPath(url,'/fonts/CadKorean.typeface.json');
    if(!root)throw new Error('DXF_LOADER_EMPTY');
    const preflight=preflightSceneRoot(root);
    const owned=new Map<THREE.Material,THREE.Material>();
    const clone=(original:THREE.Material)=>{
      if(!owned.has(original)){
        const material=original.clone() as THREE.Material&{color?:THREE.Color};
        if(material.color?.getHex()===0)material.color.setHex(0xffffff);
        owned.set(original,material);
      }
      return owned.get(original)!;
    };
    root.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.material)
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);});
    const scope=sceneScope(versionId,sourceSha256,sourceUnitFromDxf(dxf));
    const asset=tagImportedTree(root,scope);
    const textIndex=extractDxfText(source.buffer as ArrayBuffer);
    const inventory=parityInventory(root,textIndex);
    const index=parseDxfOutlineIndex(dxf,versionId,sourceSha256);
    const sourceIndex=captureSourceIndex(root,asset,index);
    const artifact=await serializeSourceScene(root,asset,'CUSTOM_DTO',{textIndex,sourceIndex});
    return {artifact:{bytes:[...artifact.bytes],manifest:artifact.manifest},inventory,preflight,
      textIndex,sourceSha256,sourcePreflight,packageVersion:packageJson.version};
  }finally{URL.revokeObjectURL(url);}
}
Object.assign(window,{a2Candidate:{build:buildCandidate}});
