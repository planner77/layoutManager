import { test, expect } from 'vitest';
import { storageConfiguration } from '@/scripts/storage-config.mjs';
import { s3Location } from '@/server/storage/s3-storage';
test('TC-S3-003: defaults local; incomplete S3, credential URLs and invalid addressing are rejected',()=>{
  expect(storageConfiguration({}).backend).toBe('local');
  expect(()=>storageConfiguration({CAD_STORAGE_BACKEND:'other'})).toThrow('CAD_STORAGE_BACKEND');
  expect(()=>storageConfiguration({CAD_STORAGE_BACKEND:'s3'})).toThrow('required');
  const env={CAD_STORAGE_BACKEND:'s3',CAD_S3_ENDPOINT:'http://localhost:8333',CAD_S3_BUCKET:'cad-files',CAD_S3_ACCESS_KEY_ID:'fixture',CAD_S3_SECRET_ACCESS_KEY:'fixture'};
  expect(storageConfiguration(env).s3?.forcePathStyle).toBe(true);
  const url=new URL(env.CAD_S3_ENDPOINT);url.username='fixture';url.password='fixture';
  expect(()=>storageConfiguration({...env,CAD_S3_ENDPOINT:url.href})).toThrow('without credentials');
  expect(()=>storageConfiguration({...env,CAD_S3_FORCE_PATH_STYLE:'yes'})).toThrow('true or false');
  expect(()=>storageConfiguration({...env,CAD_S3_TIMEOUT_MS:'0'})).toThrow('1000');
  for(const key of ['s3:cad-files:../a','s3:cad-files:/etc/passwd','s3:cad-files:cad/%2e%2e/original.dwg'])expect(()=>s3Location(key)).toThrow();
});

test('TC-S3-003: explicit empty session token overrides a value from the env file',async()=>{
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { appEnvironment } = await import('@/scripts/env.mjs');
  const dir=await mkdtemp(`${tmpdir()}/cad-env-test-`);
  try {
    await writeFile(`${dir}/settings`, 'CAD_S3_SESSION_TOKEN=fixture-only\n', {mode:0o600});
    expect(appEnvironment({CAD_STORAGE_BACKEND:'local',CAD_S3_SESSION_TOKEN:''},`${dir}/settings`).CAD_S3_SESSION_TOKEN).toBe('');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
