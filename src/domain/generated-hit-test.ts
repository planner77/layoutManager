/** Issue #51 / E1: conservative WCS hit tests for browser-confirmed GeoJSON.
 * A hole's interior is empty; its edge remains a selectable stroke. A crossing
 * window selects actual polygon/stroke intersections, not merely bounding boxes. */
import type {GeoJSONOutline} from '../viewers/core/outline-compute';
import type {XY} from '../viewers/core/outline-geometry';
import {outlineGeometryBounds} from './outline-tree';
export type HitBox = readonly [number,number,number,number];
type Segment = readonly [XY,XY];
const EPS=1e-9;
function polygons(g:GeoJSONOutline):XY[][][]{
  return g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
}
function segments(ring:XY[]):Segment[]{
  if(ring.length<4)return [];
  const result:Segment[]=[];
  for(let i=1;i<ring.length;i++)result.push([ring[i-1],ring[i]]);
  if(ring[0][0]!==ring[ring.length-1][0] || ring[0][1]!==ring[ring.length-1][1])
    result.push([ring[ring.length-1],ring[0]]);
  return result;
}
function distance(p:XY,a:XY,b:XY):number{
  const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  const t=den===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function isInsideRing(p:XY,ring:XY[]):boolean{
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>p[1])!==(b[1]>p[1]) &&
       p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function polygonFill(p:XY,polygon:XY[][]):boolean{
  return !!polygon[0] && isInsideRing(p,polygon[0]) &&
    !polygon.slice(1).some(hole=>isInsideRing(p,hole));
}
function within(p:XY,box:HitBox):boolean{
  return p[0]>=box[0] && p[0]<=box[2] && p[1]>=box[1] && p[1]<=box[3];
}
function orientation(a:XY,b:XY,c:XY):number{
  return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
}
function onSegment(a:XY,p:XY,b:XY):boolean{
  return Math.abs(orientation(a,b,p))<=EPS &&
    p[0]>=Math.min(a[0],b[0])-EPS && p[0]<=Math.max(a[0],b[0])+EPS &&
    p[1]>=Math.min(a[1],b[1])-EPS && p[1]<=Math.max(a[1],b[1])+EPS;
}
function crossed(a:XY,b:XY,c:XY,d:XY):boolean{
  const u=orientation(a,b,c),v=orientation(a,b,d),w=orientation(c,d,a),x=orientation(c,d,b);
  return (u*v<-EPS&&w*x<-EPS)||onSegment(a,c,b)||onSegment(a,d,b)||onSegment(c,a,d)||onSegment(c,b,d);
}
function intersectsSegmentBox(a:XY,b:XY,box:HitBox):boolean{
  if(within(a,box)||within(b,box))return true;
  const corners:XY[]=[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]];
  return corners.some((corner,i)=>crossed(a,b,corner,corners[(i+1)%4]));
}
function validGeometry(g:GeoJSONOutline):boolean {
  // #43 bounds validator rejects malformed/nonfinite/degenerate inputs.
  return outlineGeometryBounds(g)!==null;
}
export function geometryHitPoint(g:GeoJSONOutline,p:XY,radius:number):boolean{
  if(!validGeometry(g)||!p.every(Number.isFinite)||!Number.isFinite(radius)||radius<0)return false;
  const b=outlineGeometryBounds(g)!;
  if(p[0]<b.minX-radius||p[0]>b.maxX+radius||p[1]<b.minY-radius||p[1]>b.maxY+radius)return false;
  for(const poly of polygons(g)){
    if(poly.some(ring=>segments(ring).some(([a,b])=>distance(p,a,b)<=radius)))return true;
    if(polygonFill(p,poly))return true;
  }
  return false;
}
export function geometryContainedInBox(g:GeoJSONOutline,box:HitBox):boolean{
  if(!validGeometry(g)||!box.every(Number.isFinite)||box[0]>box[2]||box[1]>box[3])return false;
  return polygons(g).every(poly=>poly.every(ring=>ring.every(p=>within(p,box))));
}
export function geometryIntersectsBox(g:GeoJSONOutline,box:HitBox):boolean{
  if(!validGeometry(g)||!box.every(Number.isFinite)||box[0]>box[2]||box[1]>box[3])return false;
  const b=outlineGeometryBounds(g)!;
  if(b.maxX<box[0]||b.minX>box[2]||b.maxY<box[1]||b.minY>box[3])return false;
  const corners:XY[]=[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]];
  return polygons(g).some(poly=>
    poly.some(ring=>segments(ring).some(([a,c])=>intersectsSegmentBox(a,c,box))) ||
    corners.some(corner=>polygonFill(corner,poly)));
}
