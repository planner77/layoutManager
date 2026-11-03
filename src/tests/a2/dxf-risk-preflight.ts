/**
 * #218 P1-A2 synthetic safety guard: conservative, bounded ASCII DXF walk.
 * This is only an experimental pre-parse risk filter, NOT a production DXF
 * parser or proof that unseen vendor entities can be safely converted.
 * Unknown entities, dangling INSERT, cyclic blocks and massive expansions
 * are rejected rather than producing a partial publishable Scene.
 */
export const A2_SOURCE_LIMIT = 16 * 1024 * 1024;
export const A2_EXPANSION_LIMIT = 100_000;
export class A2PreflightError extends Error {
  constructor(readonly code: 'A2_SOURCE_LIMIT'|'A2_DXF_INVALID'|
    'A2_ENTITY_UNSUPPORTED'|'A2_BLOCK_INVALID'|'A2_BLOCK_CYCLE'|
    'A2_EXPANSION_LIMIT') { super(code); this.name = 'A2PreflightError'; }
}
type Entity = { type: string; block?: string; columns: number; rows: number };
const supported = new Set(['LINE','CIRCLE','ARC','LWPOLYLINE','TEXT','MTEXT','INSERT']);
export function preflightA2Dxf(bytes: Uint8Array): { model: number; expandedBound: number; blocks: number } {
  if (!bytes.length || bytes.length > A2_SOURCE_LIMIT)
    throw new A2PreflightError('A2_SOURCE_LIMIT');
  let source: string;
  try { source = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { throw new A2PreflightError('A2_DXF_INVALID'); }
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 750_000) throw new A2PreflightError('A2_SOURCE_LIMIT');
  if (lines.length < 8 || !source.includes('\nSECTION\n') || !/\nEOF\s*$/.test(source))
    throw new A2PreflightError('A2_DXF_INVALID');
  const blocks = new Map<string, Entity[]>();
  const model: Entity[] = [];
  let section = '', expectingSection = false, currentBlock: string | null = null;
  let blockNamePending = false, current: Entity | null = null, sawModel = false;
  const fail = (code: A2PreflightError['code']): never => { throw new A2PreflightError(code); };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    const value = lines[i + 1].trim();
    if (!Number.isInteger(code) || code < 0 || code > 1071) fail('A2_DXF_INVALID');
    if (code === 0) {
      current = null;
      if (value === 'SECTION') { section = ''; expectingSection = true; currentBlock = null; continue; }
      if (value === 'ENDSEC') {
        if (currentBlock) fail('A2_BLOCK_INVALID');
        section = ''; continue;
      }
      if (value === 'EOF') break;
      if (section === 'BLOCKS' && value === 'BLOCK') {
        if (currentBlock) fail('A2_BLOCK_INVALID');
        currentBlock = null; blockNamePending = true; continue;
      }
      if (section === 'BLOCKS' && value === 'ENDBLK') {
        if (!currentBlock) fail('A2_BLOCK_INVALID');
        currentBlock = null; continue;
      }
      if (section !== 'ENTITIES' && section !== 'BLOCKS') continue;
      // BLOCK record fields are never counted as drawable geometry.
      if (section === 'BLOCKS' && !currentBlock) continue;
      if (!supported.has(value)) fail('A2_ENTITY_UNSUPPORTED');
      current = {type: value, columns: 1, rows: 1};
      const target = section === 'ENTITIES' ? model : blocks.get(currentBlock!)!;
      target.push(current);
      if (target.length > A2_EXPANSION_LIMIT) fail('A2_EXPANSION_LIMIT');
      continue;
    }
    if (code === 2 && expectingSection) {
      section = value; expectingSection = false;
      if (section === 'ENTITIES') sawModel = true;
      continue;
    }
    if (section === 'BLOCKS' && blockNamePending && code === 2) {
      if (!value || blocks.has(value) || blocks.size > 10_000) fail('A2_BLOCK_INVALID');
      blocks.set(value, []);
      currentBlock = value;
      blockNamePending = false;
      continue;
    }
    if (current?.type === 'INSERT') {
      if (code === 2) current.block = value;
      // DXF INSERT 70/71: columns/rows. Bounds are intentionally conservative.
      if (code === 70 || code === 71) {
        const n = Number(value);
        if (!Number.isSafeInteger(n) || n < 1 || n > A2_EXPANSION_LIMIT) fail('A2_EXPANSION_LIMIT');
        if (code === 70) current.columns = n;
        if (code === 71) current.rows = n;
      }
    }
  }
  if (!sawModel || blockNamePending || currentBlock || !model.length)
    fail('A2_DXF_INVALID');
  const memo = new Map<string, number>();
  function bound(name: string, active: Set<string>, depth: number): number {
    if (depth > 128) return fail('A2_EXPANSION_LIMIT');
    if (active.has(name)) return fail('A2_BLOCK_CYCLE');
    const records = blocks.get(name);
    if (!records) return fail('A2_BLOCK_INVALID');
    if (memo.has(name)) return memo.get(name)!;
    active.add(name);
    let total = 0;
    for (const entity of records) {
      const count = entity.type === 'INSERT'
        ? bound(entity.block ?? '', active, depth + 1) : 1;
      total += count * entity.columns * entity.rows;
      if (total > A2_EXPANSION_LIMIT) return fail('A2_EXPANSION_LIMIT');
    }
    active.delete(name);
    memo.set(name, total);
    return total;
  }
  let expandedBound = 0;
  for (const entity of model) {
    const count = entity.type === 'INSERT'
      ? bound(entity.block ?? '', new Set(), 0) : 1;
    expandedBound += count * entity.columns * entity.rows;
    if (expandedBound > A2_EXPANSION_LIMIT) fail('A2_EXPANSION_LIMIT');
  }
  return {model: model.length, expandedBound, blocks: blocks.size};
}
