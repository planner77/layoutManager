declare module 'three/addons/libs/opentype.module.js' {
  export function parse(bytes:ArrayBuffer):{
    charToGlyphIndex(character:string):number;
  };
}
