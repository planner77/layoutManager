/**
 * Issue #52 (E2): ephemeral, single-source GeneratedDocument in DXF WCS XY.
 * No DXF writes, persistence, server API or preview/source geometry mutation.
 * Immutable base geometry and structurally shared history keep 100 undo steps
 * bounded without copying 100k vertices for each transform.
 */
import {
  canvasEditCapability,canvasObjectRef,sameCanvasScope,validCanvasScope,
  type CanvasObjectRef,type CanvasObjectScope,
} from './canvas-object-selection';
import type {OutlineResult,GeoJSONOutline} from '../viewers/core/outline-compute';
import {createSceneRef,sceneScope,type CadSceneObjectRef} from './cad-scene';
import type {OutlineKind,XY} from '../viewers/core/outline-geometry';

export const GENERATED_HISTORY_LIMIT=100;
export const GENERATED_HISTORY_BYTES=16*1024*1024;
export const GENERATED_OBJECT_LIMIT=100;
export const GENERATED_VERTEX_LIMIT=100_000;
export type Affine2D=readonly [number,number,number,number,number,number];
export const IDENTITY_2D:Affine2D=Object.freeze([1,0,0,1,0,0]) as unknown as Affine2D;
export type GeneratedCommand =
  | Readonly<{type:'Delete';ids:readonly string[]}>
  | Readonly<{type:'Translate';ids:readonly string[];dx:number;dy:number}>
  | Readonly<{type:'Rotate';ids:readonly string[];angleDegrees:number;pivot:readonly [number,number]}>;
export type GeneratedRigidOperation =
 | Readonly<{type:'Translate';dx:number;dy:number}>
 | Readonly<{type:'Rotate';angleDegrees:number;pivot:readonly [number,number]}>;
export type GeneratedEntry=Readonly<{
  ref:CanvasObjectRef;
  sceneRef:CadSceneObjectRef;
  savedOutlineId:string;
  createdAt:string;
  editedAt:string|null;
  name:string;
  outlineTypeId:string|null;
  outlineTypeName:string|null;
  kind:OutlineKind;
  baseResult:Readonly<OutlineResult>;
  baseGeometry:GeoJSONOutline;
  transform:Affine2D;
  transformOperations:readonly GeneratedRigidOperation[];
  visible:boolean;
  edited:boolean;
  dirty:boolean;
}>;
/** Sanitized import only: callers must parse untrusted JSON before replace(). */
export type GeneratedRestoreEntry=Readonly<{
 id:string;savedOutlineId:string;createdAt:string;editedAt:string|null;
 name:string;outlineTypeId:string|null;outlineTypeName:string|null;
 baseResult:OutlineResult;transform:Affine2D;
 transformOperations:readonly GeneratedRigidOperation[];
 visible:boolean;edited:boolean;
}>;
type Patch=Readonly<{id:string;index:number;before:GeneratedEntry;after?:GeneratedEntry}>;
type History=Readonly<{type:GeneratedCommand['type'];patches:readonly Patch[];bytes:number}>;
type Pending=Readonly<{command:GeneratedCommand;selection:readonly CanvasObjectRef[]}>;
export type GeneratedDocumentEvent=Readonly<{type:'append'|'change'|'visibility'|'clear'|'undo'|'redo'}>;

