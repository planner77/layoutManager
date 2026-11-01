/** #186: Batch-project WCS points using one camera/viewport snapshot per frame.
 * The caller obtains the canvas CSS rect once. No DPR multiplication here.
 * Unlike culling, this preserves offscreen coordinates for every caller.
 */
import {Vector3,type Camera} from 'three';
export type CanvasXY=Readonly<{x:number;y:number}>;
export function projectWcsBatch(camera:Camera,viewport:{width:number;height:number},
 points:readonly CanvasXY[]):(CanvasXY|null)[]{
 if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||
    viewport.width<=0||viewport.height<=0)return points.map(()=>null);
 const point3=new Vector3();
 return points.map(point=>{
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||
     Math.abs(point.x)>1e12||Math.abs(point.y)>1e12)return null;
  point3.set(point.x,point.y,0).project(camera);
  const x=(point3.x+1)*viewport.width/2,y=(1-point3.y)*viewport.height/2;
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
 });
}
