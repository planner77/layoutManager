/**
 * Read-only, client-side ASCII DXF text index. No network, DOM or renderer state.
 * The insertion-point focus envelope is deliberately NOT a glyph bounding box.
 * Unsupported OCS/array inserts are excluded rather than returning a wrong location.
 */
export interface CadFocusBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface CadTextHit {
  id: string;
  handle?: string;
  type: 'TEXT' | 'MTEXT';
  raw: string;
  text: string;
  layer: string;
  focus: CadFocusBounds;
  origin: 'MODEL' | 'INSERT';
}
export interface CadTextIndex {
  hits: CadTextHit[];
  skipped: Record<string, number>;
  truncated: boolean;
}
type Pair = { code: number; value: string };
type Entity = { kind: string; pairs: Pair[] };
type Block = { baseX: number; baseY: number; entities: Entity[] };
type Affine = readonly [number, number, number, number, number, number];

const LIMIT = 20_000;
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

function one(entity: Entity, code: number) {
  return entity.pairs.find(pair => pair.code === code)?.value;
}
function num(entity: Entity, code: number, fallback = NaN) {
  const value = one(entity, code);
  if (value === undefined) return fallback;
  const result = Number(value.trim());
  return Number.isFinite(result) ? result : NaN;
}
function multiplication(a: Affine, b: Affine): Affine {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function mapped(transform: Affine, x: number, y: number) {
  return { x: transform[0] * x + transform[2] * y + transform[4],
    y: transform[1] * x + transform[3] * y + transform[5] };
}
function worldOcs(entity: Entity) {
  return Math.abs(num(entity, 210, 0)) < 1e-8 &&
    Math.abs(num(entity, 220, 0)) < 1e-8 &&
    Math.abs(num(entity, 230, 1) - 1) < 1e-8;
}
/** Read only ASCII HEADER group pairs. DXF content may be CP949, so never decode
 * arbitrary entity text while choosing the declared encoding. */
function sourceHeader(bytes: ArrayBuffer): {version: string | null; codepage: string | null; bom: boolean} {
  const view = new Uint8Array(bytes);
  const bom = view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf;
  const probe = new TextDecoder('windows-1252').decode(view.subarray(bom ? 3 : 0, Math.min(view.length, 1024 * 1024)));
  const lines = probe.replace(/\r\n?/g, '\n').split('\n');
  let inHeader = false;
  let expectSection = false;
  let variable = '';
  let version: string | null = null;
  let codepage: string | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();
    if (code === '0' && value.toUpperCase() === 'SECTION') {
      expectSection = true;
      inHeader = false;
      variable = '';
    } else if (expectSection && code === '2') {
      inHeader = value.toUpperCase() === 'HEADER';
      expectSection = false;
    } else if (code === '0' && value.toUpperCase() === 'ENDSEC') {
      if (inHeader) break;
      inHeader = false;
      variable = '';
    } else if (inHeader && code === '9') {
      variable = value.toUpperCase();
    } else if (inHeader && variable === '$ACADVER' && code === '1') {
      version = /^AC\d{4}$/i.test(value) ? value.toUpperCase() : null;
    } else if (inHeader && variable === '$DWGCODEPAGE' && code === '3') {
      codepage = value.toUpperCase();
    }
  }
  return {version, codepage, bom};
}

function decodeSource(bytes: ArrayBuffer): string {
  const probe = new TextDecoder('windows-1252').decode(bytes.slice(0, 32));
  if (probe.startsWith('AutoCAD Binary DXF')) throw new Error('Binary DXF 텍스트 인덱스는 지원하지 않습니다.');
  const {version,codepage,bom}=sourceHeader(bytes);
  const versionNumber = version ? Number(version.slice(2)) : 0;
  // AC1021 (AutoCAD 2007) and later text is UTF-8 even when the old header
  // still declares ANSI_949/932/936/950. A UTF-8 BOM also takes precedence.
  const utf8 = bom || versionNumber >= 1021 || !codepage || codepage === 'UTF-8';
  const encoding = utf8 ? 'utf-8'
    : codepage === 'ANSI_949' ? 'euc-kr'  // WHATWG label for Windows-949/CP949
    : codepage === 'ANSI_936' ? 'gbk'
    : codepage === 'ANSI_932' ? 'shift_jis'
    : codepage === 'ANSI_950' ? 'big5'
    : /^ANSI_12\d{2}$/.test(codepage ?? '') ? 'windows-' + codepage!.slice(5)
    : null;
  if (!encoding) throw new Error('지원하지 않는 DXF 코드페이지: ' + codepage);
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(encoding, {fatal:true}); }
  catch { throw new Error('DXF 코드페이지 디코더를 사용할 수 없습니다: ' + (codepage ?? encoding)); }
  try { return decoder.decode(bytes); }
  catch {
    if (utf8 && !codepage && !version && !bom)
      throw new Error('UTF-8이 아닌 DXF입니다. 구형 DXF의 $DWGCODEPAGE 선언을 확인하세요.');
    throw new Error('DXF 문자 데이터의 바이트가 ' + encoding.toUpperCase() + ' 인코딩에 유효하지 않습니다.');
  }
}

