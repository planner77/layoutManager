import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
test('TC-FONT-001: bundled font contains Korean/Latin outlines and license',()=>{
  const source=readFileSync(new URL('../../public/fonts/NanumGothic-Regular.ttf',import.meta.url));
  const font=new TTFLoader().parse(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength));
  for(const character of '한글공장설비ABC123') expect(font.glyphs[character]?.o?.length ?? 0).toBeGreaterThan(0);
  expect(readFileSync(new URL('../../public/fonts/OFL.txt',import.meta.url),'utf8')).toContain('SIL OPEN FONT LICENSE');
});
