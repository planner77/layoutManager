import type { CadFocusBounds } from '../core/text-index';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DXFViewer } from 'three-dxf-viewer';
import type { CadViewerAdapter } from '../core/adapter';
import { explicitElevation } from './normalize';
import {sceneScope,sourceUnitFromDxf,tagImportedTree,tagAppTree} from './scene-tags';
import type {SceneAsset} from '../../domain/cad-scene';
import type {SceneScope,CadSceneObjectRef} from '../../domain/cad-scene';
import {validSceneRef} from '../../domain/cad-scene';
import type {ReadyScene} from '../core/source';
import type {SceneArtifact} from '../core/adapter';
import {serializeSourceScene,restoreSourceScene,storedSceneViewerData} from './scene-serialization';
import {extractDxfText,type CadTextIndex} from '../core/text-index';
import {sceneOutlineProjection} from './scene-projection';
import {sceneSha256} from '../../domain/scene-digest';
import {ViewerLoadError} from '../core/viewer-load-error';
import {SelectionController,type SelectionMode} from './selection-controller';
import {reconcileRenderCoverage,type RenderObservation,type RenderCoverage} from './render-coverage';
import type {DxfOutlineIndex,OutlineEntity,OutlineKind,OutlinePath} from '../core/outline-geometry';
import type {OutlineResult} from '../core/outline-compute';
import {captureSceneVisibility,applySceneVisibility} from './scene-layer-visibility';
import type {OutlineInfo,SavedOutline,SavedOutlineOverlayState} from '../core/adapter';
import type {OutlineAssignment} from '../../domain/outline-assignment';
import {parseOutlineAssignmentMetadata} from '../../domain/outline-assignment';
import {outlineGeometryBounds} from '../../domain/outline-tree';
import {selectedTranslationIds,validTranslationPreview} from '../../domain/generated-translate';
import {selectedRotation,dragRotationDegrees} from '../../domain/generated-rotate';
import {buildGeneratedTransfer,parseGeneratedTransfer} from '../../domain/generated-transfer';
import {canvasEditCapability,canvasObjectRef,createGeneratedId,validCanvasScope,type CanvasObjectRef} from '../../domain/canvas-object-selection';
import {
  GeneratedDocument,generatedResult,generatedRigidMatrix,IDENTITY_2D,
  type GeneratedCommand,type Affine2D,
} from '../../domain/generated-document';
import {SceneWorkDocument,type SceneWorkCommand,type SceneWorkState} from '../../domain/scene-work';
import type {MemoSnapTarget,SnapPoint} from '../../domain/memo-session-snap';
import type {ExchangeSelection} from '../../domain/cad-exchange';
import {captureExchangeBaseline,exchangeInventory,captureExchangeSnapshot as captureExchangeData,type ExchangeBaseline} from './exchange-snapshot';

