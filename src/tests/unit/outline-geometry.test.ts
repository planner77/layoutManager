import {describe,expect,it} from 'vitest';
import {convexHull,parseDxfOutlineIndex,type XY} from '../../viewers/core/outline-geometry';
import {computeOutline,type GeoJSONOutline} from '../../viewers/core/outline-compute';
const sha='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';
const header=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC'].join('\n');
function dxf(entities:string,blocks=''){
  return header+'\n'+(blocks?'0\nSECTION\n2\nBLOCKS\n'+blocks+'\n0\nENDSEC\n':'')+
    '0\nSECTION\n2\nENTITIES\n'+entities+'\n0\nENDSEC\n0\nEOF\n';
}
function line(h:string,x1:number,y1:number,x2:number,y2:number){
 return ['0','LINE','5',h,'8','0','10',x1,'20',y1,'11',x2,'21',y2].join('\n');
}
function poly(h:string,pts:XY[],closed=true){
 const prefix=['0','LWPOLYLINE','5',h,'8','0','70',closed?1:0].join('\n');
 return prefix+'\n'+pts.flatMap(([x,y])=>['10',x,'20',y]).join('\n');
}
function areaRing(r:XY[]){return Math.abs(r.reduce((a,p,i)=>a+p[0]*r[(i+1)%r.length][1]-r[(i+1)%r.length][0]*p[1],0)/2);}
function area(g:GeoJSONOutline){
 const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
 return polygons.reduce((sum,p)=>sum+areaRing(p[0])-p.slice(1).reduce((acc,r)=>acc+areaRing(r),0),0);
}
describe('Issue #31 WCS EntityRef and geometry AC',()=>{
 it('TC-OUT-ID: keeps handle / immutable version and SHA, rejects duplicated and missing handles for persistence',()=>{
   const s=dxf([line('1A',0,0,2,0),line('1A',0,2,2,2),['0','LINE','10','0','20','4','11','2','21','4'].join('\n')].join('\n'));
   const index=parseDxfOutlineIndex(s,id,sha);
   expect(index.unitCode).toBe(4);
   expect(index.entities).toHaveLength(3);
   expect(index.entities.every(e=>!e.stable)).toBe(true);
   const good=parseDxfOutlineIndex(dxf(line('1B',0,0,2,2)),id,sha);
   expect(good.entities[0].id).toBe(id+':'+sha+':1B');
   expect(good.entities[0].stable).toBe(true);
   expect(parseDxfOutlineIndex(dxf(line('1B',0,0,2,2)),id,sha).entities[0].id).toBe(good.entities[0].id);
 });
 it('TC-OUT-ID: applies BLOCK base, INSERT rotation and scale to WCS, as a single selectable instance',()=>{
   const blocks=['0','BLOCK','2','A','10','5','20','5',line('2C',5,5,15,5),'0','ENDBLK'].join('\n');
   const insert=['0','INSERT','5','FF','8','0','2','A','10','100','20','100','41','2','42','2','50','90'].join('\n');
   const e=parseDxfOutlineIndex(dxf(insert,blocks),id,sha).entities;
   expect(e).toHaveLength(1);expect(e[0].entityType).toBe('INSERT');expect(e[0].stable).toBe(true);
   expect(e[0].paths[0].points[0][0]).toBeCloseTo(100);
   expect(e[0].paths[0].points[0][1]).toBeCloseTo(100);
   expect(e[0].paths[0].points[1][0]).toBeCloseTo(100);
   expect(e[0].paths[0].points[1][1]).toBeCloseTo(120);
 });
 it('TC-OUT-GEO1: monotone chain includes extremes and rejects collinear/degenerate input',()=>{
   expect(convexHull([[0,0],[2,0],[2,2],[0,2],[1,1],[0,0]])).toEqual([[0,0],[2,0],[2,2],[0,2]]);
   expect(()=>convexHull([[0,0],[1,1],[2,2]])).toThrow(/공선/);
   expect(()=>convexHull([[1,2],[1,2]])).toThrow(/3개/);
 });
 it('TC-OUT-GEO1: circle curves sampled and unsupported OCS/bulge are not silently approximated',()=>{
   const circle=['0','CIRCLE','5','EF','8','0','10','10','20','20','40','5'].join('\n');
   const bad=['0','CIRCLE','5','F0','8','0','10','10','20','20','40','5','210','1','230','0'].join('\n');
   const index=parseDxfOutlineIndex(dxf(circle+'\n'+bad),id,sha);
   expect(index.entities).toHaveLength(1);
   expect(index.entities[0].paths[0].closed).toBe(true);
   expect(index.entities[0].paths[0].points.length).toBeGreaterThan(24);
   expect(index.warnings.join(' ')).toMatch(/OCS/);
 });
 it('TC-OUT-GEO2: retains concavity of L shape (not its convex hull)',()=>{
   const L=poly('AA',[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]]);
   const entity=parseDxfOutlineIndex(dxf(L),id,sha).entities;
   expect(area(computeOutline('PRECISE',entity).geometry)).toBeCloseTo(7);
   expect(area(computeOutline('CONVEX',entity).geometry)).toBeCloseTo(11.5);
 });
 it('TC-OUT-GEO2: overlapping closed shapes union, disjoint shapes MultiPolygon',()=>{
   const a=poly('1A',[[0,0],[4,0],[4,4],[0,4]]);
   const b=poly('1B',[[2,0],[6,0],[6,4],[2,4]]);
   const c=poly('1C',[[8,0],[10,0],[10,2],[8,2]]);
   const idx=parseDxfOutlineIndex(dxf([a,b,c].join('\n')),id,sha).entities;
   const overlap=computeOutline('PRECISE',idx.slice(0,2));
   expect(area(overlap.geometry)).toBeCloseTo(24);
   const multi=computeOutline('PRECISE',idx);
   expect(multi.geometry.type).toBe('MultiPolygon');
   expect(area(multi.geometry)).toBeCloseTo(28);
 });
 it('TC-OUT-GEO2: crossing an L-shaped concavity is overlap, not a hole',()=>{
   const outer=poly('AC',[[0,0],[5,0],[5,1],[1,1],[1,5],[0,5]]);
   const overlap=poly('AD',[[0.5,0.5],[3,0.5],[0.5,3]]);
   const selected=parseDxfOutlineIndex(dxf(outer+'\n'+overlap),id,sha).entities;
   // Original L shape has area 9. Crossing triangle adds area beyond the notch.
   // Misclassification as an interior hole would give an area less than 9.
   expect(area(computeOutline('PRECISE',selected).geometry)).toBeGreaterThan(9);
 });
 it('TC-OUT-GEO2: nested closed contours preserve an interior hole',()=>{
   const outer=poly('1A',[[0,0],[10,0],[10,10],[0,10]]);
   const inner=poly('1B',[[2,2],[8,2],[8,8],[2,8]]);
   const output=computeOutline('PRECISE',parseDxfOutlineIndex(dxf(outer+'\n'+inner),id,sha).entities);
   expect(output.geometry.type).toBe('Polygon');
   expect(area(output.geometry)).toBeCloseTo(64);
   if(output.geometry.type==='Polygon')expect(output.geometry.coordinates).toHaveLength(2);
 });
 it('TC-OUT-GEO2: joins truly connected LINE segments but never fills open chains',()=>{
   const rectangle=[line('1',0,0,2,0),line('2',2,0,2,1),line('3',2,1,0,1),line('4',0,1,0,0)];
   const idx=parseDxfOutlineIndex(dxf(rectangle.join('\n')),id,sha).entities;
   expect(area(computeOutline('PRECISE',idx).geometry)).toBeCloseTo(2);
   expect(()=>computeOutline('PRECISE',idx.slice(0,3))).toThrow(/폐곡선/);
 });
 it('TC-OUT-GEO2: rejects self-crossing polygon without yielding invented area',()=>{
   const crossing=poly('A',[[0,0],[4,4],[0,4],[4,0]]);
   const entities=parseDxfOutlineIndex(dxf(crossing),id,sha).entities;
   expect(()=>computeOutline('PRECISE',entities)).toThrow(/폐곡선/);
 });
});
