import type { CadStorage } from './cad-storage';
import type { UploadDiagnostics } from '../upload-observability';
export type ReceivedCad = Awaited<ReturnType<CadStorage['receive']>>;
export interface StorageBackend {
  readonly backend?: 'local' | 's3';
  receive(request: Request, diagnostics?: UploadDiagnostics): Promise<ReceivedCad>;
  publish(tempFile: string, locationId: string, versionId: string, format: string): Promise<string>;
  content(locator: string): ReturnType<CadStorage['content']>;
  removeUncommitted(locator: string): Promise<void>;
  // Remote I/O completes before entering the short SQLite transaction.
  prepare?(received: ReceivedCad): Promise<string | undefined>;
}
