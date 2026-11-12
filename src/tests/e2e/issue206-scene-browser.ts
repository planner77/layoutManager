import * as THREE from 'three';
import {ThreeDxfViewerAdapter} from '../../viewers/three-dxf-viewer/adapter';
import {sceneScope,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {serializeSourceScene} from '../../viewers/three-dxf-viewer/scene-serialization';
import type {ExchangeSelection} from '../../domain/cad-exchange';

const selection:ExchangeSelection={dxf:{enabled:true,mode:'all',layers:[]},
  generated:{enabled:false,mode:'all',keys:[]},memos:{enabled:false,mode:'all',ids:[]}};

async function create(){
  const root=new THREE.Group();
  const originalBlack=new THREE.LineBasicMaterial({color:0x000000});
  const originalRed=new THREE.LineBasicMaterial({color:0xff0000});
  for(const [index,material] of [originalBlack,originalRed].entries()){
    const geometry=new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-80,index*20,0),new THREE.Vector3(80,index*20,0)]);
    const line=new THREE.Line(geometry,material);line.userData.cadLayer=index?'RED':'BLACK';root.add(line);
  }
  const versionId='20600000-0000-4000-8000-000000000001',sourceSha256='a'.repeat(64);
  const asset=tagImportedTree(root,sceneScope(versionId,sourceSha256,'DXF_INSUNITS_4'));
  const packet=await serializeSourceScene(root,asset,'CUSTOM_DTO');
  const immutable=Array.from(packet.bytes);
  const container=document.createElement('div');
  Object.assign(container.style,{width:'640px',height:'400px',position:'relative'});document.body.append(container);
  const adapter=new ThreeDxfViewerAdapter(container,{versionId,sourceSha256});
  await adapter.loadScene({...packet,assetId:'20600000-0000-4000-8000-000000000002',revision:0});
  const canvas=container.querySelector('canvas')!;
  const gl=canvas.getContext('webgl2')!;
  const canonical=JSON.stringify(adapter.captureExchangeSnapshot(selection));
  function observe(color:string){
    adapter.setCanvasBackground(color);
    const pixels=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let white=0,black=0,red=0,maxNeutral=0,maxRed=0;
    for(let i=0;i<pixels.length;i+=4){
      // One-pixel lines use MSAA coverage; a visible stroke need not reach a
      // fully covered 255/0 sample. Require substantial separation from the
      // respective 0/255 background, plus an independently visible red line.
      if(pixels[i]>150&&pixels[i+1]>150&&pixels[i+2]>150)white++;
      if(pixels[i]<105&&pixels[i+1]<105&&pixels[i+2]<105)black++;
      if(pixels[i]>150&&pixels[i+1]<105&&pixels[i+2]<105)red++;
      if(pixels[i]===pixels[i+1]&&pixels[i+1]===pixels[i+2])maxNeutral=Math.max(maxNeutral,pixels[i]);
      if(pixels[i+1]<60&&pixels[i+2]<60)maxRed=Math.max(maxRed,pixels[i]);
    }
    return {white,black,red,maxNeutral,maxRed,glError:gl.getError(),corner:Array.from(pixels.subarray(0,3)),
      canonicalUnchanged:JSON.stringify(adapter.captureExchangeSnapshot(selection))===canonical,
      packetUnchanged:packet.bytes.every((value,index)=>value===immutable[index]),
      originalColors:[originalBlack.color.getHex(),originalRed.color.getHex()],
      sameCanvas:container.querySelector('canvas')===canvas,sameContext:canvas.getContext('webgl2')===gl,
      contextLost:gl.isContextLost()};
  }
  return {observe,canonical:JSON.parse(canonical),dispose:()=>{
    adapter.dispose();root.traverse(node=>{const line=node as THREE.Line;line.geometry?.dispose();});
    originalBlack.dispose();originalRed.dispose();container.remove();return {canvases:document.querySelectorAll('canvas').length};
  }};
}
Object.assign(window,{issue206Scene:{create}});
