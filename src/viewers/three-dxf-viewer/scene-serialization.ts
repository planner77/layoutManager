/** S2 experiment only. Checked immutable DXF-derived source scene, never production cache. */
import * as THREE from 'three';
import {toCustomDto,fromCustomDto,type CustomSceneDto} from './scene-custom-dto';
import {validateSceneAsset,validateSceneManifest,validSceneRef,type SceneAsset,type SceneScope,type SceneManifest,type SceneFormat} from '../../domain/cad-scene';
export type {SceneFormat,SceneManifest} from '../../domain/cad-scene';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const digest=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const types=new Set(['Group','Object3D','Line','LineSegments','LineLoop','Mesh','Points','Sprite']);
const forbidden=new Set(['url','src','uri','image','images','texture','textures','video','audio','script','scripts','callback','onload','onerror']);
function safe(v:unknown,depth=0,path=""):void{
 if(depth>128)throw new Error('SCENE_DEPTH');
 if(Array.isArray(v)){if(v.length>2_000_000)throw new Error('SCENE_ARRAY');for(const x of v)safe(x,depth+1,path+"/[]");return;}
 if(!rec(v)){if(typeof v==='number'&&!Number.isFinite(v))throw new Error('SCENE_NONFINITE:'+path);return;}
 for(const [k,x] of Object.entries(v)){if(forbidden.has(k.toLowerCase()))throw new Error('SCENE_EXTERNAL_RESOURCE');safe(x,depth+1,path+"/"+k);}
}
function sanitizeTree(tree:THREE.Object3DJSON):THREE.Object3DJSON{
 const walk=(node:Record<string,unknown>)=>{const data=rec(node.userData)?node.userData:{};
  const entity=rec(data.entity)?data.entity:{};const layer=typeof data.cadLayer==='string'?data.cadLayer:typeof data.layer==='string'?data.layer:typeof entity.layer==='string'?entity.layer:undefined;
  node.userData={cadSceneRef:data.cadSceneRef,...(layer?{cadLayer:layer}:{})};
  const children=node.children;if(Array.isArray(children))children.forEach(child=>{if(rec(child))walk(child);});
 };if(rec(tree.object))walk(tree.object);return tree;
}
function inspect(tree:unknown,asset:SceneAsset):void{
 if(!rec(tree)||!rec(tree.object)||!Array.isArray(tree.geometries)||!Array.isArray(tree.materials)||tree.images||tree.textures||tree.animations||tree.skeletons)throw new Error('SCENE_JSON_INVALID');
 safe(tree);
 const materialTypes=new Set(['LineBasicMaterial','LineDashedMaterial','MeshBasicMaterial','PointsMaterial','SpriteMaterial']);
 const geos=new Set<string>(),mats=new Set<string>(),shapes=new Set<string>();
 if(tree.shapes!==undefined){if(!Array.isArray(tree.shapes))throw new Error('SCENE_SHAPES_INVALID');for(const s of tree.shapes){if(!rec(s)||typeof s.uuid!=='string'||shapes.has(s.uuid))throw new Error('SCENE_SHAPE_INVALID');shapes.add(s.uuid);}}
 for(const g of tree.geometries){
  if(!rec(g)||typeof g.uuid!=='string'||geos.has(g.uuid)||!['BufferGeometry','ShapeGeometry'].includes(String(g.type)))throw new Error('SCENE_GEOMETRY_INVALID');
  geos.add(g.uuid);
  if(g.type==='BufferGeometry'){
   if(!rec(g.data)||!rec(g.data.attributes)||!rec(g.data.attributes.position))throw new Error('SCENE_GEOMETRY_ATTRIBUTES_INVALID');
   for(const [name,a] of Object.entries(g.data.attributes)){
    if(!['position','normal','color','uv'].includes(name)||!rec(a)||!Array.isArray(a.array)||!Number.isSafeInteger(a.itemSize)||Number(a.itemSize)<1||Number(a.itemSize)>4||a.array.length%Number(a.itemSize)||a.array.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('SCENE_GEOMETRY_ATTRIBUTE_INVALID');
   }
  }else{
   if(!Array.isArray(g.shapes)||g.shapes.some(id=>typeof id!=='string'||!shapes.has(id)))throw new Error('SCENE_SHAPE_REF_INVALID');
  }
 }
 for(const m of tree.materials){if(!rec(m)||typeof m.uuid!=='string'||mats.has(m.uuid)||!materialTypes.has(String(m.type)))throw new Error('SCENE_MATERIAL_INVALID');mats.add(m.uuid);}
 const actual:Record<string,unknown>[]=[];
 const walk=(node:unknown,path:number[])=>{
  if(!rec(node)||!types.has(String(node.type))||!rec(node.userData)||!rec(node.userData.cadSceneRef))throw new Error('SCENE_NODE_INVALID');
  const ref=node.userData.cadSceneRef,expected=asset.objects[actual.length];
  if(!expected||!validSceneRef(ref,asset.scope)||ref.origin!=='DXF_IMPORTED'||ref.id!==expected.ref.id||JSON.stringify(path)!==JSON.stringify(expected.treePath)||
    node.type!==expected.kind||(node.visible??true)!==expected.visible||!Array.isArray(node.matrix)||JSON.stringify(node.matrix)!==JSON.stringify(expected.transform))throw new Error('SCENE_ID_INVALID');
  if(node.geometry!==undefined&&(typeof node.geometry!=='string'||!geos.has(node.geometry)))throw new Error('SCENE_GEOMETRY_REF_INVALID');
  if(node.material!==undefined){const refs=Array.isArray(node.material)?node.material:[node.material];if(refs.some(id=>typeof id!=='string'||!mats.has(id)))throw new Error('SCENE_MATERIAL_REF_INVALID');}
  if(Object.keys(node.userData).some(k=>k!=='cadSceneRef'&&k!=='cadLayer')||node.userData.cadLayer!==undefined&&typeof node.userData.cadLayer!=='string')throw new Error('SCENE_METADATA_INVALID');
  actual.push(node);
  const children=node.children??[];if(!Array.isArray(children))throw new Error('SCENE_CHILDREN_INVALID');
  children.forEach((child,index)=>walk(child,[...path,index]));
 };
 walk(tree.object,[]);if(actual.length!==asset.objects.length)throw new Error('SCENE_NODE_COUNT_INVALID');
}
export async function serializeSourceScene(root:THREE.Object3D,asset:SceneAsset,format:SceneFormat):Promise<{bytes:Uint8Array;manifest:SceneManifest}>{
 validateSceneAsset(asset);if(asset.state!=='BUILDING')throw new Error('SCENE_NOT_BUILDING');
 const readyAsset:SceneAsset={...asset,state:'READY'};
 // Upstream userData contains parser internals (including BLOCK references). Keep only
 // verified app identity and a display layer; restore the live viewer tree afterwards.
 const backup=new Map<THREE.Object3D,Record<string,unknown>>();
 let bytes:Uint8Array;
 try{
  root.traverse(node=>{const data=node.userData;backup.set(node,data);const entity=rec(data.entity)?data.entity:{};
   const layer=typeof data.cadLayer==='string'?data.cadLayer:typeof data.layer==='string'?data.layer:typeof entity.layer==='string'?entity.layer:undefined;
   node.userData={cadSceneRef:data.cadSceneRef,...(layer?{cadLayer:layer}:{})};
  });
  const tree=sanitizeTree(root.toJSON());inspect(tree,readyAsset);
  if(format!=='THREE_JSON'&&format!=='CUSTOM_DTO')throw new Error('SCENE_FORMAT_INVALID');
  bytes=enc.encode(JSON.stringify(format==='CUSTOM_DTO'?toCustomDto(root,readyAsset):{asset:readyAsset,tree}));
 }finally{for(const [node,data] of backup)node.userData=data;}
 return {bytes,manifest:{scope:asset.scope,sceneId:asset.sceneId,format,state:'READY',revision:asset.revision,byteLength:bytes.length,sha256:await digest(bytes)}};
}
export async function restoreSourceScene(bytes:Uint8Array,manifest:SceneManifest,expected:Readonly<{scope:SceneScope;format:SceneFormat;byteLength:number;sha256:string}>):Promise<THREE.Object3D>{
 validateSceneManifest(manifest,expected);
 if(bytes.length!==expected.byteLength)throw new Error('SCENE_BYTE_LENGTH_MISMATCH');
 if(await digest(bytes)!==expected.sha256)throw new Error('SCENE_DIGEST_MISMATCH');
 const parsed=JSON.parse(dec.decode(bytes)) as unknown;if(!rec(parsed))throw new Error('SCENE_PAYLOAD_INVALID');
 const asset=validateSceneAsset(parsed.asset);
 if(asset.state!=='READY'||asset.revision!==manifest.revision||JSON.stringify(asset.scope)!==JSON.stringify(expected.scope)||asset.sceneId!==manifest.sceneId)throw new Error('SCENE_ASSET_MISMATCH');
 if(expected.format==='CUSTOM_DTO'){
  if(parsed.schema!==1||!rec(parsed.root))throw new Error('SCENE_CUSTOM_SCHEMA_INVALID');
  safe(parsed);return fromCustomDto(parsed as CustomSceneDto);
 }
 inspect(parsed.tree,asset);
 return new THREE.ObjectLoader().parse(parsed.tree as THREE.Object3DJSON);
}
