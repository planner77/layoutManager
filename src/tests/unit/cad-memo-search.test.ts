
import { describe,expect,test } from 'vitest';
import { CadError } from '../../domain/cad';
import { memoSearchQuery,memoSearchParams,memoSearchSnippet,memoSearchUrl } from '../../domain/cad-memo-search';
describe('#90 cross-Version memo query contract',()=>{
  const parse=(search:string)=>memoSearchQuery(new URLSearchParams(search));
  test('Current-only and 25 rows default; exact encoding and pagination',()=>{
    const query=parse('target=memos&q=%EB%A9%94%EB%AA%A8');
    expect(query.q).toBe('메모');
    expect(query.includePast).toBe(false);
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(25);
    expect(memoSearchUrl(query,2)).toContain('page=2');
    expect(memoSearchQuery(memoSearchParams(query))).toEqual(query);
  });
  test('NFC normalization, strict leap-day and completion filters',()=>{
    const query=parse('target=memos&q=e%CC%81&includePast=true&completion=progress&dueFrom=2028-02-29&dueTo=2028-12-31&pageSize=100');
    expect(query.q).toBe('é');
    expect(query.includePast).toBe(true);
    expect(query.completion).toBe('progress');
    expect(query.pageSize).toBe(100);
    expect(memoSearchQuery(memoSearchParams(query))).toEqual(query);
  });
  test('rejects duplicates, unknown fields, overflow, invalid dates and control characters',()=>{
    for(const raw of [
      'target=memos&q=a&q=b','target=outlines&q=test','target=memos&q=x&role=Admin',
      'target=memos&q=x&page=0','target=memos&q=x&pageSize=42',
      'target=memos&q=x&includePast=admin','target=memos&q=x&dueFrom=2026-02-30',
      'target=memos&q=x&dueFrom=2026-10-31&dueTo=2026-01-01',
      'target=memos&q=x%0Ay',
    ])expect(()=>parse(raw)).toThrow(CadError);
  });
  test('snippet is bounded text, not markup or HTML',()=>{
    const content='A'.repeat(100)+'<script>alert(1)</script>'+'B'.repeat(200);
    const snippet=memoSearchSnippet(content,'<script>');
    expect(snippet.length).toBeLessThanOrEqual(162);
    expect(snippet).toContain('<script>');
    expect(snippet).not.toContain('B'.repeat(150));
  });
});