function unicodeEscape(text: string) {
  return text.replace(/\\U\+([0-9A-Fa-f]{4})/g, (original, hex: string) => {
    const value = Number.parseInt(hex, 16);
    return value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
      ? String.fromCodePoint(value) : original;
  });
}
export function plainMtext(raw: string) {
  let output = '';
  for (let i = 0; i < raw.length; i++) {
    const character = raw[i];
    if (character === '{' || character === '}') continue;
    if (character !== '\\' || i + 1 >= raw.length) { output += character; continue; }
    const directive = raw[++i];
    if (directive === '\\' || directive === '{' || directive === '}') { output += directive; continue; }
    if (directive === 'P') { output += '\n'; continue; }
    if (directive === '~') { output += ' '; continue; }
    if ('LlOoKk'.includes(directive)) continue;
    if (directive === 'S') {
      const stop = raw.indexOf(';', i + 1);
      if (stop >= 0) {
        output += raw.slice(i + 1, stop).replace(/[#^]/g, '/');
        i = stop;
        continue;
      }
    }
    if ('AaCcFfHhQqTtWw'.includes(directive)) {
      const stop = raw.indexOf(';', i + 1);
      if (stop >= 0) { i = stop; continue; }
    }
    // Unknown control: preserve its payload, never interpret it as HTML.
    output += '\\' + directive;
  }
  return unicodeEscape(output);
}
export function normalizedText(text: string) {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim();
}
export function searchKey(text: string) {
  return normalizedText(text).toLowerCase();
}

function parsedEntities(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const model: Entity[] = [];
  const blocks = new Map<string, Block>();
  let section = '';
  let kind = '';
  let pairs: Pair[] = [];
  let block: Block | undefined;
  let expectingSectionName = false;
  let seenEntities = false;
  function flush() {
    if (!kind) return;
    const entity = { kind, pairs };
    if (section === 'BLOCKS') {
      if (kind === 'BLOCK') {
        const name = one(entity, 2) ?? '';
        block = { baseX: num(entity, 10, 0), baseY: num(entity, 20, 0), entities: [] };
        if (name && Number.isFinite(block.baseX) && Number.isFinite(block.baseY)) blocks.set(name, block);
        else block = undefined;
      } else if (kind === 'ENDBLK') block = undefined;
      else if (block) block.entities.push(entity);
    } else if (section === 'ENTITIES') model.push(entity);
    kind = ''; pairs = [];
  }
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) throw new Error('DXF 그룹 코드가 올바르지 않습니다.');
    const value = lines[i + 1];
    if (code === 0) {
      flush();
      const directive = value.trim().toUpperCase();
      if (directive === 'SECTION') { section = ''; expectingSectionName = true; block = undefined; }
      else if (directive === 'ENDSEC' || directive === 'EOF') {
        section = ''; expectingSectionName = false; block = undefined;
      } else { kind = directive; pairs = []; }
    } else if (expectingSectionName && code === 2) {
      section = value.trim().toUpperCase();
      if (section === 'ENTITIES') seenEntities = true;
      expectingSectionName = false;
    } else if (kind) pairs.push({ code, value });
  }
  flush();
  if (!seenEntities) throw new Error('DXF ENTITIES 섹션을 찾을 수 없습니다.');
  return { model, blocks };
}

