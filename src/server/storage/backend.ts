import type { CadStorage } from './cad-storage';
export type ReceivedCad = Awaited<ReturnType<CadStorage['receive']>>;
export interface StorageBackend extends Pick<CadStorage, 'receive' | 'publish' | 'content' | 'removeUncommitted'> {
  // Remote I/O completes before entering the short SQLite transaction.
  prepare?(received: ReceivedCad): Promise<string | undefined>;
}
