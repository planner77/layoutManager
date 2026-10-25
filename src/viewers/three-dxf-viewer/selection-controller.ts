import type {OutlineEntity,XY} from '../core/outline-geometry';
import type {GeoJSONOutline} from '../core/outline-compute';
import {geometryContainedInBox,geometryHitPoint,geometryIntersectsBox,type HitBox} from '../../domain/generated-hit-test';
import {SelectionSpatialIndex} from './selection-spatial-index';

/** 'select' is the #31/#40 SOURCE-only outline worker mode. */
export type SelectionMode='pan'|'select'|'objects'|'generated';
export type GeneratedSelectable=Readonly<{id:string;geometry:GeoJSONOutline}>;
const MIN_DRAG_PX=5,CLICK_PX=7;
function distanceToSegment(p:XY,a:XY,b:XY){
 const dx=b[0]-a[0],dy=b[1]-a[1],denom=dx*dx+dy*dy;
 const t=denom===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denom));
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function segmentIntersectsBox(a:XY,b:XY,rect:HitBox){
 const [left,bottom,right,top]=rect;
 const inside=(p:XY)=>p[0]>=left&&p[0]<=right&&p[1]>=bottom&&p[1]<=top;
 if(inside(a)||inside(b))return true;
 const edges: Array<[XY,XY]> = [
   [[left,bottom],[right,bottom]],[[right,bottom],[right,top]],
   [[right,top],[left,top]],[[left,top],[left,bottom]],
 ];
 const orient=(p:XY,q:XY,r:XY)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 return edges.some(([c,d])=>{
   const u=orient(a,b,c),v=orient(a,b,d),w=orient(c,d,a),x=orient(c,d,b);
   const cross=u*v<0&&w*x<0;
   const on=(p:XY,q:XY,r:XY)=>Math.abs(orient(p,q,r))<=1e-8&&
     q[0]>=Math.min(p[0],r[0])-1e-8&&q[0]<=Math.max(p[0],r[0])+1e-8&&
     q[1]>=Math.min(p[1],r[1])-1e-8&&q[1]<=Math.max(p[1],r[1])+1e-8;
   return cross||on(a,c,b)||on(a,d,b)||on(c,a,d)||on(c,b,d);
 });
}
function pathsFor(entity:OutlineEntity) {
 return entity.paths.flatMap(path=>{
   const segments:[XY,XY][]=[];
   for(let i=1;i<path.points.length;i++)segments.push([path.points[i-1],path.points[i]]);
   if(path.closed&&path.points.length>2)segments.push([path.points[path.points.length-1],path.points[0]]);
   return segments;
 });
}
/** One DOM input controller and one source SpatialIndex for all four modes.
 * Generated shapes are at most 100 confirmed session objects and are tested
 * dynamically; never add their paths to the immutable source index/Worker. */
