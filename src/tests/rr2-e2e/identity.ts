import {expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';

type Descriptor={mediaType:string;digest:string;size:number};
type Typed={engineImageId:string;configDigest:string;topDescriptor:Descriptor;
  manifestDescriptor:Descriptor};
export type RuntimeReceipt={images:{old:{app:string};new:{app:string};
  oldTyped:{app:Typed};newTyped:{app:Typed}}};

function inspect(kind:'container'|'image',name:string):Record<string,unknown>{
  const result=spawnSync('docker',[kind,'inspect',name],{encoding:'utf8',timeout:10_000});
  expect(result.status,`RR2_${kind.toUpperCase()}_INSPECT_FAILED`).toBe(0);
  const rows=JSON.parse(result.stdout) as Record<string,unknown>[];
  expect(rows).toHaveLength(1);
  return rows[0];
}
function sameDescriptor(actual:unknown,expected:Descriptor):boolean{
  if(!actual||typeof actual!=='object')return false;
  const row=actual as Record<string,unknown>;
  return row.mediaType===expected.mediaType&&row.digest===expected.digest&&
    row.size===expected.size;
}
export function assertRuntimeApp(receipt:RuntimeReceipt,release:'old'|'new',
  appName:string,project:string,volume:string):void{
  const ref=receipt.images[release].app;
  const typed=receipt.images[release==='old'?'oldTyped':'newTyped'].app;
  const app=inspect('container',appName);
  const image=inspect('image',ref);
  expect(image.Id).toBe(typed.engineImageId);
  const descriptor=image.Descriptor;
  if(descriptor==null)expect(image.Id).toBe(typed.configDigest);
  else expect(sameDescriptor(descriptor,typed.topDescriptor)||
              sameDescriptor(descriptor,typed.manifestDescriptor)).toBe(true);
  expect(app.Image).toBe(typed.engineImageId);
  expect((app.Config as {Image:string;Labels:Record<string,string>}).Image).toBe(ref);
  if(descriptor!=null)
    expect(sameDescriptor(app.ImageManifestDescriptor,typed.manifestDescriptor)).toBe(true);
  else expect(app.ImageManifestDescriptor).toBeFalsy();
  expect((app.Config as {Labels:Record<string,string>}).Labels['com.docker.compose.project'])
    .toBe(project);
  expect((app.Mounts as Array<{Name:string;Destination:string}>).some(m=>
    m.Name===volume&&m.Destination==='/data')).toBe(true);
}
