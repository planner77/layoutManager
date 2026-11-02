import {EXCHANGE_UNIT_METRES,exchangeSourceUnit,type ExchangeOptions,type ExchangeSnapshot} from '@/domain/cad-exchange';
/** Presentation default from already captured, authorized geometry; performs no read. */
export function defaultExchangeMemoHeight(snapshot:ExchangeSnapshot,unit:ExchangeOptions['unit']):number{
  const selected=unit==='auto'?exchangeSourceUnit(snapshot.inventory.scope.sourceUnit):unit;
  if(!selected)throw new Error('메모 크기를 계산할 원본 단위를 선택하세요.');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const add=(x:number,y:number)=>{if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('형상 좌표가 유효하지 않습니다.');
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);};
  for(const primitive of snapshot.primitives)for(let i=0;i<primitive.positions.length;i+=3)add(primitive.positions[i],primitive.positions[i+1]);
  for(const item of snapshot.generated)for(const polygon of item.geometry.type==='Polygon'?[item.geometry.coordinates]:item.geometry.coordinates)
    for(const ring of polygon)for(const point of ring)add(point[0],point[1]);
  const extent=Math.max(maxX-minX,maxY-minY)*EXCHANGE_UNIT_METRES[selected];
  return !Number.isFinite(extent)||extent<=0?0.1:Math.min(1,Math.max(0.01,extent/60));
}
