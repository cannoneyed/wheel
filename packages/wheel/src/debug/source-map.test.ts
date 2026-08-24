// @vitest-environment jsdom
/**
 * The minimal source-map resolver: VLQ decode + frame rewrite against a real
 * (tiny) generated-file + inline-map fixture served through a stubbed fetch.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { mapStack, clearSourceMapCache } from './source-map';

/**
 * Fixture map: generated line 1 has segments mapping columns 0 and 8 to
 * src/original.ts (line 3 col 2, line 7 col 4). Encoded by hand:
 *  seg1 [0,0,2,2]  = "AAEE"          (genCol 0, src 0, line+2, col+2)
 *  seg2 [8,0,4,2]  = "QAIE"          (genCol +8, src 0, line +4, col +2)
 */
const MAP = {
  version: 3,
  sources: ['src/original.ts'],
  names: [],
  mappings: 'AAEE,QAIE'
};

const GENERATED = `console.log('x');\n//# sourceMappingURL=data:application/json;base64,${btoa(JSON.stringify(MAP))}`;

beforeEach(() => {
  clearSourceMapCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      if (String(url) === 'http://app.test/assets/chunk.js') {
        return new Response(GENERATED, { status: 200 });
      }
      return new Response('nope', { status: 404 });
    })
  );
});

describe('mapStack', () => {
  it('rewrites V8 frames to original source positions', async () => {
    const frames = await mapStack(
      'Error: boom\n    at doThing (http://app.test/assets/chunk.js:1:9)\n    at http://app.test/assets/chunk.js:1:1'
    );
    expect(frames).toEqual([
      'Error: boom',
      'at doThing (src/original.ts:7:5)',
      'at (src/original.ts:3:3)'
    ]);
  });

  it('leaves frames untouched when no map resolves, and never throws', async () => {
    const frames = await mapStack('Error: x\n    at fn (http://app.test/missing.js:2:2)\n    weird line');
    expect(frames).toEqual(['Error: x', 'at fn (http://app.test/missing.js:2:2)', 'weird line']);
  });

  it('handles firefox-style fn@url:line:col frames', async () => {
    const frames = await mapStack('doThing@http://app.test/assets/chunk.js:1:9');
    expect(frames).toEqual(['at doThing (src/original.ts:7:5)']);
  });

  it('fetches each file once (cache)', async () => {
    await mapStack('at a (http://app.test/assets/chunk.js:1:1)\nat b (http://app.test/assets/chunk.js:1:9)');
    await mapStack('at c (http://app.test/assets/chunk.js:1:1)');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
