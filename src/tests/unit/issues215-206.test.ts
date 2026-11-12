import {afterEach,expect,test,vi} from 'vitest';
import * as THREE from 'three';
import {checking,gateStatus,sessionStatus} from '../../features/g7-runtime/session-status-model';
import {CANVAS_BACKGROUND_KEY,DEFAULT_CANVAS_BACKGROUND,normalizeCanvasBackground,readCanvasBackground,storeCanvasBackground} from '../../features/cad-viewer/canvas-background';
import {collectBlackMaterials,withDisplayContrast} from '../../viewers/three-dxf-viewer/display-contrast';
import {ViewerManager,type CadViewerAdapter} from '../../viewers/core/adapter';

afterEach(()=>vi.unstubAllGlobals());
test('T215-02 server gate and session projection never expose identity or CSRF',()=>{
  expect(checking.kind).toBe('checking');
  expect(gateStatus({state:'OFF',authEnabled:false})).toBe('off');
  expect(gateStatus({state:'BLOCKED',authEnabled:true})).toBe('blocked');
  expect(gateStatus({state:'ACTIVE',authEnabled:false})).toBe('unavailable');
  expect(sessionStatus(401,null)).toEqual({kind:'login-required',roles:[]});
  for(const status of [403,404,500])expect(sessionStatus(status,{}).kind).toBe('unavailable');
  const actor={id:'private-user-id',status:'ACTIVE',roles:['Reader','Admin','unknown'],siteGrants:['private-site']};
  const projected=sessionStatus(200,{actor,csrfToken:'private-proof'});
  expect(projected).toEqual({kind:'signed-in',roles:['Admin','Reader']});
  expect(JSON.stringify(projected)).not.toMatch(/private|unknown/);
  for(const invalid of [{...actor,id:''},{...actor,status:'DISABLED'},{...actor,roles:[]},{...actor,roles:['unknown']}])
    expect(sessionStatus(200,{actor:invalid}).kind).toBe('unavailable');
});

test('T206-02 versioned preference accepts only six-digit RGB, tolerates unavailable storage',()=>{
  expect(normalizeCanvasBackground('#Ab09Ff')).toBe('#ab09ff');
  for(const value of ['black','#abc','#001122ff','#gg0000','  #001122',null])expect(normalizeCanvasBackground(value)).toBeNull();
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  expect(readCanvasBackground(storage)).toBe(DEFAULT_CANVAS_BACKGROUND);
  expect(storeCanvasBackground(storage,'#123456')).toBe(true);
  expect(values.get(CANVAS_BACKGROUND_KEY)).toBe('#123456');
  expect(readCanvasBackground(storage)).toBe('#123456');
  values.set(CANVAS_BACKGROUND_KEY,'corrupt');expect(readCanvasBackground(storage)).toBe(DEFAULT_CANVAS_BACKGROUND);
  expect(readCanvasBackground({getItem:()=>{throw Error('blocked');}})).toBe(DEFAULT_CANVAS_BACKGROUND);
  expect(storeCanvasBackground({setItem:()=>{throw Error('blocked');}},'#ffffff')).toBe(false);
});

test('T206-03 black-origin display contrast restores exact canonical colors even on render failure',()=>{
  const root=new THREE.Group();
  const black=new THREE.LineBasicMaterial({color:0x000000});
  const colored=new THREE.LineBasicMaterial({color:0x2a7481});
  const white=new THREE.LineBasicMaterial({color:0xffffff});
  const nearBlack=new THREE.LineBasicMaterial();nearBlack.color.setRGB(0.000001,0,0);
  for(const material of [black,black,colored,white,nearBlack])
    root.add(new THREE.Line(new THREE.BufferGeometry(),material));
  const originals=[black,colored,white,nearBlack].map(material=>material.color.clone());
  const canonical=JSON.stringify(root.toJSON());
  const found=collectBlackMaterials(root);expect(found).toEqual([black]);
  withDisplayContrast(found,'#262626',()=>{
    expect(black.color.getHex()).toBe(0xffffff);
    expect(colored.color.equals(originals[1])).toBe(true);
    expect(white.color.equals(originals[2])).toBe(true);
    expect(nearBlack.color.equals(originals[3])).toBe(true);
  });
  expect(JSON.stringify(root.toJSON())).toBe(canonical);
  withDisplayContrast(found,'#ffffff',()=>expect(black.color.getHex()).toBe(0));
  black.color.setHex(0xff0000);withDisplayContrast(found,'#000000',()=>expect(black.color.getHex()).toBe(0xff0000));
  black.color.setHex(0);
  expect(()=>withDisplayContrast(found,'#000000',()=>{throw Error('render');})).toThrow('render');
  expect(JSON.stringify(root.toJSON())).toBe(canonical);
});

test('T206-04 Manager forwards initial and later colors without a second load; unsupported adapter is explicit',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('DXF bytes')));
  const setCanvasBackground=vi.fn();const load=vi.fn(async()=>({empty:false}));
  const adapter:CadViewerAdapter={load,setCanvasBackground,dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()};
  const manager=new ViewerManager(async()=>adapter);
  expect(manager.setCanvasBackground('#AaBbCc')).toBe(false);
  expect(manager.setCanvasBackground('invalid')).toBe(false);
  await manager.load('/dxf','DXF');
  expect(setCanvasBackground).toHaveBeenCalledWith('#aabbcc');
  expect(manager.supportsCanvasBackground()).toBe(true);
  for(let i=0;i<20;i++)expect(manager.setCanvasBackground(i%2?'#000000':'#ffffff')).toBe(true);
  expect(load).toHaveBeenCalledTimes(1);
  expect(setCanvasBackground).toHaveBeenCalledTimes(21);
  manager.dispose();expect(manager.supportsCanvasBackground()).toBe(false);
  expect(manager.setCanvasBackground('#123456')).toBe(false);
  const failing:CadViewerAdapter={...adapter,setCanvasBackground:()=>{throw Error('GPU clear');},dispose:vi.fn()};
  const failed=new ViewerManager(async()=>failing);
  await expect(failed.load('/dxf','DXF')).rejects.toMatchObject({stage:'adapter-load'});
  expect(failing.dispose).toHaveBeenCalledOnce();
});
