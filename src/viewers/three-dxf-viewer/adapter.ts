import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DXFViewer } from 'three-dxf-viewer';
import type { CadViewerAdapter } from '../core/adapter';
import { explicitElevation } from './normalize';
import {SelectionController,type SelectionMode} from './selection-controller';
import {reconcileRenderCoverage,type RenderObservation,type RenderCoverage} from './render-coverage';
import type {DxfOutlineIndex,OutlineEntity,OutlineKind,OutlinePath} from '../core/outline-geometry';
import type {OutlineResult} from '../core/outline-compute';
import type {OutlineInfo,SavedOutline} from '../core/adapter';

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
  private disposed = false;
  private cancel?: () => void;
  private bounds = new THREE.Box3();
  private index?: DxfOutlineIndex;
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
  private preview?: OutlineResult;
  private previewKind?: OutlineKind;
  private saved: SavedOutline[]=[];
  private activeWorkers: Partial<Record<'index'|'compute',{worker:Worker;cancel:()=>void}>>={};
  private computeSequence=0;
  constructor(private container: HTMLElement, private outline?:{
    versionId:string;sourceSha256:string;
    onSelection?:(entities:OutlineEntity[])=>void;
    onPreview?:(result:OutlineResult|null,error?:string)=>void;
    onSaved?:(count:number)=>void;
  }) {
    this.renderer = new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x000000);
    container.append(this.renderer.domElement);
    this.camera.position.z = 1000;
    this.controls = new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    this.controls.addEventListener('change',this.render);
    this.resize = new ResizeObserver(this.size);
    this.resize.observe(container); this.size();
  }
  private render = () => { if (!this.disposed) this.renderer.render(this.scene,this.camera); };
  private size = () => {
    if (this.disposed) return;
    const w=Math.max(1,this.container.clientWidth), h=Math.max(1,this.container.clientHeight);
    this.renderer.setSize(w,h);
    const height=this.camera.top-this.camera.bottom;
    this.camera.left=-height*w/h/2;this.camera.right=height*w/h/2;
    this.camera.updateProjectionMatrix();this.render();
  };
  async load(source: ArrayBuffer) {
    const text=new TextDecoder().decode(source);
    if(!/(?:^|\n)\s*0\s*\r?\nSECTION\s*\r?\n/.test(text) || !/(?:^|\n)\s*0\s*\r?\nEOF\s*$/.test(text)) throw new Error('DXF 처리에 실패했습니다. 유효한 ASCII DXF인지 확인해주세요.');
    const url=URL.createObjectURL(new Blob([explicitElevation(text)]));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const viewer=new DXFViewer();viewer.useCache=false;
    try {
      const pending=viewer.getFromPath(url,'/fonts/CadKorean.typeface.json').then(object=>{
        if (this.disposed) { if(object) release(object); throw new DOMException('취소됨','AbortError'); }
        return object;
      });
      const object=await Promise.race([pending,new Promise<never>((_,reject)=>{
        this.cancel=()=>reject(new DOMException('취소됨','AbortError'));
        timer=setTimeout(()=>reject(new Error('처리 시간 초과')),120000);
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
      this.object=object;this.scene.add(object);this.bounds.setFromObject(object);
      if(!this.bounds.isEmpty() && ![...this.bounds.min.toArray(),...this.bounds.max.toArray()].every(Number.isFinite)) throw new Error('유효하지 않은 도형 좌표');
      this.fitToView();this.render();
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
          this.visibleLayers=new Set(this.getLayers());
          const selectable=this.renderCoverage.selectable.filter(e=>this.visibleLayers.has(e.layer));
          this.selector=new SelectionController(this.renderer.domElement,this.container,selectable,
            (x,y)=>this.screenToWorld(x,y),this.selectionChanged,
            pan=>{this.controls.mouseButtons.LEFT=pan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;});
          this.spatialIndexMs=this.selector.indexBuildMs;
          this.selector.setMode(this.mode);
        }catch(error) {
          if(this.disposed)throw error;
          this.indexError=error instanceof Error?error.message:'객체 선택 인덱스를 만들 수 없습니다.';
        }
      }
      return {empty:this.bounds.isEmpty(),entityCount:viewer.lastDXF?.entities?.length};
    } catch(error) {
      if(error instanceof DOMException && error.name==='AbortError') throw error;
      throw new Error('DXF 처리에 실패했습니다. 파일과 글꼴 로드를 확인해주세요.');
    } finally {clearTimeout(timer);this.cancel=undefined;URL.revokeObjectURL(url);}
  }
  fitToView() {
    if(this.bounds.isEmpty()) return;
    const center=this.bounds.getCenter(new THREE.Vector3()), extent=this.bounds.getSize(new THREE.Vector3());
    const aspect=Math.max(1,this.container.clientWidth)/Math.max(1,this.container.clientHeight);
    const height=Math.max(extent.y,extent.x/aspect,1)*1.15;
    this.camera.top=height/2;this.camera.bottom=-height/2;this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;
    this.camera.zoom=1;this.camera.far=Math.max(10000,extent.z*4+1000);
    this.camera.position.set(center.x,center.y,center.z+this.camera.far/2);
    this.controls.target.copy(center);this.camera.updateProjectionMatrix();this.controls.update();this.render();
  }
  zoomIn() {this.camera.zoom=Math.min(1e8,this.camera.zoom*1.25);this.camera.updateProjectionMatrix();this.render();}
  zoomOut() {this.camera.zoom=Math.max(1e-8,this.camera.zoom/1.25);this.camera.updateProjectionMatrix();this.render();}
  getLayers() {
    const names=new Set<string>();this.object?.traverse(o=>{if(typeof o.userData.entity?.layer==='string') names.add(o.userData.entity.layer);});
    return [...names].sort();
  }
  showLayer(name:string,visible:boolean) {
    this.object?.traverse(o=>{if(o.userData.entity?.layer===name)o.visible=visible;});
    if(visible)this.visibleLayers.add(name);else this.visibleLayers.delete(name);
    this.selector?.setVisibleLayers(this.visibleLayers);this.render();
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
  private terminateWorker(kind:'index'|'compute') {
    const task=this.activeWorkers[kind];delete this.activeWorkers[kind];
    task?.worker.terminate();task?.cancel();
  }
  private runOutlineWorker<T>(kind:'index'|'compute',payload:Record<string,unknown>):Promise<T>{
    this.terminateWorker(kind);
    if(this.disposed)return Promise.reject(new DOMException('취소됨','AbortError'));
    return new Promise<T>((resolve,reject)=>{
      const worker=new Worker(new URL('../core/outline-worker.ts',import.meta.url),{type:'module'});
      let settled=false;
      const finish=(error?:Error,result?:T)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        if(this.activeWorkers[kind]?.worker===worker)delete this.activeWorkers[kind];
        worker.terminate();if(error)reject(error);else resolve(result as T);
      };
      this.activeWorkers[kind]={worker,cancel:()=>finish(new DOMException('취소됨','AbortError'))};
      worker.onmessage=(event:MessageEvent)=>{
        const response=event.data;
        if(response?.ok)finish(undefined,(kind==='index'?response.index:response.result) as T);
        else finish(new Error(response?.error??'외곽선 Worker 실패'));
      };
      worker.onerror=()=>finish(new Error('외곽선 Worker를 실행할 수 없습니다.'));
      const timer=setTimeout(()=>finish(new Error('외곽선 계산 제한 시간(30초) 초과')),30000);
      worker.postMessage({task:kind,...payload});
    });
  }
  private selectionChanged=(selected:OutlineEntity[])=>{
    if(this.selectionGroup){this.scene.remove(this.selectionGroup);release(this.selectionGroup);}
    this.selectionGroup=this.createPathGroup(selected.flatMap(e=>e.paths),0xffd000);
    this.scene.add(this.selectionGroup);this.render();
    this.outline?.onSelection?.(selected);
    if(this.previewKind){
      if(selected.length)void this.previewOutline(this.previewKind).catch(()=>undefined);
      else this.cancelOutlinePreview();
    }
  };
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
  getOutlineInfo():OutlineInfo|null {
    if(!this.outline)return null;
    if(!this.index && !this.indexError)return null;
    return {entityCount:this.renderCoverage?.mappedSource??0,unitCode:this.index?.unitCode??null,
      renderedObjectCount:this.renderCoverage?.renderedObjects??0,
      excludedEntityCount:(this.renderCoverage?.unmappedSource??0)+(this.renderCoverage?.boundsMismatch??0),
      spatialIndexMs:this.spatialIndexMs,
      sourceIndexMs:this.sourceIndexMs,renderAuditMs:this.renderAuditMs,
      warnings:[...(this.indexError?[this.indexError]:[]),
        ...(this.renderCoverage?.warnings??[]),...(this.index?.warnings??[])]};
  }
  setSelectionMode(mode:SelectionMode){this.mode=mode;this.selector?.setMode(mode);}
  getOutlineSelection(){return this.selector?.getSelection()??[];}
  clearOutlineSelection(){this.selector?.clear();}
  async previewOutline(kind:OutlineKind):Promise<OutlineResult> {
    if(!this.index||!this.selector)throw new Error(this.indexError??'DXF 객체 인덱스가 준비되지 않았습니다.');
    const selected=this.selector.getSelection();
    if(!selected.length)throw new Error('외곽선을 만들 객체를 먼저 선택하세요.');
    // Invalidate the old selection's preview before a new worker can finish.
    this.cancelOutlinePreview();
    this.previewKind=kind;
    const sequence=++this.computeSequence;
    try {
      const result=await this.runOutlineWorker<OutlineResult>('compute',{kind,entities:selected,tolerance:0.02});
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
  confirmOutline():SavedOutline {
    if(!this.preview)throw new Error('미리보기를 먼저 생성해야 합니다.');
    const saved:SavedOutline={id:'local-'+(this.saved.length+1),createdAt:new Date().toISOString(),result:this.preview};
    this.saved.push(saved);this.savedGroup.add(this.renderGeometry(this.preview,0xff8c00));
    this.scene.add(this.savedGroup);this.cancelOutlinePreview();
    this.outline?.onSaved?.(this.saved.length);this.render();return saved;
  }
  getSavedOutlines(){return [...this.saved];}
  clearSavedOutlines(){
    this.scene.remove(this.savedGroup);release(this.savedGroup);this.savedGroup=new THREE.Group();this.saved=[];
    this.outline?.onSaved?.(0);this.render();
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;this.cancel?.();this.resize.disconnect();
    this.terminateWorker('index');this.terminateWorker('compute');
    this.selector?.dispose();this.selector=undefined;
    for(const group of [this.selectionGroup,this.previewGroup,this.savedGroup])if(group)release(group);
    this.controls.dispose();if(this.object)release(this.object);this.scene.clear();
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}
