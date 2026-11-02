import {expect,test} from 'vitest';
import {zoneContainsPolygon,type ZonePolygon} from '../../domain/cad-zone';

const polygon=(points:number[][]):ZonePolygon=>({type:'Polygon',coordinates:[points as [number,number][]]});
const square=(x:number,y:number,size:number)=>polygon([[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]);

test('Issue 196 QA: containment honors the specified WCS epsilon at ordinary and far-origin coordinates',()=>{
 const parent=square(0,0,100);
 // max coordinate 100 leaves the fixed 1e-7 floor as the tolerance.
 expect(zoneContainsPolygon(parent,square(-5e-8,10,1))).toBe(true);
 expect(zoneContainsPolygon(parent,square(-2e-7,10,1))).toBe(false);

 const farParent=square(1e9,1e9,100);
 // epsilon = 32 * Number.EPSILON * 1e9, approximately 7.1e-6.
 expect(zoneContainsPolygon(farParent,square(1e9-3e-6,1e9+10,1))).toBe(true);
 expect(zoneContainsPolygon(farParent,square(1e9-1e-5,1e9+10,1))).toBe(false);
});
