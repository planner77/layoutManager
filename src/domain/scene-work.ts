/** Session-only DXF_IMPORTED changes. The immutable Scene asset is never edited. */
import {canvasObjectRef,sameCanvasScope,type CanvasObjectRef} from './canvas-object-selection';
import {validSceneRef,type CadSceneObjectRef,type SceneScope} from './cad-scene';
import {composeAffine,IDENTITY_2D,type Affine2D} from './generated-document';

export type SceneWorkCommand =
  | Readonly<{type:'Translate';ids:readonly string[];dx:number;dy:number}>
  | Readonly<{type:'Rotate';ids:readonly string[];angleDegrees:number;pivot:readonly [number,number]}>
  | Readonly<{type:'Visibility';ids:readonly string[];visible:boolean}>;
export type SceneWorkObject=Readonly<{ref:CanvasObjectRef;sceneRef:CadSceneObjectRef;visible:boolean;transform:Affine2D}>;
export type SceneWorkState=Readonly<{objects:readonly SceneWorkObject[];undo:number;redo:number;limit:number}>;
type Delta=Readonly<{visible:boolean;transform:Affine2D}>;
type Patch=Readonly<{id:string;before:Delta;after:Delta}>;
const LIMIT=100,MAX=1e12;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=MAX;
const identity=():Delta=>({visible:true,transform:IDENTITY_2D});

export class SceneWorkDocument {
  private readonly refs=new Map<string,CadSceneObjectRef>();
  private readonly deltas=new Map<string,Delta>();
  private undoStack:Patch[][]=[];
  private redoStack:Patch[][]=[];
  private disposed=false;
  constructor(readonly scope:SceneScope,refs:readonly CadSceneObjectRef[]){
    for(const ref of refs){
      if(!validSceneRef(ref,scope)||ref.origin!=='DXF_IMPORTED'||this.refs.has(ref.id))
        throw new Error('검증되지 않았거나 중복된 Scene 객체입니다.');
      this.refs.set(ref.id,Object.freeze({...ref}));
    }
  }
  private live(){if(this.disposed)throw new Error('종료된 Scene 작업입니다.');}
  getState():SceneWorkState{
    this.live();
    return Object.freeze({objects:Object.freeze([...this.refs.values()].map(sceneRef=>Object.freeze({
      ref:Object.freeze(canvasObjectRef('RENDER',sceneRef.id,this.scope)),sceneRef,
      ...(this.deltas.get(sceneRef.id)??identity()),
    }))),undo:this.undoStack.length,redo:this.redoStack.length,limit:LIMIT});
  }
  get(id:string):Delta{this.live();return this.deltas.get(id)??identity();}
  execute(command:SceneWorkCommand,selection:readonly CanvasObjectRef[]):void{
    this.live();
    if(!Array.isArray(command?.ids)||!command.ids.length||command.ids.length>this.refs.size||
       new Set(command.ids).size!==command.ids.length||command.ids.some(id=>!this.refs.has(id)))
      throw new Error('Scene 작업 대상이 올바르지 않습니다.');
    const restoring=command.type==='Visibility'&&command.visible===true;
    if(!restoring){
      if(selection.length!==command.ids.length||selection.some(ref=>ref.origin!=='RENDER'||
         !sameCanvasScope(ref,this.scope))||
         command.ids.some(id=>!selection.some(ref=>ref.id===id)))
        throw new Error('Scene 작업에는 현재 선택된 렌더 객체만 사용할 수 있습니다.');
    }
    let operation:Affine2D=IDENTITY_2D;
    if(command.type==='Translate'){
      if(!finite(command.dx)||!finite(command.dy))throw new Error('WCS 이동값이 유효하지 않습니다.');
      operation=[1,0,0,1,command.dx,command.dy];
    }else if(command.type==='Rotate'){
      if(!finite(command.angleDegrees)||Math.abs(command.angleDegrees)>360000||
         !Array.isArray(command.pivot)||command.pivot.length!==2||!command.pivot.every(finite))
        throw new Error('WCS 회전값이 유효하지 않습니다.');
      const theta=command.angleDegrees*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),[x,y]=command.pivot;
      operation=[c,s,-s,c,x-x*c+y*s,y-x*s-y*c];
    }else if(command.type==='Visibility'){
      if(typeof command.visible!=='boolean')throw new Error('표시 여부가 유효하지 않습니다.');
    }else throw new Error('지원하지 않는 Scene 작업입니다.');
    const patches=command.ids.map(id=>{
      const before=this.get(id);
      if(!before.visible&&!restoring)throw new Error('숨겨진 객체는 먼저 복원해야 합니다.');
      const transform=command.type==='Visibility'?before.transform:composeAffine(operation,before.transform);
      if(!transform.every(finite))throw new Error('Scene 작업 결과가 WCS 범위를 벗어났습니다.');
      const after:Delta=Object.freeze({visible:command.type==='Visibility'?command.visible:before.visible,transform});
      return {id,before,after};
    });
    for(const patch of patches)this.deltas.set(patch.id,patch.after);
    this.undoStack.push(patches);if(this.undoStack.length>LIMIT)this.undoStack.shift();this.redoStack=[];
  }
  undo():boolean{this.live();const patches=this.undoStack.pop();if(!patches)return false;
    for(const patch of patches)this.deltas.set(patch.id,patch.before);this.redoStack.push(patches);return true;}
  redo():boolean{this.live();const patches=this.redoStack.pop();if(!patches)return false;
    for(const patch of patches)this.deltas.set(patch.id,patch.after);this.undoStack.push(patches);return true;}
  /** S6-A: reset ONLY session DXF_IMPORTED deltas, never immutable Scene bytes. */
  reset():void{this.live();this.deltas.clear();this.undoStack=[];this.redoStack=[];}
  dispose(){this.disposed=true;this.refs.clear();this.deltas.clear();this.undoStack=[];this.redoStack=[];}
}
