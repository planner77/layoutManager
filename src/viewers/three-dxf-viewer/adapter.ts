import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DXFViewer } from 'three-dxf-viewer';
import type { CadViewerAdapter } from '../core/adapter';
import { explicitElevation } from './normalize';

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
  constructor(private container: HTMLElement) {
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
      return {empty:this.bounds.isEmpty()};
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
  showLayer(name:string,visible:boolean) {this.object?.traverse(o=>{if(o.userData.entity?.layer===name)o.visible=visible;});this.render();}
  dispose() {
    if(this.disposed)return;this.disposed=true;this.cancel?.();this.resize.disconnect();
    this.controls.dispose();if(this.object)release(this.object);this.scene.clear();
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}
