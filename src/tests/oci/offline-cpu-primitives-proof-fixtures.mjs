/** Public synthetic geometry for the offline candidate proof; no user CAD. */
export function syntheticPrimitivesDxf(){
  return new TextEncoder().encode([
    0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1018',9,'$DWGCODEPAGE',3,'UTF-8',9,'$INSUNITS',70,4,0,'ENDSEC',
    0,'SECTION',2,'ENTITIES',
    0,'LINE',8,'0',10,-60,20,-40,11,-10,21,-40,
    0,'CIRCLE',8,'0',10,30,20,20,40,15,
    0,'ARC',8,'0',10,-30,20,20,40,15,50,350,51,100,
    0,'LWPOLYLINE',8,'0',90,3,70,0,10,0,20,-50,10,20,20,-30,10,40,20,-50,
    0,'LWPOLYLINE',8,'0',90,4,70,1,10,-60,20,-20,10,-40,20,-20,10,-40,20,0,10,-60,20,0,
    0,'ENDSEC',0,'EOF','',
  ].join('\n'));
}
export const SYNTHETIC_PRIMITIVE_GOLDEN=Object.freeze({
  primitiveCount:5,
  kinds:['LINE','CIRCLE','ARC','LWPOLYLINE','LWPOLYLINE'],
  bbox:{min:[-60,-50,0],max:[45,35,0]},
});
