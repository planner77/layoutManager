import { describe, expect, test } from 'vitest';
import { cadViewerUrl, cadMemoViewerUrl, parseMemoLinkId } from '../../viewers/core/link';

describe('TC-LINK-001: canonical version viewer links', () => {
  test('uses only the current browser origin and an immutable encoded version path', () => {
    expect(cadViewerUrl('http://cad.internal:3100/untrusted?x=1#fragment', 'version /한글', 'DXF'))
      .toBe('http://cad.internal:3100/cad/versions/version%20%2F%ED%95%9C%EA%B8%80/viewer?renderer=three-dxf-viewer');
  });

  test('preserves an allowed DXF renderer and canonicalizes invalid values', () => {
    expect(cadViewerUrl('https://cad.example', 'v1', 'DXF', 'dxf-viewer'))
      .toBe('https://cad.example/cad/versions/v1/viewer?renderer=dxf-viewer');
    expect(cadViewerUrl('https://cad.example', 'v1', 'DXF', 'three-dxf-viewer'))
      .toBe('https://cad.example/cad/versions/v1/viewer?renderer=three-dxf-viewer');
    expect(cadViewerUrl('https://cad.example', 'v1', 'DXF', 'evil&download=/secret'))
      .toBe('https://cad.example/cad/versions/v1/viewer?renderer=three-dxf-viewer');
  });

  test('always selects the only valid DWG renderer', () => {
    expect(cadViewerUrl('http://192.168.0.10', 'dwg-1', 'DWG', 'three-dxf-viewer'))
      .toBe('http://192.168.0.10/cad/versions/dwg-1/viewer?renderer=libredwg-web');
  });

  test('rejects non-HTTP origins', () => {
    expect(() => cadViewerUrl('file:///tmp/drawing', 'v1', 'DXF')).toThrow('HTTP(S)');
  });
});


describe('#88 M6: immutable, allowlisted memo links',()=>{
  const version='11111111-1111-4111-8111-111111111111';
  const memo='22222222-2222-4222-8222-222222222222';
  test('uses DXF three renderer and only Version+memo UUID',()=>{
    expect(cadMemoViewerUrl('http://cad.example/bad?token=abc',version,memo))
      .toBe('http://cad.example/cad/versions/'+version+'/viewer?renderer=three-dxf-viewer&memo='+memo);
    expect(parseMemoLinkId(memo.toUpperCase())).toBe(memo);
  });
  test('rejects draft, repeated, malformed and path-injection values',()=>{
    expect(parseMemoLinkId(undefined)).toBeNull();
    for(const bad of [['memo'], 'session-id','../../etc/passwd',memo+'&x=1',null]){
      expect(()=>parseMemoLinkId(bad)).toThrow();
    }
    expect(()=>cadMemoViewerUrl('http://cad.example',version,'not-persisted')).toThrow();
  });
});
