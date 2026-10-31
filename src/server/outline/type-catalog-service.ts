import { randomUUID } from 'node:crypto';
import { outlineTypeNameKey, normalizeOutlineTypeInput } from '@/domain/outline-type';
import type { GlobalOutlineTypeDto, OutlineTypeAccessDto, OutlineTypePageDto } from '@/domain/outline-type-catalog';
import { G7_GREENFIELD_BASELINE, G7_PREVIOUS_TYPES_BASELINE } from '@/server/g7-operational/greenfield-schema';
import type { G7RuntimeActiveGate } from '@/server/g7-operational/runtime-gate';
import { G4Failure, type G4Context } from '@/server/auth/g4-service';
import { g7GuardedMutation } from '@/server/g7-staging/g4-store';
import type { IsolatedDb } from '@/server/g7-staging/g1-store';

const select = 'SELECT id,name,description,active,sort_order,revision,created_at,updated_at,created_by_id,updated_by_id FROM "OutlineType"';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}]/u;
type Row = Record<string, unknown>;
export type TypeListQuery = Readonly<{ includeInactive: boolean; q: string; offset: number; limit: number }>;
function projection(row: Row): GlobalOutlineTypeDto {
  return { id:String(row.id), name:String(row.name), description:row.description===null?null:String(row.description),
    active:row.active===1,sortOrder:Number(row.sort_order),revision:Number(row.revision),
    createdAt:String(row.created_at),updatedAt:String(row.updated_at),
    createdById:String(row.created_by_id),updatedById:String(row.updated_by_id),scope:'GLOBAL' };
}
function requireSchema(db:IsolatedDb):void {
  const marker=db.prepare('SELECT migration_name FROM "_prisma_migrations"').get();
  if(marker?.migration_name!==G7_GREENFIELD_BASELINE&&marker?.migration_name!==G7_PREVIOUS_TYPES_BASELINE)
    throw new G4Failure('CATALOG_UNAVAILABLE',503);
}
function scope(gate:G7RuntimeActiveGate,check:()=>void) {
  return {siteIds:gate.siteIds,assertCurrent:check,now:Date.now};
}
function normalized(input:{name:unknown;description?:unknown;sortOrder:unknown}) {
  try{return normalizeOutlineTypeInput(input);}catch{throw new G4Failure('BAD_INPUT',400);}
}
function unique(db:IsolatedDb,key:string,exceptId?:string):void {
  const row=exceptId
    ? db.prepare('SELECT 1 FROM "OutlineType" WHERE name_key=? AND id<>?').get(key,exceptId)
    : db.prepare('SELECT 1 FROM "OutlineType" WHERE name_key=?').get(key);
  if(row) throw new G4Failure('CONFLICT',409);
}
function appendAudit(db:IsolatedDb,actorId:string,typeId:string,
  action:'CREATE'|'UPDATE'|'DEACTIVATE'|'REACTIVATE',before:number|null,after:number,context:G4Context):void {
  db.prepare('INSERT INTO "OutlineTypeAudit"(id,actor_user_id,outline_type_id,action,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,\'SUCCESS\',?,?)')
    .run(randomUUID(),actorId,typeId,action,before,after,new Date(context.now).toISOString(),context.requestId);
}
function guard<T>(db:IsolatedDb,tokenHash:string|null,gate:G7RuntimeActiveGate,
  context:G4Context,check:()=>void,manage:boolean,work:(actorId:string,context:G4Context)=>T):T {
  return g7GuardedMutation(db,tokenHash,manage?'outlineType:manage':'outlineType:read',
    {kind:'global'},context,(actor,_site,current)=>{
      requireSchema(db);
      return work(actor.id,current);
    },scope(gate,check));
}
export function getOutlineTypeAccess(db:IsolatedDb,tokenHash:string|null,gate:G7RuntimeActiveGate,
  context:G4Context,check:()=>void):OutlineTypeAccessDto {
  return g7GuardedMutation(db,tokenHash,'outlineType:read',{kind:'global'},context,(actor)=>{
    requireSchema(db);check();
    return {canRead:true,canManage:actor.roles.includes('Admin'),writeEnabled:gate.cadWriteEnabled,scope:'GLOBAL'};
  },scope(gate,check));
}
export function listOutlineTypes(db:IsolatedDb,tokenHash:string|null,gate:G7RuntimeActiveGate,
  context:G4Context,check:()=>void,query:TypeListQuery):OutlineTypePageDto {
  return guard(db,tokenHash,gate,context,check,query.includeInactive,()=>{
    const q=outlineTypeNameKey(query.q.trim());
    const where=' WHERE '+(query.includeInactive?'1=1':'active=1')+' AND instr(name_key,?)>0';
    const total=Number(db.prepare('SELECT COUNT(*) AS n FROM "OutlineType"'+where).get(q)?.n);
    const rows=db.prepare(select+where+' ORDER BY sort_order,name_key,id LIMIT ? OFFSET ?')
      .all(q,query.limit,query.offset).map(projection);
    check();
    return {items:rows,total,offset:query.offset,limit:query.limit};
  });
}
export function createOutlineType(db:IsolatedDb,tokenHash:string|null,gate:G7RuntimeActiveGate,
  context:G4Context,check:()=>void,proof:()=>void,
  input:{name:unknown;description?:unknown;sortOrder:unknown}):GlobalOutlineTypeDto {
  return guard(db,tokenHash,gate,context,check,true,(actorId,current)=>{
    proof();
    if(!gate.cadWriteEnabled) throw new G4Failure('WRITE_DISABLED',503);
    const value=normalized(input),key=outlineTypeNameKey(value.name),id=randomUUID();
    unique(db,key);
    const now=new Date(current.now).toISOString();
    db.prepare('INSERT INTO "OutlineType"(id,name,name_key,description,active,sort_order,revision,created_by_id,updated_by_id,created_at,updated_at) VALUES(?,?,?,?,1,?,1,?,?,?,?)')
      .run(id,value.name,key,value.description,value.sortOrder,actorId,actorId,now,now);
    appendAudit(db,actorId,id,'CREATE',null,1,current);
    check();
    return projection(db.prepare(select+' WHERE id=?').get(id)!);
  });
}
export type TypePatch = Readonly<{expectedRevision:number;name?:unknown;description?:unknown;sortOrder?:unknown;active?:unknown}>;
export function updateOutlineType(db:IsolatedDb,tokenHash:string|null,gate:G7RuntimeActiveGate,
  context:G4Context,check:()=>void,proof:()=>void,typeId:string,patch:TypePatch):GlobalOutlineTypeDto {
  return guard(db,tokenHash,gate,context,check,true,(actorId,current)=>{
    proof();
    if(!gate.cadWriteEnabled) throw new G4Failure('WRITE_DISABLED',503);
    if(!UUID.test(typeId)) throw new G4Failure('BAD_INPUT',400);
    const prior=db.prepare(select+' WHERE id=?').get(typeId);
    if(!prior) throw new G4Failure('NOT_FOUND',404);
    const revision=Number(prior.revision);
    if(revision!==patch.expectedRevision) throw new G4Failure('CONFLICT',409);
    const active=patch.active===undefined?prior.active===1:patch.active;
    if(typeof active!=='boolean') throw new G4Failure('BAD_INPUT',400);
    const value=normalized({name:patch.name===undefined?prior.name:patch.name,
      description:patch.description===undefined?prior.description:patch.description,
      sortOrder:patch.sortOrder===undefined?prior.sort_order:patch.sortOrder});
    const key=outlineTypeNameKey(value.name);unique(db,key,typeId);
    const next=revision+1,now=new Date(current.now).toISOString();
    const changed=db.prepare('UPDATE "OutlineType" SET name=?,name_key=?,description=?,active=?,sort_order=?,revision=?,updated_by_id=?,updated_at=? WHERE id=? AND revision=?')
      .run(value.name,key,value.description,active?1:0,value.sortOrder,next,actorId,now,typeId,revision);
    if(changed.changes!==1) throw new G4Failure('CONFLICT',409);
    const action=active!==(prior.active===1)?(active?'REACTIVATE':'DEACTIVATE'):'UPDATE';
    appendAudit(db,actorId,typeId,action,revision,next,current);
    check();
    return projection(db.prepare(select+' WHERE id=?').get(typeId)!);
  });
}
export function normalizeTypeSearch(raw:unknown):string {
  if(typeof raw!=='string'||raw.length>100||FORBIDDEN.test(raw)) throw new G4Failure('BAD_INPUT',400);
  const q=raw.trim().normalize('NFC');
  if(q.length>100) throw new G4Failure('BAD_INPUT',400);
  return q;
}
