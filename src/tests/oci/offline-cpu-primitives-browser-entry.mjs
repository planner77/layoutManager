/** Synthetic-only fresh-browser reconstruction. No product Viewer or parser. */
import * as THREE from 'three';
import {validateOfflineCpuPrimitives,restoreOfflineCpuPrimitives} from './offline-cpu-primitives-dto.mjs';

const palette={LINE:0xffdd33,CIRCLE:0x33ddff,ARC:0xff44dd,LWPOLYLINE:0x55ee66};
const close=(a,b,tolerance)=>Math.abs(a-b)<=tolerance;
let current;
function dispose(){
  if(!current)return;
  current.scene.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});
  current.renderer.dispose();current.renderer.domElement.remove();current=undefined;
}
async function restore(packet){
  const bytes=Uint8Array.from(packet.bytes);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==packet.sha256)throw new Error('OFFLINE_PROOF_DIGEST');
  const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  validateOfflineCpuPrimitives(envelope,packet.source);
  const restored=restoreOfflineCpuPrimitives(envelope,packet.source);
  dispose();
  const scene=new THREE.Scene();
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(800,640);renderer.setClearColor(0x000000);renderer.setPixelRatio(1);
  document.getElementById('canvas-root').append(renderer.domElement);
  const camera=new THREE.OrthographicCamera(-80,65,50,-65,0.1,1000);
  camera.position.set(0,0,100);camera.lookAt(0,0,0);
  let segmentCount=0,buffersEqual=true,maxCircleRadialError=0,maxArcRadialError=0,
    maxCircleChordError=0,maxArcChordError=0,arcCcw=true;
  const endpoints=[];
  const orderedTypes=['LINE','CIRCLE','ARC','LWPOLYLINE','LWPOLYLINE'];
  const exactKinds=envelope.primitiveCount===5&&restored.segments.length===5&&
    restored.segments.every((item,i)=>item.type===orderedTypes[i]);
  if(!exactKinds)throw new Error('OFFLINE_PROOF_FIXTURE_TYPES');
  const bbox={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const [index,item] of restored.segments.entries()){
    const primitive=envelope.primitives[index],positions=item.positions;
    const expected=primitive.segments.flat();
    buffersEqual&&=positions.length===expected.length&&positions.every((v,i)=>v===expected[i]);
    segmentCount+=positions.length/6;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    scene.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:palette[item.type]})));
    for(let i=0;i<positions.length;i+=3)for(let axis=0;axis<3;axis++){
      bbox.min[axis]=Math.min(bbox.min[axis],positions[i+axis]);
      bbox.max[axis]=Math.max(bbox.max[axis],positions[i+axis]);
    }
    endpoints.push({type:item.type,first:Array.from(positions.slice(0,3)),last:Array.from(positions.slice(-3))});
    // Independent analytic reference for the public fixture, not DTO metadata.
    if(item.type==='CIRCLE'||item.type==='ARC'){
      const cx=item.type==='CIRCLE'?30:-30,cy=20,radius=15;
      for(let i=0;i<positions.length;i+=6){
        const x1=positions[i]-cx,y1=positions[i+1]-cy,x2=positions[i+3]-cx,y2=positions[i+4]-cy;
        const radial=Math.max(Math.abs(Math.hypot(x1,y1)-radius),Math.abs(Math.hypot(x2,y2)-radius));
        const chord=Math.abs(Math.hypot((x1+x2)/2,(y1+y2)/2)-radius);
        if(item.type==='CIRCLE'){
          maxCircleRadialError=Math.max(maxCircleRadialError,radial);
          maxCircleChordError=Math.max(maxCircleChordError,chord);
        }else{
          maxArcRadialError=Math.max(maxArcRadialError,radial);
          maxArcChordError=Math.max(maxArcChordError,chord);
          arcCcw&&=x1*y2-y1*x2>0;
        }
      }
    }
  }
  renderer.render(scene,camera);
  const gl=renderer.getContext(),pixels=new Uint8Array(800*640*4);
  gl.readPixels(0,0,800,640,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let nonBlackPixels=0;
  const colorPixels={LINE:0,CIRCLE:0,ARC:0,LWPOLYLINE:0};
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(r+g+b>30)nonBlackPixels++;
    if(r>150&&g>150&&b<150)colorPixels.LINE++;
    if(r<150&&g>150&&b>150)colorPixels.CIRCLE++;
    if(r>150&&g<150&&b>150)colorPixels.ARC++;
    if(r<150&&g>150&&b<150)colorPixels.LWPOLYLINE++;
  }
  const line=endpoints[0],circle=endpoints[1],arc=endpoints[2],open=endpoints[3],closed=endpoints[4];
  const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>close(v,b[i],0.05));
  const equalSegments=(actual,golden)=>actual.length===golden.length&&actual.every((s,i)=>s.length===golden[i].length&&s.every((v,k)=>v===golden[i][k]));
  const polylinesGolden=equalSegments(envelope.primitives[0].segments,[[-60,-40,0,-10,-40,0]])&&
    equalSegments(envelope.primitives[3].segments,[[0,-50,0,20,-30,0],[20,-30,0,40,-50,0]])&&
    equalSegments(envelope.primitives[4].segments,[[-60,-20,0,-40,-20,0],[-40,-20,0,-40,0,0],[-40,0,0,-60,0,0],[-60,0,0,-60,-20,0]]);
  let curveGolden=true,maxAnalyticVertexError=0;
  for(const [index,cx,start,sweep] of [[1,30,0,Math.PI*2],[2,-30,350*Math.PI/180,110*Math.PI/180]]){
    const segments=envelope.primitives[index].segments;
    for(let i=0;i<segments.length;i++){
      const first=start+sweep*i/segments.length,last=start+sweep*(i+1)/segments.length;
      maxAnalyticVertexError=Math.max(maxAnalyticVertexError,
        Math.hypot(segments[i][0]-(cx+15*Math.cos(first)),segments[i][1]-(20+15*Math.sin(first)),segments[i][2]),
        Math.hypot(segments[i][3]-(cx+15*Math.cos(last)),segments[i][4]-(20+15*Math.sin(last)),segments[i][5]));
      curveGolden&&=eq(segments[i].slice(0,3),[cx+15*Math.cos(first),20+15*Math.sin(first),0])&&
        eq(segments[i].slice(3),[cx+15*Math.cos(last),20+15*Math.sin(last),0]);
    }
  }
  const geometryGolden=exactKinds&&polylinesGolden&&curveGolden&&maxAnalyticVertexError<=0.05&&buffersEqual&&segmentCount===envelope.segmentCount&&
    eq(line.first,[-60,-40,0])&&eq(line.last,[-10,-40,0])&&eq(circle.first,circle.last)&&
    eq(arc.first,[-30+15*Math.cos(350*Math.PI/180),20+15*Math.sin(350*Math.PI/180),0])&&
    eq(arc.last,[-30+15*Math.cos(100*Math.PI/180),20+15*Math.sin(100*Math.PI/180),0])&&
    eq(open.first,[0,-50,0])&&eq(open.last,[40,-50,0])&&eq(closed.first,closed.last)&&arcCcw&&
    bbox.min.every((v,i)=>close(v,[-60,-50,0][i],0.1))&&bbox.max.every((v,i)=>close(v,[45,35,0][i],0.1))&&
    Math.max(maxCircleRadialError,maxArcRadialError)<=0.05&&
    Math.max(maxCircleChordError,maxArcChordError)<=0.1;
  current={scene,renderer};
  document.getElementById('status').textContent='CANDIDATE · offline geometry restored';
  return {state:envelope.state,builder:envelope.builder,primitiveCount:envelope.primitiveCount,
    segmentCount,buffersEqual,geometryGolden,exactKinds,polylinesGolden,curveGolden,maxAnalyticVertexError,bbox,arcCcw,maxCircleRadialError,maxArcRadialError,
    maxCircleChordError,maxArcChordError,nonBlackPixels,colorPixels,glError:gl.getError(),
    canvas:{width:renderer.domElement.width,height:renderer.domElement.height,visible:renderer.domElement.getBoundingClientRect().width>0}};
}
window.offlinePrimitiveProof={restore,dispose};
