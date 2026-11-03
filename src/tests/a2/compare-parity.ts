/** Walk every field, including final array positions. A single bounded throw avoids
 * creating one Playwright assertion/report record per glyph coordinate. */
export function compareParity(actual:unknown,expected:unknown,label='inventory'):void{
  let visited=0;
  const exactNumber=/\.(?:itemSize|start|count|materialIndex|color|side|blending|width|height|revision|schema|byteLength)$|\.(?:path|treePath)\[\d+\]$|\.geometry\.index(?:\.array)?\[\d+\]$/;
  function walk(a:unknown,b:unknown,path:string):void{
    if(++visited>10_000_000)throw new Error('A2_PARITY_LIMIT');
    if(typeof a!==typeof b)throw new Error('A2_PARITY_TYPE:'+path);
    if(typeof b==='number'){
      if(!Number.isFinite(a)||!Number.isFinite(b)||
        (exactNumber.test(path)?a!==b:Math.abs((a as number)-b)>1e-5))
        throw new Error('A2_PARITY_NUMBER:'+path);
      return;
    }
    if(b===null||typeof b!=='object'){
      if(a!==b)throw new Error('A2_PARITY_VALUE:'+path);
      return;
    }
    if(Array.isArray(b)){
      if(!Array.isArray(a)||a.length!==b.length)throw new Error('A2_PARITY_LENGTH:'+path);
      for(let i=0;i<b.length;i++)walk(a[i],b[i],path+'['+i+']');
      return;
    }
    if(Array.isArray(a)||!a||typeof a!=='object')throw new Error('A2_PARITY_OBJECT:'+path);
    const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;
    const ak=Object.keys(aa).sort(),bk=Object.keys(bb).sort();
    if(ak.length!==bk.length||ak.some((k,i)=>k!==bk[i]))throw new Error('A2_PARITY_KEYS:'+path);
    for(const k of bk)walk(aa[k],bb[k],path+'.'+k);
  }
  walk(actual,expected,label);
}

/** Verification-only, fixture-specific restore boundary. The raw source and
 * restored inventories remain available for evidence. No new loss is accepted
 * by inference: exact node/material slots and values must match the measured
 * CUSTOM_DTO omissions for this synthetic drawing. */
export function canonicalRestoredInventory<T extends {nodes:unknown[]}>(source:T,restored:T):{
  canonical:T;shapeClassLoss:number;materialSideLoss:number;
}{
  type Material={type:string;side:number};
  type Node={path:number[];ref:unknown;geometry?:{type:string}|null;materials:Material[]};
  const src=source.nodes as Node[],dst=restored.nodes as Node[];
  if(src.length!==dst.length)throw new Error('A2_RESTORE_NODE_COUNT');
  const shapeSlots=new Set([7,8]);
  const sideSlots=new Set(['7:0','8:0','15:0','22:0']);
  const shapeSeen=new Set<number>(),sideSeen=new Set<string>();
  const canonical=structuredClone(source);
  const out=canonical.nodes as Node[];
  for(let i=0;i<src.length;i++){
    compareParity(dst[i].ref,src[i].ref,'restore-ref-'+i);
    compareParity(dst[i].path,src[i].path,'restore-path-'+i);
    const a=src[i].geometry?.type,b=dst[i].geometry?.type;
    if(a!==b){
      if(!shapeSlots.has(i)||a!=='ShapeGeometry'||b!=='BufferGeometry')
        throw new Error('A2_RESTORE_GEOMETRY_CLASS:'+i);
      shapeSeen.add(i);out[i].geometry!.type='BufferGeometry';
    }
    if(src[i].materials.length!==dst[i].materials.length)throw new Error('A2_RESTORE_MATERIAL_COUNT:'+i);
    for(let j=0;j<src[i].materials.length;j++){
      const sm=src[i].materials[j],dm=dst[i].materials[j],slot=i+':'+j;
      if(sm.type!==dm.type)throw new Error('A2_RESTORE_MATERIAL_TYPE:'+slot);
      if(sm.side!==dm.side){
        if(!sideSlots.has(slot)||sm.type!=='MeshBasicMaterial'||sm.side!==2||dm.side!==0)
          throw new Error('A2_RESTORE_MATERIAL_SIDE:'+slot);
        sideSeen.add(slot);out[i].materials[j].side=0;
      }
    }
  }
  if(shapeSeen.size!==shapeSlots.size||sideSeen.size!==sideSlots.size)
    throw new Error('A2_RESTORE_KNOWN_LOSS_COUNT');
  compareParity(restored,canonical,'restore-canonical');
  return {canonical,shapeClassLoss:shapeSeen.size,materialSideLoss:sideSeen.size};
}
