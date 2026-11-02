import {assertMemoWcsXY,type MemoWcsXY} from './cad-memo';
import type {MemoSnapCandidateSet,MemoSnapChoice} from './memo-session-snap';
export type MemoMoveBehavior='SNAP'|'KEEP'|'DETACH';

/** A scoped browser choice, never server anchor authority. */
export type MemoSnapIntent=Readonly<{
  context:string;epoch:number;actorId:string|null;requested:MemoWcsXY;
  choices:MemoSnapCandidateSet;selected:MemoSnapChoice|null;
}>;
const copy=(choice:MemoSnapChoice):MemoSnapChoice=>({...choice,ref:{...choice.ref},
  world:{...choice.world},transform:[...choice.transform]});
export function makeMemoSnapIntent(context:string,epoch:number,requested:MemoWcsXY,
  choices:MemoSnapCandidateSet,actorId:string|null=null):MemoSnapIntent{
  const snapshot={...choices,candidates:choices.candidates.map(copy)};
  return {context,epoch,actorId,requested:{...assertMemoWcsXY(requested)},choices:snapshot,
    selected:snapshot.candidates[0]??null};
}
export function chooseMemoSnap(intent:MemoSnapIntent,key:string|null):MemoSnapIntent{
  const selected=key===null?null:intent.choices.candidates.find(choice=>choice.key===key);
  if(selected===undefined)throw new Error('스냅 후보를 다시 조회하세요.');
  return {...intent,selected};
}
export function memoSnapIntentPoint(intent:MemoSnapIntent):MemoWcsXY{
  return {...(intent.selected?.world??intent.requested)};
}
export function resolveMemoSnapIntent(intent:MemoSnapIntent,context:string,epoch:number,
  live:MemoSnapCandidateSet,actorId:string|null=null):{world:MemoWcsXY;snap:MemoSnapChoice|null}{
  const stale=()=>new Error('계정·도면·카메라·스냅 대상이 변경됐습니다. 후보를 다시 조회하고 선택하세요.');
  if(intent.context!==context||intent.epoch!==epoch||intent.actorId!==actorId)throw stale();
  if(!intent.selected)return {world:{...intent.requested},snap:null};
  const selected=intent.selected,current=live.candidates.find(choice=>choice.key===selected.key);
  if(!current||current.pointIndex!==selected.pointIndex||current.kind!==selected.kind||
    current.ref.id!==selected.ref.id||current.ref.origin!==selected.ref.origin||
    current.ref.versionId!==selected.ref.versionId||current.ref.sourceSha256!==selected.ref.sourceSha256||
    current.world.x!==selected.world.x||current.world.y!==selected.world.y||
    current.transform.some((value,index)=>value!==selected.transform[index]))throw stale();
  return {world:{...current.world},snap:copy(current)};
}
