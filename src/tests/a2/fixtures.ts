/** #218/P1-A2: entirely public synthetic DXF; no customer geometry or SHA. */
export const a2SyntheticDxf = [
  '0','SECTION','2','HEADER','9','$ACADVER','1','AC1024','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','BLOCKS',
  '0','BLOCK','2','INNER','70','0','10','0','20','0','30','0',
  '0','LINE','5','B01','8','BLOCK_LINES','10','0','20','0','11','12','21','8',
  '0','TEXT','5','B02','8','KOREAN','10','1','20','3','40','3','1','한글블록',
  '0','ENDBLK',
  '0','BLOCK','2','OUTER','70','0','10','0','20','0','30','0',
  '0','INSERT','5','B03','8','NESTED','2','INNER','10','10','20','10','30','0',
  '0','CIRCLE','5','B04','8','BLOCK_CIRCLE','10','0','20','0','40','5',
  '0','ENDBLK',
  '0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LINE','5','A01','8','LINES','10','1000','20','-2000','11','1200','21','-1900',
  '0','CIRCLE','5','A02','8','CIRCLES','10','30','20','25','40','10',
  '0','LWPOLYLINE','5','A03','8','OUTLINE','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','60','10','0','20','60',
  '0','INSERT','5','A04','8','INSERTS','2','OUTER','10','100','20','100','30','0',
  '0','INSERT','5','A05','8','INSERTS','2','OUTER','10','200','20','100','30','0',
  '0','TEXT','5','A06','8','KOREAN','10','5','20','45','40','4','1','한글 TEXT',
  '0','MTEXT','5','A07','8','KOREAN','10','5','20','55','40','3','41','80','71','1','72','1',
  '1','한글 MTEXT\\P두 번째 줄',
  '0','ENDSEC','0','EOF','',
].join('\n');
const blockHeader = (name: string) => [
  '0','BLOCK','2',name,'70','0','10','0','20','0','30','0',
];
const insert = (name: string) => ['0','INSERT','2',name,'10','0','20','0','30','0'];
/** 2^18 nested instances; allocate only ~18 blocks, never expand them. */
export function a2ExplosionDxf(): string {
  const out = ['0','SECTION','2','BLOCKS'];
  out.push(...blockHeader('B0'),'0','LINE','10','0','20','0','11','1','21','1','0','ENDBLK');
  for (let i = 1; i <= 18; i++) {
    out.push(...blockHeader('B'+i),...insert('B'+(i-1)),...insert('B'+(i-1)),'0','ENDBLK');
  }
  out.push('0','ENDSEC','0','SECTION','2','ENTITIES',...insert('B18'),'0','ENDSEC','0','EOF','');
  return out.join('\n');
}
export function a2CycleDxf(): string {
  return [
    '0','SECTION','2','BLOCKS',
    ...blockHeader('A'), ...insert('B'), '0','ENDBLK',
    ...blockHeader('B'), ...insert('A'), '0','ENDBLK',
    '0','ENDSEC','0','SECTION','2','ENTITIES',
    ...insert('A'),'0','ENDSEC','0','EOF','',
  ].join('\n');
}

/** P0-2: independent minimal, deterministic LINE DXF. No CAD/production data. */
export const a2LineOnlyDxf = [
  '0','SECTION','2','HEADER','9','$ACADVER','1','AC1024',
  '9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LINE','5','P01','8','BASIC','10','0','20','0','11','12','21','8',
  '0','ENDSEC','0','EOF','',
].join('\n');
