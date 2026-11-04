import {describe,expect,it} from 'vitest';
import {sceneSha256} from '../../domain/scene-digest';
import {validateStoredScenePayload} from '../../domain/scene-payload';
import {buildCpuLineCandidate,parseCpuLineOnlyDxf,CPU_LINE_LIMITS} from '../../server/scene/cpu-line-candidate';

const line=(x:string,y:string)=>['0','LINE','8','0','10',x,'20',y,'11','10','21','20'];
const toBytes=(items:readonly string[])=>new TextEncoder().encode([...items,''].join('\n'));
function fixture(entities:readonly string[] = [...line('1','2'),...line('3','4')],unit='4'){
  return toBytes(['0','SECTION','2','HEADER','9','$INSUNITS','70',unit,
    '0','ENDSEC','0','SECTION','2','ENTITIES',...entities,
    '0','ENDSEC','0','EOF']);
}
const versionId='11111111-1111-4111-8111-111111111111';
describe('#225 B2-A Node CPU-only bounded LINE DXF candidate',()=>{
  it('creates real THREE geometry, v2 DTO and immutable tempfile readback without a browser',async()=>{
    const source=fixture();
    const candidate=await buildCpuLineCandidate({
      source,versionId,sourceSha256:sceneSha256(source),
    });
    expect(candidate.lineCount).toBe(2);
    expect(candidate.readbackVerified).toBe(true);
    expect(candidate.manifest.format).toBe('CUSTOM_DTO');
    expect(candidate.manifest.scope.sourceUnit).toBe('DXF_INSUNITS_4');
    expect(candidate.manifest.sha256).toBe(sceneSha256(candidate.bytes));
    expect(()=>validateStoredScenePayload(candidate.bytes,candidate.manifest)).not.toThrow();
    const parsed=JSON.parse(new TextDecoder().decode(candidate.bytes)) as {
      schema:number;root:{type:string;children:Array<{
        type:string;layer:string;geometry:{attributes:{position:{array:number[]}}};
      }>};viewerData:{sourceIndex:{state:string}};
    };
    expect(parsed.schema).toBe(2);
    expect(parsed.root.type).toBe('Group');
    expect(parsed.root.children).toHaveLength(2);
    expect(parsed.root.children[0].type).toBe('Line');
    expect(parsed.root.children[0].layer).toBe('0');
    expect(parsed.root.children[0].geometry.attributes.position.array).toEqual([1,2,0,10,20,0]);
    expect(parsed.viewerData.sourceIndex.state).toBe('UNAVAILABLE');
  });
  it('rejects a wrong source digest before parsing',async()=>{
    const source=fixture();
    await expect(buildCpuLineCandidate({
      source,versionId,sourceSha256:'a'.repeat(64),
    })).rejects.toThrow('SCENE_SOURCE_DIGEST_MISMATCH');
  });
  it('rejects unknown entities rather than silently omitting them',()=>{
    expect(()=>parseCpuLineOnlyDxf(fixture(['0','CIRCLE','10','1','20','2','40','3'])))
      .toThrow('SCENE_CONVERTER_UNAVAILABLE');
  });
  it('rejects unsupported color, layer, linetype and group codes',()=>{
    for(const attributes of [
      ['62','1'],['8','ALTERNATE'],['6','DASHED'],['42','0.5'],['370','35'],
    ]){
      const entity=['0','LINE','10','1','20','2','11','3','21','4',...attributes];
      expect(()=>parseCpuLineOnlyDxf(fixture(entity))).toThrow('SCENE_CONVERTER_UNAVAILABLE');
    }
  });
  it('rejects non-planar, malformed and out-of-range coordinates',()=>{
    for(const attributes of [
      ['30','1'],['31','0.5'],['210','1'],['230','-1'],
    ]){
      expect(()=>parseCpuLineOnlyDxf(fixture([
        '0','LINE','10','1','20','2','11','3','21','4',...attributes,
      ]))).toThrow('SCENE_CONVERTER_UNAVAILABLE');
    }
    expect(()=>parseCpuLineOnlyDxf(fixture(['0','LINE','10','NaN','20','2','11','3','21','4'])))
      .toThrow('SCENE_DXF_PARSE_FAILED');
    expect(()=>parseCpuLineOnlyDxf(fixture(['0','LINE','10','1000001','20','2','11','3','21','4'])))
      .toThrow('SCENE_DXF_PARSE_FAILED');
    expect(()=>parseCpuLineOnlyDxf(fixture(['0','LINE','10','1','20','2','11','1','21','2'])))
      .toThrow('SCENE_DXF_PARSE_FAILED');
  });
  it('rejects unknown units, malformed UTF8, block sections and oversized bytes',()=>{
    expect(()=>parseCpuLineOnlyDxf(fixture(line('1','2'),'0')))
      .toThrow('SCENE_CONVERTER_UNAVAILABLE');
    expect(()=>parseCpuLineOnlyDxf(Uint8Array.from([255,254,1,0])))
      .toThrow('SCENE_DXF_PARSE_FAILED');
    const unsupported=toBytes(['0','SECTION','2','BLOCKS','0','ENDSEC','0','EOF']);
    expect(()=>parseCpuLineOnlyDxf(unsupported)).toThrow('SCENE_CONVERTER_UNAVAILABLE');
    expect(()=>parseCpuLineOnlyDxf(new Uint8Array(CPU_LINE_LIMITS.sourceBytes+1)))
      .toThrow('SCENE_ASSET_TOO_LARGE');
  });
  it('forbids duplicate handles and unterminated entity records',()=>{
    const withHandle=['0','LINE','5','A1','10','0','20','0','11','1','21','1'];
    expect(()=>parseCpuLineOnlyDxf(fixture([...withHandle,...withHandle])))
      .toThrow('SCENE_DXF_PARSE_FAILED');
    const unfinished=toBytes(['0','SECTION','2','HEADER','9','$INSUNITS','70','4',
      '0','ENDSEC','0','SECTION','2','ENTITIES','0','LINE','10','0','20','0','11','1','21','1']);
    expect(()=>parseCpuLineOnlyDxf(unfinished)).toThrow('SCENE_DXF_PARSE_FAILED');
  });
});