export function extractDxfText(source: ArrayBuffer | string): CadTextIndex {
  const { model, blocks } = parsedEntities(typeof source === 'string' ? source : decodeSource(source));
  const hits: CadTextHit[] = [];
  const skipped: Record<string, number> = {};
  let truncated = false;
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };
  function walk(entities: Entity[], transform: Affine, inheritedLayer: string | undefined, trail: string[], scope: string) {
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (entity.kind === 'INSERT') {
        const name = one(entity, 2) ?? '';
        const block = blocks.get(name);
        if (!block) { skip('정의되지 않은 BLOCK'); continue; }
        if (!worldOcs(entity) || trail.includes(name) || trail.length >= 8 ||
            num(entity, 70, 1) !== 1 || num(entity, 71, 1) !== 1) {
          skip('미지원 INSERT 배열/OCS/순환'); continue;
        }
        const x = num(entity, 10), y = num(entity, 20);
        const sx = num(entity, 41, 1), sy = num(entity, 42, 1), degree = num(entity, 50, 0);
        if (![x, y, sx, sy, degree].every(Number.isFinite) || sx === 0 || sy === 0) {
          skip('잘못된 INSERT 좌표/축척'); continue;
        }
        const angle = degree * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const local: Affine = [c * sx, s * sx, -s * sy, c * sy,
          x - c * sx * block.baseX + s * sy * block.baseY,
          y - s * sx * block.baseX - c * sy * block.baseY];
        const layer = one(entity, 8);
        walk(block.entities, multiplication(transform, local), layer && layer !== '0' ? layer : inheritedLayer,
          [...trail, name], scope + '/INSERT-' + (one(entity, 5) || i));
        continue;
      }
      if (entity.kind === 'ATTRIB' || entity.kind === 'ATTDEF') {
        skip('미지원 ' + entity.kind);
        continue;
      }
      if (entity.kind !== 'TEXT' && entity.kind !== 'MTEXT') continue;
      if (hits.length >= LIMIT) { truncated = true; continue; }
      if (num(entity, 60, 0) === 1) { skip('비표시 Entity'); continue; }
      if (!worldOcs(entity)) { skip('미지원 OCS 텍스트'); continue; }
      const pieces = entity.kind === 'MTEXT'
        ? [...entity.pairs.filter(p => p.code === 3).map(p => p.value), one(entity, 1) ?? '']
        : [one(entity, 1) ?? ''];
      const raw = pieces.join('');
      const text = normalizedText(entity.kind === 'MTEXT' ? plainMtext(raw) : unicodeEscape(raw));
      if (!text) continue;
      const aligned = entity.kind === 'TEXT' && (num(entity, 72, 0) !== 0 || num(entity, 73, 0) !== 0) &&
        Number.isFinite(num(entity, 11)) && Number.isFinite(num(entity, 21));
      const px = num(entity, aligned ? 11 : 10), py = num(entity, aligned ? 21 : 20);
      if (!Number.isFinite(px) || !Number.isFinite(py)) { skip('위치 없는 텍스트'); continue; }
      const position = mapped(transform, px, py);
      const scale = Math.max(Math.hypot(transform[0], transform[1]), Math.hypot(transform[2], transform[3]));
      const height = num(entity, 40, 1);
      const nominal = Number.isFinite(height) && height > 0 ? height : 1;
      const boxWidth = num(entity, 41, 0);
      // Conservative camera framing around the insertion point, not a font-dependent glyph bbox.
      const span = Math.max(24 * nominal, 2 * text.length * nominal,
        Number.isFinite(boxWidth) && boxWidth > 0 ? 2 * boxWidth : 0) * scale;
      if (![position.x, position.y, span].every(Number.isFinite) || span <= 0 || span > 1e14) {
        skip('잘못된 텍스트 변환'); continue;
      }
      const half = span / 2;
      const layer = one(entity, 8) ?? '0';
      hits.push({
        id: scope + '/' + (one(entity, 5) ?? i) + '/' + hits.length,
        handle: one(entity, 5),
        type: entity.kind,
        raw, text,
        layer: layer === '0' && inheritedLayer ? inheritedLayer : layer,
        origin: trail.length ? 'INSERT' : 'MODEL',
        focus: { minX: position.x - half, maxX: position.x + half,
          minY: position.y - half, maxY: position.y + half },
      });
    }
  }
  walk(model, IDENTITY, undefined, [], 'MODEL');
  return { hits, skipped, truncated };
}
