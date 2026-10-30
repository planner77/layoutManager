/** #98/#83: untrusted browser geometry/DTO boundary. Never classify provenance from derivedFrom. */
import { CadError } from '@/domain/cad';
import { assertMemoWcsXY, normalizeMemoText } from '@/domain/cad-memo';
import { applyAffine, composeAffine, type Affine2D } from '@/domain/generated-document';
import type { GeoJSONOutline } from '@/viewers/core/outline-compute';
export const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SHA=/^[a-f0-9]{64}$/i;
function invalid(code='BUSINESS_INVALID',status=422):never {throw new CadError(code,'유효하지 않은 업무 데이터입니다.',status);}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function keys(raw:unknown, required:string[], optional:string[]=[]):Record<string,unknown>{
 if(!object(raw)||required.some(k=>!Object.hasOwn(raw,k))||
    Object.keys(raw).some(k=>!required.includes(k)&&!optional.includes(k)))invalid('BUSINESS_INPUT_INVALID',400);
 return raw;
}
export function sourceSha(raw:unknown):string{
 if(typeof raw!=='string'||!SHA.test(raw))invalid('BUSINESS_SHA_INVALID');
 return raw.toLowerCase();
}
export function revision(raw:unknown):number{
 if(typeof raw!=='number'||!Number.isSafeInteger(raw)||raw<0)invalid('BUSINESS_REVISION_INVALID');
 return raw;
}
export function point(raw:unknown):{x:number;y:number}{
 if(!object(raw)||Object.keys(raw).sort().join(',')!=='x,y')invalid();
 try {return assertMemoWcsXY(raw as {x:number;y:number});} catch {return invalid('BUSINESS_COORDINATE_INVALID');}
}
export function name(raw:unknown):string{
 if(typeof raw!=='string')invalid();
 const x=raw.normalize('NFC').trim();
 if(x.length<1||x.length>100||/[\x00-\x1f\x7f]/.test(x))invalid('BUSINESS_NAME_INVALID');
 return x;
}
export function memoText(title:unknown,content:unknown):{title:string;content:string}{
 try{return normalizeMemoText(title as string,content as string);}
 catch{return invalid('BUSINESS_MEMO_TEXT_INVALID');}
}
export function geometry(raw:unknown):GeoJSONOutline{
 if(!object(raw)||(raw.type!=='Polygon'&&raw.type!=='MultiPolygon')||
    Object.keys(raw).sort().join(',')!=='coordinates,type'||!Array.isArray(raw.coordinates))invalid('OUTLINE_GEOMETRY_INVALID');
 const polys=raw.type==='Polygon'?[raw.coordinates]:raw.coordinates;
 if(polys.length<1||polys.length>64)invalid('OUTLINE_GEOMETRY_LIMIT',413);
 let vertices=0,ringCount=0;
 const result=polys.map(polygon=>{
  if(!Array.isArray(polygon)||polygon.length<1)invalid('OUTLINE_GEOMETRY_INVALID');
  const rings=polygon.map(ring=>{
   if(!Array.isArray(ring)||ring.length<4||++ringCount>128)invalid('OUTLINE_GEOMETRY_LIMIT',413);
   vertices+=ring.length;if(vertices>4000)invalid('OUTLINE_GEOMETRY_LIMIT',413);
   const points=ring.map(v=>{
    if(!Array.isArray(v)||v.length!==2||v.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e12))
     invalid('OUTLINE_GEOMETRY_INVALID');
    return [v[0],v[1]] as [number,number];
   });
   const first=points[0],last=points[points.length-1];
   if(Math.hypot(first[0]-last[0],first[1]-last[1])>1e-8)invalid('OUTLINE_GEOMETRY_INVALID');
   const [ox,oy]=first;
   let twice=0;
   for(let i=1;i<points.length-2;i++)twice+=(points[i][0]-ox)*(points[i+1][1]-oy)-(points[i][1]-oy)*(points[i+1][0]-ox);
   if(!Number.isFinite(twice)||Math.abs(twice)<1e-12)invalid('OUTLINE_GEOMETRY_INVALID');
   return {points,twice};
  });
  const orientation=Math.sign(rings[0].twice);
  for(let i=1;i<rings.length;i++)if(Math.sign(rings[i].twice)===orientation)invalid('OUTLINE_HOLE_ORIENTATION_INVALID');
  return rings.map(r=>r.points);
 });
 return raw.type==='Polygon'?{type:'Polygon',coordinates:result[0]}:{type:'MultiPolygon',coordinates:result};
}
export type Operation={type:'Translate';dx:number;dy:number}|{type:'Rotate';angleDegrees:number;pivot:[number,number]};
export function operations(input:unknown):Operation[]{
 if(!Array.isArray(input)||input.length>64)invalid('OUTLINE_TRANSFORM_INVALID');
 return input.map(raw=>{
  if(!object(raw))invalid('OUTLINE_TRANSFORM_INVALID');
  if(raw.type==='Translate'){
   keys(raw,['type','dx','dy']);
   if(![raw.dx,raw.dy].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e12))invalid('OUTLINE_TRANSFORM_INVALID');
   return {type:'Translate',dx:raw.dx as number,dy:raw.dy as number};
  }
  if(raw.type==='Rotate'){
   keys(raw,['type','angleDegrees','pivot']);
   if(typeof raw.angleDegrees!=='number'||!Number.isFinite(raw.angleDegrees)||
      Math.abs(raw.angleDegrees)>360000||!Array.isArray(raw.pivot)||raw.pivot.length!==2||
      raw.pivot.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1e12))invalid('OUTLINE_TRANSFORM_INVALID');
   return {type:'Rotate',angleDegrees:raw.angleDegrees,pivot:raw.pivot as [number,number]};
  }
  return invalid('OUTLINE_TRANSFORM_UNSUPPORTED');
 });
}
export function transformed(base:GeoJSONOutline,ops:Operation[]):{geometry:GeoJSONOutline;transform:Affine2D}{
 let matrix:Affine2D=[1,0,0,1,0,0];
 for(const op of ops){
  let next:Affine2D;
  if(op.type==='Translate')next=[1,0,0,1,op.dx,op.dy];
  else{
   const r=op.angleDegrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
   const [x,y]=op.pivot;
   next=[c,s,-s,c,x-x*c+y*s,y-x*s-y*c];
  }
  matrix=composeAffine(next,matrix);
 }
 try{return {geometry:geometry(applyAffine(base,matrix)),transform:matrix};}
 catch{return invalid('OUTLINE_TRANSFORM_INVALID');}
}
export function provenance(input:unknown):string[]{
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>256)invalid('OUTLINE_DERIVATION_INVALID');
 const values=input.map(v=>{if(typeof v!=='string'||v.length>128||!v.length)invalid('OUTLINE_DERIVATION_INVALID');return v as string;});
 if(new Set(values).size!==values.length)invalid('OUTLINE_DERIVATION_INVALID');
 return values;
}