function release(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  for (const material of materials) { for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); material.dispose(); }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  group.clear();
}
export class ThreeDxfViewerAdapter implements CadViewerAdapter {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,10000);
  private controls: OrbitControls;
  private resize: ResizeObserver;
  private object?: THREE.Group;
  private sceneAsset?:SceneAsset;
  private exchangeBaseline?:ExchangeBaseline;
  private exchangeScope?:SceneScope;
  private exchangeEpoch=0;
  private sceneArtifact?:SceneArtifact;
  private sceneTextIndex?:CadTextIndex;
  private disposed = false;
  private cancel?: () => void;
  private bounds = new THREE.Box3();
  private index?: DxfOutlineIndex;
  private renderIndex?:DxfOutlineIndex;
  private sceneWork?:SceneWorkDocument;
  private sceneObjects=new Map<string,{object:THREE.Object3D;baseLocal:THREE.Matrix4;baseWorld:THREE.Matrix4;intrinsicVisible:boolean;layer:string}>();
  private intrinsicSceneVisibility=new Map<THREE.Object3D,boolean>();
  private rendererIds=new Map<string,string>();
  private indexError?: string;
  private renderCoverage?: RenderCoverage;
  private spatialIndexMs?:number;
  private sourceIndexMs?:number;
  private renderAuditMs?:number;
  private selector?: SelectionController;
  private mode: SelectionMode='pan';
  private visibleLayers=new Set<string>();
  private selectionGroup?: THREE.Group;
  private previewGroup?: THREE.Group;
  private savedGroup=new THREE.Group();
  private savedGroups=new Map<string,THREE.Group>();
  private selectedSavedGroup?: THREE.Group;
  /** E4 preview is a disposable Scene-only ghost; never an extra Document entry. */
  private dragGhostGroup?:THREE.Group;
  private dragTranslation?:Readonly<{
    ids:readonly string[];
    bounds:Readonly<{minX:number;minY:number;maxX:number;maxY:number}>;
  }>;
  private rotateHandle?:HTMLButtonElement;
  private dragRotation?:{
    pointerId:number;ids:readonly string[];pivot:readonly [number,number];
    start:readonly [number,number];angleDegrees:number;
  };
  private rotationGhost?:THREE.Group;
  private rotateWheel=()=>{if(this.dragRotation)this.dropRotationPreview();};
  private cameraChanged=()=>{
    if(this.dragTranslation)this.selector?.cancelGeneratedDrag();
    if(this.dragRotation)this.dropRotationPreview();
  };
  /** GeneratedDocument owns all confirmed geometry, ordering, UUIDs, metadata and visibility. */
  private document?:GeneratedDocument;
  private renderedTransforms=new Map<string,Affine2D>();
  private nextSavedId=1;
  private preview?: OutlineResult;
  private previewKind?: OutlineKind;
  private activeWorkers: Partial<Record<'index'|'compute',{worker:Worker;cancel:()=>void}>>={};
  private computeSequence=0;
  constructor(private container: HTMLElement, private outline?:{
    versionId:string;sourceSha256:string;
    prepareScene?:boolean;
    onSelection?:(entities:OutlineEntity[])=>void;
    onObjectSelection?:(refs:CanvasObjectRef[])=>void;
    onPreview?:(result:OutlineResult|null,error?:string)=>void;
    onSaved?:(count:number)=>void;
    onEditError?:(message:string)=>void;
    onViewChange?:()=>void;
  }) {
    const existingCanvases=new Set(container.querySelectorAll('canvas'));
    try {
    if(outline && validCanvasScope(outline))
      this.document=new GeneratedDocument(outline,()=>this.documentChanged());
    this.renderer = new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x000000);
    container.append(this.renderer.domElement);
    const rotateHandle=document.createElement('button');
    rotateHandle.type='button';
    rotateHandle.dataset.testid='generated-rotate-handle';
    rotateHandle.setAttribute('aria-label','선택한 생성 개체 회전 핸들');
    rotateHandle.title='WCS XY 반시계(+) 회전 · 드래그, ESC 취소';
    rotateHandle.textContent='↻';
    Object.assign(rotateHandle.style,{
      position:'absolute',zIndex:'46',display:'none',transform:'translate(-50%,-50%)',
      minWidth:'30px',height:'30px',padding:'3px',borderRadius:'50%',
      border:'2px solid #0f766e',background:'#fff',color:'#115e59',
      cursor:'grab',touchAction:'none',fontSize:'19px',fontWeight:'bold',
    });
    this.rotateHandle=rotateHandle;
    container.append(rotateHandle);
    rotateHandle.addEventListener('pointerdown',this.rotatePointerDown);
    rotateHandle.addEventListener('pointermove',this.rotatePointerMove);
    rotateHandle.addEventListener('pointerup',this.rotatePointerUp);
    rotateHandle.addEventListener('pointercancel',this.rotatePointerCancel);
    rotateHandle.addEventListener('lostpointercapture',this.rotatePointerCancel);
    window.addEventListener('keydown',this.rotateKeyDown,true);
    window.addEventListener('wheel',this.rotateWheel,true);
    this.camera.position.z = 1000;
    this.controls = new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    this.controls.addEventListener('change',this.render);
    this.controls.addEventListener('change',this.cameraChanged);
    this.resize = new ResizeObserver(this.size);
    this.resize.observe(container); this.size();
    } catch(error) {
      const partial=this as unknown as {resize?:ResizeObserver;controls?:OrbitControls;renderer?:THREE.WebGLRenderer};
      partial.resize?.disconnect();
      partial.controls?.dispose();
      partial.renderer?.dispose();
      partial.renderer?.forceContextLoss();
      for(const canvas of container.querySelectorAll('canvas')) if(!existingCanvases.has(canvas))canvas.remove();
      this.rotateHandle?.remove();this.rotateHandle=undefined;
      window.removeEventListener('keydown',this.rotateKeyDown,true);
      window.removeEventListener('wheel',this.rotateWheel,true);
      this.document?.dispose();this.document=undefined;
      throw error;
    }
  }
  private render = () => {
    if (!this.disposed) {
      this.renderer.render(this.scene,this.camera);
      this.updateRotateHandle();
      this.outline?.onViewChange?.();
    }
  };
  private size = () => {
    if (this.disposed) return;
    this.selector?.cancelGeneratedDrag();
    if(this.dragRotation)this.dropRotationPreview();
    const w=Math.max(1,this.container.clientWidth), h=Math.max(1,this.container.clientHeight);
    this.renderer.setSize(w,h);
    const height=this.camera.top-this.camera.bottom;
    this.camera.left=-height*w/h/2;this.camera.right=height*w/h/2;
    this.camera.updateProjectionMatrix();this.render();
  };
  async load(source: ArrayBuffer) {
    if(this.outline?.prepareScene&&sceneSha256(new Uint8Array(source))!==this.outline.sourceSha256)
      throw new ViewerLoadError('scene','SOURCE_DIGEST_MISMATCH','수신한 DXF 바이트와 Version 체크섬이 다릅니다. Scene 생성을 중단했습니다.');
    const text=new TextDecoder().decode(source);
    if(!/(?:^|\n)\s*0\s*\r?\nSECTION\s*\r?\n/.test(text) || !/(?:^|\n)\s*0\s*\r?\nEOF\s*$/.test(text)) throw new Error('DXF 처리에 실패했습니다. 유효한 ASCII DXF인지 확인해주세요.');
    const url=URL.createObjectURL(new Blob([explicitElevation(text)]));
    const viewer=new DXFViewer();viewer.useCache=false;
    // The upstream loader reads the font before fetching this URL. Stop its
    // progress chain after cancellation so a late font response cannot fetch
    // an already revoked blob URL.
    viewer.subscribe('progress',()=>{
      if(this.disposed)throw new DOMException('취소됨','AbortError');
    });
    try {
      const pending=viewer.getFromPath(url,'/fonts/CadKorean.typeface.json').then(object=>{
        if (this.disposed) { if(object) release(object); throw new DOMException('취소됨','AbortError'); }
        return object;
      });
      const object=await Promise.race([pending,new Promise<never>((_,reject)=>{
        this.cancel=()=>reject(new DOMException('취소됨','AbortError'));
      })]);
      if(!object) throw new Error('도형 또는 글꼴 로드 실패');
      // Upstream caches materials globally. Own clones before applying background contrast.
      const owned=new Map<THREE.Material,THREE.Material>();
      const clone=(original:THREE.Material)=>{
        if(!owned.has(original)) {
          const material=original.clone() as THREE.Material & {color?:THREE.Color};
          if(material.color?.getHex()===0) material.color.setHex(0xffffff);
          owned.set(original,material);
        }
        return owned.get(original)!;
      };
      object.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.material)mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);});
      if(this.outline && validCanvasScope(this.outline))
        this.document?.setSourceUnit(sourceUnitFromDxf(text));
      if(this.outline && validCanvasScope(this.outline))
        this.sceneAsset=tagImportedTree(object,sceneScope(this.outline.versionId,this.outline.sourceSha256,sourceUnitFromDxf(text)));
      this.object=object;this.exchangeBaseline=captureExchangeBaseline(object);this.exchangeScope=this.sceneAsset?.scope;this.exchangeEpoch++;
      this.scene.add(object);this.bounds.setFromObject(object);
      if(!this.bounds.isEmpty() && ![...this.bounds.min.toArray(),...this.bounds.max.toArray()].every(Number.isFinite)) throw new Error('유효하지 않은 도형 좌표');
      this.fitToView();this.render();
      if(this.outline&&this.sceneAsset)this.initializeRenderWork(this.sceneAsset.scope);
      if(this.outline && !this.bounds.isEmpty()) {
        try {
          const indexStarted=performance.now();
          this.index=await this.runOutlineWorker<DxfOutlineIndex>('index',{
            text,versionId:this.outline.versionId,sourceSha256:this.outline.sourceSha256
          });
          this.sourceIndexMs=performance.now()-indexStarted;
          if(this.disposed)throw new DOMException('취소됨','AbortError');
          const auditStarted=performance.now();
          this.renderCoverage=this.auditRenderedObjects(this.index.entities);
          this.renderAuditMs=performance.now()-auditStarted;
          const selectable=this.renderCoverage.selectable.filter(e=>this.visibleLayers.has(e.layer));
          this.selector?.setSourceEntities(selectable);
          this.spatialIndexMs=this.selector?.indexBuildMs;
        }catch(error) {
          if(this.disposed)throw error;
          this.indexError=error instanceof Error?error.message:'객체 선택 인덱스를 만들 수 없습니다.';
        }
      }
      if(this.outline?.prepareScene&&this.sceneAsset){
        this.sceneArtifact=await serializeSourceScene(object,this.sceneAsset,'CUSTOM_DTO',{textIndex:extractDxfText(source)});
        if(this.disposed)throw new DOMException('취소됨','AbortError');
      }
      return {empty:this.bounds.isEmpty(),entityCount:viewer.lastDXF?.entities?.length,warning:this.indexError?'원본 정밀 선택 자료를 만들 수 없습니다. 렌더 객체 작업은 계속 사용할 수 있습니다.':undefined};
    } catch(error) {
      if(error instanceof DOMException && error.name==='AbortError') throw error;
      throw new Error('DXF 처리에 실패했습니다. 파일과 글꼴 로드를 확인해주세요.');
    } finally {this.cancel=undefined;URL.revokeObjectURL(url);}
  }
  async loadScene(source:ReadyScene){
    const object=await restoreSourceScene(source.bytes,source.manifest,source.manifest);
    if(this.disposed){release(object);throw new DOMException('취소됨','AbortError');}
    this.object=object as THREE.Group;
    this.exchangeBaseline=captureExchangeBaseline(object);this.exchangeScope=source.manifest.scope;this.exchangeEpoch++;
    this.scene.add(object);this.bounds.setFromObject(object);
    if(!this.bounds.isEmpty()&&![...this.bounds.min.toArray(),...this.bounds.max.toArray()].every(Number.isFinite))throw new Error('SCENE_BOUNDS_INVALID');
    this.sceneTextIndex=storedSceneViewerData(source.bytes)?.textIndex;
    this.document?.setSourceUnit(source.manifest.scope.sourceUnit);
    this.initializeRenderWork(source.manifest.scope);
    this.indexError='READY Scene에는 검증된 원본 Entity 인덱스가 없습니다.';
    this.fitToView();this.render();
    return {empty:this.bounds.isEmpty(),entityCount:this.renderIndex?.entities.length??0,metrics:{parseMs:0}};
  }
  getSceneArtifact(){return this.sceneArtifact;}
  getSceneTextIndex(){
    if(!this.sceneTextIndex)throw new Error('이 Scene에 문자 검색 자료가 없습니다. 도면 메뉴에서 명시적으로 재변환하세요.');
    return this.sceneTextIndex;
  }
  fitToView() {
    this.cancelGeneratedCommand();
    if(this.bounds.isEmpty()) return;
    const center=this.bounds.getCenter(new THREE.Vector3()), extent=this.bounds.getSize(new THREE.Vector3());
    const aspect=Math.max(1,this.container.clientWidth)/Math.max(1,this.container.clientHeight);
    const height=Math.max(extent.y,extent.x/aspect,1)*1.15;
    this.camera.top=height/2;this.camera.bottom=-height/2;this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;
    this.camera.zoom=1;this.camera.far=Math.max(10000,extent.z*4+1000);
    this.camera.position.set(center.x,center.y,center.z+this.camera.far/2);
    this.controls.target.copy(center);this.camera.updateProjectionMatrix();this.controls.update();this.render();
  }
  focusBounds(bounds: CadFocusBounds) {
    this.cancelGeneratedCommand();
    const aspect = Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
    const height = Math.max(bounds.maxY - bounds.minY, (bounds.maxX - bounds.minX) / aspect) * 1.15;
    const x = (bounds.minX + bounds.maxX) / 2;
    const y = (bounds.minY + bounds.maxY) / 2;
    if (![height, x, y].every(Number.isFinite) || height <= 1e-8 || height >= 1e15) return;
    this.camera.top = height / 2; this.camera.bottom = -height / 2;
    this.camera.left = -height * aspect / 2; this.camera.right = height * aspect / 2;
    this.camera.zoom = 1;
    this.camera.position.x = x; this.camera.position.y = y;
    this.controls.target.x = x; this.controls.target.y = y;
    this.camera.updateProjectionMatrix(); this.controls.update(); this.render();
  }
  zoomIn() {this.cancelGeneratedCommand();this.camera.zoom=Math.min(1e8,this.camera.zoom*1.25);this.camera.updateProjectionMatrix();this.render();}
  zoomOut() {this.cancelGeneratedCommand();this.camera.zoom=Math.max(1e-8,this.camera.zoom/1.25);this.camera.updateProjectionMatrix();this.render();}
  getLayers() {
    const names=new Set<string>();this.object?.traverse(o=>{const layer=o.userData.cadLayer??o.userData.entity?.layer;if(typeof layer==='string') names.add(layer);});
    return [...names].sort();
  }
  getExchangeInventory(){
    if(this.disposed)return null;
    return exchangeInventory(this.object,this.exchangeBaseline,this.exchangeScope,this.getGeneratedObjects(),this.exchangeEpoch);
  }
  captureExchangeSnapshot(selection:ExchangeSelection){
    if(this.disposed)throw new Error('Viewer가 종료되었습니다.');
    const inventory=this.getExchangeInventory();
    return captureExchangeData(this.object,this.exchangeBaseline,inventory,selection,this.getGeneratedObjects());
  }
  showLayer(name:string,visible:boolean) {
    if(visible)this.visibleLayers.add(name);else this.visibleLayers.delete(name);
    if(this.sceneWork)this.applySceneWork();
    else this.object?.traverse(o=>{if((o.userData.cadLayer??o.userData.entity?.layer)===name)o.visible=visible;});
    this.selector?.setVisibleLayers(this.visibleLayers);this.render();
  }

  private initializeRenderWork(scope:SceneScope){
    if(!this.object)return;
    this.sceneWork?.dispose();this.sceneObjects.clear();this.rendererIds.clear();
    this.intrinsicSceneVisibility=captureSceneVisibility(this.object);
    this.renderIndex=sceneOutlineProjection(this.object,scope);
    // Flat O(n) index: never scan all render entities for each Scene leaf.
    // Large DXF/READY Scenes can have tens of thousands of imported objects.
    const layerById=new Map(this.renderIndex.entities.map(entity=>[entity.id,entity.layer] as const));
    this.object.updateWorldMatrix(true,true);
    this.object.traverse(object=>{
      const ref:unknown=object.userData.cadSceneRef;
      if(!validSceneRef(ref,scope)||ref.origin!=='DXF_IMPORTED')return;
      const layer=layerById.get(ref.id);
      if(layer===undefined)return;
      this.sceneObjects.set(ref.id,{object,baseLocal:object.matrix.clone(),
        baseWorld:object.matrixWorld.clone(),intrinsicVisible:object.visible,layer});
      this.rendererIds.set(object.uuid,ref.id);
    });
    this.sceneWork=new SceneWorkDocument(scope,[...this.sceneObjects.keys()].map(id=>
      this.sceneObjects.get(id)!.object.userData.cadSceneRef as CadSceneObjectRef));
    this.visibleLayers=new Set(this.getLayers());
    this.selector?.dispose();
    this.selector=new SelectionController(this.renderer.domElement,this.container,[],
      (x,y)=>this.screenToWorld(x,y),this.selectionChanged,
      pan=>{
        // OrbitControls maps Ctrl/Meta+ROTATE to PAN even with rotation disabled.
        // Selection modifiers must remain owned by the selection controller.
        this.controls.enablePan=pan;
        this.controls.mouseButtons.LEFT=pan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
      },
      this.objectSelectionChanged,{
        begin:ids=>this.beginGeneratedDrag(ids),move:(start,current)=>this.moveGeneratedDrag(start,current),
        end:(start,current)=>this.endGeneratedDrag(start,current),cancel:()=>this.dropTranslationPreview(),
      });
    this.selector.setVisibleLayers(this.visibleLayers);
    this.selector.setRenderEntities(this.renderIndex.entities.filter(e=>this.effectivelyVisible(e.id)));
    this.selector.setMode(this.mode);
    this.updateGeneratedCandidates();
  }
  private effectivelyVisible(id:string):boolean{
    const row=this.sceneObjects.get(id);
    if(!row||!this.sceneWork?.get(id).visible||!this.visibleLayers.has(row.layer))return false;
    for(let node:THREE.Object3D|null=row.object;node;node=node.parent){
      if(node===row.object){if(!row.intrinsicVisible)return false;}
      else if(!node.visible)return false;
    }
    return true;
  }
  private sourceWorkChanged():boolean{
    return this.sceneWork?.getState().objects.some(o=>!o.visible||
      o.transform.some((n,i)=>n!==IDENTITY_2D[i]))??false;
  }
  private applySceneWork(){
    if(!this.sceneWork||!this.object)return;
    // All selectable render primitives are leaves. Parent world remains the immutable baseline.
    for(const [id,row] of this.sceneObjects){
      const delta=this.sceneWork.get(id),[a,b,c,d,e,f]=delta.transform;
      const wcs=new THREE.Matrix4().set(a,c,0,e,b,d,0,f,0,0,1,0,0,0,0,1);
      const parentWorld=row.object.parent?.matrixWorld??new THREE.Matrix4();
      const local=parentWorld.clone().invert().multiply(wcs).multiply(row.baseWorld);
      row.object.matrixAutoUpdate=false;row.object.matrix.copy(local);
    }
    // Reconcile ALL imported nodes, including display-only Points/nonplanar/multi-material geometry.
    // Visibility is baseline AND own layer AND work delta; parent visibility propagates normally.
    applySceneVisibility(this.object,this.intrinsicSceneVisibility,this.visibleLayers,object=>{
      const id=this.rendererIds.get(object.uuid);
      return id?this.sceneWork!.get(id).visible:true;
    });
    this.object.updateWorldMatrix(true,true);
    this.renderIndex=sceneOutlineProjection(this.object,this.sceneWork.scope);
    this.selector?.setRenderEntities(this.renderIndex.entities.filter(e=>this.effectivelyVisible(e.id)));
    if(this.sourceWorkChanged()){
      if(this.mode==='select')this.selector?.clearObjects();
    }
    this.render();
  }
  getSceneWorkState():SceneWorkState{
    return this.sceneWork?.getState()??{objects:[],undo:0,redo:0,limit:100};
  }
  executeSceneWorkCommand(command:SceneWorkCommand):void{
    if(!this.sceneWork)throw new Error('렌더 Scene 작업이 준비되지 않았습니다.');
    const selection=this.getCanvasObjectSelection();
    if(command.type!=='Visibility'||!command.visible){
      if(this.mode!=='render'&&this.mode!=='objects')throw new Error('렌더 선택 모드에서만 작업할 수 있습니다.');
    }
    // Validate all transformed WCS bounds before any delta is committed.
    if(command.type!=='Visibility')for(const id of command.ids){
      const row=this.sceneObjects.get(id),entity=this.renderIndex?.entities.find(e=>e.id===id);
      if(!row||!entity)throw new Error('현재 Scene 객체를 찾을 수 없습니다.');
      const [x0,y0,x1,y1]=entity.bounds;
      const theta=command.type==='Rotate'?command.angleDegrees*Math.PI/180:0;
      for(const [x,y] of [[x0,y0],[x0,y1],[x1,y0],[x1,y1]]){
        const nx=command.type==='Translate'?x+command.dx:
          command.pivot[0]+Math.cos(theta)*(x-command.pivot[0])-Math.sin(theta)*(y-command.pivot[1]);
        const ny=command.type==='Translate'?y+command.dy:
          command.pivot[1]+Math.sin(theta)*(x-command.pivot[0])+Math.cos(theta)*(y-command.pivot[1]);
        if(!Number.isFinite(nx)||!Number.isFinite(ny)||Math.abs(nx)>1e12||Math.abs(ny)>1e12)
          throw new Error('작업 결과 WCS 좌표가 유효 범위를 벗어났습니다.');
      }
    }
    this.sceneWork.execute(command,selection);this.applySceneWork();this.cancelOutlinePreview();
  }
  undoSceneWork():boolean{const changed=this.sceneWork?.undo()??false;if(changed)this.applySceneWork();return changed;}
  redoSceneWork():boolean{const changed=this.sceneWork?.redo()??false;if(changed)this.applySceneWork();return changed;}
  resetSceneWork():void{
    if(!this.sceneWork||!this.object)throw new Error('기준 Scene이 준비되지 않았습니다.');
    this.cancelGeneratedCommand();this.cancelOutlinePreview();
    this.selector?.clearObjects();this.sceneWork.reset();this.applySceneWork();
  }

  /** Reconcile only by top-level DXF handles, not screen bounds or mesh order.
   * Both handle and WCS bounds must agree. Missing/merged/unsupported content
   * is deliberately excluded from selection until the mapping is verified.
   * Notes on BLOCK merging and 1:N mapping: out/Issue31.md. */
  private auditRenderedObjects(entities:readonly OutlineEntity[]):RenderCoverage {
    const handles=new Set(entities.filter(e=>e.handle).map(e=>e.handle!.toUpperCase()));
    const observations:RenderObservation[]=[];
    this.object?.updateWorldMatrix(true,true);
    this.object?.traverse(object=>{
      const value:unknown=object.userData?.entity;
      if(!value||typeof value!=='object')return;
      const entity=value as Record<string,unknown>;
      if(typeof entity.handle!=='string'||!handles.has(entity.handle.toUpperCase())||
         typeof entity.type!=='string'||!object.visible)return;
      const bounds=new THREE.Box3().setFromObject(object);
      const valid=!bounds.isEmpty()&&[
        bounds.min.x,bounds.min.y,bounds.max.x,bounds.max.y,
      ].every(Number.isFinite);
      observations.push({handle:entity.handle,entityType:entity.type,
        layer:typeof entity.layer==='string'?entity.layer:undefined,
        bounds:valid?[bounds.min.x,bounds.min.y,bounds.max.x,bounds.max.y]:null});
    });
    return reconcileRenderCoverage(entities,observations);
  }
  private screenToWorld=(x:number,y:number):[number,number]=>{
    const rect=this.renderer.domElement.getBoundingClientRect();
    const p=new THREE.Vector3(x/Math.max(1,rect.width)*2-1,1-y/Math.max(1,rect.height)*2,0).unproject(this.camera);
    return [p.x,p.y];
  };
  /** M1 coordinate conversion uses CSS px, not WebGL drawing-buffer px (DPR). */
  clientToWcs(clientX:number,clientY:number):{x:number;y:number}|null{
    if(this.disposed||!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
    const rect=this.renderer.domElement.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0||clientX<rect.left||clientX>rect.right||
       clientY<rect.top||clientY>rect.bottom)return null;
    const [x,y]=this.screenToWorld(clientX-rect.left,clientY-rect.top);
    return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=1e12&&Math.abs(y)<=1e12?{x,y}:null;
  }
  projectWcsToCanvas(point:{x:number;y:number}):{x:number;y:number}|null{
    if(this.disposed||!Number.isFinite(point.x)||!Number.isFinite(point.y)||
       Math.abs(point.x)>1e12||Math.abs(point.y)>1e12)return null;
    const rect=this.renderer.domElement.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return null;
    const projected=new THREE.Vector3(point.x,point.y,0).project(this.camera);
    const x=(projected.x+1)*rect.width/2, y=(1-projected.y)*rect.height/2;
    return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
  }
  private terminateWorker(kind:'index'|'compute') {
    const task=this.activeWorkers[kind];delete this.activeWorkers[kind];
    task?.worker.terminate();task?.cancel();
  }
  private runOutlineWorker<T>(kind:'index'|'compute',payload:Record<string,unknown>,renderBasis=false):Promise<T>{
    this.terminateWorker(kind);
    if(this.disposed)return Promise.reject(new DOMException('취소됨','AbortError'));
    return new Promise<T>((resolve,reject)=>{
      const worker=new Worker(new URL('../core/outline-worker.ts',import.meta.url),{type:'module'});
      let settled=false;
      const finish=(error?:Error,result?:T)=>{
        if(settled)return;settled=true;
        if(this.activeWorkers[kind]?.worker===worker)delete this.activeWorkers[kind];
        clearTimeout(timer);worker.terminate();if(error)reject(error);else resolve(result as T);
      };
      this.activeWorkers[kind]={worker,cancel:()=>finish(new DOMException('취소됨','AbortError'))};
      worker.onmessage=(event:MessageEvent)=>{
        const response=event.data;
        if(response?.ok)finish(undefined,(kind==='index'?response.index:response.result) as T);
        else finish(new Error(response?.error??'외곽선 Worker 실패'));
      };
      worker.onerror=()=>finish(new Error('외곽선 Worker를 실행할 수 없습니다.'));
      const timer=setTimeout(()=>finish(new Error('외곽선 계산 제한 시간(30초) 초과')),30000);
      worker.postMessage({task:kind==='compute'&&renderBasis?'compute-render':kind,...payload});
    });
  }
  private selectionChanged=(selected:OutlineEntity[])=>{
    this.cancelGeneratedCommand();
    if(this.selectionGroup){this.scene.remove(this.selectionGroup);release(this.selectionGroup);}
    this.selectionGroup=this.createPathGroup(selected.flatMap(e=>e.paths),0xffd000);
    this.scene.add(this.selectionGroup);this.render();
    this.outline?.onSelection?.(selected);
    if(this.previewKind){
      if(selected.length)void this.previewOutline(this.previewKind).catch(()=>undefined);
      else this.cancelOutlinePreview();
    }
  };
  /** Canvas/tree/layer changes share the same selection set. */
  private objectSelectionChanged=(sources:OutlineEntity[],generated:readonly string[])=>{
    this.cancelGeneratedCommand();
    this.refreshSavedHighlight();
    if(!this.outline || !validCanvasScope(this.outline))return;
    this.outline.onObjectSelection?.([
      ...sources.map(e=>canvasObjectRef(this.mode==='select'?'SOURCE':'RENDER',e.id,this.outline!)),
      ...generated.map(id=>canvasObjectRef('GENERATED',id,this.outline!)),
    ]);
  };
  private updateGeneratedCandidates(){
    this.selector?.setGeneratedObjects((this.document?.getObjects()??[]).flatMap(item=>
      item.visible?[{id:item.ref.id,geometry:generatedResult(item).geometry}]:[]
    ));
  }
  /** Incremental Scene projection: rebuild only transformed/created overlays;
   * release all replaced/removed GPU buffers, never reparse the SOURCE index. */
  private documentChanged(){
    if(this.disposed)return;
    this.exchangeEpoch++;
    const objects=this.document?.getObjects()??[];
    const present=new Set(objects.map(item=>item.savedOutlineId));
    for(const [id,group] of this.savedGroups){
      if(present.has(id))continue;
      this.savedGroup.remove(group);release(group);this.savedGroups.delete(id);
      this.renderedTransforms.delete(id);
    }
    for(const item of objects){
      const id=item.savedOutlineId;
      let group=this.savedGroups.get(id);
      if(!group || this.renderedTransforms.get(id)!==item.transform){
        if(group){this.savedGroup.remove(group);release(group);}
        group=this.renderGeometry(generatedResult(item),0xff8c00);
        tagAppTree(group,item.sceneRef);
        this.savedGroups.set(id,group);this.savedGroup.add(group);
        this.renderedTransforms.set(id,item.transform);
      }
      group.visible=item.visible;
    }
    this.scene.add(this.savedGroup);
    this.updateGeneratedCandidates();
    this.refreshSavedHighlight();
    this.outline?.onSaved?.(objects.length);
    this.render();
  }
  private dropTranslationPreview(){
    const ghost=this.dragGhostGroup;
    this.dragTranslation=undefined;
    this.dragGhostGroup=undefined;
    delete this.renderer.domElement.dataset.generatedDragPreview;
    if(ghost){this.scene.remove(ghost);release(ghost);this.render();}
    this.document?.cancelPending();
  }
  /** A previously selected visible GENERATED boundary starts drag in generated-only mode. */
  private beginGeneratedDrag(ids:readonly string[]):boolean{
    if(this.disposed||this.mode!=='generated'||!this.document||!this.outline||
       !this.selector||this.dragTranslation)return false;
    try {
      const selected=selectedTranslationIds(this.getCanvasObjectSelection(),
        this.getGeneratedObjects(),this.outline);
      if(selected.length!==ids.length||selected.some(id=>!ids.includes(id)))
        throw new Error('이동 대상 선택이 변경되었습니다.');
      const entries=this.document.getObjects().filter(item=>ids.includes(item.ref.id));
      const geometries=entries.map(item=>generatedResult(item).geometry);
      const bounds=geometries.map(geometry=>outlineGeometryBounds(geometry));
      if(bounds.some(bound=>!bound))throw new Error('이동 미리보기를 위한 WCS 범위가 유효하지 않습니다.');
      const envelope={
        minX:Math.min(...bounds.map(b=>b!.minX)),minY:Math.min(...bounds.map(b=>b!.minY)),
        maxX:Math.max(...bounds.map(b=>b!.maxX)),maxY:Math.max(...bounds.map(b=>b!.maxY)),
      };
      if(!validTranslationPreview(0,0,envelope))throw new Error('이동 대상 WCS 범위가 유효하지 않습니다.');
      const paths:OutlinePath[]=geometries.flatMap(g=>{
        const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
        return polys.flatMap(poly=>poly.map(ring=>({points:ring,closed:true})));
      });
      // Stage is validation only. A drag never changes history or Document until release.
      this.document.stage({type:'Translate',ids:[...ids],dx:0,dy:0},this.getCanvasObjectSelection());
      const ghost=this.createPathGroup(paths,0x22d3ee);
      this.dragGhostGroup=ghost;this.dragTranslation={ids:[...ids],bounds:envelope};
      this.renderer.domElement.dataset.generatedDragPreview='true';
      this.scene.add(ghost);this.render();
      return true;
    }catch(error){
      this.dropTranslationPreview();
      this.outline?.onEditError?.(error instanceof Error?error.message:'이동을 시작할 수 없습니다.');
      return false;
    }
  }
  private moveGeneratedDrag(start:readonly [number,number],current:readonly [number,number]):boolean{
    const drag=this.dragTranslation;
    if(!drag||!this.dragGhostGroup)return false;
    const dx=current[0]-start[0],dy=current[1]-start[1];
    if(!validTranslationPreview(dx,dy,drag.bounds)){
      this.outline?.onEditError?.('이동이 허용된 WCS 범위를 벗어나 취소되었습니다.');
      this.dropTranslationPreview();
      return false;
    }
    this.dragGhostGroup.position.set(dx,dy,0);this.render();return true;
  }
  private endGeneratedDrag(start:readonly [number,number],current:readonly [number,number]){
    const drag=this.dragTranslation;
    try{
      if(!drag||!this.document||!this.outline||this.mode!=='generated')
        throw new Error('이동 도중 편집 모드가 변경되었습니다.');
      const dx=current[0]-start[0],dy=current[1]-start[1];
      if(!validTranslationPreview(dx,dy,drag.bounds))
        throw new Error('확정할 WCS 이동 범위가 유효하지 않습니다.');
      if(dx===0&&dy===0)return;
      const selection=this.getCanvasObjectSelection();
      const ids=selectedTranslationIds(selection,this.getGeneratedObjects(),this.outline);
      if(ids.length!==drag.ids.length||ids.some(id=>!drag.ids.includes(id)))
        throw new Error('드래그 중 선택 대상이 바뀌었습니다.');
      this.document.stage({type:'Translate',ids:drag.ids,dx,dy},selection);
      this.document.commitPending(this.getCanvasObjectSelection());
    }catch(error){
      this.outline?.onEditError?.(error instanceof Error?error.message:'이동이 취소되었습니다.');
    }finally{
      this.dropTranslationPreview();
    }
  }
  /** A dedicated HTML handle owns rotation gestures; selected boundary drag keeps E4 Translate. */
  private updateRotateHandle(){
    const handle=this.rotateHandle;
    if(!handle)return;
    if(this.dragRotation)return;
    handle.style.display='none';
    if(this.disposed||this.mode!=='generated'||!this.outline||!this.selector||!this.document)return;
    try{
      const selected=selectedRotation(this.getCanvasObjectSelection(),this.getGeneratedObjects(),this.outline);
      const at=this.projectWcsToCanvas({x:selected.pivot[0],y:selected.bounds.maxY});
      if(!at)return;
      const canvasRect=this.renderer.domElement.getBoundingClientRect();
      const containerRect=this.container.getBoundingClientRect();
      const x=canvasRect.left-containerRect.left+at.x;
      const anchorY=canvasRect.top-containerRect.top+at.y;
      // A fitted drawing often leaves <36px margin above its bbox.
      const y=anchorY>=44?anchorY-30:anchorY+30;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<16||y<16||
         x>containerRect.width-16||y>containerRect.height-16)return;
      handle.style.left=x+'px';handle.style.top=y+'px';
      handle.textContent='↻';handle.style.display='block';
    }catch{/* SOURCE/mixed/empty/hidden/stale selection has no rotation handle. */}
  }
  private rotatePointerDown=(event:PointerEvent)=>{
    if(event.button!==0||this.dragRotation||!this.document||!this.outline||
       this.mode!=='generated'||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    try{
      this.cancelGeneratedCommand();
      const selected=selectedRotation(this.getCanvasObjectSelection(),this.getGeneratedObjects(),this.outline);
      const rect=this.renderer.domElement.getBoundingClientRect();
      const start=this.screenToWorld(event.clientX-rect.left,event.clientY-rect.top);
      if(!start.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e12))
        throw new Error('회전 시작 좌표가 유효하지 않습니다.');
      const entries=this.document.getObjects().filter(item=>selected.ids.includes(item.ref.id));
      const paths:OutlinePath[]=entries.flatMap(item=>{
        const g=generatedResult(item).geometry;
        const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
        return polys.flatMap(poly=>poly.map(ring=>({points:ring,closed:true})));
      });
      this.document.stage({type:'Rotate',ids:selected.ids,angleDegrees:0,pivot:selected.pivot},
        this.getCanvasObjectSelection());
      this.rotationGhost=this.createPathGroup(paths,0x22d3ee);
      this.scene.add(this.rotationGhost);
      this.dragRotation={pointerId:event.pointerId,ids:selected.ids,pivot:selected.pivot,
        start,angleDegrees:0};
      this.rotateHandle?.setAttribute('data-canvas-edit-escape-layer','rotate');
      this.rotateHandle?.setPointerCapture(event.pointerId);
      this.renderer.domElement.dataset.generatedRotatePreview='0';
      if(this.rotateHandle)this.rotateHandle.style.cursor='grabbing';
      event.preventDefault();event.stopPropagation();
      this.render();
    }catch(error){
      this.dropRotationPreview();
      this.outline?.onEditError?.(error instanceof Error?error.message:'회전을 시작할 수 없습니다.');
    }
  };
  private rotatePointerMove=(event:PointerEvent)=>{
    const drag=this.dragRotation;
    if(!drag||drag.pointerId!==event.pointerId||!this.rotationGhost)return;
    try{
      const rect=this.renderer.domElement.getBoundingClientRect();
      const current=this.screenToWorld(event.clientX-rect.left,event.clientY-rect.top);
      const angleDegrees=dragRotationDegrees(drag.start,current,drag.pivot);
      const matrix=generatedRigidMatrix({type:'Rotate',angleDegrees,pivot:drag.pivot});
      // Stage and final commit validate every vertex; preview must also stay WCS finite.
      const entries=this.document?.getObjects().filter(item=>drag.ids.includes(item.ref.id))??[];
      for(const item of entries){
        const bounds=outlineGeometryBounds(generatedResult(item).geometry);
        if(!bounds)throw new Error('WCS 회전 범위가 유효하지 않습니다.');
        for(const [x,y] of [[bounds.minX,bounds.minY],[bounds.minX,bounds.maxY],
          [bounds.maxX,bounds.minY],[bounds.maxX,bounds.maxY]]){
          const nx=matrix[0]*x+matrix[2]*y+matrix[4];
          const ny=matrix[1]*x+matrix[3]*y+matrix[5];
          if(!Number.isFinite(nx)||!Number.isFinite(ny)||Math.abs(nx)>1e12||Math.abs(ny)>1e12)
            throw new Error('회전 결과가 WCS 유효 범위를 벗어났습니다.');
        }
      }
      drag.angleDegrees=angleDegrees;
      this.rotationGhost.rotation.z=angleDegrees*Math.PI/180;
      this.rotationGhost.position.set(matrix[4],matrix[5],0);
      this.renderer.domElement.dataset.generatedRotatePreview=angleDegrees.toFixed(3);
      if(this.rotateHandle)this.rotateHandle.textContent=angleDegrees.toFixed(1)+'°';
      event.preventDefault();event.stopPropagation();this.render();
    }catch(error){
      this.outline?.onEditError?.(error instanceof Error?error.message:'회전 미리보기를 취소했습니다.');
      this.dropRotationPreview();
    }
  };
  private rotatePointerUp=(event:PointerEvent)=>{
    const drag=this.dragRotation;
    if(!drag||drag.pointerId!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    try{
      if(this.mode!=='generated'||!this.document||!this.outline)
        throw new Error('회전 도중 Renderer 또는 편집 모드가 변경되었습니다.');
      const current=selectedRotation(this.getCanvasObjectSelection(),this.getGeneratedObjects(),this.outline);
      if(current.ids.length!==drag.ids.length||current.ids.some(id=>!drag.ids.includes(id)))
        throw new Error('회전 도중 선택한 객체가 변경되었습니다.');
      if(Math.abs(drag.angleDegrees)<1e-8)return;
      this.document.stage({type:'Rotate',ids:drag.ids,
        angleDegrees:drag.angleDegrees,pivot:drag.pivot},this.getCanvasObjectSelection());
      this.document.commitPending(this.getCanvasObjectSelection());
    }catch(error){
      this.outline?.onEditError?.(error instanceof Error?error.message:'회전 확정이 취소되었습니다.');
    }finally{this.dropRotationPreview();}
  };
  private rotatePointerCancel=(event:PointerEvent)=>{
    if(this.dragRotation?.pointerId===event.pointerId)this.dropRotationPreview();
  };
  private rotateKeyDown=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&this.dragRotation){
      this.dropRotationPreview();
      event.preventDefault();event.stopImmediatePropagation();
    }
  };
  private dropRotationPreview(){
    const drag=this.dragRotation,ghost=this.rotationGhost;
    this.dragRotation=undefined;this.rotationGhost=undefined;
    if(this.rotateHandle){
      this.rotateHandle.removeAttribute('data-canvas-edit-escape-layer');
      this.rotateHandle.style.cursor='grab';this.rotateHandle.textContent='↻';
      if(drag&&this.rotateHandle.hasPointerCapture(drag.pointerId))
        this.rotateHandle.releasePointerCapture(drag.pointerId);
    }
    delete this.renderer.domElement.dataset.generatedRotatePreview;
    if(ghost){this.scene.remove(ghost);release(ghost);}
    this.document?.cancelPending();
    if(ghost&&!this.disposed)this.render();
  }
  private createPathGroup(paths:OutlinePath[],color:number){
    const group=new THREE.Group(),z=this.bounds.isEmpty()?0:this.bounds.max.z+0.5;
    for(const path of paths){
      if(path.points.length<2)continue;
      const points=path.points.map(([x,y])=>new THREE.Vector3(x,y,z));
      if(path.closed)points.push(points[0].clone());
      const geometry=new THREE.BufferGeometry().setFromPoints(points);
      const material=new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:0.95});
      const line=new THREE.Line(geometry,material);line.renderOrder=1000;
      group.add(line);
    }
    return group;
  }
  private renderGeometry(result:OutlineResult,color:number) {
    const polygons=result.geometry.type==='Polygon'?[result.geometry.coordinates]:result.geometry.coordinates;
    return this.createPathGroup(polygons.flatMap(poly=>poly.map(ring=>({points:ring,closed:true}))),color);
  }
  private refreshSavedHighlight() {
    if(this.selectedSavedGroup){
      this.scene.remove(this.selectedSavedGroup);
      release(this.selectedSavedGroup);
      this.selectedSavedGroup=undefined;
    }
    const ids=new Set(this.selector?.getSelectedGeneratedIds()??[]);
    const paths:OutlinePath[]=(this.document?.getObjects()??[]).flatMap(item=>{
      if(!ids.has(item.ref.id)||!item.visible)return [];
      const g=generatedResult(item).geometry;
      const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
      return polygons.flatMap(poly=>poly.map(ring=>({points:ring,closed:true})));
    });
    if(paths.length){
      this.selectedSavedGroup=this.createPathGroup(paths,0x00ffcc);
      this.scene.add(this.selectedSavedGroup);
    }
    this.render();
  }
  getOutlineInfo():OutlineInfo|null {
    if(!this.outline)return null;
    if(!this.index && !this.indexError && !this.renderIndex)return null;
    const changed=this.sourceWorkChanged();
    const unavailable=changed?'렌더 객체 작업으로 원본 정밀 선택 상태가 달라졌습니다. Scene 작업을 되돌리세요.':
      this.indexError??(!this.renderCoverage?.mappedSource?'원본과 렌더러의 대응이 검증된 DXF Entity가 없습니다.':undefined);
    return {entityCount:changed?0:this.renderCoverage?.mappedSource??0,unitCode:this.index?.unitCode??this.renderIndex?.unitCode??null,
      renderEntityCount:this.renderIndex?.entities.length??0,
      exactSourceEntityCount:changed?0:this.renderCoverage?.mappedSource??0,
      sourceUnavailableReason:unavailable,
      renderedObjectCount:this.renderCoverage?.renderedObjects??0,
      excludedEntityCount:(this.renderCoverage?.unmappedSource??0)+(this.renderCoverage?.boundsMismatch??0),
      spatialIndexMs:this.spatialIndexMs,
      sourceIndexMs:this.sourceIndexMs,renderAuditMs:this.renderAuditMs,
      warnings:[...(this.indexError?[this.indexError]:[]),
        ...(this.renderCoverage?.warnings??[]),...(this.index?.warnings??[]),...(this.renderIndex?.warnings??[])]};
  }
  setSelectionMode(mode:SelectionMode){
    this.cancelGeneratedCommand();
    if(mode==='select'&&this.sourceWorkChanged())
      throw new Error('렌더 객체 변경 중에는 원본 정밀 선택을 사용할 수 없습니다.');
    this.mode=mode;this.selector?.setMode(mode);this.updateRotateHandle();
  }
  getOutlineSelection(){return this.selector?.getSelection()??[];}
  clearOutlineSelection(){this.selector?.clear();}
  getCanvasObjectSelection():CanvasObjectRef[]{
    if(!this.selector||!this.outline||!validCanvasScope(this.outline))return [];
    return [...this.selector.getSelection().map(e=>canvasObjectRef(this.mode==='select'?'SOURCE':'RENDER',e.id,this.outline!)),
      ...this.selector.getSelectedGeneratedIds().map(id=>canvasObjectRef('GENERATED',id,this.outline!))];
  }
  clearCanvasObjectSelection(){this.cancelGeneratedCommand();this.selector?.clearObjects();}
  isSelectedGeneratedAt(clientX:number,clientY:number):boolean{
    return this.selector?.isSelectedGeneratedAt(clientX,clientY)??false;
  }
  getCanvasEditCapability(){
    return canvasEditCapability(this.getCanvasObjectSelection(),this.outline??{versionId:'',sourceSha256:''});
  }
  async previewOutline(kind:OutlineKind):Promise<OutlineResult> {
    if(!this.selector)throw new Error('객체 선택이 준비되지 않았습니다.');
    if(this.mode==='select'&&!this.index)throw new Error(this.indexError??'DXF 객체 인덱스가 준비되지 않았습니다.');
    if(this.mode!=='select'&&this.mode!=='render'&&this.mode!=='objects')throw new Error('선택 모드에서 외곽선을 만드세요.');
    const selected=this.selector.getSelection();
    if(!selected.length)throw new Error('외곽선을 만들 객체를 먼저 선택하세요.');
    // Invalidate the old selection's preview before a new worker can finish.
    this.cancelOutlinePreview();
    this.previewKind=kind;
    const sequence=++this.computeSequence;
    try {
      // Both SOURCE and RENDER share Worker termination, Escape cancellation and the 30s timeout.
      const result=await this.runOutlineWorker<OutlineResult>('compute',
        {kind,entities:selected,tolerance:0.02},this.mode!=='select');
      if(this.disposed||sequence!==this.computeSequence)throw new DOMException('취소됨','AbortError');
      this.preview=result;
      if(this.previewGroup){this.scene.remove(this.previewGroup);release(this.previewGroup);}
      this.previewGroup=this.renderGeometry(result,0x00f0ff);
      this.scene.add(this.previewGroup);this.render();
      this.outline?.onPreview?.(result);return result;
    }catch(error) {
      if(sequence===this.computeSequence && !this.disposed) {
        this.preview=undefined;
        if(this.previewGroup){this.scene.remove(this.previewGroup);release(this.previewGroup);this.previewGroup=undefined;this.render();}
        this.outline?.onPreview?.(null,error instanceof Error?error.message:'외곽선을 계산하지 못했습니다.');
      }
      throw error;
    }
  }
  cancelOutlinePreview(){
    this.computeSequence++;this.terminateWorker('compute');this.preview=undefined;this.previewKind=undefined;
    if(this.previewGroup){this.scene.remove(this.previewGroup);release(this.previewGroup);this.previewGroup=undefined;this.render();}
    this.outline?.onPreview?.(null);
  }
  confirmOutline(assignment?:OutlineAssignment):SavedOutline {
    if(!this.preview)throw new Error('미리보기를 먼저 생성해야 합니다.');
    if(assignment && !this.preview.persistable)throw new Error('원본 정밀 근거가 없는 렌더 결과에는 업무 타입을 지정할 수 없습니다.');
    const typed=assignment?parseOutlineAssignmentMetadata(assignment):null;
    if(!this.document)throw new Error('검증된 Version/SHA 범위가 없습니다.');
    const count=this.document.getObjects().length;
    if(count>=100)throw new Error('임시 외곽선은 현재 Session에서 최대 100개까지 생성할 수 있습니다.');
    // UUIDs cannot be reused, even after legacy deletion/clear or Undo.
    let generatedId='';
    for(let i=0;i<4;i++){
      const candidate=createGeneratedId();
      if(!this.document.hasIssuedId(candidate)){generatedId=candidate;break;}
    }
    if(!generatedId)throw new Error('유일한 생성 개체 ID를 발급할 수 없습니다.');
    const savedId='local-'+this.nextSavedId;
    const createdAt=new Date().toISOString();
    const preview=this.preview;
    this.document.append({id:generatedId,savedOutlineId:savedId,createdAt,
      result:preview,...(typed?{outlineTypeId:typed.outlineTypeId,outlineTypeName:typed.outlineTypeName,
        name:typed.name}:{}),
    });
    this.nextSavedId++;
    this.cancelOutlinePreview();
    return this.getSavedOutlines().find(o=>o.id===savedId)!;
  }
  getSavedOutlines():SavedOutline[]{
    return (this.document?.getObjects()??[]).map(item=>({
      id:item.savedOutlineId,createdAt:item.createdAt,
      sceneRef:item.sceneRef,
      result:generatedResult(item),
      ...(item.outlineTypeId?{outlineTypeId:item.outlineTypeId,
        outlineTypeName:item.outlineTypeName??undefined,name:item.name}:{}),
    }));
  }
  /** No mirrored saved array: Manager, Tree, v1/v2 export and Scene share Document. */
  /** #84: read-only geometry projections, never a server Source/Handle claim.
   * RENDER paths are already in WCS (including SceneWork deltas); GENERATED
   * polygons are projected from the immutable base + session affine matrix.
   * Rendering state is not mutated and no DXF parse is performed.
   */
  getMemoSnapTargets(withPoints=false):MemoSnapTarget[]{
    if(!this.outline||!validCanvasScope(this.outline))return [];
    const scope={versionId:this.outline.versionId,sourceSha256:this.outline.sourceSha256};
    const result:MemoSnapTarget[]=[];
    let budget=20000;
    for(const item of this.document?.getObjects()??[]){
      const points:SnapPoint[]=[];
      if(withPoints&&item.visible&&budget>0){
        const geo=generatedResult(item).geometry;
        const polygons=geo.type==='Polygon'?[geo.coordinates]:geo.coordinates;
        for(const polygon of polygons)for(const ring of polygon){
          for(let i=0;i<ring.length-1&&budget>0;i++,budget--){
            const [x,y]=ring[i];
            points.push({kind:'VERTEX',world:{x,y}});
          }
        }
        const xs=points.map(p=>p.world.x),ys=points.map(p=>p.world.y);
        if(xs.length&&budget>0){
          points.push({kind:'CENTER',world:{x:(Math.min(...xs)+Math.max(...xs))/2,
            y:(Math.min(...ys)+Math.max(...ys))/2}});
          budget--;
        }
      }
      result.push({ref:{...scope,origin:'GENERATED',id:item.ref.id},
        transform:item.transform,visible:item.visible,points});
    }
    for(const item of this.renderIndex?.entities??[]){
      const delta=this.sceneWork?.get(item.id);
      if(!delta)continue;
      const points:SnapPoint[]=[];
      const visible=this.effectivelyVisible(item.id);
      if(withPoints&&visible&&budget>0){
        for(const path of item.paths){
          const pathCount=path.points.length;
          const length=path.closed && pathCount>1 &&
           path.points[0][0]===path.points[pathCount-1][0] &&
           path.points[0][1]===path.points[pathCount-1][1] ?pathCount-1:pathCount;
          for(let i=0;i<length&&budget>0;i++,budget--){
            const [x,y]=path.points[i];
            points.push({kind:!path.closed&&(i===0||i===length-1)?'ENDPOINT':'VERTEX',
              world:{x,y}});
          }
        }
        const [minX,minY,maxX,maxY]=item.bounds;
        if(budget>0&&[minX,minY,maxX,maxY].every(Number.isFinite)){
          points.push({kind:'CENTER',world:{x:(minX+maxX)/2,y:(minY+maxY)/2}});budget--;
        }
      }
      result.push({ref:{...scope,origin:'RENDER',id:item.id},
        transform:delta.transform,visible,points});
    }
    return result;
  }
  getGeneratedObjects(){
    return (this.document?.getObjects()??[]).map(item=>({
      ref:item.ref,savedOutlineId:item.savedOutlineId,visible:item.visible,
      geometry:generatedResult(item).geometry,baseGeometry:item.baseGeometry,
      transform:item.transform,transformOperations:item.transformOperations.map(op=>
         op.type==='Translate'?{...op}:{...op,pivot:[...op.pivot] as [number,number]}),
       edited:item.edited,dirty:item.dirty,
      sourceEntityIds:[...item.baseResult.sourceEntityIds],kind:item.kind,
      name:item.name||'외곽선 '+item.savedOutlineId.replace(/^local-/,''),outlineTypeId:item.outlineTypeId,outlineTypeName:item.outlineTypeName,
    }));
  }
  getSavedOutlineStates():SavedOutlineOverlayState[]{
    const selected=new Set(this.selector?.getSelectedGeneratedIds()??[]);
    return (this.document?.getObjects()??[]).map(item=>({
      id:item.savedOutlineId,visible:item.visible,selected:selected.has(item.ref.id),
    }));
  }
  setSavedOutlineVisibility(id:string,visible:boolean):boolean {
    this.cancelGeneratedCommand();
    return this.document?.setVisible(id,visible)??false;
  }
  selectSavedOutline(id:string,additive=false):boolean {
    const entry=this.document?.getObjects().find(o=>o.savedOutlineId===id);
    if(this.disposed||!entry?.visible)return false;
    return this.selector?.selectGenerated(entry.ref.id,additive)??false;
  }
  getGeneratedHistory(){return this.document?.history()??{undo:0,redo:0,limit:100};}
  getGeneratedTransfer(){
    if(!this.document)throw new Error('생성 개체 Document가 없습니다.');
    return buildGeneratedTransfer(this.document,this.getOutlineInfo()?.unitCode??null);
  }
  importGeneratedTransfer(raw:unknown,replace:boolean):{count:number;legacy:boolean}{
    if(!this.document||!this.outline||this.disposed)
      throw new Error('생성 개체 가져오기를 지원하지 않습니다.');
    const parsed=parseGeneratedTransfer(raw,this.outline,this.getOutlineInfo()?.unitCode??null);
    if(!replace&&(this.document.getObjects().length>0||
       this.document.history().undo>0||this.document.history().redo>0))
      throw new Error('기존 생성 개체가 있습니다. 명시적인 전체 교체 확인이 필요합니다.');
    // Validate every object before modifying the live Document. On failure
    // replaceFromImport preserves the current session/history unmodified.
    this.document.replaceFromImport(parsed.entries);
    const maxOrdinal=Math.max(0,...parsed.entries.map(e=>Number(e.savedOutlineId.slice(6))));
    this.nextSavedId=maxOrdinal+1;
    this.cancelGeneratedCommand();
    this.selector?.clearObjects();
    return {count:parsed.entries.length,legacy:parsed.legacy};
  }
  executeGeneratedCommand(command:GeneratedCommand):void {
    this.cancelGeneratedCommand();
    if(!this.document)throw new Error('이 Renderer에서는 생성 개체 편집을 지원하지 않습니다.');
    if(this.mode!=='objects'&&this.mode!=='generated')
      throw new Error('생성 개체 편집 모드에서만 변경할 수 있습니다.');
    this.document.execute(command,this.getCanvasObjectSelection());
  }
  stageGeneratedCommand(command:GeneratedCommand):void{
    this.cancelGeneratedCommand();
    if(!this.document)throw new Error('이 Renderer에서는 생성 개체 편집을 지원하지 않습니다.');
    this.document.stage(command,this.getCanvasObjectSelection());
  }
  commitGeneratedCommand():boolean{
    return this.document?.commitPending(this.getCanvasObjectSelection())??false;
  }
  cancelGeneratedCommand():boolean{
    const hadGhost=!!this.dragGhostGroup;
    const hadPending=this.document?.hasPending??false;
    const hadRotation=!!this.dragRotation;
    const stopped=this.selector?.cancelGeneratedDrag()??false;
    this.dropRotationPreview();
    this.dropTranslationPreview();
    return stopped||hadGhost||hadPending||hadRotation;
  }
  undoGeneratedEdit():boolean{this.cancelGeneratedCommand();return this.document?.undo()??false;}
  redoGeneratedEdit():boolean{this.cancelGeneratedCommand();return this.document?.redo()??false;}
  clearSavedOutlines(){this.cancelGeneratedCommand();this.document?.clear();}
  dispose() {
    if(this.disposed)return;this.disposed=true;this.cancel?.();this.resize.disconnect();
    this.terminateWorker('index');this.terminateWorker('compute');
    this.selector?.dispose();this.selector=undefined;
    this.dropRotationPreview();this.dropTranslationPreview();
    window.removeEventListener('keydown',this.rotateKeyDown,true);
    window.removeEventListener('wheel',this.rotateWheel,true);
    this.rotateHandle?.remove();this.rotateHandle=undefined;
    for(const group of [this.selectionGroup,this.previewGroup,this.savedGroup,this.selectedSavedGroup])if(group)release(group);
    this.savedGroups.clear();this.renderedTransforms.clear();this.document?.dispose();this.document=undefined;
    this.sceneWork?.dispose();this.sceneWork=undefined;this.sceneObjects.clear();this.rendererIds.clear();
    this.intrinsicSceneVisibility.clear();
    this.controls.removeEventListener('change',this.cameraChanged);
    this.sceneArtifact=undefined;this.sceneTextIndex=undefined;
    this.exchangeBaseline=undefined;this.exchangeScope=undefined;this.exchangeEpoch++;
    this.controls.dispose();if(this.object)release(this.object);this.scene.clear();
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}
