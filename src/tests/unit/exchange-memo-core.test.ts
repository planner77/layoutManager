import {expect,test,vi} from 'vitest';
import * as THREE from 'three';
import {EMPTY_MEMO_SETTINGS} from '../../domain/memo-schedule';
import {exchangeOptionsFingerprint,selectedExchangeMemos,type ExchangeMemoInput,type ExchangeSnapshot} from '../../domain/cad-exchange';
import {inspectExchangeSnapshot} from '../../viewers/three-dxf-viewer/exchange-export';
import {planExchangeMemoRasters,rasterizeExchangeMemos} from '../../viewers/three-dxf-viewer/exchange-memo-raster';
import {buildExchangeMemoAnnotation} from '../../viewers/three-dxf-viewer/exchange-memo-annotation';

const id='00000000-0000-4000-8000-000000000001';
const key=`memo-local:${id}`;
const memo:ExchangeMemoInput={key,id,origin:'LOCAL_MEMO',revision:null,title:'한글 제목',content:'본문\n둘째 줄',
 anchorWcs:{x:1_000_000_000.1234567,y:2_000_000_000.2345678,z:0},anchorMode:'CANONICAL',broken:false,settings:EMPTY_MEMO_SETTINGS};
function snapshot(items:readonly ExchangeMemoInput[]=[memo]):ExchangeSnapshot{return {
 inventory:{scope:{versionId:id,sourceSha256:'a'.repeat(64),sourceUnit:'DXF_INSUNITS_4'},snapshotToken:'memo-core',layers:[],
  objects:[{key,origin:'LOCAL_MEMO',layer:'메모',name:memo.title,estimatedVertices:0,supported:true}],warnings:[],sourceCoverage:'unknown',sourceEntityCount:null},
 selection:{dxf:{enabled:false,mode:'all',layers:[]},generated:{enabled:false,mode:'all',keys:[]},memos:{enabled:true,mode:'selected',ids:[key]}},
 primitives:[],generated:[],memos:items};}
const options={format:'glb' as const,unit:'auto' as const,origin:{mode:'auto' as const},filenameBase:'memo',memoTextHeightMetres:.1};

test('memo selection validates exact keys, bounds, revision and full normalized text',()=>{
 const base=snapshot();expect(selectedExchangeMemos(base,options)).toEqual([memo]);
 expect(()=>selectedExchangeMemos({...base,memos:[{...memo,key:'memo-server:'+id}]},options)).toThrow('스냅샷');
 expect(()=>selectedExchangeMemos({...base,memos:[{...memo,title:' 한글 제목'}]},options)).toThrow('원문');
 expect(()=>selectedExchangeMemos({...base,memos:[{...memo,anchorWcs:{x:1e12+1,y:0,z:0}}]},options)).toThrow('스냅샷');
 expect(()=>selectedExchangeMemos(base,{...options,memoTextHeightMetres:.0001})).toThrow('높이');
 const empty={...base,inventory:{...base.inventory,objects:[]},selection:{...base.selection,memos:{enabled:true as const,mode:'all' as const,ids:[]}},memos:[]};
 expect(selectedExchangeMemos(empty,options)).toEqual([]);
});

test('BROKEN is partial and changing text or text height invalidates acknowledgement',()=>{
 const broken={...memo,anchorMode:'BROKEN' as const,broken:true};const base=snapshot([broken]);
 expect(inspectExchangeSnapshot(base,options)).toMatchObject({partial:true,memoCount:1});
 expect(inspectExchangeSnapshot(base,options).memoWarnings[0]).toContain('끊긴');
 expect(exchangeOptionsFingerprint(base,options)).not.toBe(exchangeOptionsFingerprint(snapshot(),options));
 expect(exchangeOptionsFingerprint(base,options)).not.toBe(exchangeOptionsFingerprint(base,{...options,memoTextHeightMetres:.2}));
});

