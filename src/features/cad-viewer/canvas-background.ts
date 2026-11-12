export const CANVAS_BACKGROUND_KEY='layoutManager.viewer.canvasBackground.v1';
export const DEFAULT_CANVAS_BACKGROUND='#000000';
export type CanvasBackground=`#${string}`;

/** Only six-digit sRGB is persisted; CSS names, alpha and shorthand are excluded. */
export function normalizeCanvasBackground(value:unknown):CanvasBackground|null{
  return typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value)?value.toLowerCase() as CanvasBackground:null;
}
export function readCanvasBackground(storage:Pick<Storage,'getItem'>):CanvasBackground{
  try{return normalizeCanvasBackground(storage.getItem(CANVAS_BACKGROUND_KEY))??DEFAULT_CANVAS_BACKGROUND;}
  catch{return DEFAULT_CANVAS_BACKGROUND;}
}
export function storeCanvasBackground(storage:Pick<Storage,'setItem'>,color:CanvasBackground):boolean{
  try{storage.setItem(CANVAS_BACKGROUND_KEY,color);return true;}catch{return false;}
}
