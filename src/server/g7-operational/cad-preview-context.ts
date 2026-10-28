/** #109 S3-3: use an isolated Prisma client and local CAD backend for
 * the nonproduction S3 disposable test target. Never route to global context
 * when a gated request is present.
 */
import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { context } from '../context';
import { createDb } from '../db';
import { MasterRepository } from '../repositories/master';
import { CadRepository } from '../repositories/cad';
import { CadStorage } from '../storage/cad-storage';
import { ConfiguredCadStorage } from '../storage/configured-storage';
import { requireG7S3DisposableTarget } from './disposable-target';
import { openG7S3PreviewDb } from './preview-db';
import { requireG7RuntimeWrite, type G7CadWrite } from './cad-guard';
import { requireG7S3CadStorageAlignment } from './cad-preview-storage';

export function cadWriteContext(auth?: G7CadWrite) {
  if (!auth) return { ...context(), close: async () => {} };
  if (auth.runtime) {
    const gate = requireG7RuntimeWrite(auth)!;
    // Use the exact signed DB/storage pair, not a singleton cached before a
    // release or recovery change. Reads continue to use the same configured paths.
    const db = createDb('file:' + gate.databasePath);
    const storage = new ConfiguredCadStorage(gate.cadStoragePath,
      Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100) * 1024 * 1024,process.env);
    return {repo:new CadRepository(db),masters:new MasterRepository(db),storage,
      close:async()=>{storage.close();await db.$disconnect();}};
  }
  const target = requireG7S3DisposableTarget(process.env);
  // Verify that the formal seven-migration S3 schema is present, not just a
  // disposable manifest. Production migration directory is never accessed.
  const check = openG7S3PreviewDb(target);
  check.close();
  const directory = requireG7S3CadStorageAlignment(target, process.env);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const s = lstatSync(directory);
  if (!s.isDirectory() || s.isSymbolicLink() ||
      realpathSync(directory) !== directory ||
      s.uid !== process.getuid?.() || (s.mode & 0o077) !== 0)
    throw new Error('G7_S3_CAD_STORAGE_DENIED');
  const db = createDb('file:' + target.databasePath);
  return {
    repo: new CadRepository(db),
    masters: new MasterRepository(db),
    storage: new CadStorage(directory, 100 * 1024 * 1024),
    close: () => db.$disconnect(),
  };
}
