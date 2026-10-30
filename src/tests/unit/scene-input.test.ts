import { describe, expect, test } from 'vitest';
import { parseScenePublicationInput } from '../../server/scene/scene-input';

const request=(body:string)=>new Request('https://cad.example.test/api/cad-files/id/scene',{
  method:'POST',headers:{'content-type':'application/json'},body});
describe('#164 bounded Scene publication envelope',()=>{
  test('accepts canonical base64 beyond 1 MiB without regex stack exhaustion',async()=>{
    const bytes=Buffer.alloc(1024*1024+17,0x5a);
    const parsed=await parseScenePublicationInput(request(JSON.stringify({manifest:{synthetic:true},
      bytesBase64:bytes.toString('base64'),expectedRevision:null})));
    expect(parsed.bytes).toEqual(bytes);
    expect(parsed.expectedRevision).toBeNull();
  });
  test('rejects noncanonical and malformed large base64 before any storage call',async()=>{
    const bytes=Buffer.alloc(1024*1024+17,0x5a),base64=bytes.toString('base64');
    for(const value of [base64.slice(0,-1)+'?',base64+'=',base64.slice(0,-1)+'=']){
      await expect(parseScenePublicationInput(request(JSON.stringify({manifest:{},bytesBase64:value,
        expectedRevision:null})))).rejects.toMatchObject({code:'SCENE_INVALID'});
    }
  });
});