const MAX_WCS=1e12;
const MAX_TRANSLATE=1e12;
const MAX_DEGREES=360_000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function finiteCoordinate(n:unknown):n is number{
  return typeof n==='number' && Number.isFinite(n) && Math.abs(n)<=MAX_WCS;
}
function cloneGeometry(geometry:GeoJSONOutline):GeoJSONOutline{
  if(geometry?.type!=='Polygon'&&geometry?.type!=='MultiPolygon')
    throw new Error('Polygon/MultiPolygon geometry만 편집할 수 있습니다.');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  if(!Array.isArray(polygons)||polygons.length===0)throw new Error('빈 Polygon은 사용할 수 없습니다.');
  let count=0;
  const cloned=polygons.map(polygon=>{
    if(!Array.isArray(polygon)||!polygon.length)throw new Error('빈 Ring 모음입니다.');
    const rings=polygon.map(ring=>{
      if(!Array.isArray(ring)||ring.length<4)throw new Error('닫힌 Ring 꼭짓점이 부족합니다.');
      count+=ring.length;
      if(count>GENERATED_VERTEX_LIMIT)throw new Error('생성 개체 꼭짓점 상한을 초과했습니다.');
      const vertices=ring.map(vertex=>{
        if(!Array.isArray(vertex)||vertex.length!==2 ||
            !finiteCoordinate(vertex[0])||!finiteCoordinate(vertex[1]))
          throw new Error('유효하지 않은 WCS 좌표입니다.');
        return Object.freeze([vertex[0],vertex[1]]) as unknown as XY;
      });
      if(Math.hypot(vertices[0][0]-vertices[vertices.length-1][0],
                    vertices[0][1]-vertices[vertices.length-1][1])>1e-8)
        throw new Error('닫히지 않은 Ring입니다.');
      // Relative coordinates avoid catastrophic cancellation at distant WCS origins.
      const [originX,originY]=vertices[0];
      let area=0;
      for(let i=1;i<vertices.length-2;i++){
        const a=vertices[i],b=vertices[i+1];
        area+=(a[0]-originX)*(b[1]-originY)-
          (a[1]-originY)*(b[0]-originX);
      }
      if(!Number.isFinite(area)||Math.abs(area)<1e-15)
        throw new Error('면적이 없는 Ring입니다.');
      return Object.freeze(vertices) as unknown as XY[];
    });
    return Object.freeze(rings) as unknown as XY[][];
  });
  return Object.freeze(geometry.type==='Polygon'
    ? {type:'Polygon' as const,coordinates:cloned[0]}
    : {type:'MultiPolygon' as const,coordinates:Object.freeze(cloned) as unknown as XY[][][]});
}
/** Same WCS, closure, area and vertex validations for local import and commands. */
export function validatedGeneratedGeometry(geometry:GeoJSONOutline):GeoJSONOutline{
 return cloneGeometry(geometry);
}
function pointsCount(g:GeoJSONOutline):number{
  const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  return polys.reduce((n,poly)=>n+poly.reduce((m,ring)=>m+ring.length,0),0);
}
function freezeResult(result:OutlineResult):Readonly<OutlineResult>{
  if(result.kind!=='CONVEX'&&result.kind!=='PRECISE')throw new Error('지원하지 않는 외곽선 종류입니다.');
  if(typeof result.algorithm!=='string'||!result.algorithm ||
    !Number.isFinite(result.tolerance)||result.tolerance<=0 ||
    !Array.isArray(result.sourceEntityIds)||
    (result.geometryBasis==='RENDER_WCS_2D' ?
      result.persistable!==false || result.sourceEntityIds.length!==0 ||
      (result.derivedFrom!==undefined&&(!Array.isArray(result.derivedFrom)||result.derivedFrom.some(id=>typeof id!=='string'||!id))) :
      !result.sourceEntityIds.length)||
    !result.sourceEntityIds.every(id=>typeof id==='string'&&id.length>0))
      throw new Error('생성 근거가 유효하지 않습니다.');
  const geometry=cloneGeometry(result.geometry);
  return Object.freeze({...result,geometry,
    sourceEntityIds:Object.freeze([...result.sourceEntityIds]) as unknown as string[],
    ...(result.derivedFrom?{derivedFrom:Object.freeze([...result.derivedFrom]) as unknown as string[]}:{}),
    warnings:Object.freeze([...result.warnings]) as unknown as string[]});
}
/** x'=a*x+c*y+e, y'=b*x+d*y+f. left multiplication for WCS operations. */
export function composeAffine(left:Affine2D,right:Affine2D):Affine2D{
  const [a,b,c,d,e,f]=left,[g,h,i,j,k,l]=right;
  return Object.freeze([a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,
    a*k+c*l+e,b*k+d*l+f]) as unknown as Affine2D;
}
/** WCS XY CCW: translation and rotation are the ONLY supported edit operations. */
export function generatedRigidMatrix(operation:GeneratedRigidOperation):Affine2D{
 if(operation.type==='Translate'){
   if(!finiteCoordinate(operation.dx)||!finiteCoordinate(operation.dy))
     throw new Error('변환 이동량이 유효하지 않습니다.');
   return [1,0,0,1,operation.dx,operation.dy];
 }
 if(operation.type!=='Rotate'||!Number.isFinite(operation.angleDegrees)||
    Math.abs(operation.angleDegrees)>MAX_DEGREES||
    !Array.isArray(operation.pivot)||operation.pivot.length!==2||
    !operation.pivot.every(finiteCoordinate))
   throw new Error('변환 회전 각도/중심점이 유효하지 않습니다.');
 const radians=operation.angleDegrees*Math.PI/180;
 const cos=Math.cos(radians),sin=Math.sin(radians);
 const [px,py]=operation.pivot;
 return [cos,sin,-sin,cos,px-px*cos+py*sin,py-px*sin-py*cos];
}
export function applyAffine(geometry:GeoJSONOutline,matrix:Affine2D):GeoJSONOutline{
  const vertex=([x,y]:XY):XY=>{
    const p:[number,number]=[
      matrix[0]*x+matrix[2]*y+matrix[4],
      matrix[1]*x+matrix[3]*y+matrix[5],
    ];
    if(!finiteCoordinate(p[0])||!finiteCoordinate(p[1]))
      throw new Error('변환 결과 WCS 좌표가 유효 범위를 벗어났습니다.');
    return p;
  };
  if(geometry.type==='Polygon')
    return {type:'Polygon',coordinates:geometry.coordinates.map(r=>r.map(vertex))};
  return {type:'MultiPolygon',coordinates:geometry.coordinates.map(p=>p.map(r=>r.map(vertex)))};
}
export function generatedResult(entry:GeneratedEntry):OutlineResult{
  return {...entry.baseResult,geometry:applyAffine(entry.baseGeometry,entry.transform),
    sourceEntityIds:[...entry.baseResult.sourceEntityIds],warnings:[...entry.baseResult.warnings]};
}

