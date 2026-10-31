import {expect,test,vi,beforeEach} from 'vitest';
import {authorizedMemoList} from '../../server/cad-business/authorized-memo-read';

const versionId='11111111-1111-4111-8111-111111111111',actorId='22222222-2222-4222-8222-222222222222';
const sha='a'.repeat(64);
const tx={
 user:{count:vi.fn()},
 $queryRawUnsafe:vi.fn(),
 cadFileVersion:{findUnique:vi.fn()},currentScene:{findUnique:vi.fn()},
 cadMemo:{findMany:vi.fn()},cadMemoAnchor:{findMany:vi.fn()},
 cadMemoFeature:{findMany:vi.fn()},cadMemoGroup:{findMany:vi.fn()},
};
const auth=vi.fn(),approval=vi.fn();
vi.mock('server-only',()=>({}));
vi.mock('../../server/db',()=>({writeTransaction:vi.fn(async(_db:unknown,work:(tx:unknown)=>Promise<unknown>)=>work(tx))}));
vi.mock('../../server/scene/scene-context',()=>({requireSceneRead:(...args:unknown[])=>auth(...args)}));
vi.mock('../../server/g7-operational/runtime-handler',()=>({assertRuntimeApprovalCurrent:(...args:unknown[])=>approval(...args)}));

beforeEach(()=>{
 vi.clearAllMocks();tx.user.count.mockResolvedValue(1);
 tx.$queryRawUnsafe.mockResolvedValue(['CadMemo','CadBusinessAudit','CadOutline','CadMemoAnchor','CadMemoFeature','CadMemoGroup'].map(name=>({name})));
 tx.cadFileVersion.findUnique.mockResolvedValue({sha256:sha,fileFormat:'DXF'});
 tx.currentScene.findUnique.mockResolvedValue({revision:0});tx.cadMemo.findMany.mockResolvedValue([]);
 tx.cadMemoAnchor.findMany.mockResolvedValue([]);tx.cadMemoFeature.findMany.mockResolvedValue([]);tx.cadMemoGroup.findMany.mockResolvedValue([]);
 auth.mockResolvedValue({actorId});
});

test('reads a bounded Version/SHA/revision envelope and rechecks actor and approval inside the transaction',async()=>{
 const result=await authorizedMemoList({} as never,new Request('http://localhost'),versionId,{} as never);
 expect(result).toMatchObject({actorId,versionId,sourceSha256:sha,sceneRevision:0,memos:[],groups:[],featuresAvailable:true});
 expect(tx.cadMemo.findMany).toHaveBeenCalledWith(expect.objectContaining({take:101}));
 expect(tx.cadMemoGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({take:21}));
 expect(auth).toHaveBeenCalledTimes(2);expect(approval).toHaveBeenCalledTimes(3);
});

test('fails closed when identity changes, SHA drifts, or feature schema is partial',async()=>{
 auth.mockResolvedValueOnce({actorId}).mockResolvedValueOnce({actorId:'33333333-3333-4333-8333-333333333333'});
 await expect(authorizedMemoList({} as never,new Request('http://localhost'),versionId,{} as never)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 auth.mockResolvedValue({actorId});tx.cadMemo.findMany.mockResolvedValue([{id:'m',sourceSha256:'b'.repeat(64)}]);
 await expect(authorizedMemoList({} as never,new Request('http://localhost'),versionId,{} as never)).rejects.toMatchObject({code:'BUSINESS_SOURCE_CHANGED'});
 tx.cadMemo.findMany.mockResolvedValue([]);
 tx.$queryRawUnsafe.mockResolvedValue(['CadMemo','CadBusinessAudit','CadOutline','CadMemoFeature'].map(name=>({name})));
 await expect(authorizedMemoList({} as never,new Request('http://localhost'),versionId,{} as never)).rejects.toMatchObject({code:'MEMO_FEATURE_SCHEMA_PARTIAL'});
});

test('keeps authorized empty DWG Memo GET compatible without optional feature or anchor tables',async()=>{
 tx.cadFileVersion.findUnique.mockResolvedValue({sha256:sha,fileFormat:'DWG'});
 tx.$queryRawUnsafe.mockResolvedValue(['CadMemo','CadBusinessAudit','CadOutline'].map(name=>({name})));
 const result=await authorizedMemoList({} as never,new Request('http://localhost'),versionId,{} as never);
 expect(result).toMatchObject({actorId,versionId,sourceSha256:sha,sceneRevision:0,
  memos:[],groups:[],featuresAvailable:false});
 expect(tx.cadMemoAnchor.findMany).not.toHaveBeenCalled();
 expect(tx.cadMemoFeature.findMany).not.toHaveBeenCalled();
 expect(tx.cadMemoGroup.findMany).not.toHaveBeenCalled();
 expect(auth).toHaveBeenCalledTimes(2);
});
