import {expect,type APIRequestContext} from '@playwright/test';

/** Greenfield first-install's persisted Scene, never the newest unrelated upload. */
export async function readyGreenfieldSceneVersion(api:APIRequestContext):Promise<string>{
  const result=await api.get('/api/cad-files?filename=synthetic-scene.dxf&pageSize=100');
  expect(result.status(),await result.text()).toBe(200);
  const listed=await result.json() as {items?:{id:string;originalFilename:string}[]};
  const matches=(listed.items??[]).filter(item=>item.originalFilename==='synthetic-scene.dxf');
  expect(matches,'expected exactly one persisted first-install Scene fixture').toHaveLength(1);
  const versionId=matches[0].id;
  const sceneResult=await api.get(`/api/cad-files/${versionId}/scene`);
  expect(sceneResult.status(),await sceneResult.text()).toBe(200);
  const scene=await sceneResult.json() as {status?:string};
  expect(scene.status,'first-install Scene must be READY before downstream E2E').toBe('READY');
  return versionId;
}
