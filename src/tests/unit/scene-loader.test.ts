import {afterEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes} from 'node:crypto';
import * as THREE from 'three';
import {sceneSha256} from '../../domain/scene-digest';
import {validateStoredScenePayload} from '../../domain/scene-payload';
import {sceneScope,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {serializeSourceScene,restoreSourceScene} from '../../viewers/three-dxf-viewer/scene-serialization';
import {sceneOutlineProjection} from '../../viewers/three-dxf-viewer/scene-projection';
import {ViewerSource} from '../../viewers/core/source';
import {ViewerManager,type CadViewerAdapter} from '../../viewers/core/adapter';
const versionId='16400000-0000-4000-8000-000000000001';
const assetId='16400000-0000-4000-8000-000000000002';
const scope=sceneScope(versionId,'a'.repeat(64),'DXF_INSUNITS_4');
async function packet(){
  const root=new THREE.Group();root.position.set(100000000,25,0);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(10,5,0)]),new THREE.LineBasicMaterial());
  line.userData.cadLayer='NO_HANDLE';root.add(line);
  const asset=tagImportedTree(root,scope);
  return {...await serializeSourceScene(root,asset,'CUSTOM_DTO',{textIndex:{hits:[],skipped:{},truncated:false}}),root};
}
afterEach(()=>vi.unstubAllGlobals());
describe('SC-14/15/16 Scene loader',()=>{
  it('checks SHA-256 on LAN HTTP with padding boundaries and binary bytes',()=>{
    for(const length of [0,1,3,55,56,63,64,65,127,128,10000]){
      const bytes=randomBytes(length);expect(sceneSha256(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(sceneSha256(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('restores stable domain IDs and projects WCS geometry without Handle mapping or canonical claim',async()=>{
    const p=await packet();const restored=await restoreSourceScene(p.bytes,p.manifest,p.manifest);
    expect(restored.uuid).not.toBe(p.root.uuid);
    expect(restored.children[0].userData.cadSceneRef).toEqual(p.root.children[0].userData.cadSceneRef);
    const projection=sceneOutlineProjection(restored,scope);expect(projection.entities).toHaveLength(1);
    expect(projection.entities[0]).toMatchObject({handle:null,stable:false,layer:'NO_HANDLE',bounds:[100000000,25,100000010,30]});
  });
  it('loads only manifest/blob, never original adapter.load or DXF text Worker',async()=>{
    const p=await packet();const urls:string[]=[];
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{urls.push(url);return url.endsWith('/scene')?
      Response.json({status:'READY',manifest:p.manifest,assetId,revision:1,contentUrl:`/api/cad-files/${versionId}/scene/content?assetId=${assetId}`}):new Response(p.bytes as BodyInit);}));
    const load=vi.fn(),loadScene=vi.fn(async()=>({empty:false})),dispose=vi.fn();
    const factory=async():Promise<CadViewerAdapter>=>({load,loadScene,getSceneTextIndex:()=>({hits:[],skipped:{},truncated:false}),dispose,fitToView(){},zoomIn(){},zoomOut(){}});
    const manager=new ViewerManager(factory,new ViewerSource(),undefined,'DXF',{...scope,mode:'scene-first'});
    await manager.load(`/api/cad-files/${versionId}/content`,'DXF');await manager.getTextIndex();
    expect(urls).toHaveLength(2);expect(urls.some(url=>url.endsWith('/content'))).toBe(false);
    expect(load).not.toHaveBeenCalled();expect(loadScene).toHaveBeenCalledOnce();expect(manager.getLoadStrategy()).toBe('READY_SCENE');
    manager.dispose();expect(dispose).toHaveBeenCalledOnce();
  });
  it.each(['MISSING','REBUILD_REQUIRED','FAILED'])('does not fall back to source for %s',async(status)=>{
    const fetcher=vi.fn(async()=>Response.json({status}));vi.stubGlobal('fetch',fetcher);
    const factory=vi.fn();const manager=new ViewerManager(factory,undefined,undefined,'DXF',{...scope,mode:'scene-first'});
    await expect(manager.load('/original','DXF')).rejects.toMatchObject({stage:'scene'});
    expect(fetcher).toHaveBeenCalledOnce();expect(factory).not.toHaveBeenCalled();
  });
  it('rejects a corrupt body and metadata from another Version, without original fetch',async()=>{
    const p=await packet();const corrupt=p.bytes.slice();corrupt[20]^=1;
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({status:'READY',manifest:p.manifest,assetId,revision:1,contentUrl:`/api/cad-files/${versionId}/scene/content?assetId=${assetId}`})).mockResolvedValueOnce(new Response(corrupt));
    vi.stubGlobal('fetch',fetcher);
    await expect(new ViewerSource().readScene(versionId,scope.sourceSha256,new AbortController().signal)).rejects.toMatchObject({stage:'scene',reasonCode:'REBUILD_REQUIRED'});
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({status:'READY',manifest:p.manifest})));
    await expect(new ViewerSource().readScene('different-version',scope.sourceSha256,new AbortController().signal)).rejects.toMatchObject({stage:'scene'});
  });
  it('fails closed on network errors and incompatible builders without reading source',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new Error('offline'));vi.stubGlobal('fetch',fetcher);
    await expect(new ViewerSource().readScene(versionId,scope.sourceSha256,new AbortController().signal)).rejects.toMatchObject({stage:'scene'});
    expect(fetcher).toHaveBeenCalledOnce();
    const p=await packet();fetcher.mockResolvedValueOnce(Response.json({status:'READY',manifest:{...p.manifest,scope:{...p.manifest.scope,builder:'unsupported'}}}));
    await expect(new ViewerSource().readScene(versionId,scope.sourceSha256,new AbortController().signal)).rejects.toMatchObject({stage:'scene',reasonCode:'REBUILD_REQUIRED'});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('cancels Scene transfer before adapter construction',async()=>{
    let signal:AbortSignal|undefined;
    vi.stubGlobal('fetch',vi.fn((_url:string,options:RequestInit)=>new Promise((_resolve,reject)=>{signal=options.signal!;signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')));})));
    const factory=vi.fn();const manager=new ViewerManager(factory,undefined,undefined,'DXF',{...scope,mode:'scene-first'});
    const pending=manager.load('/original','DXF');const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});manager.dispose();await rejected;
    expect(signal?.aborted).toBe(true);expect(factory).not.toHaveBeenCalled();
  });
  it('does not classify a READY renderer initialization failure as legacy fallback',async()=>{
    const p=await packet();const fetcher=vi.fn().mockResolvedValueOnce(Response.json({status:'READY',manifest:p.manifest,assetId,revision:0,contentUrl:`/api/cad-files/${versionId}/scene/content?assetId=${assetId}`})).mockResolvedValueOnce(new Response(p.bytes as BodyInit));
    vi.stubGlobal('fetch',fetcher);
    const manager=new ViewerManager(async()=>{throw new Error('GPU unavailable');},undefined,undefined,'DXF',{...scope,mode:'scene-first'});
    await expect(manager.load('/original','DXF')).rejects.toMatchObject({stage:'scene',reasonCode:'RENDERER_UNAVAILABLE'});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects client sidecars, integer storage corruption and external resource keys even with matching digest',async()=>{
    const p=await packet();
    for(const mutate of [
      (dto:Record<string,unknown>)=>{dto.viewerData={textIndex:{hits:[],skipped:{},truncated:false},memos:[]};},
      (dto:Record<string,unknown>)=>{dto.url='https://example.invalid/asset';},
      (dto:Record<string,unknown>)=>{const root=dto.root as {children:{geometry:{attributes:{position:{arrayType:string;array:number[]}}}}[]};root.children[0].geometry.attributes.position.arrayType='Uint8Array';root.children[0].geometry.attributes.position.array[0]=999;},
    ]){
      const dto=JSON.parse(new TextDecoder().decode(p.bytes));mutate(dto);const bytes=new TextEncoder().encode(JSON.stringify(dto));
      expect(()=>validateStoredScenePayload(bytes,{...p.manifest,byteLength:bytes.length,sha256:sceneSha256(bytes)})).toThrow();
    }
  });
  it('preserves single-material text glyph groups but rejects invalid multi-material references',async()=>{
    const root=new THREE.Group();const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0),new THREE.Vector3(1,1,0)]);
    geometry.addGroup(0,3,8);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());root.add(mesh);
    const p=await serializeSourceScene(root,tagImportedTree(root,scope),'CUSTOM_DTO');
    expect(()=>validateStoredScenePayload(p.bytes,p.manifest)).not.toThrow();
    const dto=JSON.parse(new TextDecoder().decode(p.bytes));dto.root.children[0].materials.push(dto.root.children[0].materials[0]);
    const bytes=new TextEncoder().encode(JSON.stringify(dto));
    expect(()=>validateStoredScenePayload(bytes,{...p.manifest,byteLength:bytes.length,sha256:sceneSha256(bytes)})).toThrow();
  });
});
