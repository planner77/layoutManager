import { describe, expect, it } from 'vitest';
import {
  assertMemoScope,assertMemoWcsXY,parseMemoWcsXY,normalizeMemoText,
  MemoSession,MEMO_MAX_COUNT,
} from '../../domain/cad-memo';

const scope = {
  versionId:'123e4567-e89b-42d3-a456-426614174000',
  sourceSha256:'a'.repeat(64),
};
const id = (suffix:number) => '123e4567-e89b-42d3-a456-'+suffix.toString(16).padStart(12,'0');
const add = (document:MemoSession,n=1) => document.create({
  id:id(n), anchorWcsXY:{x:10,y:20},title:'검증 메모',content:'첫 줄\n둘째 줄',
},scope);

describe('Issue #82 / M1 disposable WCS memo document',()=>{
  it('TC-M1-UNIT-001 validates version/SHA, UUIDv4 and distinct local identity',()=>{
    const document=new MemoSession(scope),memo=add(document);
    expect(memo).toMatchObject({...scope,anchorWcsXY:{x:10,y:20},labelOffset:{x:14,y:-12},
      textFormat:'plain'});
    expect(memo).not.toHaveProperty('createdById');
    expect(document.list()).toHaveLength(1);
    expect(()=>add(document)).toThrow(/중복/);
    expect(()=>document.create({id:'not-uuid',anchorWcsXY:{x:1,y:2},
      title:'t',content:''},scope)).toThrow(/UUID/);
    expect(()=>assertMemoScope({...scope,sourceSha256:'bad'})).toThrow(/SHA/);
    expect(()=>new MemoSession({...scope,versionId:'not-uuid'})).toThrow(/Version/);
  });
  it('TC-M1-UNIT-002 retains exact last committed anchor on text edits and plain text XSS',()=>{
    const doc=new MemoSession(scope),initial=add(doc);
    const revised=doc.editText(initial.id,'e\u0301','<script>alert(1)</script>\r\n**raw**',scope);
    expect(revised.title).toBe('é');
    expect(revised.content).toBe('<script>alert(1)</script>\n**raw**');
    expect(revised.textFormat).toBe('plain');
    expect(revised.anchorWcsXY).toEqual({x:10,y:20});
    expect(revised.createdAt).toEqual(initial.createdAt);
    expect(doc.get(initial.id)?.anchorWcsXY).toEqual({x:10,y:20});
    expect(doc.move(initial.id,{x:13,y:15},scope).anchorWcsXY).toEqual({x:13,y:15});
    expect(doc.editText(initial.id,'수정','내용',scope).anchorWcsXY).toEqual({x:13,y:15});
  });
  it('TC-M1-UNIT-003 requires explicit finite WCS movement, rejects malformed/huge/nonfinite numbers',()=>{
    expect(parseMemoWcsXY(' +13 ',' -1.5e1 ')).toEqual({x:13,y:-15});
    expect(parseMemoWcsXY('.5','0')).toEqual({x:0.5,y:0});
    for(const xy of [['','3'],['Infinity','5'],['NaN','5'],['1,000','0'],
      ['1px','0'],['1e309','0'],['1e13','0'],['2','-1e13']]) {
      expect(()=>parseMemoWcsXY(xy[0],xy[1])).toThrow();
    }
    expect(()=>assertMemoWcsXY({x:Number.NaN,y:0})).toThrow();
    const doc=new MemoSession(scope),initial=add(doc);
    expect(()=>doc.move(initial.id,{x:Infinity,y:5},scope)).toThrow();
    expect(()=>doc.move(initial.id,{x:1e13,y:5},scope)).toThrow();
    expect(doc.get(initial.id)).toBe(initial);
  });
  it('TC-M1-UNIT-004 rejects stale Version/SHA mutations without partial changes',()=>{
    const doc=new MemoSession(scope),initial=add(doc),before=doc.list();
    const stale={...scope,sourceSha256:'b'.repeat(64)};
    expect(doc.matches(stale)).toBe(false);
    expect(()=>doc.editText(initial.id,'tamper','',stale)).toThrow(/다른 Version/);
    expect(()=>doc.move(initial.id,{x:50,y:60},stale)).toThrow(/다른 Version/);
    expect(()=>doc.remove(initial.id,{...scope,versionId:id(2)})).toThrow(/다른 Version/);
    expect(()=>doc.create({id:id(2),anchorWcsXY:{x:0,y:0},
      title:'wrong',content:''},stale)).toThrow(/다른 Version/);
    expect(doc.list()).toEqual(before);
    doc.clear();
    expect(doc.list()).toEqual([]);
  });
  it('TC-M1-UNIT-005 NFC/length/controls and empty-title fail closed',()=>{
    expect(normalizeMemoText('테스트','')).toEqual({title:'테스트',content:''});
    expect(normalizeMemoText('a','한\r\n두')).toEqual({title:'a',content:'한\n두'});
    for(const [title,content] of [
      ['', '본문'],['\n','본문'],['a\tb',''],['a'.repeat(101),''],
      ['a','b'.repeat(2001)],['abc\u0000',''],['ok','bad\u001b'],
    ])expect(()=>normalizeMemoText(title,content)).toThrow();
    // HTML is rendered as a React text node, never evaluated as markup.
    expect(normalizeMemoText('<b>title</b>','<img src=x onerror=alert(1)>').content)
      .toBe('<img src=x onerror=alert(1)>');
  });
  it('TC-M1-UNIT-006 100-memo cap, no duplicate or shared scope, no partial writes',()=>{
    const doc=new MemoSession(scope);
    for(let i=1;i<=MEMO_MAX_COUNT;i++) add(doc,i);
    const before=doc.list();
    expect(doc.list()).toHaveLength(100);
    expect(()=>add(doc,101)).toThrow(/최대 100/);
    expect(doc.list()).toEqual(before);
    doc.remove(id(50),scope);
    add(doc,101);
    expect(doc.list()).toHaveLength(100);
    const another=new MemoSession({...scope,versionId:id(200)});
    expect(another.list()).toHaveLength(0);
  });
});