export class GeneratedDocument{
  private objects:readonly GeneratedEntry[]=[];
  private undoEntries:History[]=[];
  private redoEntries:History[]=[];
  private pending:Pending|null=null;
  private disposed=false;
  private issued=new Set<string>();
  private sourceUnit='UNSPECIFIED';
  setSourceUnit(unit:string){
    this.assertLive();
    if(this.objects.length||this.issued.size)throw new Error('생성 개체 Scene Scope를 변경할 수 없습니다.');
    sceneScope(this.scope.versionId,this.scope.sourceSha256,unit);
    this.sourceUnit=unit;
  }
  constructor(
    readonly scope:CanvasObjectScope,
    private readonly onChange?:(event:GeneratedDocumentEvent)=>void,
  ){
    if(!validCanvasScope(scope))throw new Error('검증된 Version/SHA가 없습니다.');
  }
  private assertLive(){if(this.disposed)throw new Error('종료된 생성 개체 Document입니다.');}
  private emit(type:GeneratedDocumentEvent['type']){this.onChange?.({type});}
  getObjects():readonly GeneratedEntry[]{return [...this.objects];}
  history(){return {undo:this.undoEntries.length,redo:this.redoEntries.length,
    limit:GENERATED_HISTORY_LIMIT};}
  get hasPending(){return this.pending!==null;}
  /** UUID cannot be issued again even after deletion or clear. */
  hasIssuedId(id:string){return this.issued.has(id);}
  /** Objects currently deleted but still restorable by Undo reserve capacity. */
  private undoRestorableEntries():GeneratedEntry[]{
    const live=new Set(this.objects.map(item=>item.ref.id));
    const restorables=new Map<string,GeneratedEntry>();
    for(const history of this.undoEntries){
      if(history.type!=='Delete')continue;
      for(const patch of history.patches)
        if(!live.has(patch.id))restorables.set(patch.id,patch.before);
    }
    return [...restorables.values()];
  }
  append(input:{
    id:string;savedOutlineId:string;createdAt:string;result:OutlineResult;
    name?:string;outlineTypeId?:string|null;outlineTypeName?:string|null;
  }):GeneratedEntry{
    this.assertLive();
    if(this.objects.length>=GENERATED_OBJECT_LIMIT)throw new Error('생성 개체 수 상한입니다.');
    if(!UUID.test(input.id)||this.issued.has(input.id)||
       !/^local-[1-9]\d*$/.test(input.savedOutlineId)||
       this.objects.some(item=>item.savedOutlineId===input.savedOutlineId))
      throw new Error('생성 ID 또는 기존 로컬 ID가 중복/비정상입니다.');
    const baseResult=freezeResult(input.result);
    const newVertexCount=pointsCount(baseResult.geometry);
    const liveVertices=this.objects.reduce((n,o)=>n+pointsCount(o.baseGeometry),0);
    if(liveVertices+newVertexCount>GENERATED_VERTEX_LIMIT)
      throw new Error('문서 꼭짓점 총량을 초과했습니다.');
    // Keep Delete Undo only when restoring its object still fits after append.
    // Otherwise invalidate incompatible Undo before accepting the new object.
    const reserved=this.undoRestorableEntries();
    const discardIncompatibleHistory=
      this.objects.length+reserved.length+1>GENERATED_OBJECT_LIMIT ||
      liveVertices+reserved.reduce((n,o)=>n+pointsCount(o.baseGeometry),0)+
        newVertexCount>GENERATED_VERTEX_LIMIT;
    const entry=Object.freeze({
      ref:Object.freeze(canvasObjectRef('GENERATED',input.id,this.scope)),
      sceneRef:createSceneRef(sceneScope(this.scope.versionId,this.scope.sourceSha256,this.sourceUnit),'APP_CREATED',input.id),
      savedOutlineId:input.savedOutlineId,createdAt:input.createdAt,
      editedAt:null,name:input.name??'',outlineTypeId:input.outlineTypeId??null,
      outlineTypeName:input.outlineTypeName??null,kind:baseResult.kind,
      baseResult,baseGeometry:baseResult.geometry,transform:IDENTITY_2D,
      transformOperations:Object.freeze([]) as readonly GeneratedRigidOperation[],
      visible:true,edited:false,dirty:false,
    }) as GeneratedEntry;
    if(discardIncompatibleHistory)this.undoEntries=[];
    this.objects=[...this.objects,entry];
    this.issued.add(input.id);this.redoEntries=[];
    this.pending=null;this.emit('append');return entry;
  }
  setVisible(savedOutlineId:string,visible:boolean):boolean{
    this.assertLive();
    const index=this.objects.findIndex(item=>item.savedOutlineId===savedOutlineId);
    if(index<0||typeof visible!=='boolean')return false;
    if(this.objects[index].visible===visible)return true;
    this.objects=this.objects.map((o,i)=>i===index?Object.freeze({...o,visible,dirty:true}):o);
    this.pending=null;this.emit('visibility');return true;
  }
  private prepare(command:GeneratedCommand,selection:readonly CanvasObjectRef[]){
    this.assertLive();
    const capability=canvasEditCapability(selection,this.scope);
    if(!capability.canEdit)throw new Error(capability.reason);
    if(!Array.isArray(command?.ids)||!command.ids.length ||
       command.ids.length!==selection.length || new Set(command.ids).size!==command.ids.length)
      throw new Error('명령 대상이 선택 범위와 일치하지 않습니다.');
    const selected=new Set(selection.map(r=>r.id));
    if(command.ids.some(id=>!selected.has(id)))throw new Error('선택되지 않은 개체를 변경할 수 없습니다.');
    const byId=new Map(this.objects.map((o,index)=>[o.ref.id,{entry:o,index}]));
    const rows=command.ids.map(id=>{
      const row=byId.get(id);
      if(!row||!sameCanvasScope(row.entry.ref,this.scope)||!row.entry.visible)
        throw new Error('없는/숨겨진/다른 버전의 생성 개체입니다.');
      return {id,...row};
    });
    if(command.type==='Translate'){
      if(!finiteCoordinate(command.dx)||!finiteCoordinate(command.dy)||
         Math.abs(command.dx)>MAX_TRANSLATE||Math.abs(command.dy)>MAX_TRANSLATE)
        throw new Error('이동값은 유한한 WCS 범위여야 합니다.');
    }else if(command.type==='Rotate'){
      if(!Number.isFinite(command.angleDegrees)||Math.abs(command.angleDegrees)>MAX_DEGREES||
        !Array.isArray(command.pivot)||command.pivot.length!==2||
        !command.pivot.every(finiteCoordinate))
        throw new Error('회전 각도/중심점이 잘못되었습니다.');
    }else if(command.type!=='Delete')throw new Error('지원하지 않는 생성 개체 명령입니다.');
    return rows;
  }
  private build(command:GeneratedCommand,selection:readonly CanvasObjectRef[]){
    const rows=this.prepare(command,selection);
    const transform:Affine2D=command.type==='Delete'?IDENTITY_2D:
      generatedRigidMatrix(command);
    const now=new Date().toISOString();
    const patches:Patch[]=rows.map(row=>{
      if(command.type==='Delete')return {id:row.id,index:row.index,before:row.entry};
      const next=composeAffine(transform,row.entry.transform);
      // Preserve the exact allowlisted operations, not an untrusted affine
      // reconstructed by the browser at the #97 server provenance boundary.
      const operation:GeneratedRigidOperation=command.type==='Translate'
        ? Object.freeze({type:'Translate',dx:command.dx,dy:command.dy})
        : Object.freeze({type:'Rotate',angleDegrees:command.angleDegrees,
            pivot:Object.freeze([...command.pivot]) as readonly [number,number]});
      const transformOperations=Object.freeze([...row.entry.transformOperations,operation]);
      // Validate EVERY geometry before committing ANY; base geometry never changes.
      applyAffine(row.entry.baseGeometry,next);
      const after=Object.freeze({...row.entry,transform:next,transformOperations,
        edited:true,dirty:true,editedAt:now});
      return {id:row.id,index:row.index,before:row.entry,after};
    });
    const size=64+patches.reduce((n,p)=>n+160+
      (command.type==='Delete'?pointsCount(p.before.baseGeometry)*32:0),0);
    if(size>GENERATED_HISTORY_BYTES)
      throw new Error('이력 메모리 상한을 초과하는 명령입니다.');
    const history:History={type:command.type,patches,bytes:size};
    return history;
  }
  /** Validate the entire selection and result before one atomic commit. */
  execute(command:GeneratedCommand,selection:readonly CanvasObjectRef[]):void{
    const history=this.build(command,selection);
    const changed=new Map(history.patches.map(p=>[p.id,p]));
    this.objects=history.type==='Delete'
      ? this.objects.filter(o=>!changed.has(o.ref.id))
      : this.objects.map(o=>changed.get(o.ref.id)?.after??o);
    this.undoEntries.push(history);this.trimHistory();
    this.redoEntries=[];this.pending=null;this.emit('change');
  }
  /** Draft staging never modifies the Document or GPU; E4/E5 can preview it
   * independently and commit only on pointerup or numeric confirmation. */
  stage(command:GeneratedCommand,selection:readonly CanvasObjectRef[]):void{
    this.build(command,selection);
    const staged:GeneratedCommand=command.type==='Rotate'
      ? {...command,ids:[...command.ids],pivot:[...command.pivot] as [number,number]}
      : {...command,ids:[...command.ids]};
    this.pending={command:staged,selection:selection.map(ref=>Object.freeze({...ref}))};
  }
  commitPending(currentSelection:readonly CanvasObjectRef[]):boolean{
    this.assertLive();
    const pending=this.pending;
    if(!pending)return false;
    this.pending=null;
    const capability=canvasEditCapability(currentSelection,this.scope);
    const ids=new Set(currentSelection.map(ref=>ref.id));
    if(!capability.canEdit || currentSelection.length!==pending.selection.length ||
       pending.selection.some(ref=>!ids.has(ref.id)))
      throw new Error('준비 이후 편집 대상 선택이 변경되었습니다.');
    this.execute(pending.command,currentSelection);
    return true;
  }
  cancelPending():boolean{
    if(!this.pending)return false;
    this.pending=null;return true;
  }
  private trimHistory(){
    let total=this.undoEntries.reduce((n,h)=>n+h.bytes,0);
    while(this.undoEntries.length>GENERATED_HISTORY_LIMIT || total>GENERATED_HISTORY_BYTES){
      const removed=this.undoEntries.shift()!;total-=removed.bytes;
    }
  }
  private travel(history:History,reverse:boolean){
    if(history.type==='Delete'){
      if(reverse){
        const result=[...this.objects];
        for(const patch of [...history.patches].sort((a,b)=>a.index-b.index))
          result.splice(Math.min(patch.index,result.length),0,patch.before);
        this.objects=result;
      }else{
        const removed=new Set(history.patches.map(p=>p.id));
        this.objects=this.objects.filter(o=>!removed.has(o.ref.id));
      }
    }else{
      const changes=new Map(history.patches.map(p=>[p.id,p]));
      this.objects=this.objects.map(o=>{
        const patch=changes.get(o.ref.id);
        if(!patch)return o;
        const reference=reverse?patch.before:patch.after!;
        // Visibility is independent of editing history; never undo a Tree toggle.
        return Object.freeze({...o,transform:reference.transform,
          transformOperations:reference.transformOperations,edited:reference.edited,editedAt:reference.editedAt,
          dirty:reference.dirty || o.visible!==patch.before.visible});
      });
    }
  }
  undo():boolean{
    this.assertLive();this.pending=null;
    const item=this.undoEntries.pop();if(!item)return false;
    this.travel(item,true);this.redoEntries.push(item);this.emit('undo');return true;
  }
  redo():boolean{
    this.assertLive();this.pending=null;
    const item=this.redoEntries.pop();if(!item)return false;
    this.travel(item,false);this.undoEntries.push(item);this.emit('redo');return true;
  }
  /** Replace an entire session only after full validation. Failure leaves Document,
   * pending command, selection projection and undo/redo completely unchanged. */
  replaceFromImport(inputs:readonly GeneratedRestoreEntry[]):void{
    this.assertLive();
    if(!Array.isArray(inputs)||inputs.length>GENERATED_OBJECT_LIMIT)
      throw new Error('가져올 개체 수 상한을 초과했습니다.');
    const ids=new Set<string>(),ordinals=new Set<string>();
    let vertexTotal=0;
    const entries=inputs.map(input=>{
      if(!UUID.test(input.id)||ids.has(input.id)||
         !/^local-[1-9]\d{0,12}$/.test(input.savedOutlineId)||
         ordinals.has(input.savedOutlineId))
        throw new Error('가져올 UUID/로컬 ID가 유효하지 않거나 중복입니다.');
      ids.add(input.id);ordinals.add(input.savedOutlineId);
      if(typeof input.name!=='string'||input.name.length>100||
         (input.outlineTypeId!==null&&
          (typeof input.outlineTypeId!=='string'||input.outlineTypeId.length>128))||
         (input.outlineTypeName!==null&&
          (typeof input.outlineTypeName!=='string'||input.outlineTypeName.length>100))||
         typeof input.visible!=='boolean'||typeof input.edited!=='boolean'||
         typeof input.createdAt!=='string'||!Number.isFinite(Date.parse(input.createdAt))||
         (input.editedAt!==null&&
          (typeof input.editedAt!=='string'||!Number.isFinite(Date.parse(input.editedAt)))))
        throw new Error('가져올 이름/타입/가시성/시점이 유효하지 않습니다.');
      // Validate hostile runtime input through unknown values without widening
      // typed readonly arrays to any[] (Array.isArray narrows its argument).
      const untrustedOperations:unknown=input.transformOperations;
      const untrustedTransform:unknown=input.transform;
      if(!Array.isArray(untrustedOperations)||
         untrustedOperations.length>4096||
         input.edited!==(untrustedOperations.length>0)||
         input.edited!==(input.editedAt!==null))
        throw new Error('편집 이력과 편집 시점이 일치하지 않습니다.');
      if(!Array.isArray(untrustedTransform)||untrustedTransform.length!==6||
         !untrustedTransform.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)))
        throw new Error('유한한 2D Affine 변환이 필요합니다.');
      const operations:readonly GeneratedRigidOperation[]=input.transformOperations;
      const suppliedTransform:Affine2D=input.transform;
      const baseResult=freezeResult(input.baseResult);
      const recomputed=operations.reduce<Affine2D>(
        (current,operation)=>composeAffine(generatedRigidMatrix(operation),current),IDENTITY_2D);
      if(recomputed.some((n,i)=>n!==suppliedTransform[i]))
        throw new Error('허용 작업과 Affine 변환이 일치하지 않습니다.');
      const geometry=applyAffine(baseResult.geometry,recomputed);
      validatedGeneratedGeometry(geometry);
      vertexTotal+=pointsCount(baseResult.geometry);
      if(vertexTotal>GENERATED_VERTEX_LIMIT)
        throw new Error('가져올 꼭짓점 수 상한을 초과했습니다.');
      return Object.freeze({
        ref:Object.freeze(canvasObjectRef('GENERATED',input.id,this.scope)),
        sceneRef:createSceneRef(sceneScope(this.scope.versionId,this.scope.sourceSha256,this.sourceUnit),
          'APP_CREATED',input.id),
        savedOutlineId:input.savedOutlineId,createdAt:input.createdAt,editedAt:input.editedAt,
        name:input.name,outlineTypeId:input.outlineTypeId,outlineTypeName:input.outlineTypeName,
        kind:baseResult.kind,baseResult,baseGeometry:baseResult.geometry,
        transform:Object.freeze([...recomputed]) as unknown as Affine2D,
        transformOperations:Object.freeze(operations.map(operation=>
          operation.type==='Translate'?Object.freeze({...operation}):
            Object.freeze({...operation,pivot:Object.freeze([...operation.pivot]) as readonly [number,number]}))),
        visible:input.visible,edited:input.edited,dirty:true,
      }) as GeneratedEntry;
    });
    this.objects=entries;this.issued=ids;
    this.undoEntries=[];this.redoEntries=[];this.pending=null;
    this.emit('clear');
  }
  clear():void{
    this.assertLive();this.objects=[];this.undoEntries=[];this.redoEntries=[];
    this.pending=null;this.emit('clear');
  }
  dispose():void{
    this.disposed=true;this.pending=null;this.objects=[];
    this.undoEntries=[];this.redoEntries=[];this.issued.clear();
  }
}
