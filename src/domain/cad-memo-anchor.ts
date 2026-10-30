/** #84 Memo M3 WCS binding; no implicit Source/Generated rebinding. */
import type {Affine2D} from './generated-document';
export type AnchorOrigin='APP_CREATED'|'DXF_IMPORTED';
export type MemoAnchorState=Readonly<{
 mode:'FREE'|'ATTACHED'|'BROKEN_ANCHOR';
 targetRef?:Readonly<{origin:AnchorOrigin;id:string}>;
 localAnchorWcsXY?:Readonly<{x:number;y:number}>;
}>;
export const LIMIT=1e12;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=LIMIT;
export function xy(x:unknown,y:unknown):{x:number;y:number}{
 if(!finite(x)||!finite(y))throw new Error('앵커 WCS 범위가 잘못되었습니다.');
 return {x,y};
}
export function projectAffine(m:Affine2D,p:{x:number;y:number}):{x:number;y:number}{
 const [a,b,c,d,e,f]=m;
 return xy(a*p.x+c*p.y+e,b*p.x+d*p.y+f);
}
export function invertAffine(m:Affine2D,p:{x:number;y:number}):{x:number;y:number}{
 const [a,b,c,d,e,f]=m,det=a*d-b*c;
 if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw new Error('비가역 WCS 변환입니다.');
 return xy((d*(p.x-e)-c*(p.y-f))/det,(-b*(p.x-e)+a*(p.y-f))/det);
}
export function resolveMemoAnchor(local:{x:number;y:number},transform:Affine2D){
 return projectAffine(transform,xy(local.x,local.y));
}
