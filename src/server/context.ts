import 'server-only';
import { database } from './db';
import { CadRepository } from './repositories/cad';
import { CadStorage } from './storage/cad-storage';
export function context() {
  if (!process.env.CAD_STORAGE_PATH) throw new Error('CAD_STORAGE_PATH is required');
  return { repo: new CadRepository(database()), storage: new CadStorage(process.env.CAD_STORAGE_PATH, Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100) * 1024 * 1024) };
}
