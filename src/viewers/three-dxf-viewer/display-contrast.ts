import * as THREE from 'three';

type ColoredMaterial=THREE.Material & {color:THREE.Color};

/** Discover renderer-owned original black materials once after parse/restore. */
export function collectBlackMaterials(root:THREE.Object3D):ColoredMaterial[]{
  const found=new Set<ColoredMaterial>();
  root.traverse(node=>{
    const mesh=node as THREE.Mesh;
    if(!mesh.material)return;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      const colored=material as THREE.Material & {color?:THREE.Color};
      if(colored.color?.r===0&&colored.color.g===0&&colored.color.b===0)found.add(colored as ColoredMaterial);
    }
  });
  return [...found];
}

/** The synchronous callback cannot expose display color to Scene/export work. */
export function withDisplayContrast<T>(materials:readonly ColoredMaterial[],background:string,render:()=>T):T{
  const color=new THREE.Color(background);
  const dark=(0.2126*color.r+0.7152*color.g+0.0722*color.b)<0.4;
  const adjusted:{material:ColoredMaterial;original:THREE.Color}[]=[];
  try{
    if(dark)for(const material of materials){
      if(material.color.r!==0||material.color.g!==0||material.color.b!==0)continue;
      adjusted.push({material,original:material.color.clone()});material.color.setHex(0xffffff);
    }
    return render();
  }finally{for(const {material,original} of adjusted)material.color.copy(original);}
}
