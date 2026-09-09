import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CadError } from '@/domain/cad';
import type { storageConfiguration } from '@/scripts/storage-config.mjs';
import type { ReceivedCad } from './backend';
type Options = NonNullable<ReturnType<typeof storageConfiguration>['s3']>;
export function s3Location(locator: string) {
  const match = /^s3:([a-z0-9][a-z0-9.-]{1,61}[a-z0-9]):(cad\/[0-9a-f-]{36}\/original\.(?:dxf|dwg))$/.exec(locator);
  if (!match) throw new CadError('UNSAFE_PATH', '저장된 도면 위치를 확인할 수 없습니다.', 404);
  return { Bucket: match[1], Key: match[2] };
}
export class S3ObjectStorage {
  readonly client: S3Client;
  constructor(private options: Options) {
    this.client = new S3Client({ ...options, maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  }
  async prepare(received: ReceivedCad) {
    const key = `cad/${randomUUID()}/original.${received.file.fileFormat.toLowerCase()}`;
    const locator = `s3:${this.options.bucket}:${key}`;
    const body = createReadStream(received.tempFile);
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: body, ContentLength: received.file.fileSize, ContentType: 'application/octet-stream', Metadata: { sha256: received.file.sha256 }, IfNoneMatch: '*' }), { abortSignal: AbortSignal.timeout(this.options.timeoutMs) });
      return locator;
    } catch (error) {
      // The response may be lost after a successful PUT. Never delete on uncertain publication.
      throw new CadError('STORAGE_UNAVAILABLE', '오브젝트 저장소에 파일을 저장하지 못했습니다.', 503, { cause: error, recoveryId: key.split('/')[1] });
    } finally { body.destroy(); }
  }
  async content(locator: string) {
    const location = s3Location(locator);
    try {
      const response = await this.client.send(new GetObjectCommand(location), { abortSignal: AbortSignal.timeout(this.options.timeoutMs) });
      if (!response.Body || response.ContentLength === undefined) throw new Error('Missing body');
      return { stream: response.Body.transformToWebStream(), size: response.ContentLength };
    } catch (error) {
      if ((error as {name?:string}).name === 'NoSuchKey') throw new CadError('FILE_NOT_FOUND', '저장된 도면 파일을 찾을 수 없습니다.', 404, { cause: error });
      throw new CadError('STORAGE_UNAVAILABLE', '오브젝트 저장소에서 파일을 읽지 못했습니다.', 503, { cause: error });
    }
  }
  async removeUncommitted(locator: string) {
    await this.client.send(new DeleteObjectCommand(s3Location(locator)), { abortSignal: AbortSignal.timeout(this.options.timeoutMs) });
  }
  close() { this.client.destroy(); }
}
