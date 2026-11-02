import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export type Inspection={memoCount:number;memoTitles:string[];imageCount:number;inkPixels:number;rendered:boolean;rasterPngDataUrl:string|null;loadMs:number;
 textureTopNdcY:number|null;textureBottomNdcY:number|null;memoAnchors:Array<{x:number;y:number;z:number}>};
declare global {interface Window {__memoExportInspector:{load:(bytes:number[],format:'glb'|'gltf')=>Promise<Inspection>}}}

async function load(bytes:number[],format:'glb'|'gltf'):Promise<Inspection>{
 const loader=new GLTFLoader(),source=format==='glb'?new Uint8Array(bytes).buffer:new TextDecoder().decode(new Uint8Array(bytes));
 const loadStarted=performance.now();const gltf=await loader.parseAsync(source,'');const loadMs=performance.now()-loadStarted;const root=gltf.scene;
 const canvas=document.querySelector('canvas')??document.body.appendChild(document.createElement('canvas'));
 canvas.width=640;canvas.height=480;canvas.style.width='640px';canvas.style.height='480px';
 const renderer=new THREE.WebGLRenderer({canvas:canvas as HTMLCanvasElement,antialias:true,preserveDrawingBuffer:true});
 renderer.setSize(640,480,false);renderer.setClearColor(0xffffff,1);
 const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const span=Math.max(size.x,size.z,.1),camera=new THREE.OrthographicCamera(-span*.65,span*.65,span*.49,-span*.49,.001,10000);
 camera.up.set(0,0,-1);camera.position.set(center.x,center.y+Math.max(span,10),center.z);camera.lookAt(center);camera.updateProjectionMatrix();
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);scene.add(root);renderer.render(scene,camera);
 const memoTitles:string[]=[],memoAnchors:Array<{x:number;y:number;z:number}>=[],textures=new Set<THREE.Texture>();let inkPixels=0,rasterPngDataUrl:string|null=null;
 let textureTopNdcY:number|null=null,textureBottomNdcY:number|null=null;
 root.traverse(node=>{
  if(node.userData?.origin==='LOCAL_MEMO'||node.userData?.origin==='SERVER_MEMO'){
   memoTitles.push(String(node.userData.title??node.name));const anchor=node.userData.anchorWcs as {x?:number;y?:number;z?:number}|undefined;
   if(anchor&&Number.isFinite(anchor.x)&&Number.isFinite(anchor.y))memoAnchors.push({x:anchor.x!,y:anchor.y!,z:anchor.z??0});
  }
  const material=(node as THREE.Mesh).material;if(!material)return;
  for(const item of Array.isArray(material)?material:[material]){
   const map=(item as THREE.MeshBasicMaterial).map;if(map){
    textures.add(map);
    const geometry=(node as THREE.Mesh).geometry,position=geometry?.getAttribute('position'),uv=geometry?.getAttribute('uv');
    if(position&&uv&&position.count>=4){
     // Select the left edge by UV: max V is the PNG top, min V its bottom.
     // The actual +Y/-Z camera must project the image top higher on screen.
     let top=-1,bottom=-1;
     for(let i=0;i<Math.min(position.count,uv.count);i++)if(Math.abs(uv.getX(i))<1e-6){
      if(top<0||uv.getY(i)>uv.getY(top))top=i;
      if(bottom<0||uv.getY(i)<uv.getY(bottom))bottom=i;
     }
     if(top>=0&&bottom>=0&&uv.getY(top)>uv.getY(bottom)){
      const p=new THREE.Vector3().fromBufferAttribute(position,top).applyMatrix4(node.matrixWorld).project(camera);
      const q=new THREE.Vector3().fromBufferAttribute(position,bottom).applyMatrix4(node.matrixWorld).project(camera);
      textureTopNdcY=p.y;textureBottomNdcY=q.y;
     }
    }
   }
  }
 });
 for(const texture of textures){
  const image=texture.image as CanvasImageSource|undefined;if(!image)continue;
  const sample=document.createElement('canvas');const ctx=sample.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('2D canvas unavailable');
  sample.width=(image as {width:number}).width;sample.height=(image as {height:number}).height;ctx.drawImage(image,0,0);
  if(!rasterPngDataUrl)rasterPngDataUrl=sample.toDataURL('image/png');
  const pixels=ctx.getImageData(0,0,sample.width,sample.height).data;
  // Count actual glyph ink, not the deliberately pale #fffef0 card background.
  for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]>0&&pixels[i]<150&&pixels[i+1]<150&&pixels[i+2]<150)inkPixels++;}
  sample.width=0;sample.height=0;
 }
 return {memoCount:memoTitles.length,memoTitles,imageCount:textures.size,inkPixels,rendered:renderer.info.render.calls>0,rasterPngDataUrl,loadMs,
  textureTopNdcY,textureBottomNdcY,memoAnchors};
}
Object.assign(window,{__memoExportInspector:{load}});