test('raster plan wraps full text and rejects per-texture and total pixel limits before canvas allocation',()=>{
 const plan=planExchangeMemoRasters([memo],(text,size)=>text.length*size);
 expect(plan[0].titleLines).toEqual(['한글 제목']);expect(plan[0].bodyLines).toEqual(['본문','둘째 줄']);
 expect(()=>planExchangeMemoRasters([memo],()=>3000)).toThrow('2048px');
 expect(()=>planExchangeMemoRasters(Array(101).fill(memo),()=>10)).toThrow('100개');
 const large={...memo,content:Array(20).fill('x'.repeat(18)).join('\n')};
 expect(()=>planExchangeMemoRasters(Array(5).fill(large),(text)=>text.length*100)).toThrow('텍스처');
});

test('exact title/content and text-height boundaries preserve every character; 2048 side/8MP reject before output canvas allocation',()=>{
 const full={...memo,title:'T'.repeat(100),content:'X'.repeat(2000)};
 expect(selectedExchangeMemos({...snapshot(),memos:[full]},{...options,memoTextHeightMetres:.001})).toHaveLength(1);
 expect(selectedExchangeMemos({...snapshot(),memos:[full]},{...options,memoTextHeightMetres:10})).toHaveLength(1);
 expect(()=>selectedExchangeMemos(snapshot(),{...options,memoTextHeightMetres:NaN})).toThrow('높이');
 const long=planExchangeMemoRasters([full],(text,size)=>text.length*size);
 expect(long[0].titleLines.join('')).toBe(full.title);expect(long[0].bodyLines.join('')).toBe(full.content);
 const large={...memo,title:'T',content:Array(45).fill('x').join('\n')};
 const measure=(text:string)=>text.length?2016:0;
 const pair=planExchangeMemoRasters([large,large],measure);expect(pair[0].width).toBe(2048);
 expect(pair.reduce((n,row)=>n+row.pixels,0)).toBeLessThanOrEqual(8_388_608);
 expect(()=>planExchangeMemoRasters([large,large,large],measure)).toThrow('텍스처');
 let allocated=0;const canvas={width:0,height:0,getContext:()=>({measureText:(text:string)=>({width:measure(text)}),font:''})};
 vi.stubGlobal('document',{createElement:()=>{allocated++;return {...canvas};}});
 try{expect(()=>rasterizeExchangeMemos([large,large,large],{family:'test',assertGlyphs:()=>{},dispose:()=>{}})).toThrow('텍스처');
  expect(allocated).toBe(1);}finally{vi.unstubAllGlobals();}
});

test('annotation uses raw WCS delta for label, records pin precision and owns geometry on error',()=>{
 const plan={titleLines:['한글'],bodyLines:[],width:200,height:100,pixels:20_000};
 const origin=new THREE.Vector3(1_000_000_000,2_000_000_000,0),precision={max:0};
 const canvas={width:200,height:100} as HTMLCanvasElement;
 const group=buildExchangeMemoAnnotation({memo,plan,canvas},origin,.001,.1,precision);
 const card=group.children.find(o=>o.name==='Memo text PNG') as THREE.Mesh;
 const position=card.geometry.getAttribute('position');
 const raw=(memo.anchorWcs.x-origin.x)*.001+.2;
 expect(position.getX(0)).toBeCloseTo(Math.fround(raw),8);
 // Viewer camera uses up=(0,0,-1): screen-down is +Z, so bottom corners must have larger Z.
 expect(position.getZ(2)).toBeGreaterThan(position.getZ(0));
 expect(position.getZ(3)).toBeGreaterThan(position.getZ(1));
 const uv=card.geometry.getAttribute('uv');
 expect([uv.getY(0),uv.getY(1),uv.getY(2),uv.getY(3)]).toEqual([1,1,0,0]);
 expect(precision.max).toBeGreaterThanOrEqual(0);
 expect(group.userData.anchorWcs).toEqual(memo.anchorWcs);
 expect(()=>buildExchangeMemoAnnotation({memo,plan:{...plan,width:Infinity},canvas},origin,.001,.1,{max:0})).toThrow('좌표');
});
