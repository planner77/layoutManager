/** #172: Memo delete is author-or-site-Admin; editing uses current G7 memo:write.
 * Callers MUST first resolve a live signed Version/Site, role and session using
 * requireG7CadPermission (or requireSceneRead for read-only UI hints).
 * A global Admin without the actual Site Grant cannot use this predicate.
 */
import type {Prisma} from '@/generated/prisma/client';
type Tx=Prisma.TransactionClient;

export async function isSiteMemoAdmin(tx:Tx,actorId:string):Promise<boolean>{
  const role=await tx.userRoleGrant.findFirst({
    where:{userId:actorId,role:'Admin'},select:{userId:true},
  });
  return role!==null;
}

export async function canDeleteMemo(tx:Tx,actorId:string,createdById:string):Promise<boolean>{
  return actorId===createdById || await isSiteMemoAdmin(tx,actorId);
}
