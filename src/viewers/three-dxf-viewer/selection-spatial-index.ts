/** Conservative spatial index for selectable DXF WCS bounds.
 * Bounded bucket occupancy prevents giant entities from allocating unlimited
 * tiles. Exact geometry still has to be checked by the calling controller. */
import type {OutlineEntity} from '../core/outline-geometry';
export type WorldBox=[number,number,number,number];
function intersects(a:WorldBox,b:WorldBox):boolean {
  return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
}
export class SelectionSpatialIndex {
  private readonly cells=new Map<number,number[]>();
  private readonly overflow:number[]=[];
  private readonly extent:WorldBox;
  private readonly dimension:number;
  private readonly dx:number;
  private readonly dy:number;
  readonly buildMs:number;
  readonly assignmentCount:number;
  readonly overflowCount:number;
  constructor(private readonly entities:readonly OutlineEntity[]) {
    const start=performance.now();
    const box:WorldBox=[Infinity,Infinity,-Infinity,-Infinity];
    for(const e of entities){
      box[0]=Math.min(box[0],e.bounds[0]);box[1]=Math.min(box[1],e.bounds[1]);
      box[2]=Math.max(box[2],e.bounds[2]);box[3]=Math.max(box[3],e.bounds[3]);
    }
    this.extent=Number.isFinite(box[0])?box:[0,0,1,1];
    this.dimension=Math.min(128,Math.max(8,Math.ceil(Math.sqrt(entities.length)/2)));
    this.dx=Math.max((this.extent[2]-this.extent[0])/this.dimension,1e-9);
    this.dy=Math.max((this.extent[3]-this.extent[1])/this.dimension,1e-9);
    let assignments=0;
    for(let i=0;i<entities.length;i++){
      const e=entities[i];
      if(!e.bounds.every(Number.isFinite))continue;
      const x0=this.x(e.bounds[0]),x1=this.x(e.bounds[2]);
      const y0=this.y(e.bounds[1]),y1=this.y(e.bounds[3]);
      const occupied=(x1-x0+1)*(y1-y0+1);
      if(occupied>64){this.overflow.push(i);continue;}
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const key=y*this.dimension+x;
        let cell=this.cells.get(key);
        if(!cell){cell=[];this.cells.set(key,cell);}
        cell.push(i);assignments++;
      }
    }
    this.assignmentCount=assignments;
    this.overflowCount=this.overflow.length;
    this.buildMs=performance.now()-start;
  }
  private clampCell(value:number){return Math.max(0,Math.min(this.dimension-1,value));}
  private x(v:number){return this.clampCell(Math.floor((v-this.extent[0])/this.dx));}
  private y(v:number){return this.clampCell(Math.floor((v-this.extent[1])/this.dy));}
  query(rect:WorldBox):OutlineEntity[] {
    if(!rect.every(Number.isFinite)||rect[0]>rect[2]||rect[1]>rect[3])return [];
    if(!intersects(rect,this.extent))return [];
    const x0=this.x(rect[0]),x1=this.x(rect[2]),y0=this.y(rect[1]),y1=this.y(rect[3]);
    const tiles=(x1-x0+1)*(y1-y0+1);
    // Avoid joining thousands of cells for a nearly full-canvas selection.
    if(tiles>4096)return this.entities.filter(e=>intersects(e.bounds,rect));
    const ids=new Set<number>(this.overflow);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      for(const id of this.cells.get(y*this.dimension+x)??[])ids.add(id);
    }
    return [...ids].sort((a,b)=>a-b).map(i=>this.entities[i])
      .filter(e=>intersects(e.bounds,rect));
  }
}
