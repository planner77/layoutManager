import type {OutlineEntity,XY} from '../core/outline-geometry';

export type SelectionMode='pan'|'select';
const MIN_DRAG_PX=5,CLICK_PX=7;
function distanceToSegment(p:XY,a:XY,b:XY){
 const dx=b[0]-a[0],dy=b[1]-a[1],denom=dx*dx+dy*dy;
 const t=denom===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denom));
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function segmentIntersectsBox(a:XY,b:XY,rect:[number,number,number,number]){
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
/** DOM controls are owned by the three-dxf-viewer adapter and always disposed with it. */
export class SelectionController {
 private ids=new Set<string>();
 private mode:SelectionMode='pan';
 private visible=new Set<string>();
 private down?:{pointerId:number;x:number;y:number;mod:boolean};
 private box:HTMLDivElement;
 private space=false;
 private previousPosition:string;
 private previousCursor:string;
 constructor(
   private canvas:HTMLCanvasElement,
   private container:HTMLElement,
   private entities:OutlineEntity[],
   private screenToWorld:(x:number,y:number)=>XY,
   private onChange:(selected:OutlineEntity[])=>void,
   private onPanKey:(pan:boolean)=>void,
 ) {
   this.visible=new Set(entities.map(e=>e.layer));
   this.previousPosition=container.style.position;
   this.previousCursor=canvas.style.cursor;
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
 setMode(mode:SelectionMode){this.mode=mode;this.cancelDrag();this.canvas.style.cursor=mode==='select'?'crosshair':this.previousCursor;this.onPanKey(mode==='pan'||this.space);}
 setVisibleLayers(layers:Set<string>){
   this.visible=new Set(layers);
   const before=this.ids.size;
   this.ids=new Set([...this.ids].filter(id=>this.entities.some(e=>e.id===id&&this.visible.has(e.layer))));
   if(before!==this.ids.size)this.emit();
 }
 getSelection(){return this.entities.filter(e=>this.ids.has(e.id));}
 clear(){if(this.ids.size){this.ids.clear();this.emit();}this.cancelDrag();}
 private emit(){this.onChange(this.getSelection());}
 private position(clientX:number,clientY:number):XY {
   const rect=this.canvas.getBoundingClientRect();
   return [clientX-rect.left,clientY-rect.top];
 }
 private pointerDown=(event:PointerEvent)=>{
   if(this.mode!=='select'||this.space||event.button!==0)return;
   const [x,y]=this.position(event.clientX,event.clientY);
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
   const candidates=this.entities.filter(e=>this.visible.has(e.layer));
   let hits:OutlineEntity[]=[];
   if(dragging){
     const min=this.screenToWorld(Math.min(x,start.x),Math.max(y,start.y));
     const max=this.screenToWorld(Math.max(x,start.x),Math.min(y,start.y));
     const rect:[number,number,number,number]=[Math.min(min[0],max[0]),Math.min(min[1],max[1]),Math.max(min[0],max[0]),Math.max(min[1],max[1])];
     const contained=x>=start.x;
     hits=candidates.filter(e=>{
       if(contained)return e.paths.every(path=>path.points.every(p=>p[0]>=rect[0]&&p[0]<=rect[2]&&p[1]>=rect[1]&&p[1]<=rect[3]));
       if(e.bounds[2]<rect[0]||e.bounds[0]>rect[2]||e.bounds[3]<rect[1]||e.bounds[1]>rect[3])return false;
       return pathsFor(e).some(([a,b])=>segmentIntersectsBox(a,b,rect));
     });
   }else{
     const p=this.screenToWorld(x,y),q=this.screenToWorld(x+CLICK_PX,y),radius=Math.hypot(q[0]-p[0],q[1]-p[1]);
     const ranked=candidates.map(e=>({e,d:pathsFor(e).reduce((best,[a,b])=>Math.min(best,distanceToSegment(p,a,b)),Infinity)})).sort((a,b)=>a.d-b.d);
     if(ranked[0]&&ranked[0].d<=radius)hits=[ranked[0].e];
   }
   if(!start.mod)this.ids.clear();
   for(const hit of hits){if(start.mod&&this.ids.has(hit.id))this.ids.delete(hit.id);else this.ids.add(hit.id);}
   this.emit();
 };
 private pointerCancel=()=>this.cancelDrag();
 private keyDown=(event:KeyboardEvent)=>{
   const el=event.target as HTMLElement|null;
   if(el?.closest('input,textarea,select,[contenteditable="true"]'))return;
   if(event.code==='Space'&&this.mode==='select'&&!event.repeat){this.space=true;this.onPanKey(true);event.preventDefault();}
   if(event.key==='Escape'&&this.mode==='select'&&(this.down||this.ids.size)){
     this.clear();event.preventDefault();event.stopImmediatePropagation();
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
   this.onPanKey(true);
 }
}
