import {describe, expect, it} from 'vitest';
import {a2CycleDxf, a2ExplosionDxf, a2SyntheticDxf} from '../a2/fixtures';
import {A2_EXPANSION_LIMIT, A2_SOURCE_LIMIT, A2PreflightError, preflightA2Dxf} from '../a2/dxf-risk-preflight';
import {SCENE_PAYLOAD_LIMITS} from '../../domain/scene-payload';

const bytes = (input: string) => new TextEncoder().encode(input);
describe('#218 P1-A2: fail-closed synthetic DXF risk filter, NOT renderer GO', () => {
  it('counts basic nested BLOCK/INSERT references without expanding geometry', () => {
    expect(preflightA2Dxf(bytes(a2SyntheticDxf)))
      .toEqual({model:7, expandedBound:11, blocks:2});
    expect(A2_EXPANSION_LIMIT).toBe(SCENE_PAYLOAD_LIMITS.nodes);
  });
  it('rejects 2^18 BLOCK expansion before any Object3D allocation', () => {
    expect(() => preflightA2Dxf(bytes(a2ExplosionDxf())))
      .toThrowError('A2_EXPANSION_LIMIT');
  });
  it('rejects a cyclic nested block graph', () => {
    expect(() => preflightA2Dxf(bytes(a2CycleDxf())))
      .toThrowError('A2_BLOCK_CYCLE');
  });
  it('rejects unsupported DXF entities instead of silently dropping geometry', () => {
    expect(() => preflightA2Dxf(bytes(
      a2SyntheticDxf.replace('\nLINE\n', '\n3DSOLID\n'),
    ))).toThrowError('A2_ENTITY_UNSUPPORTED');
  });
  it('rejects too-large inputs and invalid UTF8/empty DXF with stable codes', () => {
    expect(() => preflightA2Dxf(new Uint8Array(A2_SOURCE_LIMIT + 1)))
      .toThrowError('A2_SOURCE_LIMIT');
    expect(() => preflightA2Dxf(new Uint8Array([0xff,0xfe,0xfd])))
      .toThrowError('A2_DXF_INVALID');
    expect(() => preflightA2Dxf(new Uint8Array()))
      .toThrow(A2PreflightError);
  });
});
