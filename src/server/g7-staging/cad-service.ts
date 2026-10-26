/** #109 S1: staged CAD writes on disposable DB/files only, NEVER operating API. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { validateDeletePassword } from '../../domain/cad';
import { hashDeletePassword, verifyDeletePassword } from '../password';
import { digestSessionToken } from '../auth/session';
import { createG4Service, G4Failure, type G4Context } from '../auth/g4-service';
import { createG4IsolatedStore, g7GuardedMutation } from './g4-store';
import type { IsolatedDb } from './g1-store';
import type { G7StagingGate } from './gate';

const idValid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const tokenHash = (token: unknown): string | null => {
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(token) ||
      Buffer.from(token, 'base64url').length !== 32 ||
      Buffer.from(token, 'base64url').toString('base64url') !== token) return null;
  return digestSessionToken(token);
};
const fail = (status: number, code: 'BAD_INPUT' | 'ACCESS_DENIED' | 'CONFLICT') =>
  new G4Failure(code, status);

function cadAudit(db: IsolatedDb, action: 'CAD_UPLOADED' | 'CAD_CURRENT_CHANGED' |
    'CAD_VERSION_DELETED', actorId: string, siteId: string, versionId: string,
    context: G4Context) {
  // Staging migration's SQL CHECK allows CAD actions only for a scoped VERSION.
  // Business mutation and this insert commit/rollback in the same transaction.
  db.prepare('INSERT INTO "AuditEvent"(id,actor_user_id,affected_user_id,site_id,action,target_kind,target_id,before_revision,after_revision,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), actorId, actorId, siteId, action, 'VERSION', versionId,
         null, null, 'SUCCESS', new Date(context.now).toISOString(), context.requestId);
}
function assertStageFile(gate: G7StagingGate, candidate: string) {
  const base = path.join(gate.root, 'cad');
  if (path.dirname(candidate) !== base || !/^[a-f0-9-]{36}\.dxf$/.test(path.basename(candidate)) ||
      lstatSync(candidate).isSymbolicLink() || !lstatSync(candidate).isFile()) {
    throw fail(403, 'ACCESS_DENIED');
  }
}
export function stagedCadList(db: IsolatedDb) {
  return db.prepare('SELECT id,location_id,version,file_format,file_size,sha256 FROM "CadFileVersion" ORDER BY registered_at DESC,id DESC LIMIT 100')
    .all();
}
export function stagedCadContent(db: IsolatedDb, gate: G7StagingGate, versionId: string) {
  if (!idValid(versionId)) throw fail(400, 'BAD_INPUT');
  const file = db.prepare('SELECT storage_path,sha256,file_size,file_format FROM "CadFileVersion" WHERE id=?')
    .get(versionId);
  if (!file) throw fail(403, 'ACCESS_DENIED');
  const filePath = String(file.storage_path);
  assertStageFile(gate, filePath);
  const bytes = readFileSync(filePath);
  if (bytes.byteLength !== Number(file.file_size) ||
      createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new G4Failure('G4_UNAVAILABLE', 503);
  }
  return bytes;
}

export async function stagedCadUpload(
  db: IsolatedDb, gate: G7StagingGate, rawToken: unknown,
  body: Record<string, unknown>, context: G4Context,
) {
  if (!gate.writeEnabled) throw fail(403, 'ACCESS_DENIED');
  if (!idValid(body.siteId) || !idValid(body.locationId) ||
      typeof body.dxfBase64 !== 'string' || body.dxfBase64.length > 349528 ||
      !/^[a-zA-Z0-9+/]+={0,2}$/.test(body.dxfBase64) ||
      typeof body.originalFilename !== 'string' ||
      !/^[^/\\\x00-\x1f]{1,128}\.dxf$/i.test(body.originalFilename)) {
    throw fail(400, 'BAD_INPUT');
  }
  const locationId = body.locationId;
  const siteId = body.siteId;
  const bytes = Buffer.from(body.dxfBase64, 'base64');
  const source = bytes.toString('utf8', 0, Math.min(bytes.length, 32));
  if (!bytes.length || bytes.length > 262144 ||
      (!source.startsWith('0\nSECTION') && !source.startsWith('0\r\nSECTION'))) {
    throw fail(400, 'BAD_INPUT');
  }
  const password = validateDeletePassword(body.deletePassword);
  const hash = await hashDeletePassword(password);
  // Preflight limits unauthorized staged file creation. Commit separately
  // rechecks the session and its current grants under BEGIN IMMEDIATE.
  createG4Service(createG4IsolatedStore(db)).permit(rawToken, 'cad:upload',
    { kind: 'site', siteId }, context);
  const id = randomUUID(), file = path.join(gate.root, 'cad', id + '.dxf');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let wrote = false;
  try {
    writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    wrote = true;
    return g7GuardedMutation(db, tokenHash(rawToken), 'cad:upload',
      { kind: 'site', siteId }, context, actor => {
        const floor = db.prepare(
          'SELECT l.id,l.next_version,b.site_id FROM "CadLocation" l ' +
          'JOIN "Building" b ON b.id=l.building_id WHERE l.id=?'
        ).get(locationId);
        if (!floor || floor.site_id !== siteId) throw fail(403, 'ACCESS_DENIED');
        const version = Number(floor.next_version);
        db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,drawing_name,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, locationId, version, body.originalFilename as string, null,
            '', hash, 'DXF', bytes.length, sha256, file,
            new Date(context.now).toISOString().slice(0, 10));
        db.prepare('UPDATE "CadLocation" SET next_version=next_version+1 WHERE id=?')
          .run(locationId);
        if (body.makeCurrent === true) {
          db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?')
            .run(id, locationId);
        }
        cadAudit(db, 'CAD_UPLOADED', actor.id, siteId, id, context);
        return { id, locationId, version, sha256 };
      });
  } catch (error) {
    if (wrote) try { unlinkSync(file); } catch { /* orphan remains in disposable stage */ }
    throw error;
  }
}
export function stagedCadCurrent(db: IsolatedDb, gate: G7StagingGate,
  rawToken: unknown, body: Record<string, unknown>, context: G4Context) {
  if (!gate.writeEnabled) throw fail(403, 'ACCESS_DENIED');
  if (!idValid(body.versionId) || !idValid(body.locationId)) throw fail(400, 'BAD_INPUT');
  const versionId = body.versionId, locationId = body.locationId;
  return g7GuardedMutation(db, tokenHash(rawToken), 'cad:current',
    { kind: 'version', versionId }, context, (actor, siteId) => {
      const file = db.prepare('SELECT location_id FROM "CadFileVersion" WHERE id=?')
        .get(versionId);
      if (!file || file.location_id !== locationId || !siteId) throw fail(409, 'CONFLICT');
      const result = db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?')
        .run(versionId, locationId);
      if (result.changes !== 1) throw fail(409, 'CONFLICT');
      cadAudit(db, 'CAD_CURRENT_CHANGED', actor.id, siteId, versionId, context);
      return { locationId, versionId };
    });
}
export async function stagedCadDelete(db: IsolatedDb, gate: G7StagingGate,
  rawToken: unknown, body: Record<string, unknown>, context: G4Context) {
  if (!gate.writeEnabled) throw fail(403, 'ACCESS_DENIED');
  if (!idValid(body.versionId)) throw fail(400, 'BAD_INPUT');
  const versionId = body.versionId;
  const file = db.prepare('SELECT delete_password_hash FROM "CadFileVersion" WHERE id=?')
    .get(versionId);
  // Authenticate before testing the existing delete password; denied access
  // must not reveal whether a Version or its password exists.
  createG4Service(createG4IsolatedStore(db)).permit(rawToken, 'cad:delete',
    { kind: 'version', versionId }, context);
  if (!file || !await verifyDeletePassword(
    validateDeletePassword(body.password), file.delete_password_hash as string | null,
  )) throw fail(403, 'ACCESS_DENIED');
  return g7GuardedMutation(db, tokenHash(rawToken), 'cad:delete',
    { kind: 'version', versionId }, context, (actor, siteId) => {
      const current = db.prepare(
        'SELECT location_id,storage_path,delete_password_hash FROM "CadFileVersion" WHERE id=?'
      ).get(versionId);
      if (!current || current.delete_password_hash !== file.delete_password_hash ||
          !siteId) throw fail(409, 'CONFLICT');
      const storagePath = String(current.storage_path);
      assertStageFile(gate, storagePath);
      db.prepare('UPDATE "CadLocation" SET current_version_id=NULL WHERE id=? AND current_version_id=?')
        .run(String(current.location_id), versionId);
      db.prepare('INSERT INTO "CadDeletionJob"(id,version_id,storage_path) VALUES(?,?,?)')
        .run(randomUUID(), versionId, storagePath);
      db.prepare('DELETE FROM "CadFileVersion" WHERE id=?').run(versionId);
      cadAudit(db, 'CAD_VERSION_DELETED', actor.id, siteId, versionId, context);
      // File physical cleanup must be independent and idempotent. This stage
      // intentionally retains tombstoned bytes for snapshot/rollback evidence.
      return { deleted: true, versionId, cleanupPending: true };
    });
}
