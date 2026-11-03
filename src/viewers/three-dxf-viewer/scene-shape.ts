import * as THREE from 'three';
import {validateShapeDtos,type CurveDto,type PathDto,type ShapeDto} from '../../domain/scene-shape';

function point(v:THREE.Vector2):[number,number]{return [v.x,v.y];}
function curve(c:THREE.Curve<THREE.Vector2>):CurveDto{
 // three-dxf-viewer bundles a minified Three copy; constructor names and
 // instanceof are not portable. The closed DTO validator checks all fields.
 if(c.type==='LineCurve'){const x=c as THREE.LineCurve;return {type:'LineCurve',v1:point(x.v1),v2:point(x.v2)};}
 if(c.type==='QuadraticBezierCurve'){const x=c as THREE.QuadraticBezierCurve;return {type:'QuadraticBezierCurve',v0:point(x.v0),v1:point(x.v1),v2:point(x.v2)};}
 if(c.type==='CubicBezierCurve'){const x=c as THREE.CubicBezierCurve;return {type:'CubicBezierCurve',v0:point(x.v0),v1:point(x.v1),v2:point(x.v2),v3:point(x.v3)};}
 throw new Error('CUSTOM_CURVE_UNSUPPORTED');
}
function path(p:THREE.Path):PathDto{
 if(!['Path','Shape'].includes(p.type)||!Array.isArray(p.curves))throw new Error('CUSTOM_PATH_UNSUPPORTED');
 return {autoClose:p.autoClose,currentPoint:point(p.currentPoint),curves:p.curves.map(curve)};
}
export function writeShapeGeometry(g:THREE.ShapeGeometry):{shapes:ShapeDto[];curveSegments:number}{
 if(g.type!=='ShapeGeometry'||!g.parameters?.shapes)throw new Error('CUSTOM_SHAPE_UNSUPPORTED');
 const source=Array.isArray(g.parameters.shapes)?g.parameters.shapes:[g.parameters.shapes];
 const shapes=source.map(s=>{if(s.type!=='Shape'||!Array.isArray(s.holes))throw new Error('CUSTOM_SHAPE_UNSUPPORTED');
  return {...path(s),holes:s.holes.map(path)};});
 const result={shapes,curveSegments:g.parameters.curveSegments??12};
 validateShapeDtos(result.shapes,result.curveSegments,{scalars:0});
 return result;
}
function readPath(dto:PathDto,p:THREE.Path){
 p.autoClose=dto.autoClose;p.currentPoint.set(...dto.currentPoint);
 for(const c of dto.curves){
  const vec=(x:[number,number])=>new THREE.Vector2(...x);
  switch(c.type){
   case 'LineCurve':p.add(new THREE.LineCurve(vec(c.v1),vec(c.v2)));break;
   case 'QuadraticBezierCurve':p.add(new THREE.QuadraticBezierCurve(vec(c.v0),vec(c.v1),vec(c.v2)));break;
   case 'CubicBezierCurve':p.add(new THREE.CubicBezierCurve(vec(c.v0),vec(c.v1),vec(c.v2),vec(c.v3)));break;
  }
 }
}
export function readShapeGeometry(shapes:ShapeDto[],segments:number):THREE.ShapeGeometry{
 validateShapeDtos(shapes,segments,{scalars:0});
 const created=shapes.map(dto=>{const shape=new THREE.Shape();readPath(dto,shape);
  for(const hole of dto.holes){const p=new THREE.Path();readPath(hole,p);shape.holes.push(p);}return shape;});
 return new THREE.ShapeGeometry(created,segments);
}
