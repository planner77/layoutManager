import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, constants } from 'node:fs';
import { mkdir, realpath, mkdtemp, rm, link, unlink, open } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import { CadError, registration } from '@/domain/cad';

export class CadStorage {
  constructor(public directory: string, public maxBytes: number) {}
  private async root() { await mkdir(this.directory, { recursive: true }); return realpath(this.directory); }
  async receive(request: Request) {
    if (!request.body) throw new CadError('MISSING_FILE', '파일을 선택해주세요.');
    let parser: ReturnType<typeof busboy>;
    try { parser = busboy({ headers: { 'content-type': request.headers.get('content-type') ?? '' }, defParamCharset: 'utf8', limits: { fileSize: this.maxBytes + 1, files: 1, fields: 6, fieldSize: 4096, parts: 8 } }); }
    catch { throw new CadError('INVALID_UPLOAD', '올바른 파일 업로드 요청이 아닙니다.'); }
    const temp = await mkdtemp(path.join(await this.root(), '.upload-'));
    const tempFile = path.join(temp, randomUUID());
    const fields: Record<string, unknown> = {};
    let filename = '', size = 0, invalid = false, truncated = false, gotFile = false;
    const hash = createHash('sha256');
    let saving: Promise<void> = Promise.resolve();
    const cleanup = () => rm(temp, { recursive: true, force: true });
    parser.on('field', (name, value, info) => { if (name in fields || info.valueTruncated) invalid = true; fields[name] = value; });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.on(event, () => { invalid = true; });
    parser.on('file', (name, stream, info) => {
      gotFile = true; filename = info.filename;
      if (name !== 'file') invalid = true;
      stream.on('limit', () => { truncated = true; });
      saving = pipeline(stream, new Transform({ transform(chunk: Buffer, _encoding, next) { size += chunk.length; hash.update(chunk); next(null, chunk); } }), createWriteStream(tempFile, { flags: 'wx', mode: 0o600 }));
      // Consume the rejection immediately; it is rethrown after the parser settles.
      void saving.catch(() => {});
    });
    let bodyBytes = 0;
    const limit = this.maxBytes + 64 * 1024;
    try {
      await pipeline(Readable.fromWeb(request.body as never), new Transform({ transform(chunk: Buffer, _encoding, next) { bodyBytes += chunk.length; next(bodyBytes > limit ? new CadError('FILE_TOO_LARGE', '업로드 제한 크기를 초과했습니다.', 413) : null, chunk); } }), parser);
      await saving;
      if (truncated || size > this.maxBytes) throw new CadError('FILE_TOO_LARGE', '업로드 제한 크기를 초과했습니다.', 413);
      if (!gotFile || !size) throw new CadError('EMPTY_FILE', '내용이 있는 파일을 선택해주세요.');
      if (invalid || !filename || filename.length > 255 || /[\x00-\x1f]/.test(filename)) throw new CadError('INVALID_UPLOAD', '파일 또는 입력 항목을 확인해주세요.');
      const extension = path.extname(filename).toLowerCase();
      if (extension !== '.dxf' && extension !== '.dwg') throw new CadError('UNSUPPORTED_FILE', 'DXF 또는 DWG 파일만 등록할 수 있습니다.', 415);
      return { input: registration(fields), file: { originalFilename: filename, fileFormat: extension === '.dxf' ? 'DXF' as const : 'DWG' as const, fileSize: size, sha256: hash.digest('hex'), storagePath: '' }, tempFile, cleanup };
    } catch (error) { await saving.catch(() => {}); await cleanup(); throw error; }
  }
  async publish(tempFile: string, locationId: string, versionId: string, format: string) {
    const key = `${locationId}/${versionId}/original.${format.toLowerCase()}`;
    const root = await this.root();
    const target = path.join(root, key);
    await mkdir(path.dirname(target), { recursive: true });
    const actual = await realpath(path.dirname(target));
    if (!actual.startsWith(root + path.sep)) throw new CadError('UNSAFE_PATH', '파일 저장 경로를 확인할 수 없습니다.', 500);
    // Same filesystem, atomic publication, EEXIST protects against overwrite.
    await link(tempFile, target);
    await unlink(tempFile);
    return key;
  }
  private async resolve(key: string) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.(dxf|dwg)$/.test(key)) throw new CadError('UNSAFE_PATH', '파일 경로를 확인할 수 없습니다.', 404);
    const root = await this.root();
    let file: string;
    try { file = await realpath(path.join(root, key)); } catch { throw new CadError('FILE_NOT_FOUND', '저장된 도면 파일을 찾을 수 없습니다.', 404); }
    if (!file.startsWith(root + path.sep)) throw new CadError('UNSAFE_PATH', '파일 경로를 확인할 수 없습니다.', 404);
    return file;
  }
  async content(key: string): Promise<{stream: ReadableStream<Uint8Array>; size: number}> { const file = await open(await this.resolve(key), constants.O_RDONLY | constants.O_NOFOLLOW); const stat = await file.stat(); if (!stat.isFile()) { await file.close(); throw new CadError('FILE_NOT_FOUND', '도면 파일을 찾을 수 없습니다.', 404); } return { stream: Readable.toWeb(file.createReadStream({ autoClose: true })) as unknown as ReadableStream<Uint8Array>, size: stat.size }; }
  async removeUncommitted(key: string) { await unlink(await this.resolve(key)); }
}
