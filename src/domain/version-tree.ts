/** #201 pure Version tree projection. Folder ownership and Zone parentage are independent. */
export type Folder={id:string;parentFolderId:string|null;name:string;sortOrder:number;revision:number;createdById:string};
export type Membership={kind:'OUTLINE'|'ZONE';objectId:string;folderId:string|null;sortOrder:number;revision:number};
export type Outline={id:string;name:string;kind:string;outlineTypeId:string|null};
export type Zone={id:string;name:string;code:string;categoryId:string|null;parentZoneId:string|null;sortOrder:number};
export type TreeNode={key:string;kind:'FOLDER'|'UNCLASSIFIED'|'OUTLINE'|'ZONE'|'DRAFT';id:string;name:string;sortOrder:number;path:string[];children:TreeNode[];code?:string;typeName?:string;categoryName?:string;revision?:number};
const compare=(a:TreeNode,b:TreeNode)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id);
export function mergeVersionTreeTypes(current:readonly {id:string;name:string;active?:boolean}[],referenced:readonly {id:string;name:string;active?:boolean}[]){
 return [...new Map([...current,...referenced].map(type=>[type.id,type])).values()];
}
export function draftDisplayName(id:string,name:string|undefined){
 const saved=name?.trim();if(saved)return saved;
 return '외곽선 '+id.replace(/^local-/,'');
}
export function projectVersionTree(input:{folders:readonly Folder[];memberships:readonly Membership[];outlines:readonly Outline[];zones:readonly Zone[];categories:readonly {id:string;name:string}[];types:readonly {id:string;name:string;active?:boolean}[];drafts:readonly {id:string;name:string;kind:string;outlineTypeId?:string;outlineTypeName?:string}[]}):TreeNode[]{
 const member=new Map(input.memberships.map(m=>[m.kind+':'+m.objectId,m]));
 const categories=new Map(input.categories.map(c=>[c.id,c.name]));
 const types=new Map(input.types.map(t=>[t.id,t.name+(t.active===false?' (비활성)':'')]));
 const folders=new Map<string,TreeNode>();
 for(const f of input.folders)folders.set(f.id,{key:'folder:'+f.id,kind:'FOLDER',id:f.id,name:f.name,sortOrder:f.sortOrder,revision:f.revision,path:[],children:[]});
 const roots:TreeNode[]=[];const unclassified:TreeNode={key:'unclassified',kind:'UNCLASSIFIED',id:'unclassified',name:'미분류',sortOrder:10000,path:[],children:[]};
 for(const f of input.folders){const node=folders.get(f.id)!;const parent=f.parentFolderId?folders.get(f.parentFolderId):null;
  if(parent&&parent!==node)parent.children.push(node);else roots.push(node);}
 const place=(node:TreeNode,folderId:string|null)=>{const target=(folderId?folders.get(folderId)?.children:undefined)??unclassified.children;target.push(node);};
 for(const o of input.outlines){const m=member.get('OUTLINE:'+o.id);place({key:'outline:'+o.id,kind:'OUTLINE',id:o.id,name:o.name,sortOrder:m?.sortOrder??0,
  path:[],children:[],typeName:o.outlineTypeId?types.get(o.outlineTypeId)??'알 수 없는 타입':o.kind,revision:m?.revision??0},m?.folderId??null);}
 const zoneMap=new Map(input.zones.map(z=>[z.id,z]));
 const zoneNode=(z:Zone,seen:Set<string>):TreeNode=>{
  const m=member.get('ZONE:'+z.id);
  const node:TreeNode={key:'zone:'+z.id,kind:'ZONE',id:z.id,name:z.name,code:z.code,
   categoryName:z.categoryId?categories.get(z.categoryId)??'알 수 없는 카테고리':undefined,
   sortOrder:z.parentZoneId?z.sortOrder:m?.sortOrder??z.sortOrder,revision:z.parentZoneId?undefined:m?.revision??0,path:[],children:[]};
  if(seen.has(z.id))return node;
  const next=new Set(seen);next.add(z.id);
  node.children=input.zones.filter(child=>child.parentZoneId===z.id).map(child=>zoneNode(child,next)).sort(compare);
  return node;
 };
 for(const z of input.zones.filter(z=>!z.parentZoneId||!zoneMap.has(z.parentZoneId))){const m=member.get('ZONE:'+z.id);place(zoneNode(z,new Set()),m?.folderId??null);}
 for(const d of input.drafts)unclassified.children.push({key:'draft:'+d.id,kind:'DRAFT',id:d.id,name:d.name,sortOrder:0,path:[],children:[],
  typeName:d.outlineTypeId?(types.get(d.outlineTypeId)||d.outlineTypeName?.trim()||'알 수 없는 타입'):(d.outlineTypeName?.trim()||d.kind)});
 const finalize=(node:TreeNode,path:string[],seen:Set<string>)=>{
  if(seen.has(node.key)){node.children=[];return;}
  node.path=path;node.children.sort(compare);const next=new Set(seen);next.add(node.key);
  for(const child of node.children)finalize(child,[...path,node.name],next);
 };
 roots.sort(compare);unclassified.children.sort(compare);
 for(const root of roots)finalize(root,[],new Set());finalize(unclassified,[],new Set());
 return [...roots,unclassified];
}
export function filteredVersionTree(roots:readonly TreeNode[],query:string,kind:'ALL'|'OUTLINE'|'ZONE'):{roots:TreeNode[];count:number}{
 const q=query.trim().toLocaleLowerCase('ko-KR');let count=0;
 const filter=(node:TreeNode):TreeNode|null=>{
  const children=node.children.map(filter).filter((x):x is TreeNode=>!!x);
  const leaf=node.kind==='OUTLINE'||node.kind==='DRAFT'||node.kind==='ZONE';
  const kindMatch=kind==='ALL'||kind==='OUTLINE'&&(node.kind==='OUTLINE'||node.kind==='DRAFT')||kind==='ZONE'&&node.kind==='ZONE';
  const text=[node.name,node.code,node.typeName,node.categoryName,...node.path].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR');
  const folderMatch=q!==''&&(node.kind==='FOLDER'||node.kind==='UNCLASSIFIED')&&text.includes(q);
  const self=leaf&&kindMatch&&(!q||text.includes(q));
  if(self)count++;
  if(self||folderMatch||children.length||!q&&node.kind==='FOLDER'&&kind==='ALL')return {...node,children};
  if(node.kind==='UNCLASSIFIED'&&!q)return {...node,children};
  return null;
 };
 return {roots:roots.map(filter).filter((x):x is TreeNode=>!!x),count};
}
export function subtreeObjects(node:TreeNode):{kind:'OUTLINE'|'ZONE'|'DRAFT';id:string}[]{
 const items:{kind:'OUTLINE'|'ZONE'|'DRAFT';id:string}[]=[];
 if(node.kind==='OUTLINE'||node.kind==='ZONE'||node.kind==='DRAFT')items.push({kind:node.kind,id:node.id});
 for(const child of node.children)items.push(...subtreeObjects(child));return items;
}
