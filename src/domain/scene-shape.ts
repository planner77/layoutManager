/** Closed, bounded 2D ShapeGeometry constructor contract. */
export type Point2 = [number,number];
export type CurveDto =
  | {type:'LineCurve';v1:Point2;v2:Point2}
  | {type:'QuadraticBezierCurve';v0:Point2;v1:Point2;v2:Point2}
  | {type:'CubicBezierCurve';v0:Point2;v1:Point2;v2:Point2;v3:Point2};
export type PathDto = {autoClose:boolean;currentPoint:Point2;curves:CurveDto[]};
export type ShapeDto = PathDto & {holes:PathDto[]};
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).length===allowed.length&&Object.keys(v).every(k=>allowed.includes(k));
const point=(v:unknown):v is Point2=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e12);
export function validateShapeDtos(value:unknown,segments:unknown,budget:{scalars:number}):asserts value is ShapeDto[]{
 if(!Number.isSafeInteger(segments)||Number(segments)<1||Number(segments)>256||!Array.isArray(value)||!value.length||value.length>1024)throw new Error('SCENE_SHAPE_INVALID');
 let curves=0,paths=0;
 const path=(v:unknown,shape:boolean)=>{
  if(!rec(v)||!keys(v,shape?['autoClose','currentPoint','curves','holes']:['autoClose','currentPoint','curves'])||
    typeof v.autoClose!=='boolean'||!point(v.currentPoint)||!Array.isArray(v.curves)||v.curves.length>100_000)throw new Error('SCENE_SHAPE_INVALID');
  paths++;budget.scalars+=2;
  for(const c of v.curves){
   if(!rec(c))throw new Error('SCENE_CURVE_INVALID');
   const fields=c.type==='LineCurve'?['type','v1','v2']:c.type==='QuadraticBezierCurve'?['type','v0','v1','v2']:
     c.type==='CubicBezierCurve'?['type','v0','v1','v2','v3']:[];
   if(!fields.length||!keys(c,fields)||fields.slice(1).some(k=>!point(c[k])))throw new Error('SCENE_CURVE_INVALID');
   curves++;budget.scalars+=2*(fields.length-1);
   if(curves>100_000||budget.scalars>2_000_000)throw new Error('SCENE_SHAPE_LIMIT');
  }
  if(shape){if(!Array.isArray(v.holes)||v.holes.length>10_000)throw new Error('SCENE_SHAPE_INVALID');v.holes.forEach(h=>path(h,false));}
  if(paths>100_000||curves*Number(segments)*6>2_000_000||budget.scalars+curves*Number(segments)*6>2_000_000)throw new Error('SCENE_SHAPE_LIMIT');
 };
 value.forEach(s=>path(s,true));
 budget.scalars+=curves*Number(segments)*6;
 if(budget.scalars>2_000_000)throw new Error('SCENE_SHAPE_LIMIT');
}
