import { readFileSync, writeFileSync } from 'node:fs';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
// Derived typeface has a separate family name to respect the source reserved name.
export function prepareFonts() {
  const source = readFileSync(new URL('../public/fonts/NanumGothic-Regular.ttf', import.meta.url));
  const font = new TTFLoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
  font.familyName = 'CAD Korean';
  for (const key of ['fontFamily','fullName','postScriptName','preferredFamily','uniqueID']) {
    if (font.original_font_information[key]) font.original_font_information[key] = {en:'CAD Korean'};
  }
  writeFileSync(new URL('../public/fonts/CadKorean.typeface.json', import.meta.url), JSON.stringify(font));
}
