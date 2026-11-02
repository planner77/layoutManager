import { describe, beforeEach, afterEach, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDb, type Database } from '../../server/db';
import { CadRepository } from '../../server/repositories/cad';
import { migrate, seedChain } from '../helpers/database';
import { digestSessionToken, newSessionCandidate } from '../../server/auth/session';
import type { G7CadWrite } from '../../server/g7-operational/cad-guard';

const BetterSqlite = createRequire(import.meta.url)('better-sqlite3') as
 new (filename:string)=>{exec(sql:string):void;close():void};
const sql = readFileSync(new URL('../../deploy/g7-s3/prisma/migrations/202610260002_g7_operational_auth/migration.sql',import.meta.url),'utf8');
let dir='',filename='',db:Database,repo:CadRepository;
const SHA = 'a'.repeat(64), NOW = Date.now();
async function newActor(role='Editor') {
  const userId=randomUUID(), session=newSessionCandidate(userId,NOW);
  await db.user.create({data:{
    id:userId,loginName:'u'+randomUUID().replaceAll('-','').slice(0,24),
    passwordHash:'scrypt$isolated_test_only',status:'ACTIVE',
    mustChangePassword:false,createdAt:BigInt(NOW),updatedAt:BigInt(NOW),
  }});
  await db.userRoleGrant.create({data:{userId,role,grantedAt:BigInt(NOW)}});
  await db.authSession.create({data:{
    id:session.session.id,userId,tokenHash:digestSessionToken(session.rawToken),
    issuedAt:BigInt(NOW),lastSeenAt:BigInt(NOW),expiresAt:BigInt(session.session.expiresAt),
  }});
  return {userId,session,proof:{tokenHash:digestSessionToken(session.rawToken),
    now:NOW+250,requestId:'s2_unit_001'} satisfies G7CadWrite};
}
beforeEach(async()=>{
  dir=mkdtempSync(path.join(tmpdir(),'g7-cad-operational-'));
  filename=path.join(dir,'fixture.sqlite');
  await migrate(filename);
  const raw=new BetterSqlite(filename);
  try{raw.exec('PRAGMA foreign_keys=ON;');raw.exec(sql);}
  finally{raw.close();}
  db=createDb('file:'+filename);repo=new CadRepository(db);
});
afterEach(async()=>{await db.$disconnect();rmSync(dir,{recursive:true,force:true});});
const sampleFile=(name:string)=>({
  originalFilename:name,fileFormat:'DXF' as const,fileSize:123,
  sha256:createHash('sha256').update(name).digest('hex'),storagePath:'/synthetic/'+name,
});
describe('#109 G7 S3-3 isolated CAD mutation and Audit',()=>{
  test('authenticated Editor+Site upload/current/delete writes append-only Audit atomically',async()=>{
    const chain=await seedChain(db),actor=await newActor();
    await db.userSiteGrant.create({data:{userId:actor.userId,siteId:chain.site.id,
      grantedAt:BigInt(NOW)}});
    // Multipart request preparation time may precede the actual write by seconds.
    // Authorization samples time inside the DB transaction, not proof.now.
    const stalePreparedProof={...actor.proof,now:NOW-1000};
    const base=await repo.register({...chain.input,makeCurrent:false},sampleFile('a.dxf'),
      undefined,stalePreparedProof);
    const newer=await repo.register({...chain.input,makeCurrent:false},sampleFile('b.dxf'),
      undefined,actor.proof);
    expect(await db.auditEvent.count({where:{action:'CAD_UPLOADED'}})).toBe(2);
    expect((await db.auditEvent.findFirst({where:{action:'CAD_UPLOADED',targetId:newer.id}}))?.afterRevision).toBe(newer.version);
    await repo.setCurrent(chain.floor.id,newer.id,actor.proof);
    expect((await db.cadLocation.findUnique({where:{id:chain.floor.id}}))?.currentVersionId)
      .toBe(newer.id);
    await expect(repo.deleteVersion(newer.id,'wrong',actor.proof)).rejects.toMatchObject({
      code:'INVALID_DELETE_PASSWORD',
    });
    const deleted=await repo.deleteVersion(newer.id,'1234',actor.proof);
    expect(deleted.wasCurrent).toBe(true);
    expect(await db.cadFileVersion.count()).toBe(1);
    expect(await db.auditEvent.count({where:{action:'CAD_VERSION_DELETED'}})).toBe(1);
    expect(await db.auditEvent.count({where:{action:'CAD_CURRENT_CHANGED'}})).toBe(1);
    expect((await db.auditEvent.findFirst({where:{action:'CAD_CURRENT_CHANGED'}}))?.afterRevision).toBe(newer.version);
    expect(base.id).toBeTruthy();
  },60_000);
  test('Reader, unauthorized Site, revoked session cannot mutate CAD or add success Audit',async()=>{
    const chain=await seedChain(db),reader=await newActor('Reader');
    await db.userSiteGrant.create({data:{userId:reader.userId,siteId:chain.site.id,
      grantedAt:BigInt(NOW)}});
    const editor=await newActor('Editor');
    // Even a wrong delete password on an unknown/foreign Version must not
    // reveal password validity before the current Role/Site authorization.
    await expect(repo.deleteVersion(randomUUID(),'wrong',reader.proof))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
    const denied=repo.register(chain.input,sampleFile('bad.dxf'),undefined,reader.proof);
    await expect(denied).rejects.toMatchObject({code:'ACCESS_DENIED'});
    const wrongSite=repo.register(chain.input,sampleFile('wrongsite.dxf'),undefined,editor.proof);
    await expect(wrongSite).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await db.userSiteGrant.create({data:{userId:editor.userId,siteId:chain.site.id,
      grantedAt:BigInt(NOW)}});
    await db.authSession.update({where:{id:editor.session.session.id},data:{
      revokedAt:BigInt(NOW+1),
    }});
    await expect(repo.register(chain.input,sampleFile('revoked.dxf'),
      undefined,editor.proof)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
    expect(await db.cadFileVersion.count()).toBe(0);
    expect(await db.auditEvent.count({where:{action:'CAD_UPLOADED'}})).toBe(0);
  },60_000);
  test('Audit insert failure rolls back Current and DELETE mutations including deletion job',async()=>{
    const chain=await seedChain(db),actor=await newActor();
    await db.userSiteGrant.create({data:{userId:actor.userId,siteId:chain.site.id,
      grantedAt:BigInt(NOW)}});
    const first=await repo.register({...chain.input,makeCurrent:true},sampleFile('first.dxf'),
      undefined,actor.proof);
    const second=await repo.register({...chain.input,makeCurrent:false},sampleFile('second.dxf'),
      undefined,actor.proof);
    const raw=new BetterSqlite(filename);
    try {
      raw.exec("CREATE TRIGGER deny_current_audit BEFORE INSERT ON AuditEvent WHEN NEW.action='CAD_CURRENT_CHANGED' BEGIN SELECT RAISE(ABORT,'AUDIT_FAILURE'); END;");
    }finally{raw.close();}
    await expect(repo.setCurrent(chain.floor.id,second.id,actor.proof)).rejects.toThrow();
    expect((await db.cadLocation.findUnique({where:{id:chain.floor.id}}))?.currentVersionId)
      .toBe(first.id);
    expect(await db.auditEvent.count({where:{action:'CAD_CURRENT_CHANGED'}})).toBe(0);
    const raw2=new BetterSqlite(filename);
    try {raw2.exec("DROP TRIGGER deny_current_audit; CREATE TRIGGER deny_delete_audit BEFORE INSERT ON AuditEvent WHEN NEW.action='CAD_VERSION_DELETED' BEGIN SELECT RAISE(ABORT,'AUDIT_FAILURE'); END;");}
    finally{raw2.close();}
    await expect(repo.deleteVersion(first.id,'1234',actor.proof)).rejects.toThrow();
    expect(await db.cadFileVersion.count()).toBe(2);
    expect(await db.cadDeletionJob.count()).toBe(0);
    expect((await db.cadLocation.findUnique({where:{id:chain.floor.id}}))?.currentVersionId)
      .toBe(first.id);
  },60_000);
});
