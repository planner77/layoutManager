import type { Page } from '@playwright/test';

/**
 * WebGL E2E raster regression: compare DRAWN SOURCE STROKES rather than exact PNG bytes.
 * Canvas layout can differ by 1-3 physical pixels following CSS fullscreen or
 * scrollbar/Drawer settlement while the original CAD layers are unchanged.
 *
 * Decode both PNG screenshots in the browser; normalize their differing raster
 * dimensions to the same grid. Exclude control overlays at the left/top/right.
 * Treat a bright stroke as matching only if the other raster has a bright pixel
 * within 2 normalized pixels. Missing CAD lines produce low overlap, unlike an
 * innocuous resize/antialias shift. No production Viewer or source is modified.
 */
export async function canvasStrokeSimilarity(page:Page,reference:Buffer,actual:Buffer):Promise<number>{
 return page.evaluate(async ({referenceBase64,actualBase64})=>{
  const width=512,height=256;
  async function decode(base64:string):Promise<Uint8ClampedArray>{
   const data=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
   const image=await createImageBitmap(new Blob([data.buffer as ArrayBuffer],{type:'image/png'}));
   const surface=document.createElement('canvas');
   surface.width=width;surface.height=height;
   const ctx=surface.getContext('2d',{willReadFrequently:true});
   if(!ctx)throw new Error('CANVAS_SIMILARITY_2D_UNAVAILABLE');
   ctx.drawImage(image,0,0,width,height);
   image.close();
   return ctx.getImageData(0,0,width,height).data;
  }
  function strokeMask(pixels:Uint8ClampedArray):{mask:Uint8Array;count:number}{
   const mask=new Uint8Array(width*height);
   let count=0;
   // Left layer Drawer ends before x=24%; text-search top-right before y=18%.
   // Only the CAD work surface contributes to the regression score.
   for(let y=Math.floor(height*.18);y<Math.floor(height*.86);y++){
    for(let x=Math.floor(width*.24);x<Math.floor(width*.9);x++){
     const index=(y*width+x)*4;
     const r=pixels[index],g=pixels[index+1],b=pixels[index+2];
     if(Math.min(r,g,b)>40&&Math.max(r,g,b)>55){
      mask[y*width+x]=1;count++;
     }
    }
   }
   return {mask,count};
  }
  function hasNear(mask:Uint8Array,x:number,y:number):boolean{
   for(let yy=Math.max(0,y-2);yy<=Math.min(height-1,y+2);yy++)
    for(let xx=Math.max(0,x-2);xx<=Math.min(width-1,x+2);xx++)
     if(mask[yy*width+xx])return true;
   return false;
  }
  const before=strokeMask(await decode(referenceBase64));
  const after=strokeMask(await decode(actualBase64));
  // Blank canvases are failures, not vacuously equal rasters.
  if(before.count<20||after.count<20)return 0;
  let matched=0;
  for(let y=Math.floor(height*.18);y<Math.floor(height*.86);y++)
   for(let x=Math.floor(width*.24);x<Math.floor(width*.9);x++){
    const index=y*width+x;
    if(before.mask[index]&&hasNear(after.mask,x,y))matched++;
    if(after.mask[index]&&hasNear(before.mask,x,y))matched++;
   }
  return matched/(before.count+after.count);
 },{referenceBase64:reference.toString('base64'),actualBase64:actual.toString('base64')});
}
