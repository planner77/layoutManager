import { CadError } from '@/domain/cad';
import { requireResolvedPermission, type Role, type SpecialGrant, type UserAccess } from '@/domain/auth';
import { digestSessionToken, SESSION_IDLE_MS } from '@/server/auth/session';
import { context } from '@/server/context';
import { createDb, type Database } from '@/server/db';
import { requireG7PublicAuthority } from '@/server/g7-operational/cad-guard';
import { resolveG7RuntimeGate, type G7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { openG7RuntimeDb } from '@/server/g7-operational/runtime-db';
import { SceneBlobStorage } from '@/server/storage/scene-storage';
import { SceneRepository } from './scene-repository';

const deny=(code:string,status:number)=>new CadError(code,'Scene 읽기 승인이 필요합니다.',status);
function cookie(request:Request):string|null{
  const values=(request.headers.get('cookie')??'').split(';').map(v=>v.trim())
    .filter(v=>v.startsWith('cad_session='));
  if(values.length!==1)return null;
  const value=values[0].slice('cad_session='.length);
  return /^[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value,'base64url').length===32&&
    Buffer.from(value,'base64url').toString('base64url')===value?value:null;
}
export function sceneReadContext(request:Request){
  const gate=resolveG7RuntimeGate(process.env);
  if(gate.state==='BLOCKED')throw deny('G7_RUNTIME_BLOCKED',503);
  if(gate.state==='ACTIVE'){
    requireG7PublicAuthority(request,gate.origin);
    const probe=openG7RuntimeDb(gate,true);probe.close();
    const db=createDb('file:'+gate.databasePath);
    const storage=new SceneBlobStorage(gate.cadStoragePath,process.env);
    return {gate,repo:new SceneRepository(db,storage),
      close:async()=>{storage.close();await db.$disconnect();}};
  }
  const db=context().repo.db;
  if(!process.env.CAD_STORAGE_PATH)throw deny('SCENE_STORAGE_UNAVAILABLE',503);
  const storage=new SceneBlobStorage(process.env.CAD_STORAGE_PATH,process.env);
  return {gate,repo:new SceneRepository(db,storage),close:async()=>storage.close()};
}
export async function requireSceneRead(request:Request,db:Database,versionId:string,gate:G7RuntimeGate):Promise<void>{
  if(gate.state==='OFF')return; // Preserve existing public CAD read mode only.
  if(gate.state!=='ACTIVE')throw deny('G7_RUNTIME_BLOCKED',503);
  const raw=cookie(request);
  if(!raw)throw deny('UNAUTHENTICATED',401);
  const session=await db.authSession.findUnique({where:{tokenHash:digestSessionToken(raw)},
    include:{user:{include:{roles:true,sites:true,specials:true}}}});
  const now=BigInt(Date.now());
  if(!session||session.revokedAt!==null||session.issuedAt>now||session.lastSeenAt>now||
    session.expiresAt<=now||now-session.lastSeenAt>=BigInt(SESSION_IDLE_MS)||
    session.user.status!=='ACTIVE'||session.user.mustChangePassword)
    throw deny('UNAUTHENTICATED',401);
  const version=await db.cadFileVersion.findUnique({where:{id:versionId},
    select:{location:{select:{building:{select:{siteId:true}}}}}});
  if(!version)throw deny('ACCESS_DENIED',403);
  const siteId=version.location.building.siteId;
  const actor:UserAccess={id:session.user.id,status:'ACTIVE',mustChangePassword:false,
    roles:session.user.roles.map(x=>x.role as Role),
    siteGrants:session.user.sites.map(x=>x.siteId),
    specialGrants:session.user.specials.map(x=>x.permission as SpecialGrant)};
  try{
    if(!gate.siteIds.includes(siteId))throw new Error();
    requireResolvedPermission(actor,'cad:read',{kind:'version',versionId},siteId);
  }catch{throw deny('ACCESS_DENIED',403);}
  // A scope-authorized Scene read is G3 session activity. Fail closed if the
  // account/session was revoked, disabled or expired during authorization.
  const touched=await db.authSession.updateMany({
    where:{id:session.id,revokedAt:null,issuedAt:{lte:now},
      expiresAt:{gt:now},
      lastSeenAt:{gt:now-BigInt(SESSION_IDLE_MS),lte:now},
      user:{is:{status:'ACTIVE',mustChangePassword:false}}},
    data:{lastSeenAt:now},
  });
  if(touched.count!==1)throw deny('UNAUTHENTICATED',401);
}
