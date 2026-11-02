import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CadError } from '@/domain/cad';
import { storageConfiguration } from '@/scripts/storage-config.mjs';

const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
export const SCENE_MAX_BYTES=32*1024*1024;
const unavailable=(cause?:unknown)=>new CadError('SCENE_STORAGE_UNAVAILABLE','Scene 저장소를 확인할 수 없습니다.',503,{cause});

/** Only server-generated asset IDs can form a locator. No route accepts a path. */
export class SceneBlobStorage {
  private readonly config:ReturnType<typeof storageConfiguration>;
  private client?:S3Client;
  constructor(private readonly directory:string,env:Record<string,string|undefined>){
    this.config=storageConfiguration(env);
  }
  locator(assetId:string):string {
    if(!ID.test(assetId))throw new CadError('SCENE_ASSET_INVALID','Scene ID가 올바르지 않습니다.',400);
    return this.config.backend==='s3'
      ? `s3:${this.config.s3!.bucket}:scene/${assetId}.json`
      : `scenes/${assetId}.json`;
  }
  private s3():S3Client {
    if(!this.config.s3)throw unavailable();
    return this.client??=new S3Client({...this.config.s3,maxAttempts:1,
      requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
  }
  private parse(locator:string):{bucket?:string;key:string;local:boolean} {
    const local=/^scenes\/([0-9a-f-]{36})\.json$/.exec(locator);
    if(local&&ID.test(local[1]))return {key:locator,local:true};
    const remote=/^s3:([a-z0-9][a-z0-9.-]{1,61}[a-z0-9]):(scene\/([0-9a-f-]{36})\.json)$/.exec(locator);
    if(remote&&ID.test(remote[3])&&remote[1]===this.config.s3?.bucket)
      return {bucket:remote[1],key:remote[2],local:false};
    throw new CadError('SCENE_LOCATOR_INVALID','Scene 저장 위치가 올바르지 않습니다.',503);
  }
  owns(locator:string,assetId:string):boolean{
    if(!ID.test(assetId))return false;
    try{return this.parse(locator).key.endsWith('/'+assetId+'.json');}
    catch{return false;}
  }
  private async localFile(key:string):Promise<string> {
    const root=await realpath(this.directory);
    const dir=path.join(root,'scenes');
    await mkdir(dir,{recursive:true,mode:0o700});
    if(await realpath(dir)!==dir)throw unavailable();
    return path.join(dir,path.basename(key));
  }
  async putVerified(locator:string,bytes:Uint8Array,digest:string):Promise<void>{
    if(!SHA.test(digest)||bytes.length<1||bytes.length>SCENE_MAX_BYTES||
      createHash('sha256').update(bytes).digest('hex')!==digest)
      throw new CadError('SCENE_DIGEST_MISMATCH','Scene 내용이 올바르지 않습니다.',400);
    const x=this.parse(locator);
    if(x.local){
      const filename=await this.localFile(x.key);
      const handle=await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    }else{
      try{await this.s3().send(new PutObjectCommand({Bucket:x.bucket!,Key:x.key,
        Body:bytes,ContentLength:bytes.length,ContentType:'application/json',
        Metadata:{sha256:digest},IfNoneMatch:'*'}),
        {abortSignal:AbortSignal.timeout(this.config.s3!.timeoutMs)});}
      catch(error){throw unavailable(error);}
    }
    // PUT acknowledgement alone is insufficient, especially for remote stores.
    await this.readVerified(locator,bytes.length,digest);
  }
  async readVerified(locator:string,length:number,digest:string):Promise<Uint8Array>{
    if(!Number.isSafeInteger(length)||length<1||length>SCENE_MAX_BYTES||!SHA.test(digest))throw unavailable();
    const x=this.parse(locator);
    let bytes:Uint8Array;
    if(x.local){
      try{
        const filename=await this.localFile(x.key);
        const handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
        try{
          const stat=await handle.stat();
          if(!stat.isFile()||stat.size!==length||stat.nlink!==1)
            throw new CadError('SCENE_STORAGE_CORRUPT','Scene 내용이 손상되었습니다.',503);
          bytes=await handle.readFile();
        }finally{await handle.close();}
      }catch(error){
        if(error instanceof CadError&&error.code==='SCENE_STORAGE_CORRUPT')throw error;
        if((error as NodeJS.ErrnoException).code==='ENOENT')
          throw new CadError('SCENE_STORAGE_CORRUPT','Scene 내용이 손상되었습니다.',503);
        throw unavailable(error);
      }
    }else{
      try{
        const response=await this.s3().send(new GetObjectCommand({Bucket:x.bucket!,Key:x.key}),
          {abortSignal:AbortSignal.timeout(this.config.s3!.timeoutMs)});
        if(!response.Body||response.ContentLength!==length)
          throw new CadError('SCENE_STORAGE_CORRUPT','Scene 내용이 손상되었습니다.',503);
        const reader=response.Body.transformToWebStream().getReader();
        const chunks:Uint8Array[]=[];let received=0;
        try{
          for(;;){
            const part=await reader.read();if(part.done)break;
            received+=part.value.byteLength;
            if(received>length||received>SCENE_MAX_BYTES){await reader.cancel();
              throw new CadError('SCENE_STORAGE_CORRUPT','Scene 내용이 손상되었습니다.',503);}
            chunks.push(part.value);
          }
        }finally{reader.releaseLock();}
        bytes=Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),received);
      }catch(error){
        if(error instanceof CadError&&error.code==='SCENE_STORAGE_CORRUPT')throw error;
        if(['NoSuchKey','NotFound'].includes((error as {name?:string}).name??''))
          throw new CadError('SCENE_STORAGE_CORRUPT','Scene 내용이 손상되었습니다.',503);
        throw unavailable(error);
      }
    }
    if(bytes.length!==length||createHash('sha256').update(bytes).digest('hex')!==digest)
      throw new CadError('SCENE_STORAGE_CORRUPT','Scene 내용이 손상되었습니다.',503);
    return bytes;
  }
  async removeOrphan(locator:string):Promise<void>{
    const x=this.parse(locator);
    if(x.local){
      try{await unlink(await this.localFile(x.key));}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    }else await this.s3().send(new DeleteObjectCommand({Bucket:x.bucket!,Key:x.key}),
      {abortSignal:AbortSignal.timeout(this.config.s3!.timeoutMs)});
  }
  close():void{this.client?.destroy();}
}
