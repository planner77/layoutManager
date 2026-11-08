/** Synthetic-only fresh browser geometry/material proof. No product Viewer. */
import * as THREE from 'three';
import {validateOfflineCpuStyledPrimitives,restoreOfflineCpuStyledPrimitives} from './offline-cpu-styled-primitives-dto.mjs';

const WIDTH=960,HEIGHT=720,view={left:-95,right:65,bottom:-60,top:60};
let current;
function dispose(){if(!current)return;current.scene.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});current.renderer.dispose();current.renderer.domElement.remove();current=undefined;}
const near=(a,b,t=0.05)=>Math.abs(a-b)<=t;
const pointNear=(a,b,t=0.05)=>a.every((v,i)=>near(v,b[i],t));
const first=p=>Array.from(p.slice(0,3));
const last=p=>Array.from(p.slice(-3));
const pixelBox=(x1,y1,x2,y2)=>[Math.floor((x1-view.left)/(view.right-view.left)*WIDTH),Math.floor((y1-view.bottom)/(view.top-view.bottom)*HEIGHT),Math.ceil((x2-view.left)/(view.right-view.left)*WIDTH),Math.ceil((y2-view.bottom)/(view.top-view.bottom)*HEIGHT)];
function countPixels(pixels,box,test){let count=0;for(let y=box[1];y<box[3];y++)for(let x=box[0];x<box[2];x++){const i=(y*WIDTH+x)*4;if(test(pixels[i],pixels[i+1],pixels[i+2]))count++;}return count;}
async function decodePacket(packet){
  const bytes=Uint8Array.from(packet.bytes);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==packet.sha256)throw new Error('STYLED_PROOF_DIGEST');
  const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  validateOfflineCpuStyledPrimitives(envelope,packet.source);
  return envelope;
}
async function restore(packet){
  const envelope=await decodePacket(packet),restored=restoreOfflineCpuStyledPrimitives(envelope,packet.source);
  dispose();
  const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(WIDTH,HEIGHT);renderer.setPixelRatio(1);renderer.setClearColor(0x000000);
  document.getElementById('canvas-root').append(renderer.domElement);
  const camera=new THREE.OrthographicCamera(view.left,view.right,view.top,view.bottom,0.1,1000);camera.position.set(0,0,100);camera.lookAt(0,0,0);
  let segmentCount=0,visibleCount=0,buffersEqual=true,geometryGolden=true,maxVertexError=0,maxMidpointError=0,arcCcw=true,circleCcw=true;
  const bbox={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  const expectedTypes=['LINE','CIRCLE','ARC','LWPOLYLINE','LINE','LWPOLYLINE'];
  const expectedVisible=[true,true,false,false,false,true];
  const expectedRgb=[0xff0000,0xffff00,0x112233,0x00ff00,0xff00ff,0x00ff88];
  const expectedPaths={0:[[-80,40,0],[-50,40,0]],3:[[30,30,0],[50,30,0],[50,45,0]],4:[[-80,-20,0],[-50,-20,0]],5:[[20,-30,0],[40,-30,0],[40,-45,0]]};
  for(const [index,item] of restored.segments.entries()){
    const p=envelope.primitives[index],positions=item.positions;
    buffersEqual&&=positions.length===p.segments.flat().length&&positions.every((v,i)=>v===p.segments.flat()[i]);
    segmentCount+=positions.length/6;if(item.visible)visibleCount++;
    geometryGolden&&=item.type===expectedTypes[index]&&item.visible===expectedVisible[index]&&item.rgb===expectedRgb[index];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const node=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:item.rgb,linewidth:1}));node.visible=item.visible;scene.add(node);
    for(let i=0;i<positions.length;i+=3)for(let axis=0;axis<3;axis++){
      bbox.min[axis]=Math.min(bbox.min[axis],positions[i+axis]);bbox.max[axis]=Math.max(bbox.max[axis],positions[i+axis]);
    }
    if(Object.hasOwn(expectedPaths,index)){
      const path=expectedPaths[index];geometryGolden&&=positions.length/6===path.length-1&&pointNear(first(positions),path[0])&&pointNear(last(positions),path.at(-1));
      for(let j=0;j<path.length-1;j++)geometryGolden&&=pointNear(Array.from(positions.slice(j*6,j*6+3)),path[j])&&pointNear(Array.from(positions.slice(j*6+3,j*6+6)),path[j+1]);
    }
    if(index===1||index===2){
      const cx=index===1?-30:10,cy=20,r=index===1?12:10,sweep=index===1?2*Math.PI:Math.PI,count=positions.length/6;
      geometryGolden&&=index===1?pointNear(first(positions),last(positions)):pointNear(first(positions),[20,20,0])&&pointNear(last(positions),[0,20,0]);
      for(let j=0;j<count;j++){
        const a=sweep*j/count,b=sweep*(j+1)/count,m=(a+b)/2,values=Array.from(positions.slice(j*6,j*6+6));
        const idealA=[cx+r*Math.cos(a),cy+r*Math.sin(a)],idealB=[cx+r*Math.cos(b),cy+r*Math.sin(b)],idealM=[cx+r*Math.cos(m),cy+r*Math.sin(m)];
        maxVertexError=Math.max(maxVertexError,Math.hypot(values[0]-idealA[0],values[1]-idealA[1]),Math.hypot(values[3]-idealB[0],values[4]-idealB[1]));
        maxMidpointError=Math.max(maxMidpointError,Math.hypot((values[0]+values[3])/2-idealM[0],(values[1]+values[4])/2-idealM[1]));
        const cross=(values[0]-cx)*(values[4]-cy)-(values[1]-cy)*(values[3]-cx);
        if(index===1)circleCcw&&=cross>0;else arcCcw&&=cross>0;
      }
    }
  }
  geometryGolden&&=restored.segments.length===6&&segmentCount===57&&visibleCount===3&&maxVertexError<=0.05&&maxMidpointError<=0.1&&circleCcw&&arcCcw&&
    bbox.min.every((v,i)=>near(v,[-80,-45,0][i],0.1))&&bbox.max.every((v,i)=>near(v,[50,45,0][i],0.1));
  renderer.render(scene,camera);
  const gl=renderer.getContext(),pixels=new Uint8Array(WIDTH*HEIGHT*4);gl.readPixels(0,0,WIDTH,HEIGHT,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const bright=(r,g,b)=>r+g+b>30;
  const visiblePixels={red:countPixels(pixels,pixelBox(-82,38,-48,42),(r,g,b)=>r>150&&g<100&&b<100),yellow:countPixels(pixels,pixelBox(-44,6,-16,34),(r,g,b)=>r>150&&g>150&&b<100),green:countPixels(pixels,pixelBox(18,-47,42,-28),(r,g,b)=>r<100&&g>150&&b>60)};
  const hiddenPixels={off:countPixels(pixels,pixelBox(-2,18,22,32),bright),frozen:countPixels(pixels,pixelBox(28,28,52,47),bright),entity:countPixels(pixels,pixelBox(-82,-22,-48,-18),bright)};
  current={scene,renderer};document.getElementById('status').textContent='CANDIDATE · styled offline geometry restored';
  return {state:envelope.state,builder:envelope.builder,segmentCount,visibleCount,buffersEqual,geometryGolden,maxVertexError,maxMidpointError,arcCcw,circleCcw,bbox,visiblePixels,hiddenPixels,glError:gl.getError(),canvas:{width:renderer.domElement.width,height:renderer.domElement.height,visible:renderer.domElement.getBoundingClientRect().width>0}};
}
window.offlineStyledProof={restore,validate:decodePacket,dispose};
