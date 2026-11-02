import * as THREE from 'three';
import {memoExportSettings} from '../../domain/cad-exchange';
import type {MemoRaster} from './exchange-memo-raster';

function quantized(raw:readonly [number,number,number],precision:{max:number}):[number,number,number]{
 const q=raw.map(Math.fround) as [number,number,number];
 if(q.some(n=>!Number.isFinite(n)))throw new Error('메모 좌표가 유효하지 않습니다.');
 precision.max=Math.max(precision.max,Math.hypot(raw[0]-q[0],raw[1]-q[1],raw[2]-q[2]));
 return q;
}
/** Owned XZ plane + pin + leader, positioned in metres after WCS origin subtraction. */
export function buildExchangeMemoAnnotation(raster:MemoRaster,origin:THREE.Vector3,metresPerUnit:number,
 textHeightMetres:number,precision:{max:number}):THREE.Group{
 const {memo,canvas,plan}=raster;
 const group=new THREE.Group(),owned:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[];
 group.name=memo.title.slice(0,100);
 group.userData={key:memo.key,id:memo.id,origin:memo.origin,revision:memo.revision,
  title:memo.title,content:memo.content,anchorWcs:{...memo.anchorWcs},anchorMode:memo.anchorMode,
  broken:memo.broken,settings:memoExportSettings(memo.settings),textHeightMetres,
  visual:'PNG_TEXTURE_PLANE_WITH_PIN_LEADER'};
 try{
  const anchor=quantized([(memo.anchorWcs.x-origin.x)*metresPerUnit,
    -origin.z*metresPerUnit,-(memo.anchorWcs.y-origin.y)*metresPerUnit],precision);
  const rawAnchor:[number,number,number]=[(memo.anchorWcs.x-origin.x)*metresPerUnit,
    -origin.z*metresPerUnit,-(memo.anchorWcs.y-origin.y)*metresPerUnit];
  const labelX=rawAnchor[0]+2*textHeightMetres,labelZ=rawAnchor[2]-2*textHeightMetres;
  const width=plan.width/BODY_PX*textHeightMetres,height=plan.height/BODY_PX*textHeightMetres;
  const topLeft=quantized([labelX,anchor[1],labelZ],precision),
    topRight=quantized([labelX+width,anchor[1],labelZ],precision),
    bottomRight=quantized([labelX+width,anchor[1],labelZ+height],precision),
    bottomLeft=quantized([labelX,anchor[1],labelZ+height],precision);
  const plane=new THREE.BufferGeometry();owned.push(plane);plane.setAttribute('position',new THREE.Float32BufferAttribute([
    ...topLeft,...topRight,...bottomRight,...bottomLeft],3));
  plane.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));plane.setIndex([0,1,2,0,2,3]);
  const texture=new THREE.CanvasTexture(canvas);textures.push(texture);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:false,side:THREE.DoubleSide});materials.push(material);
  const card=new THREE.Mesh(plane,material);card.name='Memo text PNG';group.add(card);
  const leader=new THREE.BufferGeometry();owned.push(leader);leader.setAttribute('position',new THREE.Float32BufferAttribute([
    ...anchor,...topLeft],3));
  const leaderMaterial=new THREE.MeshBasicMaterial({color:0x0f766e});materials.push(leaderMaterial);
  const leaderObject=new THREE.LineSegments(leader,leaderMaterial);
  leaderObject.name='Memo leader';group.add(leaderObject);
  const radius=Math.max(.001,textHeightMetres*.18);
  const pinGeometry=new THREE.SphereGeometry(radius,8,6);owned.push(pinGeometry);
  const pinMaterial=new THREE.MeshBasicMaterial({color:0x0f766e});materials.push(pinMaterial);
  const pin=new THREE.Mesh(pinGeometry,pinMaterial);
  pin.position.set(...anchor);pin.name='Memo pin';group.add(pin);
  return group;
 }catch(error){for(const geometry of owned)geometry.dispose();for(const material of materials)material.dispose();
  for(const texture of textures)texture.dispose();throw error;}
}

const BODY_PX=32;