export class SelectionController {
 private ids=new Set<string>();
 private generatedIds=new Set<string>();
 private generated:readonly GeneratedSelectable[]=[];
 private readonly spatial:SelectionSpatialIndex;
 private readonly idToLayer:Map<string,string>;
 get indexBuildMs(){return this.spatial.buildMs;}
 get indexAssignments(){return this.spatial.assignmentCount;}
 get overflowEntities(){return this.spatial.overflowCount;}
 private mode:SelectionMode='pan';
 private visible=new Set<string>();
 private down?:{pointerId:number;x:number;y:number;mod:boolean};
 private box:HTMLDivElement;
 private space=false;
 private previousPosition:string;
 private previousCursor:string;
 private previousTabIndex:string|null;
 constructor(
   private canvas:HTMLCanvasElement,
   private container:HTMLElement,
   private entities:OutlineEntity[],
   private screenToWorld:(x:number,y:number)=>XY,
   private onChange:(selected:OutlineEntity[])=>void,
   private onPanKey:(pan:boolean)=>void,
   private onObjectsChange?:(sources:OutlineEntity[],generatedIds:readonly string[])=>void,
 ) {
   this.spatial=new SelectionSpatialIndex(entities);
   this.idToLayer=new Map(entities.map(e=>[e.id,e.layer]));
   this.visible=new Set(entities.map(e=>e.layer));
   this.previousPosition=container.style.position;
   this.previousCursor=canvas.style.cursor;
   this.previousTabIndex=canvas.getAttribute('tabindex');
   if(this.previousTabIndex===null)canvas.tabIndex=0;
   container.style.position='relative';
   this.box=document.createElement('div');
   this.box.dataset.outlineSelectionBox='true';
   Object.assign(this.box.style,{position:'absolute',pointerEvents:'none',display:'none',zIndex:'2',border:'1px dashed #38bdf8',background:'rgba(14,165,233,.18)'});
   container.append(this.box);
   canvas.addEventListener('pointerdown',this.pointerDown);
   canvas.addEventListener('pointermove',this.pointerMove);
   window.addEventListener('pointerup',this.pointerUp);
   window.addEventListener('pointercancel',this.pointerCancel);
   window.addEventListener('keydown',this.keyDown,true);
   window.addEventListener('keyup',this.keyUp,true);
   window.addEventListener('blur',this.blur);
 }
 setMode(mode:SelectionMode){
   this.mode=mode;this.cancelDrag();
   this.canvas.style.cursor=mode==='pan'?this.previousCursor:'crosshair';
   this.onPanKey(mode==='pan'||this.space);
 }
 setVisibleLayers(layers:Set<string>){
   this.visible=new Set(layers);
   const before=this.ids.size;
   this.ids=new Set([...this.ids].filter(id=>{
     const layer=this.idToLayer.get(id);return layer!==undefined&&this.visible.has(layer);
   }));
   if(before!==this.ids.size)this.emit();
 }
 setGeneratedObjects(objects:readonly GeneratedSelectable[]){
   const unique=new Map(objects.map(o=>[o.id,o]));
   this.generated=[...unique.values()];
   const before=this.generatedIds.size;
   this.generatedIds=new Set([...this.generatedIds].filter(id=>unique.has(id)));
   if(before!==this.generatedIds.size)this.emit();
 }
 getSelection(){return this.entities.filter(e=>this.ids.has(e.id));}
 getSelectedGeneratedIds(){return [...this.generatedIds];}
 /** Right-click context actions must hit an already-selected confirmed shape. */
 isSelectedGeneratedAt(clientX:number,clientY:number):boolean {
   if(!this.generatedIds.size)return false;
   const [x,y]=this.position(clientX,clientY);
   const world=this.screenToWorld(x,y),near=this.screenToWorld(x+CLICK_PX,y);
   const radius=Math.hypot(near[0]-world[0],near[1]-world[1]);
   return this.generated.some(item=>this.generatedIds.has(item.id) &&
     geometryHitPoint(item.geometry,world,radius));
 }
 selectGenerated(id:string,additive=false):boolean{
   if(!this.generated.some(item=>item.id===id))return false;
   if(!additive){this.ids.clear();this.generatedIds.clear();}
   if(additive&&this.generatedIds.has(id))this.generatedIds.delete(id);
   else this.generatedIds.add(id);
   this.emit();return true;
 }
 clear(){if(this.ids.size){this.ids.clear();this.emit();}this.cancelDrag();}
 clearObjects(){
   const changed=this.ids.size>0||this.generatedIds.size>0;
   this.ids.clear();this.generatedIds.clear();this.cancelDrag();
   if(changed)this.emit();
 }
 private emit(){
   const sources=this.getSelection();
   this.onChange(sources);
   this.onObjectsChange?.(sources,this.getSelectedGeneratedIds());
 }
 private position(clientX:number,clientY:number):XY {
   const rect=this.canvas.getBoundingClientRect();
   return [clientX-rect.left,clientY-rect.top];
 }
 private pointerDown=(event:PointerEvent)=>{
   if(this.mode==='pan'||this.space||event.button!==0)return;
   const [x,y]=this.position(event.clientX,event.clientY);
   this.canvas.focus({preventScroll:true});
   this.down={pointerId:event.pointerId,x,y,mod:event.ctrlKey||event.metaKey};
 };
 private pointerMove=(event:PointerEvent)=>{
   if(!this.down||this.down.pointerId!==event.pointerId)return;
   const [x,y]=this.position(event.clientX,event.clientY),start=this.down;
   if(Math.hypot(x-start.x,y-start.y)<MIN_DRAG_PX&&this.box.style.display==='none')return;
   this.box.style.display='block';
   Object.assign(this.box.style,{
     left:Math.min(x,start.x)+'px',top:Math.min(y,start.y)+'px',
     width:Math.abs(x-start.x)+'px',height:Math.abs(y-start.y)+'px',
     borderColor:x>=start.x?'#38bdf8':'#22c55e',
     background:x>=start.x?'rgba(14,165,233,.18)':'rgba(34,197,94,.18)',
   });
 };
 private pointerUp=(event:PointerEvent)=>{
   const start=this.down;
   if(!start||start.pointerId!==event.pointerId)return;
   const [x,y]=this.position(event.clientX,event.clientY);
   const dragging=Math.hypot(x-start.x,y-start.y)>=MIN_DRAG_PX;
   this.cancelDrag();
   const includeSource=this.mode==='select'||this.mode==='objects';
   const includeGenerated=this.mode==='objects'||this.mode==='generated';
   let sourceHits:OutlineEntity[]=[];
   let generatedHits:GeneratedSelectable[]=[];
   if(dragging){
     const min=this.screenToWorld(Math.min(x,start.x),Math.max(y,start.y));
     const max=this.screenToWorld(Math.max(x,start.x),Math.min(y,start.y));
     const rect:HitBox=[Math.min(min[0],max[0]),Math.min(min[1],max[1]),Math.max(min[0],max[0]),Math.max(min[1],max[1])];
     const contained=x>=start.x;
     if(includeSource){
       const candidates=this.spatial.query([rect[0],rect[1],rect[2],rect[3]]).filter(e=>this.visible.has(e.layer));
       sourceHits=candidates.filter(e=>{
         if(contained)return e.paths.every(path=>path.points.every(p=>p[0]>=rect[0]&&p[0]<=rect[2]&&p[1]>=rect[1]&&p[1]<=rect[3]));
         if(e.bounds[2]<rect[0]||e.bounds[0]>rect[2]||e.bounds[3]<rect[1]||e.bounds[1]>rect[3])return false;
         return pathsFor(e).some(([a,b])=>segmentIntersectsBox(a,b,rect));
       });
     }
     if(includeGenerated)generatedHits=this.generated.filter(o=>contained?
       geometryContainedInBox(o.geometry,rect):geometryIntersectsBox(o.geometry,rect));
   }else{
     const p=this.screenToWorld(x,y),q=this.screenToWorld(x+CLICK_PX,y),radius=Math.hypot(q[0]-p[0],q[1]-p[1]);
     if(includeSource){
       const candidates=this.spatial.query([p[0]-radius,p[1]-radius,p[0]+radius,p[1]+radius]).filter(e=>this.visible.has(e.layer));
       const ranked=candidates.map(e=>({e,d:pathsFor(e).reduce((best,[a,b])=>Math.min(best,distanceToSegment(p,a,b)),Infinity)})).sort((a,b)=>a.d-b.d);
       if(ranked[0]&&ranked[0].d<=radius)sourceHits=[ranked[0].e];
     }
     // In general-object mode a matching DXF entity ALWAYS wins over its
     // overlay; select an overlapping generated object in GENERATED mode/tree.
     if(includeGenerated && (!sourceHits.length || this.mode==='generated')){
       const match=[...this.generated].reverse().find(o=>geometryHitPoint(o.geometry,p,radius));
       if(match)generatedHits=[match];
     }
   }
   if(!start.mod){this.ids.clear();this.generatedIds.clear();}
   for(const hit of sourceHits){
     if(start.mod&&this.ids.has(hit.id))this.ids.delete(hit.id);else this.ids.add(hit.id);
   }
   for(const hit of generatedHits){
     if(start.mod&&this.generatedIds.has(hit.id))this.generatedIds.delete(hit.id);
     else this.generatedIds.add(hit.id);
   }
   this.emit();
 };
 private pointerCancel=()=>this.cancelDrag();
 private keyDown=(event:KeyboardEvent)=>{
   const el=event.target as HTMLElement|null;
   if(el?.closest('input,textarea,select,[contenteditable="true"]'))return;
   if(event.code==='Space'&&this.mode!=='pan'&&!event.repeat){
     const interactive=el?.closest('button,a[href],summary,[role="button"],[role="link"],[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="treeitem"]');
     if(!interactive){this.space=true;this.onPanKey(true);event.preventDefault();}
   }
   if(event.key==='Escape'&&(this.down||this.ids.size||this.generatedIds.size)){
     this.clearObjects();event.preventDefault();
   }
 };
 private keyUp=(event:KeyboardEvent)=>{
   if(event.code==='Space'&&this.space){this.space=false;this.onPanKey(this.mode==='pan');event.preventDefault();}
 };
 private blur=()=>{this.space=false;this.onPanKey(this.mode==='pan');this.cancelDrag();};
 private cancelDrag(){this.down=undefined;this.box.style.display='none';}
 dispose(){
   this.canvas.removeEventListener('pointerdown',this.pointerDown);
   this.canvas.removeEventListener('pointermove',this.pointerMove);
   window.removeEventListener('pointerup',this.pointerUp);
   window.removeEventListener('pointercancel',this.pointerCancel);
   window.removeEventListener('keydown',this.keyDown,true);
   window.removeEventListener('keyup',this.keyUp,true);
   window.removeEventListener('blur',this.blur);
   this.box.remove();this.canvas.style.cursor=this.previousCursor;this.container.style.position=this.previousPosition;
   if(this.previousTabIndex===null)this.canvas.removeAttribute('tabindex');
   else this.canvas.setAttribute('tabindex',this.previousTabIndex);
   this.onPanKey(true);
 }
}
