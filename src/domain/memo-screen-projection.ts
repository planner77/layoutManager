/** #186: Pure, bounded Canvas projection of Memo pins and the pending anchor.
 * Project once for all visible pins, using one camera/viewport snapshot.
 * A preview substitutes only its memo, leaving persisted WCS untouched.
 */
import type {MemoDraft,MemoWcsXY} from './cad-memo';
export type ScreenXY=Readonly<{x:number;y:number}>;
type SourceMemo=Pick<MemoDraft,'id'|'anchorWcsXY'>;
type ScreenProjection=Readonly<{
 positions:Record<string,ScreenXY>;candidate:ScreenXY|null;
}>;
export function sameScreenPoint(a:ScreenXY|null,b:ScreenXY|null):boolean{
 return a===b||!!a&&!!b&&a.x===b.x&&a.y===b.y;
}
export function sameScreenPositions(a:Readonly<Record<string,ScreenXY>>,
 b:Readonly<Record<string,ScreenXY>>):boolean{
 if(a===b)return true;
 const ids=Object.keys(a);
 return ids.length===Object.keys(b).length &&
  ids.every(id=>Object.hasOwn(b,id)&&a[id].x===b[id].x&&a[id].y===b[id].y);
}
export function projectMemoPins(memos:readonly SourceMemo[],
 preview:{id:string;point:MemoWcsXY}|null,candidate:MemoWcsXY|null,
 viewport:{width:number;height:number},
 project:(points:readonly MemoWcsXY[])=>readonly (ScreenXY|null)[]):ScreenProjection{
 // All Memo paths are already limited to 100 records by MemoSession/server.
 const worlds=memos.map(m=>preview?.id===m.id?preview.point:m.anchorWcsXY);
 if(candidate)worlds.push(candidate);
 const projected=project(worlds);
 const inside=(p:ScreenXY|null|undefined):p is ScreenXY=>!!p&&
  Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&
  p.x<=viewport.width&&p.y<=viewport.height;
 const positions:Record<string,ScreenXY>={};
 for(let i=0;i<memos.length;i++)if(inside(projected[i]))
  positions[memos[i].id]=projected[i]!;
 const pending=candidate?projected[memos.length]:null;
 return {positions,candidate:inside(pending)?pending!:null};
}
