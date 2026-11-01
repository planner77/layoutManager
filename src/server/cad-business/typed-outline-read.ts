/** Version-scoped, single-transaction catalogue and stored Outline snapshots. */
import type { Prisma } from '@/generated/prisma/client';
import { outlineTypeNameKey } from '@/domain/outline-type';
import type { AuthorizedOutlineCatalog, OutlineTypeChoice, StoredOutlineDto, StoredOutlinePageDto } from '@/domain/typed-outline';
import { CadError } from '@/domain/cad';
import type { Database } from '@/server/db';
import { writeTransaction } from '@/server/db';
import { requireSceneRead } from '@/server/scene/scene-context';
import { assertRuntimeApprovalCurrent } from '@/server/g7-operational/runtime-handler';
import { G7_GREENFIELD_BASELINE, G7_PREVIOUS_TYPED_OUTLINES_BASELINE } from '@/server/g7-operational/greenfield-schema';
import type { G7RuntimeActiveGate } from '@/server/g7-operational/runtime-gate';
import { outlineDto } from './service';

type Tx = Prisma.TransactionClient;
type Page = Readonly<{offset:number;limit:number;q?:string}>;
const denied=(code:string,status:number):never=>{throw new CadError(code,'외곽선 조회를 처리할 수 없습니다.',status);};
function approvalCurrent(gate:G7RuntimeActiveGate):void{
  try{assertRuntimeApprovalCurrent(gate);}
  catch{denied('G7_RUNTIME_BLOCKED',503);}
}
export function outlinePageQuery(url:string,catalog:boolean):Page {
  const params=new URL(url).searchParams;
  const allowed=catalog?['q','offset','limit']:['offset','limit'];
  for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)
    denied('BUSINESS_INPUT_INVALID',400);
  const integer=(key:string,fallback:number,min:number,max:number)=>{
    const raw=params.get(key);
    if(raw===null)return fallback;
    if(!/^(0|[1-9][0-9]{0,5})$/.test(raw))denied('BUSINESS_INPUT_INVALID',400);
    const n=Number(raw);
    if(n<min||n>max)denied('BUSINESS_INPUT_INVALID',400);
    return n;
  };
  const raw=params.get('q')??'';
  if(raw.length>100||/[\p{Cc}\p{Cf}\p{Cs}]/u.test(raw))denied('BUSINESS_INPUT_INVALID',400);
  const q=raw.trim().normalize('NFC');
  if(q.length>100)denied('BUSINESS_INPUT_INVALID',400);
  return {offset:integer('offset',0,0,100000),limit:integer('limit',catalog?50:100,1,100),...(catalog?{q}:{})};
}
async function latest(tx:Tx):Promise<void>{
  const rows=await tx.$queryRawUnsafe<{migration_name:string}[]>(
    'SELECT migration_name FROM "_prisma_migrations"');
  if(rows.length!==1||![G7_GREENFIELD_BASELINE,G7_PREVIOUS_TYPED_OUTLINES_BASELINE].includes(rows[0].migration_name as typeof G7_GREENFIELD_BASELINE))
    denied('BUSINESS_SCHEMA_UNAVAILABLE',503);
}
async function snapshot(tx:Tx,request:Request,versionId:string,gate:G7RuntimeActiveGate){
  if(await tx.user.count()===0)denied('BOOTSTRAP_REQUIRED',503);
  const actor=await requireSceneRead(request,tx,versionId,gate,'outline:read');
  if(!actor)return denied('BUSINESS_AUTH_REQUIRED',401);
  await latest(tx);
  const version=await tx.cadFileVersion.findUnique({where:{id:versionId},
    select:{sha256:true,fileFormat:true}});
  if(!version)return denied('BUSINESS_VERSION_NOT_FOUND',404);
  if(version.fileFormat!=='DXF')return denied('BUSINESS_DXF_ONLY',415);
  const scene=await tx.currentScene.findUnique({where:{versionId}});
  approvalCurrent(gate);
  return {actor,version,sceneRevision:scene?.revision??null};
}
async function recheck(tx:Tx,request:Request,versionId:string,gate:G7RuntimeActiveGate,
  actorId:string):Promise<void>{
  approvalCurrent(gate);
  const current=await requireSceneRead(request,tx,versionId,gate,'outline:read');
  if(!current||current.actorId!==actorId)denied('UNAUTHENTICATED',401);
  approvalCurrent(gate);
}
export async function authorizedOutlineCatalog(db:Database,request:Request,versionId:string,
  gate:G7RuntimeActiveGate,page:Page):Promise<AuthorizedOutlineCatalog>{
  return writeTransaction(db,async tx=>{
    const context=await snapshot(tx,request,versionId,gate);
    const key=outlineTypeNameKey(page.q??'');
    const count=await tx.$queryRawUnsafe<{n:bigint}[]>(
      'SELECT COUNT(*) AS n FROM "OutlineType" WHERE active=1 AND instr(name_key,?)>0',key);
    const types=await tx.$queryRawUnsafe<{id:string;name:string;sort_order:number;revision:number}[]>(
      'SELECT id,name,sort_order,revision FROM "OutlineType" WHERE active=1 AND instr(name_key,?)>0 ORDER BY sort_order,name_key,id LIMIT ? OFFSET ?',
      key,page.limit,page.offset);
    await recheck(tx,request,versionId,gate,context.actor.actorId);
    return {actorId:context.actor.actorId,versionId,sourceSha256:context.version.sha256,
      sceneRevision:context.sceneRevision,catalogScope:'GLOBAL',
      canCreate:context.actor.canWrite&&context.sceneRevision!==null,
      items:types.map(type=>({id:type.id,name:type.name,active:true as const,
        sortOrder:type.sort_order,revision:type.revision} satisfies OutlineTypeChoice)),
      total:Number(count[0]?.n??0),offset:page.offset,limit:page.limit};
  });
}
export async function storedOutlinePage(db:Database,request:Request,versionId:string,
  gate:G7RuntimeActiveGate,page:Page):Promise<StoredOutlinePageDto>{
  return writeTransaction(db,async tx=>{
    const context=await snapshot(tx,request,versionId,gate);
    if(await tx.cadOutline.count({where:{versionId,deletedAt:null,
      sourceSha256:{not:context.version.sha256}}})>0)denied('BUSINESS_SOURCE_CHANGED',409);
    const where={versionId,deletedAt:null};
    const [total,rows]=await Promise.all([
      tx.cadOutline.count({where}),
      tx.cadOutline.findMany({where,orderBy:[{createdAt:'asc'},{id:'asc'}],
        skip:page.offset,take:page.limit,include:{outlineType:true}}),
    ]);
    if(rows.some(row=>row.outlineTypeId!==null&&row.outlineType?.id!==row.outlineTypeId))
      denied('BUSINESS_SCHEMA_UNAVAILABLE',503);
    await recheck(tx,request,versionId,gate,context.actor.actorId);
    return {actorId:context.actor.actorId,versionId,sourceSha256:context.version.sha256,
      sceneRevision:context.sceneRevision,canWrite:context.actor.canWrite&&context.sceneRevision!==null,
      total,offset:page.offset,limit:page.limit,outlines:rows.map(outlineDto)};
  });
}
export async function storedOutlineById(db:Database,request:Request,versionId:string,
  outlineId:string,gate:G7RuntimeActiveGate):Promise<StoredOutlineDto>{
  return writeTransaction(db,async tx=>{
    const context=await snapshot(tx,request,versionId,gate);
    const row=await tx.cadOutline.findFirst({where:{id:outlineId,versionId,deletedAt:null},
      include:{outlineType:true}});
    if(!row)return denied('BUSINESS_NOT_FOUND',404);
    if(row.sourceSha256!==context.version.sha256)denied('BUSINESS_SOURCE_CHANGED',409);
    if(row.outlineTypeId!==null&&row.outlineType?.id!==row.outlineTypeId)
      denied('BUSINESS_SCHEMA_UNAVAILABLE',503);
    await recheck(tx,request,versionId,gate,context.actor.actorId);
    return outlineDto(row);
  });
}
