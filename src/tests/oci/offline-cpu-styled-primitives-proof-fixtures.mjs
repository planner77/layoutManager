/** Synthetic only. Spatial sectors make visible and hidden style checks independent. */
export function syntheticStyledDxf(){
  const header=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1018',9,'$DWGCODEPAGE',3,'UTF-8',9,'$INSUNITS',70,4,9,'$LWDISPLAY',290,0,9,'$LWDEFAULT',370,25,9,'$CLAYER',8,'0',0,'ENDSEC'];
  const ltype=[0,'TABLE',2,'LTYPE',70,2,5,'10',0,'LTYPE',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,5,'11',330,'10',0,'ENDTAB'];
  const layer=(name,flags,aci,weight,handle,extra=[])=>[0,'LAYER',2,name,70,flags,62,aci,6,'CONTINUOUS',370,weight,5,handle,330,'20',...extra];
  const layers=[0,'TABLE',2,'LAYER',70,6,5,'20',...layer('0',0,1,-3,'21'),...layer('LOCK',4,5,50,'22'),...layer('OFF',0,-2,30,'23',[420,0x112233,290,0]),...layer('FROZEN',1,3,25,'24'),0,'ENDTAB'];
  const styles=[0,'TABLE',2,'STYLE',70,2,5,'30',0,'STYLE',2,'STANDARD',70,0,40,0,41,1,50,0,71,0,42,1,3,'simple.ttf',4,'',5,'31',330,'30',0,'ENDTAB'];
  const entities=[
    0,'LINE',8,'0',10,-80,20,40,11,-50,21,40,
    0,'CIRCLE',8,'LOCK',62,2,370,35,10,-30,20,20,40,12,
    0,'ARC',8,'OFF',370,-3,10,10,20,20,40,10,50,0,51,180,
    0,'LWPOLYLINE',8,'FROZEN',90,3,70,0,10,30,20,30,10,50,20,30,10,50,20,45,
    0,'LINE',8,'0',60,1,420,0xff00ff,10,-80,20,-20,11,-50,21,-20,
    0,'LWPOLYLINE',8,'0',62,200,420,0x00ff88,90,3,70,0,10,20,20,-30,10,40,20,-30,10,40,20,-45,
  ];
  return new TextEncoder().encode([...header,0,'SECTION',2,'TABLES',...ltype,...layers,...styles,0,'ENDSEC',0,'SECTION',2,'ENTITIES',...entities,0,'ENDSEC',0,'EOF',''].join('\n'));
}
export const STYLED_FIXTURE_GOLDEN=Object.freeze({
  primitiveCount:6,visiblePrimitiveCount:3,
  types:['LINE','CIRCLE','ARC','LWPOLYLINE','LINE','LWPOLYLINE'],
  visible:[true,true,false,false,false,true],
  rgb:[0xff0000,0xffff00,0x112233,0x00ff00,0xff00ff,0x00ff88],
  locked:[false,true,false,false,false,false],
  weight:[25,35,25,25,25,25],
  weightOrigin:['DEFAULT','ENTITY','DEFAULT','LAYER','DEFAULT','DEFAULT'],
});
