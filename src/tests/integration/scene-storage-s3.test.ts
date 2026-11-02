import { describe, expect, test } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SceneBlobStorage } from '../../server/storage/scene-storage';

const env={CAD_STORAGE_BACKEND:'s3',CAD_S3_ENDPOINT:'https://s3.example.test',
  CAD_S3_BUCKET:'scene-bucket',CAD_S3_ACCESS_KEY_ID:'synthetic-access',
  CAD_S3_SECRET_ACCESS_KEY:'synthetic-secret'};
const body=(bytes:Uint8Array)=>({transformToWebStream:()=>new ReadableStream<Uint8Array>({
  start(controller){controller.enqueue(bytes);controller.close();}})});
function mockStore(send:(command:unknown)=>Promise<unknown>){
  const storage=new SceneBlobStorage('/unused',env);
  (storage as unknown as {client:{send:typeof send;destroy:()=>void}}).client={send,destroy:()=>{}};
  return storage;
}
describe('#164 Scene S3 immutable object storage contract',()=>{
  test('conditional PUT uses server-generated key; readback proves bytes and SHA',async()=>{
    const id=randomUUID(),bytes=Buffer.from('{"scene":"synthetic"}'),digest=createHash('sha256').update(bytes).digest('hex');
    const commands:unknown[]=[];
    const storage=mockStore(async command=>{
      commands.push(command);
      if(command instanceof PutObjectCommand)return {};
      if(command instanceof GetObjectCommand)return {ContentLength:bytes.length,Body:body(bytes)};
      throw new Error('unexpected command');
    });
    const locator=storage.locator(id);
    expect(locator).toBe(`s3:scene-bucket:scene/${id}.json`);
    await storage.putVerified(locator,bytes,digest);
    expect((commands[0] as PutObjectCommand).input).toMatchObject({Bucket:'scene-bucket',
      Key:`scene/${id}.json`,IfNoneMatch:'*',ContentLength:bytes.length,Metadata:{sha256:digest}});
    expect(commands[1]).toBeInstanceOf(GetObjectCommand);
    expect(await storage.readVerified(locator,bytes.length,digest)).toEqual(bytes);
    storage.close();
  });
  test('timeout and corrupt readback fail without deletion; unsafe locator is denied',async()=>{
    const id=randomUUID(),bytes=Buffer.from('valid'),digest=createHash('sha256').update(bytes).digest('hex');
    let deletes=0;
    const storage=mockStore(async command=>{
      if(command instanceof PutObjectCommand)return {};
      if(command instanceof GetObjectCommand)return {ContentLength:bytes.length,Body:body(Buffer.from('wrong'))};
      if(command instanceof DeleteObjectCommand)deletes++;
      return {};
    });
    await expect(storage.putVerified(storage.locator(id),bytes,digest)).rejects.toMatchObject({code:'SCENE_STORAGE_CORRUPT'});
    expect(deletes).toBe(0);
    await expect(storage.readVerified(`s3:scene-bucket:scene/../${id}.json`,bytes.length,digest))
      .rejects.toMatchObject({code:'SCENE_LOCATOR_INVALID'});
    storage.close();
    const failed=mockStore(async command=>{if(command instanceof PutObjectCommand)throw new Error('lost PUT ACK');return {};});
    await expect(failed.putVerified(failed.locator(randomUUID()),bytes,digest))
      .rejects.toMatchObject({code:'SCENE_STORAGE_UNAVAILABLE'});
    failed.close();
  });
  test('lying S3 ContentLength cannot buffer an oversized response',async()=>{
    const id=randomUUID(),bytes=Buffer.from('small'),digest=createHash('sha256').update(bytes).digest('hex');
    let cancelled=false;
    const storage=mockStore(async command=>{
      if(command instanceof GetObjectCommand)return {ContentLength:bytes.length,Body:{
        transformToWebStream:()=>new ReadableStream<Uint8Array>({
          start(controller){controller.enqueue(Buffer.alloc(1024*1024,0x78));},
          cancel(){cancelled=true;},
        })}};
      throw new Error('unexpected command');
    });
    await expect(storage.readVerified(storage.locator(id),bytes.length,digest))
      .rejects.toMatchObject({code:'SCENE_STORAGE_CORRUPT'});
    expect(cancelled).toBe(true);
    storage.close();
  });
});
