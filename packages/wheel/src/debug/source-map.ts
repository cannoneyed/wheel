/**
 * Minimal, dependency-free source-map resolution for captured stack traces.
 *
 * WHY THIS EXISTS: a stack that says `chunk-ab12.js:1:48213` is useless to a
 * human and worse for an agent (it will read the wrong file). In dev, vite
 * serves every module with a source map (usually inline, base64). This module
 * fetches the map for each frame's URL once, decodes the `mappings` VLQ
 * stream, and rewrites the frame to `board-service.ts:87:12` — at CAPTURE
 * time, so every surface that hands out the stack (panel copy button,
 * `__wheel.errors()`, the driver's thrown WheelAppError) is already readable.
 *
 * Deliberately minimal: only decodes what position lookup needs (no source
 * content, no names beyond the frame's own), caches per URL, and fails soft —
 * a frame whose map can't be fetched or parsed keeps its raw location. ~120
 * lines beats a runtime dependency for the one operation we need.
 */

interface MapSegment {
  /** Generated column (0-based). */
  readonly genCol: number;
  readonly srcIndex: number;
  readonly srcLine: number;
  readonly srcCol: number;
}

interface DecodedMap {
  readonly sources: readonly string[];
  /** Per generated line: segments sorted by genCol. */
  readonly lines: readonly (readonly MapSegment[])[];
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CHAR_VALUE = new Map<string, number>([...BASE64].map((char, index) => [char, index] as const));

/** Decode one VLQ value starting at `pos`; returns [value, nextPos]. */
function decodeVlq(text: string, pos: number): readonly [number, number] {
  let result = 0;
  let shift = 0;
  for (;;) {
    const digit = CHAR_VALUE.get(text[pos]);
    if (digit === undefined) throw new Error('bad VLQ');
    pos += 1;
    result += (digit & 31) << shift;
    if ((digit & 32) === 0) break;
    shift += 5;
  }
  const negative = (result & 1) === 1;
  result >>>= 1;
  return [negative ? -result : result, pos];
}

function decodeMappings(mappings: string, sources: readonly string[]): DecodedMap {
  const lines: MapSegment[][] = [];
  let srcIndex = 0;
  let srcLine = 0;
  let srcCol = 0;
  for (const lineText of mappings.split(';')) {
    const segments: MapSegment[] = [];
    let genCol = 0;
    if (lineText.length > 0) {
      let pos = 0;
      while (pos < lineText.length) {
        const end = lineText.indexOf(',', pos);
        const stop = end === -1 ? lineText.length : end;
        // 1-, 4-, or 5-field segments; only 4+ carry a source position.
        let value: number;
        [value, pos] = decodeVlq(lineText, pos);
        genCol += value;
        if (pos < stop) {
          [value, pos] = decodeVlq(lineText, pos);
          srcIndex += value;
          [value, pos] = decodeVlq(lineText, pos);
          srcLine += value;
          [value, pos] = decodeVlq(lineText, pos);
          srcCol += value;
          if (pos < stop) [, pos] = decodeVlq(lineText, pos); // name index — unused
          segments.push({ genCol, srcIndex, srcLine, srcCol });
        }
        pos = stop + 1;
      }
    }
    lines.push(segments);
  }
  return { sources, lines };
}

const mapCache = new Map<string, Promise<DecodedMap | null>>();

/** Test seam: forget every cached map (jsdom tests swap fetch implementations). */
export function clearSourceMapCache(): void {
  mapCache.clear();
}

async function loadMap(fileUrl: string): Promise<DecodedMap | null> {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) return null;
    const text = await response.text();
    const match = [...text.matchAll(/\/\/[#@] sourceMappingURL=(\S+)/g)].at(-1);
    if (!match) return null;
    const ref = match[1];
    let json: string;
    if (ref.startsWith('data:')) {
      const base64 = ref.slice(ref.indexOf('base64,') + 'base64,'.length);
      json = atob(base64);
    } else {
      const mapResponse = await fetch(new URL(ref, fileUrl).href);
      if (!mapResponse.ok) return null;
      json = await mapResponse.text();
    }
    const parsed = JSON.parse(json) as { sourceRoot?: string; sources: string[]; mappings: string };
    const root = parsed.sourceRoot ?? '';
    return decodeMappings(parsed.mappings, parsed.sources.map((source) => `${root}${source}`));
  } catch {
    return null; // fail soft: the frame keeps its raw location
  }
}

function mapFor(fileUrl: string): Promise<DecodedMap | null> {
  let cached = mapCache.get(fileUrl);
  if (!cached) {
    cached = loadMap(fileUrl);
    mapCache.set(fileUrl, cached);
  }
  return cached;
}

/** Find the mapped original position, or null. Lines/cols are 1-based in, 1-based out. */
function lookup(decoded: DecodedMap, line: number, col: number): { source: string; line: number; col: number } | null {
  const segments = decoded.lines[line - 1];
  if (!segments || segments.length === 0) return null;
  let best: MapSegment | null = null;
  for (const segment of segments) {
    if (segment.genCol <= col - 1) best = segment;
    else break;
  }
  if (!best) return null;
  const source = decoded.sources[best.srcIndex];
  if (source === undefined) return null;
  return { source, line: best.srcLine + 1, col: best.srcCol + 1 };
}

/** `at fn (url:1:2)` / `fn@url:1:2` / bare `url:1:2` — both stack dialects. */
const FRAME = /^(\s*)(?:at\s+)?(?:(.*?)\s*[@(]\s*)?(\S+?):(\d+):(\d+)\)?\s*$/;

/** Shorten a mapped source path for humans: strip protocol noise, keep the tail. */
function tidySource(source: string): string {
  return source.replace(/^(webpack:\/\/\/?|file:\/\/|\/@fs\/)/, '').replace(/\?.*$/, '');
}

/**
 * Rewrite each frame of a raw stack to its original source position where a
 * map resolves; frames without a resolvable map pass through untouched. Never
 * throws.
 */
export async function mapStack(rawStack: string): Promise<string[]> {
  const out: string[] = [];
  for (const rawLine of rawStack.split('\n')) {
    const match = FRAME.exec(rawLine);
    if (!match) {
      out.push(rawLine.trim());
      continue;
    }
    const [, , fn, url, lineText, colText] = match;
    const decoded = /^https?:/.test(url) ? await mapFor(url) : null;
    const position = decoded ? lookup(decoded, Number(lineText), Number(colText)) : null;
    if (position) {
      const label = fn ? `${fn} ` : '';
      out.push(`at ${label}(${tidySource(position.source)}:${position.line}:${position.col})`);
    } else {
      out.push(rawLine.trim());
    }
  }
  return out;
}
