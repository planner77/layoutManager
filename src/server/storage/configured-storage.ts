import { CadError } from '@/domain/cad';
import { storageConfiguration } from '@/scripts/storage-config.mjs';
import { CadStorage } from './cad-storage';
import { S3ObjectStorage } from './s3-storage';
import type { ReceivedCad, StorageBackend } from './backend';
export class ConfiguredCadStorage extends CadStorage implements StorageBackend {
  private options: ReturnType<typeof storageConfiguration>;
  private remote?: S3ObjectStorage;
  constructor(directory: string, maxBytes: number, env: Record<string,string|undefined>) {
    super(directory, maxBytes); this.options = storageConfiguration(env);
  }
  private s3() {
    if (!this.options.s3) throw new CadError('STORAGE_UNAVAILABLE', 'S3 저장소 설정이 필요합니다.', 503);
    return this.remote ??= new S3ObjectStorage(this.options.s3);
  }
  async prepare(received: ReceivedCad) {
    return this.options.backend === 's3' ? this.s3().prepare(received) : undefined;
  }
  override async content(locator: string) { return locator.startsWith('s3:') ? this.s3().content(locator) : super.content(locator); }
  override async removeUncommitted(locator: string) { return locator.startsWith('s3:') ? this.s3().removeUncommitted(locator) : super.removeUncommitted(locator); }
  close() { this.remote?.close(); }
}
