import { validateSceneAsset, validateSceneManifest, validSceneRef, type SceneManifest } from './cad-scene';
import { validateSceneViewerData,type SceneViewerDataV2 } from './scene-viewer-data';
import { sceneSha256 } from './scene-digest';
import {validateShapeDtos} from './scene-shape';

export const SCENE_PAYLOAD_LIMITS = Object.freeze({bytes:32*1024*1024,nodes:100_000,attributeScalars:2_000_000,depth:128});

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const uint = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const arrays: Record<string, readonly [number,number] | null> = {
  Int8Array:[-128,127],Uint8Array:[0,255],Uint8ClampedArray:[0,255],Int16Array:[-32768,32767],
  Uint16Array:[0,65535],Int32Array:[-2147483648,2147483647],Uint32Array:[0,4294967295],
  Float32Array:null,Float64Array:null,
};
const nodeTypes = new Set(['Group','Object3D','Line','LineSegments','LineLoop','Mesh','Points','Sprite']);
const materialTypes = new Set(['LineBasicMaterial','LineDashedMaterial','MeshBasicMaterial','PointsMaterial','SpriteMaterial']);
function fail(): never { throw new Error('SCENE_PAYLOAD_INVALID'); }
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) fail();
}
/** Pure bounded validation of the selected S2 format. No Three/DOM/network/DB. */
export function validateStoredScenePayload(bytes: Uint8Array, manifest: SceneManifest): void {
  if (bytes.length > SCENE_PAYLOAD_LIMITS.bytes) fail();
  validateSceneManifest(manifest, {scope:manifest.scope,format:'CUSTOM_DTO',byteLength:bytes.length,sha256:sceneSha256(bytes)});
  const dto: unknown = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if (!record(dto) || dto.schema !== 1 && dto.schema !== 2) fail();
  const v2=dto.schema===2;
  keys(dto,['schema','asset','root','viewerData']);
  const asset = validateSceneAsset(dto.asset);
  keys(dto.asset as unknown as Record<string,unknown>,['scope','sceneId','state','revision','objects']);
  keys(asset.scope as unknown as Record<string,unknown>,['versionId','sourceSha256','schema','builder','renderer','frame','sourceUnit']);
  for(const object of asset.objects){
    keys(object as unknown as Record<string,unknown>,['ref','treePath','kind','visible','transform','revision']);
    keys(object.ref as unknown as Record<string,unknown>,['versionId','sourceSha256','schema','builder','renderer','frame','sourceUnit','sceneId','id','origin','sourceRef','derivedFrom']);
  }
  if (asset.objects.length > SCENE_PAYLOAD_LIMITS.nodes || asset.state !== 'READY' || asset.sceneId !== manifest.sceneId ||
      asset.revision !== manifest.revision || JSON.stringify(asset.scope) !== JSON.stringify(manifest.scope)) fail();
  if(v2 && dto.viewerData===undefined)fail();
  let count = 0, scalars = 0;
  const budget={scalars:0};
  const viewerData=dto.viewerData!==undefined?validateSceneViewerData(dto.viewerData,v2?asset:undefined,budget):undefined;
  scalars=budget.scalars;
  const nodeLayers=new Map<string,string|undefined>();
  const walk = (node: unknown, path: number[]) => {
    if (!record(node) || path.length > SCENE_PAYLOAD_LIMITS.depth || ++count > SCENE_PAYLOAD_LIMITS.nodes) fail();
    keys(node,['type','name','visible','matrix','ref','layer','geometry','materials','children']);
    const expected = asset.objects[count-1];
    if (!expected || typeof node.type!=='string' || !nodeTypes.has(node.type) || !validSceneRef(node.ref,asset.scope) ||
        node.ref.origin !== 'DXF_IMPORTED' || node.ref.id !== expected.ref.id || node.type !== expected.kind ||
        typeof node.name !== 'string' || node.name.length > 4096 || typeof node.visible !== 'boolean' ||
        node.visible !== expected.visible || !Array.isArray(node.matrix) || node.matrix.length !== 16 || !node.matrix.every(finite) ||
        JSON.stringify(node.matrix) !== JSON.stringify(expected.transform) || JSON.stringify(path) !== JSON.stringify(expected.treePath) ||
        node.layer !== undefined && (typeof node.layer !== 'string' || node.layer.length > 256) || !Array.isArray(node.children)) fail();
    keys(node.ref as Record<string,unknown>,['versionId','sourceSha256','schema','builder','renderer','frame','sourceUnit','sceneId','id','origin','sourceRef','derivedFrom']);
    nodeLayers.set(node.ref.id as string,node.layer as string|undefined);
    let vertices = 0;
    if (node.geometry !== undefined) {
      if (!record(node.geometry)) fail(); const geometry = node.geometry;
      keys(geometry,v2?['type','attributes','index','groups','drawRange','shapes','curveSegments']:['attributes','index','groups']);
      if(v2){
        if(typeof geometry.type!=='string'||!['BufferGeometry','ShapeGeometry'].includes(geometry.type))fail();
        if(geometry.type==='ShapeGeometry'){
          if(geometry.shapes===undefined||geometry.curveSegments===undefined)fail();
          budget.scalars=scalars;validateShapeDtos(geometry.shapes,geometry.curveSegments,budget);scalars=budget.scalars;
        }else if(geometry.shapes!==undefined||geometry.curveSegments!==undefined)fail();
      }
      if (!record(geometry.attributes) || !record(geometry.attributes.position)) fail();
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        if (!['position','normal','color','uv'].includes(name) || !record(attribute)) fail();
        keys(attribute,['itemSize','array','normalized','arrayType']);
        if (!uint(attribute.itemSize) || attribute.itemSize < 1 || attribute.itemSize > 4 ||
            !Array.isArray(attribute.array) || attribute.array.length % attribute.itemSize ||
            typeof attribute.normalized !== 'boolean' || typeof attribute.arrayType !== 'string' ||
            !Object.hasOwn(arrays,attribute.arrayType)) fail();
        scalars += attribute.array.length; if (scalars > SCENE_PAYLOAD_LIMITS.attributeScalars) fail();
        const range = arrays[attribute.arrayType];
        if (attribute.array.some(n => !finite(n) || range && (!Number.isInteger(n) || n < range[0] || n > range[1]) ||
            attribute.arrayType === 'Float32Array' && !Number.isFinite(Math.fround(n)))) fail();
        if (name === 'position') { if (attribute.itemSize !== 3) fail(); vertices = attribute.array.length / 3; }
      }
      let indexArray:unknown=geometry.index;
      if(v2&&indexArray!==null){
        if(!record(indexArray))fail();keys(indexArray,['arrayType','array']);
        if(typeof indexArray.arrayType!=='string'||!['Uint16Array','Uint32Array'].includes(indexArray.arrayType)||!Array.isArray(indexArray.array))fail();
        indexArray=indexArray.array;
      }
      if (indexArray !== null && (!Array.isArray(indexArray) || indexArray.length > 2_000_000 ||
          indexArray.some(n => !uint(n) || n >= vertices || v2 && record(geometry.index) && geometry.index.arrayType==='Uint16Array' && n>65535))) fail();
      if(v2&&Array.isArray(indexArray)){scalars+=indexArray.length;if(scalars>SCENE_PAYLOAD_LIMITS.attributeScalars)fail();}
      const drawCount = Array.isArray(indexArray) ? indexArray.length : vertices;
      if(v2){if(!record(geometry.drawRange))fail();keys(geometry.drawRange,['start','count']);
        if(!uint(geometry.drawRange.start)||geometry.drawRange.start>drawCount||geometry.drawRange.count!==null&&
          (!uint(geometry.drawRange.count)||geometry.drawRange.start+Number(geometry.drawRange.count)>drawCount))fail();}
      if (!Array.isArray(geometry.groups) || geometry.groups.length > 100_000) fail();
      for (const group of geometry.groups) {
        if (!record(group)) fail(); keys(group,['start','count','materialIndex']);
        // Three ignores groups when a Mesh has a single material. Its text
        // ShapeGeometry still records one group/materialIndex per glyph.
        if (!uint(group.start) || !uint(group.count) || group.start + group.count > drawCount || !uint(group.materialIndex) ||
            !Array.isArray(node.materials) || node.materials.length!==1 && group.materialIndex >= node.materials.length) fail();
      }
    }
    if (node.materials !== undefined) {
      if (!Array.isArray(node.materials) || node.materials.length > 256) fail();
      for (const material of node.materials) {
        if (!record(material)) fail(); keys(material,v2?['type','color','opacity','transparent','linewidth','dashSize','gapSize','side','depthTest','depthWrite','alphaTest','blending']:
          ['type','color','opacity','transparent','linewidth','dashSize','gapSize']);
        if (typeof material.type!=='string'||!materialTypes.has(material.type) || !uint(material.color) || material.color > 0xffffff ||
            !finite(material.opacity) || material.opacity < 0 || material.opacity > 1 || typeof material.transparent !== 'boolean' ||
            !finite(material.linewidth) || !finite(material.dashSize) || !finite(material.gapSize)) fail();
        if(v2&&(typeof material.side!=='number'||![0,1,2].includes(material.side)||typeof material.depthTest!=='boolean'||typeof material.depthWrite!=='boolean'||
          !finite(material.alphaTest)||material.alphaTest<0||material.alphaTest>1||
          typeof material.blending!=='number'||![0,1,2,3,4].includes(material.blending)))fail();
      }
    }
    node.children.forEach((child,index) => walk(child,[...path,index]));
  };
  walk(dto.root,[]); if (count !== asset.objects.length) fail();
  const sourceIndex=v2?(viewerData as SceneViewerDataV2).sourceIndex:undefined;
  if(sourceIndex?.state==='READY'){
    for(const binding of sourceIndex.bindings)if(binding.layer!==null&&nodeLayers.get(binding.sceneObjectId)!==binding.layer)fail();
  }
}
